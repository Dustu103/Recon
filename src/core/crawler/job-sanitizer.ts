/**
 * Domain 2 & Public Jobs: Job Link Sanitizer & Public Opportunity Extractor
 * Strips private user session tokens, referral keys, and marketing trackers from URLs.
 * Extracts public job metadata (Schema.org JobPosting JSON-LD and OpenGraph tags).
 * Assesses ATS job closure state to maintain fresh, verified listings.
 */
import * as cheerio from 'cheerio';

export interface PublicJobMetadata {
  title: string;
  companyName: string;
  location?: string;
  descriptionSnippet: string;
  isClosed: boolean;
  postedAt?: string;
  validThrough?: string;
  canonicalUrl: string;
}

/** Tracking parameter prefixes or exact keys to strip from URLs */
const TRACKING_PARAM_REGEX = /^(utm_|ref$|ref_|fbclid|gclid|twclid|msclkid|yclid|mc_eid|_ga|_gl|_hsenc|_hsmi|session|token|candidate_id|applicant_id|referral|referral_code|ref_id|gh_src|lever-origin|lever-source|gr_origin|trk|trackingId|midToken|trkEmail|recipient_id)/i;

/** Known closure text patterns across popular ATS (Greenhouse, Lever, Workday, Amazon Jobs, etc.) */
const CLOSED_PATTERNS: RegExp[] = [
  /this job is no longer available/i,
  /this position has been filled/i,
  /no longer accepting applications/i,
  /application closed/i,
  /this posting has expired/i,
  /job (has )?expired/i,
  /job (is )?closed/i,
  /requisition (is |has )?closed/i,
  /position is closed/i,
  /this listing is inactive/i,
];

/**
 * Sanitizes a job application URL by:
 * 1. Removing user-identifying referral tokens, session cookies, and UTM tracking tags.
 * 2. Normalizing hostname and protocol.
 * 3. Preserving essential routing parameters (e.g. `gh_jid`, `id`, `jobId`).
 * 4. Removing trailing hash fragments.
 */
export function sanitizeJobUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(rawUrl.trim());

    // Normalize protocol & host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Strip hash fragment
    parsed.hash = '';

    // Filter tracking query params
    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_val, key) => {
      if (TRACKING_PARAM_REGEX.test(key)) {
        keysToDelete.push(key);
      }
    });

    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    // Clean up trailing slash if not root
    let cleanUrl = parsed.toString();
    if (cleanUrl.endsWith('/') && parsed.pathname.length > 1 && !parsed.search) {
      cleanUrl = cleanUrl.slice(0, -1);
    }

    return cleanUrl;
  } catch {
    // If not a full valid URL, return trimmed original
    return rawUrl.trim();
  }
}

/**
 * Extracts public job metadata from HTML, prioritizing Schema.org JobPosting JSON-LD,
 * then falling back to OpenGraph and semantic HTML tags.
 */
export function extractPublicJobMetadata(html: string, sourceUrl: string): PublicJobMetadata {
  const canonicalUrl = sanitizeJobUrl(sourceUrl);
  const $ = cheerio.load(html || '');

  let title = '';
  let companyName = '';
  let location: string | undefined;
  let descriptionSnippet = '';
  let postedAt: string | undefined;
  let validThrough: string | undefined;
  let isClosed = false;

  // 1. Try Schema.org JobPosting JSON-LD
  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const text = $(elem).text().trim();
      if (!text) return;

      const parsed = JSON.parse(text);
      const candidates = Array.isArray(parsed)
        ? parsed
        : parsed['@graph'] && Array.isArray(parsed['@graph'])
        ? parsed['@graph']
        : [parsed];

      for (const item of candidates) {
        if (
          item['@type'] === 'JobPosting' ||
          (Array.isArray(item['@type']) && item['@type'].includes('JobPosting'))
        ) {
          if (item.title && !title) {
            title = String(item.title).trim();
          }

          if (item.hiringOrganization) {
            if (typeof item.hiringOrganization === 'string') {
              companyName = item.hiringOrganization.trim();
            } else if (item.hiringOrganization.name) {
              companyName = String(item.hiringOrganization.name).trim();
            }
          }

          if (item.datePosted && !postedAt) {
            postedAt = String(item.datePosted);
          }

          if (item.validThrough && !validThrough) {
            validThrough = String(item.validThrough);
          }

          if (item.jobLocation && !location) {
            if (typeof item.jobLocation === 'string') {
              location = item.jobLocation.trim();
            } else if (item.jobLocation.address) {
              const addr = item.jobLocation.address;
              if (typeof addr === 'string') {
                location = addr.trim();
              } else {
                const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(
                  Boolean
                );
                if (parts.length > 0) location = parts.join(', ');
              }
            } else if (item.jobLocation.name) {
              location = String(item.jobLocation.name).trim();
            }
          }

          if (item.description && !descriptionSnippet) {
            // Strip HTML tags from description
            const desc$ = cheerio.load(String(item.description));
            descriptionSnippet = desc$.text().replace(/\s+/g, ' ').trim().slice(0, 300);
          }
        }
      }
    } catch {
      // Ignore JSON-LD parse errors
    }
  });

  // 2. Fallbacks: OpenGraph & Meta Tags
  if (!title) {
    title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('meta[name="twitter:title"]').attr('content')?.trim() ||
      $('title').text().trim() ||
      $('h1').first().text().trim() ||
      'Job Opportunity';
  }

  if (!companyName) {
    companyName =
      $('meta[property="og:site_name"]').attr('content')?.trim() ||
      $('meta[name="author"]').attr('content')?.trim() ||
      deriveCompanyFromUrl(canonicalUrl);
  }

  if (!descriptionSnippet) {
    descriptionSnippet =
      $('meta[property="og:description"]').attr('content')?.trim() ||
      $('meta[name="description"]').attr('content')?.trim() ||
      $('p').first().text().trim() ||
      '';
    descriptionSnippet = descriptionSnippet.replace(/\s+/g, ' ').slice(0, 300);
  }

  // 3. Closure & Liveness Detection
  // Check validThrough date if available
  if (validThrough) {
    try {
      const expiry = new Date(validThrough);
      if (!isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) {
        isClosed = true;
      }
    } catch {
      // ignore
    }
  }

  // Check HTML text against closed patterns
  if (!isClosed) {
    const fullText = $('body').text() || html;
    for (const pattern of CLOSED_PATTERNS) {
      if (pattern.test(fullText)) {
        isClosed = true;
        break;
      }
    }
  }

  return {
    title,
    companyName,
    location: location || undefined,
    descriptionSnippet,
    isClosed,
    postedAt: postedAt || undefined,
    validThrough: validThrough || undefined,
    canonicalUrl,
  };
}

/**
 * Derives a human-friendly company name from a URL hostname.
 */
function deriveCompanyFromUrl(urlStr: string): string {
  try {
    const hostname = new URL(urlStr).hostname;
    // e.g. "jobs.lever.co" -> lever, "boards.greenhouse.io" -> greenhouse, "stripe.com" -> Stripe
    const parts = hostname.replace(/^www\./, '').split('.');
    if (parts.length >= 2) {
      const name = parts[0] === 'jobs' || parts[0] === 'careers' || parts[0] === 'boards' ? parts[1] : parts[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return hostname;
  } catch {
    return 'Company';
  }
}
