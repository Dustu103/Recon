/**
 * D0.5 — Frozen Error Code Registry
 * Every throw anywhere in the codebase must use one of these codes.
 * Never a raw string.
 */

export const ErrorCode = Object.freeze({
  // ── Crawler / Network ─────────────────────────────────────────────────────
  COMPANY_UNREACHABLE: 'COMPANY_UNREACHABLE',
  INVALID_URL: 'INVALID_URL',
  PRIVATE_IP_BLOCKED: 'PRIVATE_IP_BLOCKED',
  ROBOTS_DISALLOWED: 'ROBOTS_DISALLOWED',
  TIMEOUT: 'TIMEOUT',
  RESPONSE_TOO_LARGE: 'RESPONSE_TOO_LARGE',

  // ── LLM Pipeline ──────────────────────────────────────────────────────────
  LLM_RATE_LIMITED: 'LLM_RATE_LIMITED',
  LLM_INVALID_JSON: 'LLM_INVALID_JSON',
  JD_TOO_SHORT: 'JD_TOO_SHORT',

  // ── Validation & Deterministic ────────────────────────────────────────────
  INVALID_INPUT: 'INVALID_INPUT',
  KIT_SCHEMA_INVALID: 'KIT_SCHEMA_INVALID',
  SCHEDULE_ALLOCATION_FAILED: 'SCHEDULE_ALLOCATION_FAILED',
  CASE_FAILED: 'CASE_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // ── Auth & Session (D1) ───────────────────────────────────────────────────
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_EXISTS: 'USER_EXISTS',
  AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',

  // ── Kit Persistence & Access (D5) ─────────────────────────────────────────
  KIT_NOT_FOUND: 'KIT_NOT_FOUND',
  UNAUTHORIZED_KIT_ACCESS: 'UNAUTHORIZED_KIT_ACCESS',
  BATCH_SIZE_EXCEEDED: 'BATCH_SIZE_EXCEEDED',

  // ── Concurrency & State (D5/D6) ───────────────────────────────────────────
  GENERATION_IN_PROGRESS: 'GENERATION_IN_PROGRESS',
  CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
} as const);

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Structured error thrown everywhere in the codebase. */
export class TaroError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TaroError';

    // Standard JavaScript Error has non-enumerable message.
    // Make message enumerable so JSON.stringify(err) includes message.
    Object.defineProperty(this, 'message', {
      value: message,
      enumerable: true,
      writable: true,
      configurable: true,
    });

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TaroError);
    }
  }

  toJSON(): { name: string; code: ErrorCode; message: string; cause?: unknown } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.cause !== undefined ? { cause: this.cause } : {}),
    };
  }
}
