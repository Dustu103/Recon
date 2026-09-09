import rateLimit from 'express-rate-limit';
import { TaroError, ErrorCode } from '@/shared';

/**
 * General burst protection across auth routes (20 req/min per IP).
 */
export const authBurstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new TaroError(
        ErrorCode.AUTH_RATE_LIMITED,
        'Too many authentication requests from this IP. Please wait a moment.'
      )
    );
  },
});

/**
 * Dedicated brute-force throttle on /api/auth/login.
 * Tracks failed attempts strictly per IP.
 * Successful logins do NOT decrement the quota (skipSuccessfulRequests: true).
 */
export const loginFailedAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // 5 failed attempts per window
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new TaroError(
        ErrorCode.AUTH_RATE_LIMITED,
        'Too many failed login attempts from this IP. Please try again in 15 minutes.'
      )
    );
  },
});
