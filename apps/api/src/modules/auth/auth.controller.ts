import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import type { AuthRequest } from '../../middleware/auth';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'strict' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

export const authController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body);
      res.cookie('refreshToken', result.refreshToken, COOKIE_OPTS);
      res.status(201).json({
        success: true,
        data: { accessToken: result.accessToken, user: result.user },
      });
    } catch (e) { next(e); }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body);
      res.cookie('refreshToken', result.refreshToken, COOKIE_OPTS);
      res.json({
        success: true,
        data: { accessToken: result.accessToken, user: result.user },
      });
    } catch (e) { next(e); }
  },

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.refreshToken ?? req.body?.refreshToken;
      if (!token) { res.status(401).json({ success: false, error: { message: 'Refresh token required' } }); return; }
      const result = await authService.refresh(token);
      res.cookie('refreshToken', result.refreshToken, COOKIE_OPTS);
      res.json({ success: true, data: { accessToken: result.accessToken } });
    } catch (e) { next(e); }
  },

  async logout(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.refreshToken;
      await authService.logout(req.user!.id, token);
      res.clearCookie('refreshToken');
      res.json({ success: true, data: { message: 'Logged out successfully' } });
    } catch (e) { next(e); }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.forgotPassword(req.body.email);
      res.json({ success: true, data: { message: 'If that email exists, a reset link has been sent' } });
    } catch (e) { next(e); }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.resetPassword(req.body.token, req.body.password);
      res.json({ success: true, data: { message: 'Password reset successfully' } });
    } catch (e) { next(e); }
  },

  async me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prisma } = await import('../../config/database');
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, email: true, name: true, role: true, emailVerified: true, createdAt: true },
      });
      res.json({ success: true, data: user });
    } catch (e) { next(e); }
  },
};
