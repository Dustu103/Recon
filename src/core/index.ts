/**
 * @taro/core — Public API
 */

// Crawler & Research Subsystem (Domain 2)
export * from './crawler/types';
export {
  crawlCompany,
  getCachedResearch,
  setCachedResearch,
  clearResearchCache,
} from './crawler/research-orchestrator';
export { validateUrl, isPrivateOrRestrictedIp, isLocalhostAllowed } from './crawler/url-validator';
export { safeFetch, clearDnsCache, createPinnedAgent } from './crawler/fetcher';
export type { SafeFetchResult, SafeFetchOptions } from './crawler/fetcher';
export { cleanHtml } from './crawler/cleaner';
export type { CleanedPage } from './crawler/cleaner';
export { checkRobots, parseRobotsTxt, isPathAllowed, clearRobotsCache } from './crawler/robots-checker';
export type { RobotsCheckResult } from './crawler/robots-checker';
export { rankLinks, isInternalLink, KEYWORD_WEIGHTS } from './crawler/link-ranker';
export type { RankedLink } from './crawler/link-ranker';
export {
  MockDiscussionRetriever,
  DomainInsightsRetriever,
  getDefaultDiscussionRetriever,
} from './crawler/discussion-retriever';

// AI Generation Engine & LLM Pipeline (Domain 3)
export * from './llm/types';
export { TokenBucketLimiter } from './llm/rate-limiter';
export type { RateLimiterConfig } from './llm/rate-limiter';
export { executeWithRetry, isRetryableError, extractRetryAfterMs } from './llm/retry';
export type { RetryOptions } from './llm/retry';
export { stripMarkdownFences, parseAndValidateJson } from './llm/json-parser';
export {
  sanitizeUntrustedText,
  wrapUntrustedJd,
  wrapUntrustedContext,
  PROMPT_INJECTION_INSTRUCTION,
} from './llm/prompt-guard';
export { GeminiProvider } from './llm/providers/gemini.provider';
export { GroqProvider } from './llm/providers/groq.provider';
export { MockLlmProvider } from './llm/providers/mock.provider';
export { LlmClient, getDefaultLlmClient, _resetDefaultLlmClient } from './llm/client';
export type { LlmClientConfig } from './llm/client';

export * from './pipeline/types';
export { extractRequirements } from './pipeline/step1-extract';
export { synthesizeCompanyBrief } from './pipeline/step2-brief';
export { generateQuestionsForRequirements } from './pipeline/step3-questions';
export { generateFlashcards } from './pipeline/step4-flashcards';
export { validateDraftKitEnvelope } from './pipeline/validation-gate';
export {
  generateKit,
  buildStudySchedule,
  buildCoverage,
} from './pipeline/kit-orchestrator';
export type { GenerateKitParams } from './pipeline/kit-orchestrator';

// Deterministic Logic Subsystem (Domain 4)
export * from './deterministic';

// Builder & Regeneration Subsystem (Domain 6)
export {
  regenerateQuestionsCategory,
  regenerateCompanyBrief,
  regenerateFlashcards,
  cleanKitForExport,
} from './builder/regeneration-engine';
export type {
  RegenerationOptions,
  RegenerateQuestionsResult,
  RegenerateBriefResult,
  RegenerateFlashcardsResult,
} from './builder/regeneration-engine';

// Practice & Weak-Spot Radar Subsystem (Domain 7)
export { getLatestRatingsMap, normalizeDate } from './practice/history-reducer';
export type { ResolvedLatestRating } from './practice/history-reducer';
export { buildSpacedRepetitionQueue } from './practice/spaced-repetition';
export { calculateWeakSpotRadar } from './practice/weak-spot-radar';
