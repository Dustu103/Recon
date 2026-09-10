/**
 * Domain 3: Unified Resilient LLM Client
 * Orchestrates rate limiting, prompt quarantine, transparent live failover (Gemini -> Groq),
 * and strictly isolated mock test execution.
 */
import { LlmProvider, LlmRequestOptions, LlmResponse } from './types';
import { TokenBucketLimiter } from './rate-limiter';
import { executeWithRetry } from './retry';
import { GeminiProvider } from './providers/gemini.provider';
import { GroqProvider } from './providers/groq.provider';
import { MockLlmProvider } from './providers/mock.provider';
import { ErrorCode, TaroError } from '@taro/shared';

export interface LlmClientConfig {
  tpmLimit?: number;
  rpmLimit?: number;
  mock?: boolean;
}

export class LlmClient {
  private readonly limiter: TokenBucketLimiter;
  private readonly mockMode: boolean;

  private primaryProvider: LlmProvider | null = null;
  private fallbackProvider: LlmProvider | null = null;
  private mockProvider: MockLlmProvider;

  constructor(config: LlmClientConfig = {}) {
    this.limiter = new TokenBucketLimiter({
      tpmLimit: config.tpmLimit || (process.env.LLM_TPM_LIMIT ? parseInt(process.env.LLM_TPM_LIMIT, 10) : 60000),
      rpmLimit: config.rpmLimit || (process.env.LLM_RPM_LIMIT ? parseInt(process.env.LLM_RPM_LIMIT, 10) : 15),
    });

    this.mockMode = config.mock ?? (process.env.NODE_ENV === 'test');
    this.mockProvider = new MockLlmProvider();

    if (!this.mockMode) {
      this.initLiveProviders();
    }
  }

  private initLiveProviders(): void {
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (geminiKey) {
      try {
        this.primaryProvider = new GeminiProvider(geminiKey);
      } catch (err) {
        console.warn('[LlmClient] Failed to initialize GeminiProvider:', (err as Error).message);
      }
    }

    if (groqKey) {
      try {
        const groq = new GroqProvider(groqKey);
        if (!this.primaryProvider) {
          // If Gemini key is missing, Groq becomes primary
          this.primaryProvider = groq;
        } else {
          this.fallbackProvider = groq;
        }
      } catch (err) {
        console.warn('[LlmClient] Failed to initialize GroqProvider:', (err as Error).message);
      }
    }
  }

  public getRateLimiter(): TokenBucketLimiter {
    return this.limiter;
  }

  /**
   * Executes prompt completion with rate limiting, retries, and live failover.
   */
  public async complete(prompt: string, options: LlmRequestOptions = {}): Promise<LlmResponse> {
    // 1. Check Mock Gating (strictly isolated from live failover)
    if (this.mockMode || options.mock) {
      const res = await this.mockProvider.complete(prompt, options);
      this.limiter.recordUsage(res.totalTokens);
      return res;
    }

    // 2. Ensure at least one live provider is available
    if (!this.primaryProvider && !this.fallbackProvider) {
      throw new TaroError(
        ErrorCode.LLM_PROVIDER_ERROR,
        'No active LLM providers configured. Set GEMINI_API_KEY or GROQ_API_KEY.'
      );
    }

    // 3. Pre-dispatch rate-limit check
    const estimatedTokens = TokenBucketLimiter.estimateTokens(prompt) + (options.maxTokens ?? 1000);
    await this.limiter.throttleIfNeeded(estimatedTokens);

    // 4. Attempt Primary Provider
    const activePrimary = this.primaryProvider || this.fallbackProvider!;
    try {
      const res = await executeWithRetry(() => activePrimary.complete(prompt, options), {
        maxRetries: 3,
      });
      this.limiter.recordUsage(res.totalTokens);
      return res;
    } catch (primaryErr) {
      // 5. Attempt Secondary Fallback if available
      if (this.fallbackProvider && activePrimary !== this.fallbackProvider) {
        console.warn(
          `[LlmClient] Primary provider (${activePrimary.name}) failed: ${(primaryErr as Error).message}. Attempting fallback (${this.fallbackProvider.name})...`
        );
        try {
          const fallbackRes = await executeWithRetry(() => this.fallbackProvider!.complete(prompt, options), {
            maxRetries: 3,
          });
          this.limiter.recordUsage(fallbackRes.totalTokens);
          return fallbackRes;
        } catch (fallbackErr) {
          throw new TaroError(
            ErrorCode.LLM_PROVIDER_ERROR,
            `All live LLM providers failed. Primary: ${(primaryErr as Error).message}; Fallback: ${(fallbackErr as Error).message}`,
            fallbackErr
          );
        }
      }

      // If no fallback was available, bubble typed error (NEVER fall through to mock!)
      throw new TaroError(
        ErrorCode.LLM_PROVIDER_ERROR,
        `LLM completion failed on ${activePrimary.name}: ${(primaryErr as Error).message}`,
        primaryErr
      );
    }
  }
}

let _defaultClient: LlmClient | null = null;

export function getDefaultLlmClient(config?: LlmClientConfig): LlmClient {
  if (!_defaultClient || config) {
    _defaultClient = new LlmClient(config);
  }
  return _defaultClient;
}

export function _resetDefaultLlmClient(): void {
  _defaultClient = null;
}
