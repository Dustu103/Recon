# Crawler & Intelligence Research Engine (Domain 2)

Recon implements a deterministic, SSRF-shielded intelligence gathering engine designed to fulfill Section 2 of `FS-AI-INTERVIEW-01`. It extracts company culture, tech stack, and interview process handbooks while strictly enforcing web security, robots compliance, and honest degradation.

---

## 1. Architecture & Crawl Topology

The crawler executes a **Bounded Depth-2 Breadth-First Search (BFS)** designed specifically to discover buried hiring handbooks (e.g., GitLab and PostHog publishing processes under `/company` $\to$ `/company/culture/how-we-hire`) without triggering unbounded crawl storms.

```
[Target URL]
     │
     ▼
[URL Validator & SSRF Shield] ── (Blocked CIDR/Cloud Metadata) ──► TaroError(PRIVATE_IP_BLOCKED)
     │
     ▼
[robots.txt Checker (RFC 9309)] ── (5xx Disallowed) ──► Graceful Degradation (JD-only)
     │
     ▼
[SafeFetcher (Undici Socket Pinning)] ── (250ms Polite Spacing / 2MB Cap / text/html Allowlist)
     │
     ▼
[Cheerio Semantic Cleaner] ── (Strips boilerplate, noise, cookie banners)
     │
     ├──► [Depth 0]: Root Page Extracted
     │
     ├──► [Link Ranker]: Keyword scoring for Depth 1 candidates
     │
     ├──► [Depth 1]: Crawls top sub-pages (/careers, /engineering, /company)
     │         │
     │         └──► [Early-Exit Quality Gate]: Score >= 18 on hiring/interview page?
     │                   ├── YES: Skip Depth 2
     │                   └── NO:  Discover Depth 2 child links (/how-we-hire)
     │
     ├──► [Depth 2]: Crawls buried handbooks (capped at max 5–6 total pages)
     │
     ▼
[Keyword Extractor]: Tech stack (React, TypeScript, AWS...) & Culture (Ownership, Velocity...)
     │
     ▼
[Discussion Retriever]: Pluggable provider (Mock, DomainInsights, or Search)
     │
     ▼
[CompanyResearchResult] ──► Downstream LLM Prompt Context
```

---

## 2. SSRF Shield & Undici Socket Pinning (Anti-TOCTOU)

### The Threat
A naive SSRF check resolves hostname via `dns.lookup()`, verifies the IP against a blocklist, and calls `fetch(hostname)`. An attacker controlling a DNS server with a 0-second TTL returns a benign public IP on check 1, and `169.254.169.254` (cloud metadata) or `127.0.0.1` on check 2 when the HTTP client establishes its socket.

### The Mitigation
Recon eliminates the Time-Of-Check to Time-Of-Use (TOCTOU) window by overriding Undici's TCP/TLS connection resolver via `buildConnector({ lookup })`:
1. `lookup` resolves all A and AAAA records via `dns.promises.lookup(hostname, { all: true })`.
2. **Every returned address is validated** against the CIDR blocklist. If ANY IP is restricted, the connection is rejected immediately.
3. The socket connector passes all verified public addresses to Undici:
   ```ts
   cb(null, addresses.map(a => ({ address: a.address, family: a.family })));
   ```
4. Undici connects the TCP/TLS socket directly to the validated IP pool, preserving multi-A record round-robin failover while maintaining TLS SNI (`opts.servername`) and the HTTP `Host` header for the target domain. **Zero secondary DNS lookups occur.**
5. In-process bounded DNS cache (max 500 entries, 10-second TTL) avoids redundant resolver overhead across multi-page crawls while preventing memory leaks in 24/7 server environments.

### CIDR Blocklist
- **IPv4**: `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10` (CGNAT), `127.0.0.0/8` (Loopback), `169.254.0.0/16` (Link-local), `172.16.0.0/12`, `192.0.0.0/24`, `192.0.2.0/24`, `192.88.99.0/24`, `192.168.0.0/16`, `198.18.0.0/15`, `198.51.100.0/24`, `203.0.113.0/24`, `224.0.0.0/4`, `240.0.0.0/4`, `255.255.255.255/32`.
- **IPv6**: `::1`, `fc00::/7` (ULA), `fe80::/10` (Link-local), `ff00::/8` (Multicast), `2001:db8::/32` (Doc), `::ffff:0:0/96` (IPv4-mapped IPv6).
- **Cloud Metadata Endpoints**: `169.254.169.254` (AWS/GCP/Azure/DO), `metadata.google.internal` (GCP), `100.100.100.200` (Alibaba Cloud), `fd00:ec2::254` (AWS IPv6).

### Hard Production Gating
Localhost and loopback access can only be enabled in testing/evaluation, strictly gated against production:
```ts
export function isLocalhostAllowed(explicitOption?: boolean): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (explicitOption !== undefined) return explicitOption;
  return process.env.NODE_ENV === 'test' || process.env.TARO_CLI_MODE === 'evaluate';
}
```

---

## 3. RFC 9309 robots.txt Compliance

Recon strictly adheres to RFC 9309 Section 2.3.1.2:
- **200 OK**: Directives for `User-agent: ReconBot` (or fallback `*`) are parsed. Specific `Allow:` directives take precedence over `Disallow:` for longer prefix matches.
- **4xx (e.g. 404 Not Found)**: Fail-open per RFC 9309 §2.3.1.2 ("resource does not exist; no access restrictions").
- **5xx (Server Error)**: Fail-closed / conservative disallow per RFC 9309 §2.3.1.2 ("assume complete disallow of access until server returns successful response or 4xx"). The crawl logs a structured warning and gracefully suspends domain crawling.
- **Timeout / DNS Failure**: Fails open with a structured warning.

---

## 4. Politeness, Rate Limiting & Backoff

To prevent hammering target origins:
- **Spacing**: Minimum 250ms spacing between successive requests to the same origin (overridable to 0ms in unit tests).
- **Concurrency**: Maximum 2 concurrent connections per host origin.
- **Backoff**: Honors `Retry-After` headers (capped at 2s) on 429/503 responses, or backs off exponentially (500ms $\to$ 1000ms), before skipping the page.

---

## 5. Content-Type Filtering & Size Guardrails

Per Section 11 of `FS-AI-INTERVIEW-01`:
- **Allowed MIME types**: `text/html`, `application/xhtml+xml` (case-insensitive prefix match).
- **Rejected MIME types**: PDFs, images, executables, or raw JSON served at careers URLs are aborted before body download, throwing `TaroError(INVALID_INPUT)` or skipping the link.
- **3xx Redirect Ordering**: Status code check precedes Content-Type check so redirect responses without Content-Type are followed correctly.
- **2MB Size Cap**: Headers checked for `Content-Length > 2MB`. If unchunked/omitted, chunks are streamed with a running byte counter; if bytes exceed 2MB, the socket is immediately destroyed via `response.body.destroy()`.

---

## 6. Skip-and-Log Resilience & Honest Degradation

- **Sub-page Resilience**: Any sub-page encountering 404, 403, timeout, or robots disallow is recorded in `skippedPages: SkippedPage[]` and `warnings`. The crawl never aborts on individual page failures.
- **Root Website Failure**: If the target company domain is unreachable (DNS resolution error, 404, timeout, or robots 5xx disallow), the orchestrator emits a warning:
  `"Company website unreachable: ... Proceeding with JD-only analysis."`
  and returns a degraded `CompanyResearchResult` with `pages: []` and `insightsIncluded: false`. The kit pipeline continues uninterrupted, generating high-quality interview questions based purely on the Job Description.

---

## 7. Pluggable Discussion Retriever

Addresses ToS and scraping fragility by decoupling interview sentiment retrieval into pluggable providers:
1. **`MockDiscussionRetriever`**: Deterministic test double for unit tests and Section 9 Appendix B headless evaluation.
2. **`DomainInsightsRetriever`**: Parses crawled company pages (careers, engineering blog, handbook) for interview, hiring, and culture sentences, extracting matching snippets with zero external dependencies.
3. **`SearchDiscussionRetriever`**: Optional provider querying external search API if `SERPER_API_KEY` is configured.
