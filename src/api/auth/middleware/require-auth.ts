import { Request, Response, NextFunction } from 'express';
import { TaroError, ErrorCode } from '@/shared';
import { verifySessionToken, SESSION_COOKIE_NAME } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

/**
 * Strict cookie-only authentication middleware.
 * Reads solely from req.cookies.taro_session. Zero Bearer fallback.
 * Differentiates TokenExpiredError from generic invalid token signatures.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];

  if (!token) {
    return next(new TaroError(ErrorCode.UNAUTHORIZED, 'Authentication required'));
  }

  try {
    const payload = verifySessionToken(token);
    req.user = {
      id: payload.userId,
      email: payload.email,
    };
    next();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      return next(
        new TaroError(ErrorCode.TOKEN_EXPIRED, 'Session token has expired, please log in again')
      );
    }
    return next(new TaroError(ErrorCode.UNAUTHORIZED, 'Invalid session token'));
  }
}
