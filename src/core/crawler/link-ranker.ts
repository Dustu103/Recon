import * as cheerio from 'cheerio';

export interface RankedLink {
  url: string;
  score: number;
  anchorText: string;
  matchedKeywords: string[];
}

// Keyword scoring rules from plan.md D2.3 + Enterprise Careers & Leadership expansions
export const KEYWORD_WEIGHTS: Record<string, number> = {
  careers: 10,
  jobs: 10,
  hiring: 10,
  interview: 10,
  'how-we-hire': 12,
  'leadership-principles': 15,
  'working-at': 10,
  principles: 9,
  'our-workplace': 9,
  handbook: 9,
  engineering: 8,
  tech: 7,
  culture: 7,
  about: 6,
  process: 6,
  team: 5,
  values: 5,
  life: 5,
  company: 4,
  blog: 3,
};

/**
 * Extracts the core brand token from a hostname (e.g. www.amazon.in -> amazon, stripe.com -> stripe)
 */
export function extractBrandFromHostname(hostname: string): string {
  const clean = hostname.toLowerCase().replace(/^www\./, '').trim();
  const parts = clean.split('.');
  if (parts.length <= 1) return clean;
  const multiPartTlds = new Set(['co.uk', 'com.au', 'co.in', 'com.br', 'co.jp', 'org.uk']);
  const lastTwo = parts.slice(-2).join('.');
  if (multiPartTlds.has(lastTwo) && parts.length >= 3) {
    return parts[parts.length - 3];
  }
  return parts[parts.length - 2];
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

/**
 * Identifies whether an external link is an authentic associated careers, culture, or ATS portal for the brand
 * (e.g. amazon.in -> amazon.jobs, aboutamazon.in, or linear.app -> jobs.lever.co/linear)
 */
export function isAssociatedCompanyLink(
  baseHost: string,
  targetHost: string,
  targetUrl: string,
  anchorText: string
): boolean {
  const brand = extractBrandFromHostname(baseHost);
  if (!brand || brand.length < 3) return false;

  const cleanTarget = targetHost.toLowerCase().replace(/^www\./, '');
  const targetLower = targetUrl.toLowerCase();
  const anchorLower = anchorText.toLowerCase();
  const combined = `${cleanTarget} ${targetLower} ${anchorLower}`;

  const isCareerOrCultureContext =
    /(career|job|hiring|work|about|engineering|culture|values|leadership|team|intern|student|how-we-hire|principles)/i.test(
      combined
    );

  if (!isCareerOrCultureContext) {
    return false;
  }

  const targetParts = cleanTarget.split('.');
  const multiPartTlds = new Set(['co.uk', 'com.au', 'co.in', 'com.br', 'co.jp', 'org.uk']);
  const lastTwo = targetParts.slice(-2).join('.');
  const isMultiPart = multiPartTlds.has(lastTwo);
  const expectedTldParts = isMultiPart ? 2 : 1;

  // 1. Brand as Apex domain with another TLD (e.g. amazon.jobs, amazon.science, amazon.com when base is amazon.in)
  if (targetParts[0] === brand && targetParts.length === 1 + expectedTldParts) {
    return true;
  }

  // 2. Subdomain of brand on another TLD (e.g. careers.amazon.com, jobs.amazon.de)
  if (
    (cleanTarget.startsWith('careers.') || cleanTarget.startsWith('jobs.') || cleanTarget.startsWith('about.')) &&
    targetParts[1] === brand &&
    targetParts.length === 2 + expectedTldParts
  ) {
    return true;
  }

  // 3. Known company brand portals: about<brand>.* or lifeat<brand>.* (e.g. aboutamazon.in, aboutamazon.com)
  const targetApex = isMultiPart
    ? targetParts[targetParts.length - 3]
    : targetParts[targetParts.length - 2];
  if (targetApex === `about${brand}` || targetApex === `lifeat${brand}`) {
    return true;
  }

  // 4. Known Enterprise ATS with brand in URL
  const isEnterpriseAts =
    /(lever\.co|greenhouse\.io|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|workable\.com|bamboohr\.com|jobvite\.com|icims\.com)/i.test(
      cleanTarget
    );

  if (isEnterpriseAts && (cleanTarget.includes(brand) || targetLower.includes(brand))) {
    return true;
  }

  return false;
}

/**
 * Extracts and ranks internal links and verified company portals from HTML based on hiring and engineering keywords.
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

    const anchorText = $(el).text().replace(/\s+/g, ' ').trim();

    // Must be internal link (same host or subdomain of same domain) or associated verified company portal
    if (
      !isInternalLink(parsedBase.hostname, absoluteUrl.hostname) &&
      !isAssociatedCompanyLink(parsedBase.hostname, absoluteUrl.hostname, cleanUrl, anchorText)
    ) {
      return;
    }

    seenUrls.add(cleanUrl);

    const hrefAndText = `${absoluteUrl.pathname.toLowerCase()} ${absoluteUrl.hostname.toLowerCase()} ${anchorText.toLowerCase()}`;

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
 * Extracts and scores relevant candidate URLs from raw XML sitemap text.
 * Discovers careers, engineering, and culture paths when landing pages use client-side rendering.
 */
export function rankSitemapUrls(
  xml: string,
  baseUrl: string,
  maxResults: number = 3
): RankedLink[] {
  if (!xml || !baseUrl) return [];

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return [];
  }

  const locRegex = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi;
  const seenUrls = new Set<string>();
  const candidates: RankedLink[] = [];

  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    const rawLoc = match[1].trim();
    try {
      const locUrl = new URL(rawLoc);
      locUrl.hash = '';
      const cleanUrl = locUrl.toString();

      if (seenUrls.has(cleanUrl)) continue;
      if (cleanUrl === parsedBase.origin || cleanUrl === `${parsedBase.origin}/`) continue;

      if (!isInternalLink(parsedBase.hostname, locUrl.hostname)) continue;

      seenUrls.add(cleanUrl);

      const pathAndHost = `${locUrl.pathname.toLowerCase()} ${locUrl.hostname.toLowerCase()}`;
      let score = 0;
      const matchedKeywords: string[] = [];

      for (const [keyword, weight] of Object.entries(KEYWORD_WEIGHTS)) {
        if (pathAndHost.includes(keyword)) {
          score += weight;
          matchedKeywords.push(keyword);
        }
      }

      if (score > 0) {
        candidates.push({
          url: cleanUrl,
          score,
          anchorText: 'Sitemap Entry',
          matchedKeywords,
        });
      }
    } catch {
      continue;
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.url.length !== b.url.length) return a.url.length - b.url.length;
    return a.url.localeCompare(b.url);
  });

  return candidates.slice(0, maxResults);
}


