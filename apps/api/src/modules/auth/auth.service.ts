import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../config/logger';
import type { RegisterInput, LoginInput } from './auth.schema';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function generateAccessToken(userId: string, email: string, role: string): string {
  return jwt.sign({ sub: userId, email, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function generateRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function getRefreshTokenExpiry(): Date {
  const days = parseInt(env.JWT_REFRESH_EXPIRES_IN.replace('d', ''), 10) || 30;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

export const authService = {
  async register(data: RegisterInput): Promise<TokenPair & { user: { id: string; email: string; name: string } }> {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already registered', 409);

    const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { email: data.email, passwordHash, name: data.name },
      select: { id: true, email: true, name: true, role: true },
    });

    // Create default profile
    await prisma.profile.create({ data: { userId: user.id } });

    logger.info({ userId: user.id }, 'User registered');

    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: getRefreshTokenExpiry() },
    });

    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name } };
  },

  async login(data: LoginInput): Promise<TokenPair & { user: { id: string; email: string; name: string; role: string } }> {
    const user = await prisma.user.findUnique({
      where: { email: data.email, isActive: true },
      select: { id: true, email: true, name: true, role: true, passwordHash: true },
    });

    if (!user) throw new AppError('Invalid email or password', 401);

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw new AppError('Invalid email or password', 401);

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: getRefreshTokenExpiry() },
    });

    logger.info({ userId: user.id }, 'User logged in');
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  },

  async refresh(token: string): Promise<TokenPair> {
    const stored = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, email: true, role: true, isActive: true } } },
    });

    if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    try {
      jwt.verify(token, env.JWT_REFRESH_SECRET);
    } catch {
      await prisma.refreshToken.delete({ where: { token } });
      throw new AppError('Invalid refresh token', 401);
    }

    await prisma.refreshToken.delete({ where: { token } });

    const accessToken = generateAccessToken(stored.user.id, stored.user.email, stored.user.role);
    const newRefreshToken = generateRefreshToken(stored.user.id);

    await prisma.refreshToken.create({
      data: { token: newRefreshToken, userId: stored.user.id, expiresAt: getRefreshTokenExpiry() },
    });

    return { accessToken, refreshToken: newRefreshToken };
  },

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken, userId } });
    } else {
      await prisma.refreshToken.deleteMany({ where: { userId } });
    }
    logger.info({ userId }, 'User logged out');
  },

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return; // Silent to prevent email enumeration

    await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordReset.create({ data: { token, userId: user.id, expiresAt } });

    // TODO: Send email via emailService
    logger.info({ userId: user.id, token }, 'Password reset token generated');
  },

  async resetPassword(token: string, password: string): Promise<void> {
    const reset = await prisma.passwordReset.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!reset || reset.expiresAt < new Date() || reset.usedAt) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

    await prisma.$transaction([
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.refreshToken.deleteMany({ where: { userId: reset.userId } }),
    ]);

    logger.info({ userId: reset.userId }, 'Password reset successfully');
  },
};
