import { describe, it, expect } from 'vitest';
import {
  RegisterInputSchema,
  LoginInputSchema,
  UserPayloadSchema,
} from '../../schemas/auth.schema';

describe('RegisterInputSchema', () => {
  it('normalizes valid email (trim and lowercase)', () => {
    const parsed = RegisterInputSchema.parse({
      email: '   Candidate@Example.COM  ',
      password: 'strongPassword123!',
    });
    expect(parsed.email).toBe('candidate@example.com');
    expect(parsed.password).toBe('strongPassword123!');
  });

  it('accepts valid password at min boundary (8 characters)', () => {
    const parsed = RegisterInputSchema.parse({
      email: 'user@example.com',
      password: '12345678',
    });
    expect(parsed.password).toBe('12345678');
  });

  it('accepts valid password at max bcrypt boundary (72 characters)', () => {
    const password72 = 'a'.repeat(72);
    const parsed = RegisterInputSchema.parse({
      email: 'user@example.com',
      password: password72,
    });
    expect(parsed.password.length).toBe(72);
  });

  it('rejects password exceeding 72 characters to prevent bcrypt silent truncation', () => {
    const password73 = 'a'.repeat(73);
    const result = RegisterInputSchema.safeParse({
      email: 'user@example.com',
      password: password73,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('72');
    }
  });

  it('rejects multi-byte password exceeding 72 bytes even if character length is <= 72', () => {
    // 20 emoji characters = 80 bytes in UTF-8
    const emojiPassword = '🔑'.repeat(20);
    const result = RegisterInputSchema.safeParse({
      email: 'user@example.com',
      password: emojiPassword,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('72 bytes');
    }
  });

  it('rejects password shorter than 8 characters', () => {
    const result = RegisterInputSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('8 characters');
    }
  });

  it('rejects invalid email address', () => {
    const result = RegisterInputSchema.safeParse({
      email: 'not-an-email',
      password: 'validPassword123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(RegisterInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('LoginInputSchema', () => {
  it('normalizes valid login credentials', () => {
    const parsed = LoginInputSchema.parse({
      email: '  Applicant@Domain.ORG  ',
      password: 'mypassword',
    });
    expect(parsed.email).toBe('applicant@domain.org');
    expect(parsed.password).toBe('mypassword');
  });

  it('rejects empty password', () => {
    const result = LoginInputSchema.safeParse({
      email: 'valid@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects password exceeding 72 characters', () => {
    const result = LoginInputSchema.safeParse({
      email: 'valid@example.com',
      password: 'a'.repeat(73),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = LoginInputSchema.safeParse({
      email: 'bad-email',
      password: 'somepassword',
    });
    expect(result.success).toBe(false);
  });
});

describe('UserPayloadSchema', () => {
  it('accepts valid user payload with ISO string date', () => {
    const parsed = UserPayloadSchema.parse({
      id: 'usr-12345',
      email: 'dev@taro.ai',
      createdAt: '2026-09-01T12:00:00.000Z',
    });
    expect(parsed.id).toBe('usr-12345');
    expect(parsed.email).toBe('dev@taro.ai');
  });

  it('accepts valid user payload with Date object', () => {
    const date = new Date();
    const parsed = UserPayloadSchema.parse({
      id: 'usr-67890',
      email: 'lead@taro.ai',
      createdAt: date,
    });
    expect(parsed.createdAt).toStrictEqual(date);
  });

  it('accepts valid user payload without createdAt (for stateless session tokens)', () => {
    const parsed = UserPayloadSchema.parse({
      id: 'usr-sess-1',
      email: 'session@taro.ai',
    });
    expect(parsed.id).toBe('usr-sess-1');
    expect(parsed.email).toBe('session@taro.ai');
    expect(parsed.createdAt).toBeUndefined();
  });

  it('rejects invalid email or empty id', () => {
    expect(
      UserPayloadSchema.safeParse({
        id: '',
        email: 'invalid-email',
        createdAt: new Date().toISOString(),
      }).success
    ).toBe(false);
  });
});
