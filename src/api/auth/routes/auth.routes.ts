import { Router } from 'express';
import {
  register,
  login,
  logout,
  me,
  sendOtp,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller';
import {
  authBurstLimiter,
  loginFailedAttemptLimiter,
} from '../middleware/rate-limiter';
import { requireAuth } from '../middleware/require-auth';

export const authRouter = Router();

authRouter.post('/register', authBurstLimiter, register);
authRouter.post('/send-otp', authBurstLimiter, sendOtp);
authRouter.post('/verify-otp', authBurstLimiter, verifyOtp);
authRouter.post('/resend-otp', authBurstLimiter, resendOtp);
authRouter.post('/forgot-password', authBurstLimiter, forgotPassword);
authRouter.post('/reset-password', authBurstLimiter, resetPassword);
authRouter.post('/login', authBurstLimiter, loginFailedAttemptLimiter, login);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);
