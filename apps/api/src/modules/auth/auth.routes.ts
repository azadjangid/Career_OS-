import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { authRateLimit, refreshRateLimit } from '../../middleware/rateLimiter';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
  verifyEmailSchema,
} from './auth.schema';

const router = Router();

router.post('/register', authRateLimit, validate(registerSchema), authController.register);
router.post('/login', authRateLimit, validate(loginSchema), authController.login);
router.post('/logout', refreshRateLimit, validate(refreshTokenSchema.partial()), authController.logout);
router.post('/refresh', refreshRateLimit, validate(refreshTokenSchema.partial()), authController.refresh);
router.post('/forgot-password', authRateLimit, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authRateLimit, validate(resetPasswordSchema), authController.resetPassword);
router.post('/verify-email', authRateLimit, validate(verifyEmailSchema), authController.verifyEmail);
router.post('/resend-verification', authRateLimit, authenticate, authController.resendVerification);
router.get('/me', authenticate, authController.me);

export default router;
