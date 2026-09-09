import {
  CompanyResearchResult,
  CrawledPage,
  SkippedPage,
  CrawlOptions,
  DiscussionSnippet,
} from './types';
import { validateUrl } from './url-validator';
import { safeFetch } from './fetcher';
import { cleanHtml } from './cleaner';
import { checkRobots } from './robots-checker';
import { rankLinks, RankedLink } from './link-ranker';
import { getDefaultDiscussionRetriever } from './discussion-retriever';
import { TaroError } from '@/shared';

const DEFAULT_MAX_PAGES = 5;
const DEFAULT_GLOBAL_TIMEOUT_MS = 15000;

// Curated tech stack keyword dictionaries
const TECH_KEYWORDS = [
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Golang', 'Rust', 'Java', 'C++',
  'React', 'Next.js', 'Vue', 'Angular', 'Node.js', 'Express', 'NestJS',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Kafka',
  'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Terraform', 'GraphQL',
];

// Curated culture keyword dictionaries
const CULTURE_KEYWORDS = [
  'ownership', 'transparency', 'velocity', 'collaboration', 'empathy',
  'integrity', 'curiosity', 'diversity', 'inclusion', 'excellence',
  'customer-obsessed', 'bias for action', 'async-first', 'remote-first',
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractKeywords(text: string, dictionary: string[]): string[] {
  const lowerText = text.toLowerCase();
  const matched = new Set<string>();

  for (const kw of dictionary) {
    const escaped = escapeRegex(kw.toLowerCase());
    const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
    if (regex.test(lowerText)) {
      matched.add(kw);
    }
  }

  return Array.from(matched);
}

/**
 * Extracts a sensible company name from a domain or page title.
 */
function deriveCompanyName(domain: string, title?: string): string {
  if (title) {
    const parts = title.split(/[|\-–—:]/);
    if (parts.length > 0 && parts[0].trim().length > 1 && parts[0].trim().length < 40) {
      return parts[0].trim();
    }
  }

  // Fallback to domain name without TLD
  const base = domain.replace(/^www\./, '').split('.')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Orchestrates the full crawling and intelligence research workflow for a company URL.
 * Implements bounded Depth-2 BFS, RFC 9309 robots checking, Content-Type filtering,
 * polite rate-limiting, and skip-and-log error resilience with honest degradation.
 */
export async function crawlCompany(
  companyUrl: string,
  options: CrawlOptions = {}
): Promise<CompanyResearchResult> {
  const startTime = Date.now();
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_GLOBAL_TIMEOUT_MS;
  const allowLocalhost = options.allowLocalhost ?? (process.env.NODE_ENV === 'test');
  const politeDelayMs = options.politeDelayMs ?? (process.env.NODE_ENV === 'test' ? 0 : 250);
  const discussionRetriever = options.discussionRetriever ?? getDefaultDiscussionRetriever();

  const pages: CrawledPage[] = [];
  const skippedPages: SkippedPage[] = [];
  const warnings: string[] = [];

  // Global timeout controller
  const globalAbortController = new AbortController();
  const globalTimeoutId = setTimeout(() => {
    globalAbortController.abort();
  }, timeoutMs);

  let parsedRoot: URL;
  try {
    parsedRoot = validateUrl(companyUrl, { allowLocalhost });
  } catch (err: any) {
    clearTimeout(globalTimeoutId);
    return {
      companyName: companyUrl,
      domain: companyUrl,
      rootUrl: companyUrl,
      pages: [],
      skippedPages: [{ url: companyUrl, reason: err.message }],
      cultureKeywords: [],
      engineeringTechStack: [],
      interviewInsights: [],
      warnings: [`Invalid company URL: ${err.message}`],
      crawledAt: new Date().toISOString(),
      insightsIncluded: false,
      durationMs: Date.now() - startTime,
    };
  }

  const rootUrl = parsedRoot.toString();
  const domain = parsedRoot.hostname;

  // 1. Check robots.txt for the domain root
  const robots = await checkRobots(rootUrl, { allowLocalhost, timeoutMs: 2500 });
  if (robots.warning) {
    warnings.push(robots.warning);
  }

  if (!robots.isAllowed) {
    clearTimeout(globalTimeoutId);
    return {
      companyName: deriveCompanyName(domain),
      domain,
      rootUrl,
      pages: [],
      skippedPages: [{ url: rootUrl, reason: robots.warning || 'Disallowed by robots.txt' }],
      cultureKeywords: [],
      engineeringTechStack: [],
      interviewInsights: [],
      warnings: [...warnings, 'Crawling halted: domain disallowed by robots.txt'],
      crawledAt: new Date().toISOString(),
      insightsIncluded: false,
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Fetch and Clean Root Page (Depth 0)
  let rootHtml = '';
  try {
    const rootFetch = await safeFetch(rootUrl, {
      timeoutMs: Math.min(timeoutMs, 6000),
      allowLocalhost,
      politeDelayMs,
      signal: globalAbortController.signal,
    });

    rootHtml = rootFetch.html;
    const cleanedRoot = cleanHtml(rootHtml);

    pages.push({
      url: rootFetch.finalUrl,
      title: cleanedRoot.title,
      metaDescription: cleanedRoot.metaDescription,
      cleanText: cleanedRoot.cleanText,
      headings: cleanedRoot.headings,
      wordCount: cleanedRoot.wordCount,
      depth: 0,
      statusCode: rootFetch.statusCode,
    });
  } catch (err: any) {
    // Honest Degradation: Root page failure skips crawling but does not crash pipeline
    clearTimeout(globalTimeoutId);
    return {
      companyName: deriveCompanyName(domain),
      domain,
      rootUrl,
      pages: [],
      skippedPages: [{ url: rootUrl, reason: err.message, statusCode: err instanceof TaroError ? 502 : undefined }],
      cultureKeywords: [],
      engineeringTechStack: [],
      interviewInsights: [],
      warnings: [`Company website unreachable: ${err.message}. Proceeding with JD-only analysis.`],
      crawledAt: new Date().toISOString(),
      insightsIncluded: false,
      durationMs: Date.now() - startTime,
    };
  }

  const companyName = deriveCompanyName(domain, pages[0]?.title);

  // 3. Discover and Rank Sub-pages (Depth 1)
  const visitedUrls = new Set<string>([rootUrl, pages[0].url]);
  const depth1Candidates: RankedLink[] = rankLinks(rootHtml, rootUrl, 6);

  // Filter out visited
  const depth1ToFetch = depth1Candidates.filter((c) => !visitedUrls.has(c.url));

  // Early-exit check: Did depth 1 discover a high-confidence hiring process page?
  let foundHighConfidenceHiring = depth1ToFetch.some(
    (c) => c.score >= 18 || c.url.includes('interview') || c.url.includes('how-we-hire')
  );

  const depth2Queue: string[] = [];

  // Crawl Depth 1 Pages
  for (const candidate of depth1ToFetch) {
    if (pages.length >= maxPages || globalAbortController.signal.aborted) break;

    visitedUrls.add(candidate.url);

    // Robots check per path
    const pathRobots = await checkRobots(candidate.url, { allowLocalhost, timeoutMs: 1500 });
    if (!pathRobots.isAllowed) {
      skippedPages.push({ url: candidate.url, reason: pathRobots.warning || 'Disallowed by robots.txt' });
      continue;
    }

    try {
      const fetchRes = await safeFetch(candidate.url, {
        timeoutMs: 5000,
        allowLocalhost,
        politeDelayMs,
        signal: globalAbortController.signal,
      });

      const cleaned = cleanHtml(fetchRes.html);
      pages.push({
        url: fetchRes.finalUrl,
        title: cleaned.title,
        metaDescription: cleaned.metaDescription,
        cleanText: cleaned.cleanText,
        headings: cleaned.headings,
        wordCount: cleaned.wordCount,
        depth: 1,
        statusCode: fetchRes.statusCode,
      });

      // If we haven't found a high-confidence hiring page and need depth 2, discover child links
      if (!foundHighConfidenceHiring && pages.length < maxPages) {
        const subLinks = rankLinks(fetchRes.html, candidate.url, 4);
        for (const sub of subLinks) {
          if (!visitedUrls.has(sub.url)) {
            depth2Queue.push(sub.url);
          }
        }
      }
    } catch (err: any) {
      // Skip-and-log resilience
      skippedPages.push({
        url: candidate.url,
        reason: err.message,
      });
    }
  }

  // 4. Crawl Depth 2 Pages (if budget remains and no high-confidence hiring page found yet)
  if (!foundHighConfidenceHiring && pages.length < maxPages && !globalAbortController.signal.aborted) {
    for (const url of depth2Queue) {
      if (pages.length >= maxPages || globalAbortController.signal.aborted) break;
      if (visitedUrls.has(url)) continue;
      visitedUrls.add(url);

      const pathRobots = await checkRobots(url, { allowLocalhost, timeoutMs: 1500 });
      if (!pathRobots.isAllowed) {
        skippedPages.push({ url, reason: pathRobots.warning || 'Disallowed by robots.txt' });
        continue;
      }

      try {
        const fetchRes = await safeFetch(url, {
          timeoutMs: 5000,
          allowLocalhost,
          politeDelayMs,
          signal: globalAbortController.signal,
        });

        const cleaned = cleanHtml(fetchRes.html);
        pages.push({
          url: fetchRes.finalUrl,
          title: cleaned.title,
          metaDescription: cleaned.metaDescription,
          cleanText: cleaned.cleanText,
          headings: cleaned.headings,
          wordCount: cleaned.wordCount,
          depth: 2,
          statusCode: fetchRes.statusCode,
        });
      } catch (err: any) {
        skippedPages.push({ url, reason: err.message });
      }
    }
  }

  clearTimeout(globalTimeoutId);

  // 5. Aggregate Text and Extract Culture and Tech Keywords
  const fullText = pages.map((p) => `${p.title} ${p.headings.join(' ')} ${p.cleanText}`).join('\n\n');
  const cultureKeywords = extractKeywords(fullText, CULTURE_KEYWORDS);
  const engineeringTechStack = extractKeywords(fullText, TECH_KEYWORDS);

  // 6. Retrieve Public Discussion / Interview Insights
  let interviewInsights: DiscussionSnippet[] = [];
  try {
    interviewInsights = await discussionRetriever.retrieveDiscussions(companyName, domain, pages);
  } catch (err: any) {
    warnings.push(`Discussion retrieval failed: ${err.message}`);
  }

  return {
    companyName,
    domain,
    rootUrl,
    pages,
    skippedPages,
    cultureKeywords,
    engineeringTechStack,
    interviewInsights,
    warnings,
    crawledAt: new Date().toISOString(),
    insightsIncluded: interviewInsights.length > 0,
    durationMs: Date.now() - startTime,
  };
}
