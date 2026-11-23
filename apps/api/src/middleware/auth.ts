import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { AppError } from './errorHandler';

export const hashApiKey = (key: string): string => crypto.createHash('sha256').update(key).digest('hex');

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    if (!token) throw new AppError('Authentication required', 401);

    // Personal API keys (cos_…) authenticate the same way as a session token
    const user = token.startsWith('cos_')
      ? await prisma.user.findFirst({
          where: { apiKeyHash: hashApiKey(token), isActive: true },
          select: { id: true, email: true, role: true, isActive: true },
        })
      : await (async () => {
          const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
          return prisma.user.findUnique({
            where: { id: payload.sub, isActive: true },
            select: { id: true, email: true, role: true, isActive: true },
          });
        })();

    if (!user) throw new AppError('User not found or inactive', 401);

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid or expired token', 401));
    } else {
      next(error);
    }
  }
};

export const requireRole = (...roles: string[]) =>
  (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError('Insufficient permissions', 403));
      return;
    }
    next();
  };

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  if (req.cookies?.accessToken) return req.cookies.accessToken as string;
  return null;
}
