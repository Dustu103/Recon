import { describe, it, expect, beforeEach } from 'vitest';
import { TokenBucketLimiter } from '../../rate-limiter';

describe('TokenBucketLimiter', () => {
  let limiter: TokenBucketLimiter;

  beforeEach(() => {
    limiter = new TokenBucketLimiter({
      tpmLimit: 1000,
      rpmLimit: 5,
      safetyMargin: 0.8, // max 800 tokens, max 4 rpm
    });
  });

  it('estimates tokens based on character length', () => {
    expect(TokenBucketLimiter.estimateTokens('1234')).toBe(1);
    expect(TokenBucketLimiter.estimateTokens('12345678')).toBe(2);
    expect(TokenBucketLimiter.estimateTokens('')).toBe(0);
  });

  it('allows requests within TPM and RPM budget with 0 wait time', () => {
    expect(limiter.getRequiredWaitMs(100)).toBe(0);
    limiter.recordUsage(100);
    expect(limiter.getCurrentTokens()).toBe(100);
    expect(limiter.getCurrentRpm()).toBe(1);
  });

  it('calculates wait time when TPM ceiling is breached', () => {
    const now = Date.now();
    limiter.recordUsage(750, now);
    // 750 + 100 = 850 > 800 (tpm ceiling with 0.8 safety margin)
    const waitMs = limiter.getRequiredWaitMs(100, now);
    expect(waitMs).toBeGreaterThan(0);
    expect(waitMs).toBeLessThanOrEqual(60050);
  });

  it('calculates wait time when RPM ceiling is breached', () => {
    const now = Date.now();
    limiter.recordUsage(10, now);
    limiter.recordUsage(10, now);
    limiter.recordUsage(10, now);
    limiter.recordUsage(10, now);
    // 4 requests made, maxAllowedRpm = floor(5 * 0.8) = 4
    const waitMs = limiter.getRequiredWaitMs(10, now);
    expect(waitMs).toBeGreaterThan(0);
  });

  it('prunes expired records older than 60 seconds', () => {
    const pastTime = Date.now() - 65000;
    limiter.recordUsage(500, pastTime);
    expect(limiter.getCurrentTokens()).toBe(0);
    expect(limiter.getCurrentRpm()).toBe(0);
  });
});
