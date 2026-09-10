/**
 * Domain 3: Jittered Exponential Backoff Engine
 * Handles HTTP 429 / 503 errors and extracts explicit retry-after hints.
 */
import { ErrorCode, TaroError } from '@taro/shared';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

/**
 * Extracts wait duration from standard error headers or messages.
 * Matches:
 *  - "Please try again in 18.4s"
 *  - "retry-after: 20"
 *  - err.status === 429 / 503
 */
export function extractRetryAfterMs(error: unknown): number | null {
  if (!error) return null;

  // Check custom or standard properties
  if (typeof error === 'object') {
    const errObj = error as Record<string, unknown>;

    // Direct header or property
    if (typeof errObj.retryAfter === 'number' && errObj.retryAfter > 0) {
      return errObj.retryAfter * 1000;
    }

    if (typeof errObj.retryAfter === 'string') {
      const parsed = parseFloat(errObj.retryAfter);
      if (!isNaN(parsed) && parsed > 0) return Math.ceil(parsed * 1000);
    }

    // Message inspection
    if (typeof errObj.message === 'string') {
      const msg = errObj.message;
      // Groq / OpenAI style: "Please try again in 18.4s." or "try again in 20s"
      const matchSeconds = /try again in ([\d.]+)\s*s/i.exec(msg);
      if (matchSeconds && matchSeconds[1]) {
        const secs = parseFloat(matchSeconds[1]);
        if (!isNaN(secs) && secs > 0) {
          return Math.ceil(secs * 1000) + 100; // 100ms safety buffer
        }
      }

      // Milliseconds pattern
      const matchMs = /try again in ([\d]+)\s*ms/i.exec(msg);
      if (matchMs && matchMs[1]) {
        const ms = parseInt(matchMs[1], 10);
        if (!isNaN(ms) && ms > 0) {
          return ms + 50;
        }
      }
    }
  }

  return null;
}

/**
 * Determines if an error is retryable (429 Rate Limit, 503 Service Unavailable, Network Glitch).
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof TaroError) {
    if (error.code === ErrorCode.LLM_RATE_LIMITED) return true;
  }

  if (typeof error === 'object') {
    const errObj = error as Record<string, unknown>;

    const status = errObj.status || errObj.statusCode;
    if (status === 429 || status === 503 || status === 502 || status === 504) {
      return true;
    }

    const msg = String(errObj.message || '').toLowerCase();
    if (
      msg.includes('rate limit') ||
      msg.includes('too many requests') ||
      msg.includes('429') ||
      msg.includes('503') ||
      msg.includes('service unavailable') ||
      msg.includes('overloaded') ||
      msg.includes('fetch failed') ||
      msg.includes('econnreset') ||
      msg.includes('etimedout')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Executes async task with jittered exponential backoff.
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 16000;

  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;

      if (attempt > maxRetries || !isRetryableError(err)) {
        if (attempt > maxRetries && isRetryableError(err)) {
          throw new TaroError(
            ErrorCode.LLM_RATE_LIMITED,
            `LLM rate limit or transient service error exhausted all ${maxRetries} retries: ${(err as Error).message}`,
            err
          );
        }
        throw err;
      }

      // Check if server gave an explicit retry-after hint
      const explicitRetryMs = extractRetryAfterMs(err);

      let delayMs: number;
      if (explicitRetryMs && explicitRetryMs > 0) {
        delayMs = Math.min(explicitRetryMs, maxDelayMs * 2);
      } else {
        // Full jitter exponential backoff: min(maxDelay, baseDelay * 2^(attempt-1)) + jitter
        const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
        const jitter = Math.floor(Math.random() * 500); // 0 to 500ms
        delayMs = expDelay + jitter;
      }

      if (options.onRetry) {
        options.onRetry(attempt, delayMs, err);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
