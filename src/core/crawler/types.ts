/**
 * Crawler & Research Engine Contracts
 */

export interface CrawledPage {
  url: string;
  title: string;
  metaDescription?: string;
  cleanText: string;
  cleanMarkdown?: string;
  headings: string[];
  wordCount: number;
  depth: number;
  statusCode: number;
}

export interface SkippedPage {
  url: string;
  reason: string;
  statusCode?: number;
}

export interface DiscussionSnippet {
  source: string;
  snippet: string;
  url?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface CompanyResearchResult {
  companyName: string;
  domain: string;
  rootUrl: string;
  pages: CrawledPage[];
  skippedPages: SkippedPage[];
  cultureKeywords: string[];
  engineeringTechStack: string[];
  interviewInsights: DiscussionSnippet[];
  warnings: string[];
  crawledAt: string;
  insightsIncluded: boolean;
  durationMs: number;
}

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  politeDelayMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  allowLocalhost?: boolean;
  discussionRetriever?: DiscussionRetriever;
  skipCache?: boolean;
}

export interface DiscussionRetriever {
  name: string;
  retrieveDiscussions(
    companyName: string,
    domain: string,
    crawledPages: CrawledPage[]
  ): Promise<DiscussionSnippet[]>;
}
