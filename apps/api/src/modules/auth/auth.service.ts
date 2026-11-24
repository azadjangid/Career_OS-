import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../config/logger';
import { sendMail } from '../../lib/mailer';
import { passwordResetEmail, verifyEmailEmail } from '../../lib/emailTemplates';
import { audit } from '../../lib/audit';
import type { RegisterInput, LoginInput } from './auth.schema';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Tokens are only ever stored as SHA-256 hashes, so a database leak doesn't hand out sessions. */
export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('not-a-real-password', env.BCRYPT_ROUNDS));

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateAccessToken(userId: string, email: string, role: string): string {
  return jwt.sign({ sub: userId, email, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function generateRefreshToken(userId: string): string {
  // jti makes every token unique even when two are issued in the same second
  return jwt.sign({ sub: userId, jti: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function refreshTokenMaxAgeMs(): number {
  const days = parseInt(env.JWT_REFRESH_EXPIRES_IN.replace('d', ''), 10) || 30;
  return days * 24 * 60 * 60 * 1000;
}

async function issueTokens(user: { id: string; email: string; role: string }): Promise<TokenPair> {
  const accessToken = generateAccessToken(user.id, user.email, user.role);
  const refreshToken = generateRefreshToken(user.id);
  await prisma.refreshToken.create({
    data: { token: hashToken(refreshToken), userId: user.id, expiresAt: new Date(Date.now() + refreshTokenMaxAgeMs()) },
  });
  return { accessToken, refreshToken };
}

async function sendVerification(user: { id: string; email: string; name: string }): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.emailVerification.deleteMany({ where: { userId: user.id } });
  await prisma.emailVerification.create({
    data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
  });
  await sendMail(verifyEmailEmail(user, token));
}

type PublicUser = { id: string; email: string; name: string; role: string; emailVerified: boolean };

export const authService = {
  async register(data: RegisterInput, meta: RequestMeta = {}): Promise<TokenPair & { user: PublicUser }> {
    const email = data.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email already registered', 409);

    const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, passwordHash, name: data.name.trim(), profile: { create: {} } },
      select: { id: true, email: true, name: true, role: true, emailVerified: true },
    });

    logger.info({ userId: user.id }, 'User registered');
    await audit(user.id, 'auth.register', meta);
    await sendVerification(user);

    return { ...(await issueTokens(user)), user };
  },

  async login(data: LoginInput, meta: RequestMeta = {}): Promise<TokenPair & { user: PublicUser }> {
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim(), isActive: true },
      select: { id: true, email: true, name: true, role: true, emailVerified: true, passwordHash: true },
    });

    // Compare against a dummy hash when the user doesn't exist so timing doesn't reveal which emails are registered
    const valid = await bcrypt.compare(data.password, user?.passwordHash ?? getDummyHash());
    if (!user || !valid) throw new AppError('Invalid email or password', 401);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, 'auth.login', meta);
    logger.info({ userId: user.id }, 'User logged in');

    const { passwordHash: _omit, ...publicUser } = user;
    return { ...(await issueTokens(user)), user: publicUser };
  },

  async refresh(token: string): Promise<TokenPair> {
    let payload: { sub: string };
    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string };
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token: hashToken(token) },
      include: { user: { select: { id: true, email: true, role: true, isActive: true } } },
    });

    if (!stored) {
      // A correctly signed token that is no longer stored was already used once (rotation deletes it).
      // That means it was copied, so end every session for this user.
      await prisma.refreshToken.deleteMany({ where: { userId: payload.sub } });
      logger.warn({ userId: payload.sub }, 'Refresh token reuse detected; all sessions revoked');
      throw new AppError('Invalid or expired refresh token', 401);
    }

    await prisma.refreshToken.delete({ where: { id: stored.id } });
    if (stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new AppError('Invalid or expired refresh token', 401);
    }
    return issueTokens(stored.user);
  },

  /** Ends the session that owns this refresh token. Works without an access token so an expired session can still log out. */
  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    await prisma.refreshToken.deleteMany({ where: { token: hashToken(refreshToken) } });
  },

  async forgotPassword(email: string, meta: RequestMeta = {}): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.isActive) return; // Silent to prevent email enumeration

    await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordReset.create({
      data: { token: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });

    await sendMail(passwordResetEmail(user, token));
    await audit(user.id, 'auth.password_reset_requested', meta);
  },

  async resetPassword(token: string, password: string, meta: RequestMeta = {}): Promise<void> {
    const reset = await prisma.passwordReset.findUnique({ where: { token: hashToken(token) } });

    if (!reset || reset.expiresAt < new Date() || reset.usedAt) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

    await prisma.$transaction([
      // Following the emailed link also proves the user owns the address
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash, emailVerified: true } }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.refreshToken.deleteMany({ where: { userId: reset.userId } }),
    ]);

    await audit(reset.userId, 'auth.password_reset', meta);
    logger.info({ userId: reset.userId }, 'Password reset successfully');
  },

  async verifyEmail(token: string): Promise<void> {
    const row = await prisma.emailVerification.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.expiresAt < new Date()) throw new AppError('This confirmation link is invalid or has expired', 400);
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { emailVerified: true } }),
      prisma.emailVerification.deleteMany({ where: { userId: row.userId } }),
    ]);
    await audit(row.userId, 'auth.email_verified');
  },

  async resendVerification(userId: string): Promise<{ alreadyVerified: boolean }> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, emailVerified: true } });
    if (!user) throw new AppError('User not found', 404);
    if (user.emailVerified) return { alreadyVerified: true };
    await sendVerification(user);
    return { alreadyVerified: false };
  },
};
