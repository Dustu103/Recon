import jwt from 'jsonwebtoken';
import { Response } from 'express';

export const SESSION_COOKIE_NAME = 'taro_session';

export interface SessionTokenPayload {
  userId: string;
  email: string;
}

/** Pre-computed bcrypt hash of a random dummy string for constant-time comparisons */
export const DUMMY_PASSWORD_HASH =
  '$2a$10$wT0o3q6k9dK8vK8a8q1hEeX1yPZ2wL4mN6bV8cX0zO2aC4eG6iK8u';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('[Auth] JWT_SECRET is not defined in environment');
  }
  return secret;
}

/** Signs a 7-day session token */
export function signSessionToken(
  payload: SessionTokenPayload,
  expiresIn: jwt.SignOptions['expiresIn'] = '7d'
): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn,
  });
}

/** Verifies session token; throws TokenExpiredError or JsonWebTokenError on invalid */
export function verifySessionToken(token: string): SessionTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret());
  return decoded as SessionTokenPayload;
}

/** Attaches the HttpOnly SameSite=Lax session cookie to the response */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: '/',
  });
}

/** Clears the session cookie from the response */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}
