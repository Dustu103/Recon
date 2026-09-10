import { describe, it, expect } from 'vitest';
import { LlmClient } from '../../client';
import { ErrorCode, TaroError } from '@taro/shared';

describe('Unified Resilient LlmClient', () => {
  it('activates deterministic Mock provider in test mode or when mock: true', async () => {
    const client = new LlmClient({ mock: true });
    const res = await client.complete('Test prompt', {
      systemPrompt: 'Extract role requirements',
    });

    expect(res.provider).toBe('mock');
    expect(res.content).toContain('Senior Software Engineer');
    expect(res.totalTokens).toBeGreaterThan(0);
  });

  it('records token usage against the internal rate limiter', async () => {
    const client = new LlmClient({ mock: true });
    const limiter = client.getRateLimiter();
    limiter.reset();

    expect(limiter.getCurrentTokens()).toBe(0);
    await client.complete('Sample prompt', { mock: true });
    expect(limiter.getCurrentTokens()).toBeGreaterThan(0);
  });

  it('strictly throws LLM_PROVIDER_ERROR when live providers are not configured and mock is false', async () => {
    const origGemini = process.env.GEMINI_API_KEY;
    const origGroq = process.env.GROQ_API_KEY;

    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      const client = new LlmClient({ mock: false });
      await expect(client.complete('test', { mock: false })).rejects.toThrow(TaroError);
      try {
        await client.complete('test', { mock: false });
      } catch (err) {
        expect((err as TaroError).code).toBe(ErrorCode.LLM_PROVIDER_ERROR);
      }
    } finally {
      if (origGemini) process.env.GEMINI_API_KEY = origGemini;
      if (origGroq) process.env.GROQ_API_KEY = origGroq;
    }
  });
});
