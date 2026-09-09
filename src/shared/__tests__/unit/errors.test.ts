/**
 * D0.5 — Error Code Registry Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { ErrorCode, TaroError } from '../../errors';

describe('ErrorCode', () => {
  it('exports all expected codes', () => {
    const codes = Object.keys(ErrorCode);
    expect(codes).toContain('COMPANY_UNREACHABLE');
    expect(codes).toContain('INVALID_URL');
    expect(codes).toContain('PRIVATE_IP_BLOCKED');
    expect(codes).toContain('ROBOTS_DISALLOWED');
    expect(codes).toContain('TIMEOUT');
    expect(codes).toContain('RESPONSE_TOO_LARGE');
    expect(codes).toContain('LLM_RATE_LIMITED');
    expect(codes).toContain('LLM_INVALID_JSON');
    expect(codes).toContain('JD_TOO_SHORT');
    expect(codes).toContain('INVALID_INPUT');
    expect(codes).toContain('KIT_SCHEMA_INVALID');
    expect(codes).toContain('SCHEDULE_ALLOCATION_FAILED');
    expect(codes).toContain('CASE_FAILED');
    expect(codes).toContain('NOT_FOUND');
    expect(codes).toContain('INTERNAL_ERROR');
    expect(codes).toContain('UNAUTHORIZED');
    expect(codes).toContain('TOKEN_EXPIRED');
    expect(codes).toContain('INVALID_CREDENTIALS');
    expect(codes).toContain('USER_EXISTS');
    expect(codes).toContain('AUTH_RATE_LIMITED');
    expect(codes).toContain('KIT_NOT_FOUND');
    expect(codes).toContain('UNAUTHORIZED_KIT_ACCESS');
    expect(codes).toContain('BATCH_SIZE_EXCEEDED');
    expect(codes).toContain('GENERATION_IN_PROGRESS');
  });

  it('has no duplicate values', () => {
    const values = Object.values(ErrorCode);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(ErrorCode)).toBe(true);
    expect(() => {
      (ErrorCode as Record<string, string>)['NEW_CODE'] = 'NEW_CODE';
    }).toThrow();
    expect(Object.keys(ErrorCode)).not.toContain('NEW_CODE');
  });
});

describe('TaroError', () => {
  it('preserves code, message, and name', () => {
    const err = new TaroError(ErrorCode.TIMEOUT, 'Request timed out after 8s');
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toBe('Request timed out after 8s');
    expect(err.name).toBe('TaroError');
    expect(err).toBeInstanceOf(Error);
  });

  it('accepts an optional cause', () => {
    const original = new Error('fetch failed');
    const err = new TaroError(ErrorCode.COMPANY_UNREACHABLE, 'Site unreachable', original);
    expect(err.cause).toBe(original);
  });

  it('serializes to JSON with code, message, and name intact', () => {
    const err = new TaroError(ErrorCode.TIMEOUT, 'Request timed out after 8s');
    const jsonStr = JSON.stringify(err);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.code).toBe('TIMEOUT');
    expect(parsed.message).toBe('Request timed out after 8s');
    expect(parsed.name).toBe('TaroError');
  });
});
