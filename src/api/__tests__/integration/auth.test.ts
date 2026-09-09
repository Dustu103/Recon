import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../../index';
import { connectTestDb, clearTestDb, closeTestDb } from '../setup/test-db';
import { UserModel } from '../../auth/models/user.model';
import { SESSION_COOKIE_NAME } from '../../auth/utils/jwt';

describe('D1 Identity & Authentication Integration Suite', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  // ── Registration ─────────────────────────────────────────────────────────
  describe('POST /api/auth/register', () => {
    it('registers a new user, returns 201 with UserPayload, and sets HttpOnly session cookie', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'Test.User@example.com',
          password: 'securePassword123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test.user@example.com');
      expect(res.body.user.id).toBeDefined();
      expect(res.body.user.createdAt).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.passwordHash).toBeUndefined();

      // Check cookie headers
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const sessionCookie = (cookies as string[]).find((c) =>
        c.startsWith(`${SESSION_COOKIE_NAME}=`)
      );
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('Path=/');

      // Verify user was stored with hashed password in Mongo
      const stored = await UserModel.findOne({ email: 'test.user@example.com' });
      expect(stored).not.toBeNull();
      expect(stored!.passwordHash).toBeDefined();
      expect(stored!.passwordHash).not.toBe('securePassword123!');
    });

    it('rejects duplicate email with 409 USER_EXISTS', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'password123',
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'anotherPassword123',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('USER_EXISTS');
    });

    it('handles concurrent race condition (Mongo E11000 duplicate key error) with 409 USER_EXISTS', async () => {
      const originalCreate = UserModel.create;
      const mongoDuplicateErr = new Error('E11000 duplicate key error collection') as Error & { code: number };
      mongoDuplicateErr.code = 11000;
      UserModel.create = vi.fn().mockRejectedValue(mongoDuplicateErr) as any;

      try {
        const res = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'racecondition@example.com',
            password: 'validPassword123',
          });

        expect(res.status).toBe(409);
        expect(res.body.error).toBeDefined();
        expect(res.body.error.code).toBe('USER_EXISTS');
      } finally {
        UserModel.create = originalCreate;
      }
    });

    it('rejects password shorter than 8 chars with 400 INVALID_INPUT', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'short@example.com',
          password: 'short',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });

    it('rejects password longer than 72 chars with 400 INVALID_INPUT', async () => {
      const longPassword = 'a'.repeat(73);
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'long@example.com',
          password: longPassword,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
      expect(res.body.error.message).toContain('72');
    });

    it('rejects invalid email formats with 400 INVALID_INPUT', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'validPassword123',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INPUT');
    });
  });

  // ── Login ────────────────────────────────────────────────────────────────
  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Register a standard user
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'login.test@example.com',
          password: 'correctPassword123',
        });
    });

    it('authenticates valid credentials, returns 200, and sets session cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login.test@example.com',
          password: 'correctPassword123',
        });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('login.test@example.com');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const sessionCookie = (cookies as string[]).find((c) =>
        c.startsWith(`${SESSION_COOKIE_NAME}=`)
      );
      expect(sessionCookie).toBeDefined();
    });

    it('rejects incorrect password with 401 INVALID_CREDENTIALS', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login.test@example.com',
          password: 'wrongPassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects unknown email with 401 INVALID_CREDENTIALS (constant-time response)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'unknown.user@example.com',
          password: 'randomPassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('handles Mongoose CastError or ValidationError with 400 INVALID_INPUT', async () => {
      const originalFindOne = UserModel.findOne;
      const castErr = new Error('Cast to ObjectId failed') as Error & { name: string };
      castErr.name = 'CastError';
      UserModel.findOne = vi.fn().mockRejectedValue(castErr) as any;

      try {
        const res = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'login.test@example.com',
            password: 'correctPassword123',
          });

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
        expect(res.body.error.code).toBe('INVALID_INPUT');
      } finally {
        UserModel.findOne = originalFindOne;
      }
    });
  });

  // ── Rate Limiter ─────────────────────────────────────────────────────────
  describe('Brute-Force Rate Limiter on /api/auth/login', () => {
    it('returns 429 AUTH_RATE_LIMITED on the 6th attempt after 5 consecutive failed logins', async () => {
      // Use unique simulated client IP via X-Forwarded-For (with trust proxy enabled)
      const clientIp = '10.200.1.15';

      // 5 failed attempts are allowed (receive 401)
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .set('X-Forwarded-For', clientIp)
          .send({
            email: 'nonexistent@example.com',
            password: `badPassword${i}`,
          });

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      }

      // The 6th attempt exceeds the max limit of 5 and is blocked
      const blockedRes = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', clientIp)
        .send({
          email: 'nonexistent@example.com',
          password: 'blockedAttempt',
        });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error).toBeDefined();
      expect(blockedRes.body.error.code).toBe('AUTH_RATE_LIMITED');
      expect(blockedRes.body.error.message).toContain('15 minutes');
    });
  });

  // ── Session & /api/auth/me ────────────────────────────────────────────────
  describe('GET /api/auth/me', () => {
    it('returns 200 with UserPayload when authenticated via cookie', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'session.test@example.com',
          password: 'sessionPassword123',
        });

      const cookies = regRes.headers['set-cookie'] as string[];
      const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!;

      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', sessionCookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user).toBeDefined();
      expect(meRes.body.user.email).toBe('session.test@example.com');
      expect(meRes.body.user.id).toBe(regRes.body.user.id);
    });

    it('returns 401 UNAUTHORIZED when no cookie is sent', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 UNAUTHORIZED when session cookie is malformed/tampered', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE_NAME}=tampered.jwt.signature`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 TOKEN_EXPIRED when session token has expired', async () => {
      const secret = process.env.JWT_SECRET || 'test_jwt_secret_that_is_32_chars_long!!';
      // Create an expired token (expired 60s ago)
      const expiredToken = jwt.sign(
        {
          userId: '60d0fe4f5311236168a109ca',
          email: 'expired@example.com',
          exp: Math.floor(Date.now() / 1000) - 60,
        },
        secret
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE_NAME}=${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });
  });

  // ── Logout ───────────────────────────────────────────────────────────────
  describe('POST /api/auth/logout', () => {
    it('returns 200 and clears the session cookie', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const clearedCookie = (cookies as string[]).find((c) =>
        c.startsWith(`${SESSION_COOKIE_NAME}=;`)
      );
      expect(clearedCookie).toBeDefined();
      expect(clearedCookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    });
  });
});
