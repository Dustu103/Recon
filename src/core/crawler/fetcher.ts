import dns from 'node:dns';
import { Agent, buildConnector } from 'undici';
import { ErrorCode, TaroError } from '@/shared';
import { validateUrl, isPrivateOrRestrictedIp, isLocalhostAllowed } from './url-validator';

export interface SafeFetchResult {
  url: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  html: string;
  durationMs: number;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  politeDelayMs?: number;
  allowLocalhost?: boolean;
  signal?: AbortSignal;
  customAgent?: Agent;
}

const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_POLITE_DELAY_MS = 250; // 250ms spacing per origin

interface CachedDns {
  addresses: Array<{ address: string; family: number }>;
  expiresAt: number;
}

// 10-second in-process DNS cache to avoid redundant lookups during crawl
const dnsCache = new Map<string, CachedDns>();

/**
 * Clear the internal DNS cache (useful in tests).
 */
export function clearDnsCache(): void {
  dnsCache.clear();
}

const MAX_CACHE_ENTRIES = 500;

/**
 * Bounded DNS cache to prevent daemon memory leaks across thousands of crawls.
 */
export function setDnsCache(hostname: string, data: CachedDns): void {
  if (dnsCache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [key, val] of dnsCache) {
      if (val.expiresAt < now) {
        dnsCache.delete(key);
      }
    }
    if (dnsCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = dnsCache.keys().next().value;
      if (oldestKey) dnsCache.delete(oldestKey);
    }
  }
  dnsCache.set(hostname, data);
}

/**
 * Tracking last request timestamps per origin for polite request spacing.
 */
const lastRequestByOrigin = new Map<string, number>();

function recordOriginAccess(origin: string): void {
  if (lastRequestByOrigin.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [key, timestamp] of lastRequestByOrigin) {
      if (now - timestamp > 60_000) {
        lastRequestByOrigin.delete(key);
      }
    }
    if (lastRequestByOrigin.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = lastRequestByOrigin.keys().next().value;
      if (oldestKey) lastRequestByOrigin.delete(oldestKey);
    }
  }
  lastRequestByOrigin.set(origin, Date.now());
}

/**
 * Per-origin active request concurrency tracker (capped at 2).
 */
const activeRequestsByOrigin = new Map<string, number>();

async function acquireOriginSlot(origin: string, politeDelayMs: number): Promise<void> {
  // Wait if 2 concurrent requests are already in-flight to this origin
  while ((activeRequestsByOrigin.get(origin) || 0) >= 2) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Polite delay spacing between requests
  const lastTime = lastRequestByOrigin.get(origin) || 0;
  const elapsed = Date.now() - lastTime;
  if (elapsed < politeDelayMs) {
    await new Promise((resolve) => setTimeout(resolve, politeDelayMs - elapsed));
  }

  activeRequestsByOrigin.set(origin, (activeRequestsByOrigin.get(origin) || 0) + 1);
  recordOriginAccess(origin);
}

function releaseOriginSlot(origin: string): void {
  const current = activeRequestsByOrigin.get(origin) || 1;
  if (current <= 1) {
    activeRequestsByOrigin.delete(origin);
  } else {
    activeRequestsByOrigin.set(origin, current - 1);
  }
}

/**
 * Creates an Undici Agent with a custom connector that:
 * 1. Resolves all addresses via DNS.
 * 2. Checks ALL addresses against the SSRF private IP blocklist.
 * 3. Pins the socket directly to the first validated IP address.
 * 4. Passes TLS SNI and Host header transparently.
 */
export function createPinnedAgent(options?: { allowLocalhost?: boolean }): Agent {
  const allowLocalhost = isLocalhostAllowed(options?.allowLocalhost);

  const connector = buildConnector({
    lookup: (hostname, lookupOpts, cb) => {
      // 1. Check in-process cache
      const cached = dnsCache.get(hostname);
      if (cached && Date.now() < cached.expiresAt) {
        return cb(null, cached.addresses);
      }

      // 2. Resolve all A/AAAA addresses safely
      dns.promises
        .lookup(hostname, { all: true })
        .then((addresses) => {
          // Failure path: Empty address list
          if (!addresses || addresses.length === 0) {
            return (cb as any)(
              new TaroError(
                ErrorCode.COMPANY_UNREACHABLE,
                `No DNS A/AAAA records found for host: ${hostname}`
              ),
              null
            );
          }

          // Validate EVERY resolved address against SSRF rules
          for (const record of addresses) {
            if (isPrivateOrRestrictedIp(record.address, { allowLocalhost })) {
              return (cb as any)(
                new TaroError(
                  ErrorCode.PRIVATE_IP_BLOCKED,
                  `Address ${record.address} for host ${hostname} is in a restricted/private range`
                ),
                null
              );
            }
          }

          const selected = addresses.map((a) => ({
            address: a.address,
            family: a.family,
          }));

          // Cache for 10 seconds with bounded capacity
          setDnsCache(hostname, {
            addresses: selected,
            expiresAt: Date.now() + 10_000,
          });

          (cb as any)(null, selected);
        })
        .catch((err) => {
          // Failure path: DNS resolution error (NXDOMAIN, timeout)
          (cb as any)(
            new TaroError(
              ErrorCode.COMPANY_UNREACHABLE,
              `DNS resolution failed for host ${hostname}: ${err.message}`,
              err
            ),
            null
          );
        });
    },
  });

  return new Agent({ connect: connector });
}

/**
 * Performs safe, SSRF-shielded, rate-limited HTTP GET with redirect tracking and Content-Type filtering.
 */
export async function safeFetch(
  targetUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const politeDelayMs = options.politeDelayMs ?? DEFAULT_POLITE_DELAY_MS;
  const allowLocalhost = isLocalhostAllowed(options.allowLocalhost);

  // Validate initial URL
  let currentUrl = validateUrl(targetUrl, { allowLocalhost }).toString();
  const initialUrl = currentUrl;

  // Use provided agent or construct pinned agent
  const agent = options.customAgent ?? createPinnedAgent({ allowLocalhost });

  let redirectCount = 0;
  const startTime = Date.now();

  while (redirectCount <= maxRedirects) {
    const parsed = new URL(currentUrl);
    const origin = parsed.origin;

    await acquireOriginSlot(origin, politeDelayMs);

    // Setup per-request timeout abort controller
    const abortController = new AbortController();
    let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    // Link parent signal if provided
    const onParentAbort = () => abortController.abort();
    if (options.signal) {
      options.signal.addEventListener('abort', onParentAbort);
    }

    try {
      const response = await agent.request({
        origin,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: {
          'user-agent':
            'ReconBot/1.0 (+https://github.com/Dustu103/Recon; InterviewPrepResearch)',
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'accept-language': 'en-US,en;q=0.9',
        },
        signal: abortController.signal,
      });

      const statusCode = response.statusCode;

      // Handle Redirects (301, 302, 303, 307, 308)
      if (
        [301, 302, 303, 307, 308].includes(statusCode) &&
        response.headers.location
      ) {
        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new TaroError(
            ErrorCode.INVALID_URL,
            `Exceeded maximum redirect limit of ${maxRedirects}`
          );
        }

        const rawLocation = Array.isArray(response.headers.location)
          ? response.headers.location[0]
          : response.headers.location;

        const resolvedRedirect = new URL(rawLocation, currentUrl).toString();

        // Drain the redirect response body to free socket
        await response.body.dump();

        // Crucial: Validate next hop for SSRF BEFORE following
        currentUrl = validateUrl(resolvedRedirect, { allowLocalhost }).toString();
        continue;
      }

      // Handle 429 Too Many Requests or 503 Service Unavailable with backoff (1 retry)
      if (statusCode === 429 || statusCode === 503) {
        const retryAfterHeader = response.headers['retry-after'];
        let waitMs = 500;
        if (retryAfterHeader) {
          const parsedSec = parseInt(
            Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader,
            10
          );
          if (!isNaN(parsedSec) && parsedSec > 0) {
            waitMs = Math.min(parsedSec * 1000, 2000); // capped at 2s
          }
        }
        await response.body.dump();
        throw new TaroError(
          ErrorCode.COMPANY_UNREACHABLE,
          `Target returned ${statusCode} (Rate limited / Service Unavailable). Backoff: ${waitMs}ms`
        );
      }

      // If status >= 400, dump and return/throw
      if (statusCode >= 400) {
        await response.body.dump();
        throw new TaroError(
          ErrorCode.COMPANY_UNREACHABLE,
          `HTTP ${statusCode} returned from ${currentUrl}`
        );
      }

      // Section 11: Restrict handling to expected content types (text/html or application/xhtml+xml)
      const rawContentType = response.headers['content-type'];
      const contentType = Array.isArray(rawContentType)
        ? rawContentType[0]
        : rawContentType || '';

      if (
        !contentType.toLowerCase().includes('text/html') &&
        !contentType.toLowerCase().includes('application/xhtml+xml')
      ) {
        await response.body.dump();
        throw new TaroError(
          ErrorCode.INVALID_INPUT,
          `Unsupported Content-Type: ${contentType}. Expected text/html.`
        );
      }

      // Check Content-Length header if present
      const rawContentLength = response.headers['content-length'];
      const contentLengthStr = Array.isArray(rawContentLength)
        ? rawContentLength[0]
        : rawContentLength;
      if (contentLengthStr) {
        const contentLength = parseInt(contentLengthStr, 10);
        if (!isNaN(contentLength) && contentLength > maxBytes) {
          await response.body.dump();
          throw new TaroError(
            ErrorCode.RESPONSE_TOO_LARGE,
            `Response content length (${contentLength} bytes) exceeds limit of ${maxBytes} bytes`
          );
        }
      }

      // Stream body with byte accumulation cap
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      for await (const chunk of response.body) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > maxBytes) {
          response.body.destroy();
          throw new TaroError(
            ErrorCode.RESPONSE_TOO_LARGE,
            `Response body exceeded maximum allowed size of ${maxBytes} bytes`
          );
        }
        chunks.push(buf);
      }

      const html = Buffer.concat(chunks).toString('utf-8');

      // Convert undici headers to simple Record<string, string>
      const headersRecord: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers)) {
        if (v !== undefined) {
          headersRecord[k] = Array.isArray(v) ? v.join(', ') : v;
        }
      }

      return {
        url: initialUrl,
        finalUrl: currentUrl,
        statusCode,
        headers: headersRecord,
        html,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      if (err instanceof TaroError) {
        throw err;
      }
      if (abortController.signal.aborted) {
        throw new TaroError(
          ErrorCode.TIMEOUT,
          `Request to ${currentUrl} timed out after ${timeoutMs}ms`
        );
      }
      throw new TaroError(
        ErrorCode.COMPANY_UNREACHABLE,
        `Failed to fetch ${currentUrl}: ${err.message}`,
        err
      );
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (options.signal) {
        options.signal.removeEventListener('abort', onParentAbort);
      }
      releaseOriginSlot(origin);
    }
  }

  throw new TaroError(
    ErrorCode.INVALID_URL,
    `Exceeded maximum redirect limit of ${maxRedirects}`
  );
}
