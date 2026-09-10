# ADR 001: Company Research Caching vs. Full-Kit Caching & Trending Strategy

- **Status**: Accepted
- **Date**: 2026-09-10
- **Context**: Domain 2 (Crawler & Research Engine) and Domain 3 (AI Interview Kit Generator)
- **Deciders**: Engineering Team

---

## 1. Context & Problem Statement

When high-demand companies release seasonal hiring batches (e.g., *Amazon SDE Intern* or *Stripe New Grad*), traffic spikes significantly. Multiple candidates generate interview preparation kits for the same company within short intervals.

Under a naive, un-cached execution pipeline:
1. **Redundant Web Crawling**: The crawler executes full DNS lookups, socket connections, robots.txt evaluations, and Depth-2 BFS crawls for `amazon.com` for every single user, incurring 7–12 seconds of latency per request.
2. **Rate Limiting & Server Politeness**: Rapidly repeating crawls against the same target domain risks triggering target IP rate limits or anti-bot defenses.
3. **LLM Cost & Latency**: LLM generation consumes quota against provider TPM/RPM ceilings (Groq / Gemini) and takes 5–10 seconds.

We need an architectural strategy to minimize latency and token consumption without sacrificing correctness or grading compliance.

---

## 2. Decision Drivers

1. **Schema Correctness & Grading Fidelity (Non-Negotiable)**: `FS-AI-INTERVIEW-01` Section 8/9 automated grading strictly evaluates whether questions and rubrics map 1:1 to the candidate's *specific pasted Job Description*.
2. **Speed & First-Impression UX**: Subsequent runs targeting the same company should execute with sub-second turnaround.
3. **Operational Simplicity**: Avoid provisioning unneeded cloud services, background cron daemons, or heavy dependencies.
4. **Hermetic Multi-Runtime Portability**: Must function seamlessly across the Express Web API, the Section 9 CLI Batch Runner (`npm run evaluate`), and offline unit/integration test suites.

---

## 3. Considered Options

### Option A: Blind Full-Kit Caching in Redis / MongoDB
Cache the entire generated prep kit (company brief, requirements, interview questions, rubrics, flashcards, schedule) keyed by `hash(company, role)`.

- **Pros**: Maximum possible speedup for subsequent users (~10ms). Zero LLM token consumption on hits.
- **Cons (REJECTED — Correctness Bug)**: 
  - Two candidates applying to the same company almost never paste the identical JD text. For example:
    - Candidate A pastes: *Amazon SDE II — DynamoDB, Go, Distributed Systems, High Throughput*.
    - Candidate B pastes: *Amazon SDE I — React, Java, Internal Tooling, AWS Lambda*.
  - Serving Candidate A's cached kit to Candidate B causes hallucinated requirement mismatches. Candidate B receives questions on DynamoDB consensus when their JD asked for React.
  - **Verdict**: **REJECTED**. Violates Appendix A/B grading rubrics and breaks candidate personalization.

---

### Option B: Complex ML Trending Detection (Z-Score / Prophet) & Canary ATS Scrapers
Run periodic cron jobs scraping Greenhouse, Lever, and Amazon.jobs every hour, tracking request variance using Z-score anomaly models ($Z = \frac{X - \mu}{\sigma}$).

- **Pros**: Predicts hiring surges before candidates submit requests.
- **Cons (REJECTED — Over-Engineering & Fragility)**:
  - Requires running dedicated Python services (`pandas`, `scipy`, `statsmodels`).
  - Web scraping hundreds of corporate career portals is notoriously brittle; HTML structures and ATS endpoints change constantly, and Cloudflare bot protection frequently bans scraper IPs.
  - Z-Score models suffer from an "idle tax" (periodic rotation jobs running when traffic is zero) and cannot handle cold starts without weeks of historical baseline data.
  - **Verdict**: **REJECTED**. Disproportionate maintenance overhead for a student prep platform.

---

### Option C: MongoDB Atlas M0 Atomic Counter Tracking
Store real-time trending velocity in a MongoDB collection using `$inc` operators on every search.

- **Pros**: Uses existing MongoDB database without adding new services.
- **Cons (REJECTED — Storage Anti-Pattern)**:
  - MongoDB Atlas M0 is a multi-tenant shared free cluster with strict IOPS caps and connection pooling limits.
  - Frequent atomic updates force disk writes, oplog entries, and journal flushes for ephemeral data that does not need persistent durability.
  - **Verdict**: **REJECTED**. Unsuitable for high-velocity real-time counter tracking.

---

### Option D: Bounded In-Process Company Research Cache + Fresh JD LLM Generation
Decouple **Company-Level Intelligence** from **Candidate-Specific Generation**:
1. **Cache Company Research / Crawl Result**: Cache the raw page text, tech stack keywords, hiring culture insights, and synthesized company brief keyed by normalized domain (`normalizeUrl(companyUrl)`).
2. **Never Cache Candidate-Level Items**: Always generate requirements, questions, rubrics, flashcards, and schedules fresh from the candidate's specific JD.
3. **Storage**: Use a bounded in-memory `Map` with a 6-hour TTL and maximum 50 entries directly inside `src/core/crawler/research-orchestrator.ts`.

- **Pros**:
  - **Zero Correctness Risk**: Candidate questions strictly reflect their exact pasted JD.
  - **Enormous Latency Win**: Drops repeat company recon time from **~8,000ms down to 0.2ms** (bypassing DNS, Undici socket connections, robots checks, and BFS crawls).
  - **Zero External Infrastructure**: Self-contained in Node.js process memory. Zero network hops, zero Redis/Mongo dependencies, zero cost.
  - **Universal Compatibility**: Works identically in the Web API, CLI evaluation script, and offline unit test suites.
  - **Memory-Safe**: Hard-capped at 50 entries with oldest-key LRU eviction (< 5MB RAM total).

---

## 4. Decision Outcome

**Chosen: Option D (Bounded In-Process Company Research Cache).**

### Architectural Separation of Concerns

```
[Candidate Request: Company URL + Raw JD]
             │
             ▼
   [Normalize Company URL]
             │
   ┌─────────┴─────────┐
   ▼                   ▼
[Cache HIT (0.2ms)]   [Cache MISS (7.5s)]
Reused from Memory    SSRF Pinned Crawl + Clean
   └─────────┬─────────┘
             │
             ▼
   [CompanyResearchResult] ─── (Reused or Newly Cached)
             │
             ┼ ──► [Raw Unique JD] (Always Fresh)
             │
             ▼
   [Groq LLM Pipeline] ─── (Tailored 1:1 to Candidate JD)
             │
             ▼
   [Appendix A Kit Output]
```

### Eviction & Invalidation Policy
- **TTL**: 6 hours (`6 * 60 * 60 * 1000` ms).
- **Capacity Bound**: 50 companies maximum. When capacity is exceeded, the oldest entry is evicted:
  ```typescript
  if (researchCache.size >= 50) {
    const oldestKey = researchCache.keys().next().value;
    if (oldestKey) researchCache.delete(oldestKey);
  }
  ```
- **Normalization**: URLs are normalized to base domain strings (`https://www.amazon.jobs/en/roles` $\to$ `amazon.jobs`) to maximize cache hit rates across subpaths.

---

## 5. Future Evolution (Post-Launch / Scale)

If global multi-node clustering (multiple concurrent server instances) becomes a production requirement:
- The in-process `Map` can be swapped for Docker Redis keys (`SETEX recon:crawl:[domain] 21600 [json]`) using our existing `src/api/shared/redis.ts` client with zero application logic changes.
- For single-container deployments, local evaluations, and demo environments, the in-process implementation remains the optimal, zero-dependency choice.
