/**
 * Domain 3: Google Gemini LLM Provider (Primary Live Provider)
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { LlmProvider, LlmRequestOptions, LlmResponse } from '../types';
import { TokenBucketLimiter } from '../rate-limiter';
import { ErrorCode, TaroError } from '@taro/shared';

export class GeminiProvider implements LlmProvider {
  public readonly name = 'gemini' as const;
  private readonly client: GoogleGenerativeAI;
  private readonly defaultModel: string;

  constructor(apiKey?: string, modelName?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new TaroError(ErrorCode.LLM_PROVIDER_ERROR, 'GEMINI_API_KEY is not configured');
    }
    this.client = new GoogleGenerativeAI(key);
    this.defaultModel = modelName || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  public async complete(prompt: string, options: LlmRequestOptions = {}): Promise<LlmResponse> {
    const modelName = this.defaultModel;
    const model = this.client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 4096,
        responseMimeType: options.jsonMode ? 'application/json' : 'text/plain',
      },
      systemInstruction: options.systemPrompt,
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const content = response.text();

    const usage = response.usageMetadata;
    const promptTokens = usage?.promptTokenCount ?? TokenBucketLimiter.estimateTokens(prompt);
    const completionTokens = usage?.candidatesTokenCount ?? TokenBucketLimiter.estimateTokens(content);
    const totalTokens = usage?.totalTokenCount ?? promptTokens + completionTokens;

    return {
      content,
      promptTokens,
      completionTokens,
      totalTokens,
      model: modelName,
      provider: 'gemini',
    };
  }
}
