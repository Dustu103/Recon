import { Router } from 'express';
import {
  register,
  login,
  logout,
  me,
} from '../controllers/auth.controller';
import {
  authBurstLimiter,
  loginFailedAttemptLimiter,
} from '../middleware/rate-limiter';
import { requireAuth } from '../middleware/require-auth';

export const authRouter = Router();

authRouter.post('/register', authBurstLimiter, register);
authRouter.post('/login', authBurstLimiter, loginFailedAttemptLimiter, login);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);
