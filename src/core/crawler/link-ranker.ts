import * as cheerio from 'cheerio';

export interface RankedLink {
  url: string;
  score: number;
  anchorText: string;
  matchedKeywords: string[];
}

// Keyword scoring rules from plan.md D2.3
export const KEYWORD_WEIGHTS: Record<string, number> = {
  careers: 10,
  jobs: 10,
  hiring: 10,
  handbook: 9,
  engineering: 8,
  tech: 7,
  culture: 7,
  about: 6,
  team: 5,
  values: 5,
  life: 5,
  blog: 3,
};

/**
 * Extracts and ranks internal links from HTML based on hiring and engineering keywords.
 * Returns the top N ranked links in descending score order.
 */
export function rankLinks(
  html: string,
  baseUrl: string,
  maxResults: number = 3
): RankedLink[] {
  if (!html || !baseUrl) return [];

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return [];
  }

  const $ = cheerio.load(html);
  const seenUrls = new Set<string>();
  const candidates: RankedLink[] = [];

  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href')?.trim();
    if (!rawHref) return;

    // Ignore non-http links, javascript, mailto, tel, fragment-only
    if (
      rawHref.startsWith('#') ||
      rawHref.startsWith('javascript:') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:') ||
      rawHref.startsWith('data:')
    ) {
      return;
    }

    let absoluteUrl: URL;
    try {
      absoluteUrl = new URL(rawHref, parsedBase);
    } catch {
      return;
    }

    // Only allow HTTP/HTTPS
    if (absoluteUrl.protocol !== 'http:' && absoluteUrl.protocol !== 'https:') {
      return;
    }

    // Must be internal link (same host or subdomain of same domain)
    if (!isInternalLink(parsedBase.hostname, absoluteUrl.hostname)) {
      return;
    }

    // Canonicalize URL: strip hash and tracking query parameters
    absoluteUrl.hash = '';
    const cleanUrl = absoluteUrl.toString();

    // Do not link to the homepage itself
    if (cleanUrl === parsedBase.origin || cleanUrl === `${parsedBase.origin}/`) {
      return;
    }

    // Skip already seen URLs
    if (seenUrls.has(cleanUrl)) {
      return;
    }
    seenUrls.add(cleanUrl);

    const anchorText = $(el).text().replace(/\s+/g, ' ').trim();
    const hrefAndText = `${absoluteUrl.pathname.toLowerCase()} ${anchorText.toLowerCase()}`;

    let score = 0;
    const matchedKeywords: string[] = [];

    for (const [keyword, weight] of Object.entries(KEYWORD_WEIGHTS)) {
      if (hrefAndText.includes(keyword)) {
        score += weight;
        matchedKeywords.push(keyword);
      }
    }

    if (score > 0) {
      candidates.push({
        url: cleanUrl,
        score,
        anchorText,
        matchedKeywords,
      });
    }
  });

  // Sort descending by score, tie-break by shorter URL length, then alphabetically
  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.url.length !== b.url.length) {
      return a.url.length - b.url.length;
    }
    return a.url.localeCompare(b.url);
  });

  return candidates.slice(0, maxResults);
}

/**
 * Determines whether the candidate host belongs to the same domain or subdomain as the base host.
 * Safely handles subdomains (e.g. careers.acme.com and acme.com) without falling prey to multi-part TLD flaws.
 */
export function isInternalLink(baseHost: string, targetHost: string): boolean {
  if (baseHost === targetHost) return true;

  const cleanBase = baseHost.toLowerCase().replace(/^www\./, '');
  const cleanTarget = targetHost.toLowerCase().replace(/^www\./, '');

  if (cleanBase === cleanTarget) return true;
  if (cleanTarget.endsWith(`.${cleanBase}`)) return true;
  if (cleanBase.endsWith(`.${cleanTarget}`)) return true;

  return false;
}

