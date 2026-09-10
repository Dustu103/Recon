/**
 * Domain 3: LLM Infrastructure Types & Interfaces
 */
import { z } from 'zod';

export interface LlmRequestOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  systemPrompt?: string;
  mock?: boolean;
  abortSignal?: AbortSignal;
}

export interface LlmResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  provider: 'gemini' | 'groq' | 'mock';
}

export interface LlmProvider {
  readonly name: 'gemini' | 'groq' | 'mock';
  complete(prompt: string, options?: LlmRequestOptions): Promise<LlmResponse>;
}

export interface TokenUsageWindow {
  timestamp: number;
  tokens: number;
}
