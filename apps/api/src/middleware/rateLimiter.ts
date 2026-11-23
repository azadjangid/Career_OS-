import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  // A single page load fires several requests, so the production default (100/15min) is
  // too tight to develop against. Keep it strict in production only.
  max: env.NODE_ENV === 'production' ? env.RATE_LIMIT_MAX_REQUESTS : Math.max(env.RATE_LIMIT_MAX_REQUESTS, 5000),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many auth attempts' } },
});

export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: env.AI_RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'AI rate limit exceeded' } },
});
