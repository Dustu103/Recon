/**
 * Domain 3: Groq LLM Provider (Fallback Live Provider)
 */
import { Groq } from 'groq-sdk';
import { LlmProvider, LlmRequestOptions, LlmResponse } from '../types';
import { TokenBucketLimiter } from '../rate-limiter';
import { ErrorCode, TaroError } from '@taro/shared';

export class GroqProvider implements LlmProvider {
  public readonly name = 'groq' as const;
  private readonly client: Groq;
  private readonly defaultModel: string;

  constructor(apiKey?: string, modelName?: string) {
    const key = apiKey || process.env.GROQ_API_KEY;
    if (!key) {
      throw new TaroError(ErrorCode.INTERNAL_ERROR, 'GROQ_API_KEY is not configured');
    }
    this.client = new Groq({ apiKey: key });
    this.defaultModel = modelName || process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  }

  public async complete(prompt: string, options: LlmRequestOptions = {}): Promise<LlmResponse> {
    const modelName = this.defaultModel;

    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const completion = await this.client.chat.completions.create({
      model: modelName,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    });

    const content = completion.choices[0]?.message?.content || '';

    const promptTokens = completion.usage?.prompt_tokens ?? TokenBucketLimiter.estimateTokens(prompt);
    const completionTokens = completion.usage?.completion_tokens ?? TokenBucketLimiter.estimateTokens(content);
    const totalTokens = completion.usage?.total_tokens ?? promptTokens + completionTokens;

    return {
      content,
      promptTokens,
      completionTokens,
      totalTokens,
      model: modelName,
      provider: 'groq',
    };
  }
}
