import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import type { AuthRequest } from './auth';

export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  // Per client IP. A single page load fires 6-10 requests, so the default is 1000 per 15 minutes;
  // auth and AI have their own much stricter limits below.
  max: env.NODE_ENV === 'production' ? env.RATE_LIMIT_MAX_REQUESTS : Math.max(env.RATE_LIMIT_MAX_REQUESTS, 5000),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many auth attempts' } },
});

// Token refresh happens on every page load and whenever the 15-minute access token expires
export const refreshRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'test' ? 1000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
});

// Counted per signed-in user (it always runs after authenticate), so people behind one office or
// mobile-carrier IP don't share a single AI allowance
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: () => env.AI_RATE_LIMIT_PER_MINUTE,
  keyGenerator: req => ((req as AuthRequest).user?.id ? `user:${(req as AuthRequest).user!.id}` : `ip:${req.ip ?? 'unknown'}`),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'AI rate limit exceeded' } },
});
