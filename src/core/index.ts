/**
 * @taro/core — Public API
 */

// Crawler & Research Subsystem (Domain 2)
export * from './crawler/types';
export { crawlCompany } from './crawler/research-orchestrator';
export { validateUrl, isPrivateOrRestrictedIp, isLocalhostAllowed } from './crawler/url-validator';
export { safeFetch, clearDnsCache, createPinnedAgent } from './crawler/fetcher';
export type { SafeFetchResult, SafeFetchOptions } from './crawler/fetcher';
export { cleanHtml } from './crawler/cleaner';
export type { CleanedPage } from './crawler/cleaner';
export { checkRobots, parseRobotsTxt, isPathAllowed } from './crawler/robots-checker';
export type { RobotsCheckResult } from './crawler/robots-checker';
export { rankLinks, isInternalLink, KEYWORD_WEIGHTS } from './crawler/link-ranker';
export type { RankedLink } from './crawler/link-ranker';
export {
  MockDiscussionRetriever,
  DomainInsightsRetriever,
  getDefaultDiscussionRetriever,
} from './crawler/discussion-retriever';
