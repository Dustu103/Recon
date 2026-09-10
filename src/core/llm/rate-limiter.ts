/**
 * Domain 3: Token-Bucket Rate Limiter & Concurrency Queue
 * Enforces configured TPM and RPM limits via a sliding-window tracker.
 */
import { TokenUsageWindow } from './types';

export interface RateLimiterConfig {
  tpmLimit?: number;
  rpmLimit?: number;
  safetyMargin?: number; // e.g. 0.8 to stay under 80% ceiling
}

export class TokenBucketLimiter {
  private readonly tpmLimit: number;
  private readonly rpmLimit: number;
  private readonly safetyMargin: number;

  private tokenUsage: TokenUsageWindow[] = [];
  private requestTimestamps: number[] = [];

  constructor(config: RateLimiterConfig = {}) {
    this.tpmLimit = config.tpmLimit || 60000;
    this.rpmLimit = config.rpmLimit || 15;
    this.safetyMargin = config.safetyMargin || 0.85;
  }

  /**
   * Prunes records older than 60 seconds (60,000 ms).
   */
  private prune(now = Date.now()): void {
    const windowStart = now - 60000;
    this.tokenUsage = this.tokenUsage.filter((item) => item.timestamp > windowStart);
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > windowStart);
  }

  /**
   * Returns currently consumed tokens in the active 60s sliding window.
   */
  public getCurrentTokens(now = Date.now()): number {
    this.prune(now);
    return this.tokenUsage.reduce((acc, curr) => acc + curr.tokens, 0);
  }

  /**
   * Returns currently consumed requests in the active 60s sliding window.
   */
  public getCurrentRpm(now = Date.now()): number {
    this.prune(now);
    return this.requestTimestamps.length;
  }

  /**
   * Approximates token count from text length (~4 chars per token).
   */
  public static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Checks if dispatching `estimatedTokens` would violate TPM or RPM limits.
   * If so, returns the sleep delay in ms required before dispatching is safe.
   */
  public getRequiredWaitMs(estimatedTokens: number, now = Date.now()): number {
    this.prune(now);

    const maxAllowedTokens = Math.floor(this.tpmLimit * this.safetyMargin);
    const maxAllowedRpm = Math.floor(this.rpmLimit * this.safetyMargin);

    const currentTokens = this.tokenUsage.reduce((sum, item) => sum + item.tokens, 0);
    const currentRpm = this.requestTimestamps.length;

    let waitMs = 0;

    // Check RPM ceiling
    if (currentRpm >= maxAllowedRpm && this.requestTimestamps.length > 0) {
      const oldestReq = this.requestTimestamps[0];
      const rpmExpiry = oldestReq + 60000 - now + 50; // extra 50ms padding
      if (rpmExpiry > waitMs) {
        waitMs = rpmExpiry;
      }
    }

    // Check TPM ceiling
    if (currentTokens + estimatedTokens > maxAllowedTokens && this.tokenUsage.length > 0) {
      const oldestToken = this.tokenUsage[0];
      const tpmExpiry = oldestToken.timestamp + 60000 - now + 50;
      if (tpmExpiry > waitMs) {
        waitMs = tpmExpiry;
      }
    }

    return Math.max(0, waitMs);
  }

  /**
   * Automatically pauses execution if dispatching would breach rate limits.
   */
  public async throttleIfNeeded(estimatedTokens: number): Promise<void> {
    const waitMs = this.getRequiredWaitMs(estimatedTokens);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  /**
   * Records completed request token and request count.
   */
  public recordUsage(tokens: number, now = Date.now()): void {
    this.prune(now);
    this.tokenUsage.push({ timestamp: now, tokens: Math.max(1, tokens) });
    this.requestTimestamps.push(now);
  }

  /**
   * Explicitly reset limiter state (used in testing).
   */
  public reset(): void {
    this.tokenUsage = [];
    this.requestTimestamps = [];
  }
}
