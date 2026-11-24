import { Request, Response, NextFunction, CookieOptions } from 'express';
import { authService, refreshTokenMaxAgeMs } from './auth.service';
import type { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { requestMeta } from '../../lib/audit';

const REFRESH_COOKIE = 'refreshToken';

// The refresh cookie is only ever sent to the auth routes, never to the rest of the API
const cookieOpts = (): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: refreshTokenMaxAgeMs(),
});

const clearRefreshCookie = (res: Response) => {
  res.clearCookie(REFRESH_COOKIE, { ...cookieOpts(), maxAge: undefined });
  // Older builds set the cookie on '/', clear that one too
  res.clearCookie(REFRESH_COOKIE);
};

export const authController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body, requestMeta(req));
      res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts());
      res.status(201).json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
    } catch (e) { next(e); }
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body, requestMeta(req));
      res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts());
      res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
    } catch (e) { next(e); }
  },

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
      if (!token) {
        res.status(401).json({ success: false, error: { code: 'NO_REFRESH_TOKEN', message: 'Refresh token required' } });
        return;
      }
      const result = await authService.refresh(token);
      res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOpts());
      res.json({ success: true, data: { accessToken: result.accessToken } });
    } catch (e) {
      clearRefreshCookie(res);
      next(e);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.logout(req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken);
      clearRefreshCookie(res);
      res.json({ success: true, data: { message: 'Logged out successfully' } });
    } catch (e) { next(e); }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.forgotPassword(req.body.email, requestMeta(req));
      res.json({ success: true, data: { message: 'If that email exists, a reset link has been sent' } });
    } catch (e) { next(e); }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.resetPassword(req.body.token, req.body.password, requestMeta(req));
      clearRefreshCookie(res);
      res.json({ success: true, data: { message: 'Password reset successfully' } });
    } catch (e) { next(e); }
  },

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.verifyEmail(req.body.token);
      res.json({ success: true, data: { verified: true } });
    } catch (e) { next(e); }
  },

  async resendVerification(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const r = await authService.resendVerification(req.user!.id);
      res.json({ success: true, data: { sent: !r.alreadyVerified, alreadyVerified: r.alreadyVerified } });
    } catch (e) { next(e); }
  },

  async me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, email: true, name: true, role: true, emailVerified: true, createdAt: true },
      });
      res.json({ success: true, data: user });
    } catch (e) { next(e); }
  },
};
