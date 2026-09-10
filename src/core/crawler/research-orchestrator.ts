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
import { rankLinks, RankedLink, extractBrandFromHostname } from './link-ranker';
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

// Curated culture keyword dictionaries (including Enterprise Leadership Principles)
const CULTURE_KEYWORDS = [
  'ownership', 'transparency', 'velocity', 'collaboration', 'empathy',
  'integrity', 'curiosity', 'diversity', 'inclusion', 'excellence',
  'customer-obsessed', 'bias for action', 'async-first', 'remote-first',
  'customer obsession', 'deliver results', 'invent and simplify', 'learn and be curious',
  'hire and develop the best', 'insist on highest standards', 'think big', 'frugality',
  'earn trust', 'dive deep', 'have backbone', 'disagree and commit',
  'first principles', 'high agency', 'radical candor', 'extreme ownership',
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Keywords that collide with common English lowercase words and must be matched case-sensitively
const CASE_SENSITIVE_KEYWORDS = new Set(['Go', 'Rust', 'React', 'Express']);

const GO_VERB_PREPOSITIONS = new Set([
  'to', 'into', 'ahead', 'back', 'further', 'through', 'for', 'here', 'there', 'on', 'with', 'out'
]);

function isLikelyGolangUsage(text: string): boolean {
  if (!/\bGo\b/.test(text)) return false;
  // If in a list (e.g. "Go, Python" or "Go / Rust") or tech conjunction ("Go and Postgres")
  if (/\bGo\s*[,;/&|\)]/.test(text) || /\bGo\s+(and|or|lang|language|code|dev|engineer|backend|microservices)\b/i.test(text)) {
    return true;
  }
  // Check if any occurrence of Go is NOT followed by a directional verb preposition
  const matches = [...text.matchAll(/\bGo\s+([a-zA-Z]+)\b/g)];
  if (matches.length === 0) return true; // standalone "Go"
  return matches.some((m) => !GO_VERB_PREPOSITIONS.has(m[1].toLowerCase()));
}

export function extractKeywords(text: string, dictionary: string[]): string[] {
  const lowerText = text.toLowerCase();
  const matched = new Set<string>();

  for (const kw of dictionary) {
    if (kw === 'Go') {
      if (isLikelyGolangUsage(text)) {
        matched.add('Go');
      }
    } else if (CASE_SENSITIVE_KEYWORDS.has(kw)) {
      // Require case-sensitive boundary match on original text
      const escaped = escapeRegex(kw);
      const regex = new RegExp(`\\b${escaped}\\b`);
      if (regex.test(text)) {
        matched.add(kw);
      }
    } else {
      const escaped = escapeRegex(kw.toLowerCase());
      const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
      if (regex.test(lowerText)) {
        matched.add(kw);
      }
    }
  }

  return Array.from(matched);
}

/**
 * Extracts a sensible company name from a domain or page title.
 * Prioritizes brand-matching title segments over generic e-commerce storefront prefixes.
 */
export function deriveCompanyName(domain: string, title?: string): string {
  const brand = extractBrandFromHostname(domain);
  const fallback = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Company';

  if (!title || typeof title !== 'string') {
    return fallback;
  }

  const cleanTitle = title.replace(/&nbsp;/g, '').trim();
  if (cleanTitle.length === 0) {
    return fallback;
  }

  const parts = cleanTitle
    .split(/[|\-–—:]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // 1. If a title part contains or matches the brand name (e.g. "Amazon.in" -> "Amazon")
  if (brand) {
    const brandLower = brand.toLowerCase();
    const brandPart = parts.find((p) => p.toLowerCase().includes(brandLower));
    if (brandPart) {
      // Strip TLD if present in part (e.g. "Amazon.in" -> "Amazon")
      const cleaned = brandPart.replace(/\.[a-z]{2,8}$/i, '').trim();
      if (cleaned.length >= 2 && cleaned.length <= 30) {
        return cleaned;
      }
    }
  }

  // 2. Filter out generic marketing noise prefixes (e.g. "Online Shopping", "Shop Online", "Welcome to")
  const isGenericMarketing = /^(online shopping|shop online|welcome to|official site|home|login|portal)/i;
  for (const part of parts) {
    if (!isGenericMarketing.test(part) && part.length >= 2 && part.length <= 40) {
      return part;
    }
  }

  return fallback;
}

// ── Bounded In-Process Research Cache (ADR 001) ─────────────────────────────
interface CachedResearch {
  result: CompanyResearchResult;
  timestamp: number;
}

const researchCache = new Map<string, CachedResearch>();
const RESEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CACHE_ENTRIES = 50; // Hard memory cap (< 5MB RAM)

function normalizeCacheKey(hostnameOrUrl: string): string {
  let host = hostnameOrUrl.trim().toLowerCase();
  try {
    if (host.includes('://')) {
      host = new URL(host).hostname;
    } else if (host.includes('/')) {
      host = host.split('/')[0];
    }
  } catch {
    // fallback to raw string
  }
  return host.replace(/^www\./, '').trim();
}

export function getCachedResearch(hostnameOrUrl: string): CompanyResearchResult | null {
  const key = normalizeCacheKey(hostnameOrUrl);
  const entry = researchCache.get(key);
  if (entry && Date.now() - entry.timestamp < RESEARCH_CACHE_TTL_MS) {
    return entry.result;
  }
  return null;
}

export function setCachedResearch(hostnameOrUrl: string, result: CompanyResearchResult): void {
  const key = normalizeCacheKey(hostnameOrUrl);
  // Oldest-entry eviction when capacity reached
  if (researchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = researchCache.keys().next().value;
    if (oldestKey) {
      researchCache.delete(oldestKey);
    }
  }
  researchCache.set(key, { result, timestamp: Date.now() });
}

export function clearResearchCache(): void {
  researchCache.clear();
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
  const cacheKey = normalizeCacheKey(domain);
  const isLocal = domain === 'localhost' || domain === '127.0.0.1' || domain.endsWith('.local');

  // Check in-process research cache (ADR 001) - excluded for local test domains
  if (!options.skipCache && !isLocal) {
    const cached = getCachedResearch(cacheKey);
    if (cached) {
      clearTimeout(globalTimeoutId);
      return {
        ...cached,
        durationMs: Date.now() - startTime,
      };
    }
  }

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
      cleanMarkdown: cleanedRoot.cleanMarkdown || cleanedRoot.cleanText,
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

  // Proactive Careers Discovery: If no high-confidence careers/hiring link was found in root HTML,
  // probe standard careers endpoints (/careers, /jobs, careers.<domain>, <brand>.jobs)
  // Only executed for public remote domains, avoiding local test mock servers
  if (!isLocal && !depth1Candidates.some((c) => c.score >= 10)) {
    const brand = extractBrandFromHostname(domain);
    const candidateProbes: string[] = [
      `${parsedRoot.origin}/careers`,
      `${parsedRoot.origin}/jobs`,
      `${parsedRoot.origin}/about/careers`,
    ];
    if (brand && brand.length >= 3) {
      candidateProbes.push(`https://${brand}.jobs/`);
      const cleanBase = domain.replace(/^www\./, '');
      candidateProbes.push(`https://careers.${cleanBase}/`);
      candidateProbes.push(`https://jobs.${cleanBase}/`);
    }
    for (const probeUrl of candidateProbes) {
      if (!visitedUrls.has(probeUrl) && !depth1Candidates.some((c) => c.url === probeUrl)) {
        depth1Candidates.push({
          url: probeUrl,
          score: 10,
          anchorText: 'Careers Portal',
          matchedKeywords: ['careers'],
        });
      }
    }
  }

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
        cleanMarkdown: cleaned.cleanMarkdown || cleaned.cleanText,
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
          cleanMarkdown: cleaned.cleanMarkdown || cleaned.cleanText,
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
  const totalWords = pages.reduce((sum, p) => sum + p.wordCount, 0);
  if (pages.length > 0 && totalWords < 50) {
    warnings.push(
      `Crawled pages contain minimal text (${totalWords} words), likely a client-side rendered SPA without SSR. Relying primarily on Job Description.`
    );
  }

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

  const result: CompanyResearchResult = {
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

  if (!options.skipCache && !isLocal && pages.length > 0) {
    setCachedResearch(domain, result);
  }

  return result;
}
