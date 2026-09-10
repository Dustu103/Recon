# Recon — AI Interview Prep Kit

> **Transform any job description and company URL into a structured, hyper-personalized interview preparation kit.**

Recon is built to fulfill `FS-AI-INTERVIEW-01`, engineered with a **Streamlined Unified Architecture** combining a robust Express backend API, a deterministic company intelligence crawler, a Redis-backed enterprise authentication system, and a modern Next.js 14 web application.

---

## Architecture & Layout

The repository utilizes a unified root workspace keeping strict domain boundaries:

```
taro/
├── package.json               # Unified dependencies & scripts (Express, Zod, Cheerio, Vitest, etc.)
├── docker-compose.yml         # Containerized MongoDB (27017) & Redis (6379) persistence
├── tsconfig.json              # TypeScript configuration with path aliases (@/shared, @/core, @/api, @/cli)
├── vitest.config.ts           # Unified Vitest runner for all 215 unit & integration tests
├── .env                       # Active runtime configuration
├── .env.example               # Committed environment variable contract
├── src/
│   ├── shared/                # Foundation: Appendix A Schemas, Frozen Error Enum, ID Generator
│   ├── core/                  # Headless Domain Logic: Crawler, Link Ranker, SSRF Shield, robots.txt parser
│   ├── api/                   # HTTP & Persistence: Express Server, Auth Routes, Redis OTP Service, Mailer
│   └── cli/                   # Batch Evaluation CLI: "npm run evaluate -- --input ... --output ..."
├── apps/
│   └── web/                   # Frontend Workspace: Next.js 14, Tailwind CSS, Candidate Dashboard, Kit Recon
├── docs/                      # Technical specifications, security architecture, and threat models
└── tests/
    └── cli/fixtures/          # Evaluation test fixtures
```

---

## Quick Start

### 1. Prerequisites
- **Node.js**: v20.x or v22.x LTS
- **Docker**: Docker Desktop or Docker Engine (for MongoDB & Redis)
- **npm**: v10.x or higher

### 2. Infrastructure Startup (MongoDB + Redis)
```bash
docker compose up -d
```
Spins up:
- `recon-mongodb` on `localhost:27017`
- `recon-redis` on `localhost:6379`

### 3. Environment Configuration
```bash
cp .env.example .env
```
Key configuration values in `.env`:
- `MONGODB_URI=mongodb://127.0.0.1:27017/recon_dev`
- `REDIS_HOST=127.0.0.1` & `REDIS_PORT=6379`
- `JWT_SECRET`: 32+ character cryptographic secret
- `RESEND_API_KEY`: Real-world transactional email delivery (optional in local dev; falls back to formatted console output)
- `GROQ_API_KEY` / `GEMINI_API_KEY`: Live AI generation keys

### 4. Running the Development Servers
Starts both the Express API (`http://localhost:4000`) and the Next.js web client (`http://localhost:3000`):
```bash
npm run dev
```

---

## Security & Verification Features

### Redis-Backed 2-Step OTP Authentication
- **5-Minute Expiration**: Cryptographically uniform numeric OTP valid for 300 seconds.
- **Timing-Safe Verification**: Constant-time comparison using `crypto.timingSafeEqual` over HMAC-SHA256 digests.
- **Anti-Brute Force Protection**: Maximum 3 attempts per 6-digit OTP code before immediate Redis revocation.
- **At-Rest Hashing**: Plaintext OTP is never stored in Redis memory; only salted hashes are persisted.
- **Anti-Spam Throttling**: Strict 60-second cooldown on resends, plus max 5 requests per hour.
- **Production Delivery**: Integrated directly with **Resend API** via native HTTPS fetch.

### 15-Minute Expiring Password Reset
- **15-Minute Expiration**: Single-use cryptographic 64-hex tokens with HMAC-SHA256 at-rest hashing in Redis (`RESET_TOKEN_TTL_SECONDS = 900`).
- **Single-Use Invalidation**: Immediate atomic revocation of reset token upon successful password update.
- **Anti-Enumeration Privacy**: Preserves constant-time response latencies via dummy bcrypt comparison for unregistered emails.
- **Dedicated Flow UI**: Built-in Next.js interfaces at `/forgot-password` and `/reset-password?token=...`.

### SSRF-Shielded Company Crawler (Domain 2)
- **Undici Socket Pinning & 16-Bit Word Parsing**: Pins the validated IP directly to the connection socket, completely eliminating DNS rebinding TOCTOU attacks across IPv4 and dotted/hex IPv4-mapped IPv6.
- **RFC 9309 robots.txt Compliance**: Full user-agent matching, path prefixes, real-world `text/plain` support, origin caching, 4xx fail-open, and 5xx conservative fail-closed.
- **Polite Crawling**: 250ms spacing per origin and 2MB stream size cap.
- **Link Ranking**: Heuristic scoring prioritizing engineering culture, tech stacks, and career insights.

---

## Verification & Testing

Recon includes a hermetic test suite with **341 tests across 39 test files** passing 100%:

```bash
npm test              # Run all 341 unit & integration tests (~35s)
npm run test:shared   # Test Appendix A schemas, error codes, ID generators
npm run test:core     # Test crawler, LLM pipeline, coverage checker, deterministic scheduler, regeneration engine
npm run test:api      # Test Express API, Redis OTP, auth routes, kit lifecycle, stale reaper, and builder mutations
npm run test:cli      # Test evaluation CLI runner
```

---

## Implemented Milestones

| Domain | Scope | Status | Highlights |
| :--- | :--- | :--- | :--- |
| **D0: Foundation** | Infrastructure & Contracts | **Complete** | Monorepo consolidation, Appendix A/B Zod schemas, 26 frozen error codes, monotonic ID generator, `.env` validator. |
| **D1: Identity** | Auth, Sessions & Multi-Tenancy | **Complete** | Cookie-only auth (`taro_session`, `HttpOnly`, `SameSite=Lax`), 2-step Redis OTP email verification (5-min TTL), 15-min single-use password reset link, Resend API mailer, 8–72 char passwords, 2-tier rate limiting, timing attack defense, tenant isolation (strict 404). |
| **D2: Research** | Crawler & Extraction | **Complete** | SSRF shield with Undici socket pinning, RFC 9309 robots compliance, HTML cleaner, dynamic link ranker, discussion notes retriever, quality gate. |
| **D3: AI Generation** | LLM Pipeline Steps 1–4 | **Complete** | Gemini 1.5 Flash & Groq fallback, schema-enforced JSON generation, prompt engineering for requirement extraction and role synthesis, retry backoff with jitter. |
| **D4: Deterministic** | Math & Scheduling | **Complete** | Coverage checker distinguishing must vs. nice-to-have gaps, bounded 2-pass gap repair, difficulty-first study scheduler `(difficulty DESC, isMust DESC, id ASC)` preserving front-loading invariant. |
| **D5: Kit Lifecycle** | Persistence, Polling & Resilience | **Complete** | 202 Accepted async dispatch, 2.5s HTTP polling progress engine, sub-millisecond in-memory cache with durable DB checkpoints, SHA-256 idempotent deduplication, crash-safe `failKit`, 15-min background stale reaper. |
| **D6: Builder** | Interactive Editor & Regeneration | **Complete** | Granular inline editing for questions/brief/flashcards, manual additions (`_manual`), non-destructive reordering, single-section regeneration with protected item preservation, singleton confirmation gate (`428 CONFIRMATION_REQUIRED`), OCC versioning (`409 CONCURRENT_MODIFICATION`), and candidate progress tracking. |
| **D7: Practice** | Mock Simulation | Pending | Audio transcription, AI interviewer follow-ups, depth rubric evaluation. |
| **D8: Evaluation** | Appendix B Orchestration | Pending | Core pipeline wiring to `npm run evaluate`. |
| **D9: Release** | Production Hardening | Pending | Containerization, deployment guides, smoke tests. |

---

## Documentation Index

- [docs/monorepo.md](file:///d:/Prorgram/Project/taro/docs/monorepo.md): Monorepo structure, domain boundaries, and import invariants.
- [docs/schema.md](file:///d:/Prorgram/Project/taro/docs/schema.md): Appendix A & B schema contracts, referential integrity rules, and Canonical Error Registry.
- [docs/auth.md](file:///d:/Prorgram/Project/taro/docs/auth.md): Authentication endpoints, cookie specs, session format, and frontend architecture.
- [docs/crawler.md](file:///d:/Prorgram/Project/taro/docs/crawler.md): Deep careers crawler, SSRF socket pinning, and RFC 9309 robots parser.
- [docs/deterministic.md](file:///d:/Prorgram/Project/taro/docs/deterministic.md): Deterministic math, 2-pass gap repair, and study schedule front-loading proofs.
- [docs/kit-lifecycle.md](file:///d:/Prorgram/Project/taro/docs/kit-lifecycle.md): Kit lifecycle engine, 202 async generation, 2.5s HTTP polling, and stale reaper.
- [docs/kit-builder.md](file:///d:/Prorgram/Project/taro/docs/kit-builder.md): Kit builder mutations, protected item regeneration rules, and candidate progress tracking.
- [docs/security.md](file:///d:/Prorgram/Project/taro/docs/security.md): Security controls, threat models, Redis OTP verification, and explicit architectural trade-offs.
- [docs/operations/environment.md](file:///d:/Prorgram/Project/taro/docs/operations/environment.md): Environment variable specifications and secret management.
- [docs/operations/runbook.md](file:///d:/Prorgram/Project/taro/docs/operations/runbook.md): Developer runbook, Docker commands, test workflows, and batch evaluation.
- [docs/architecture/decisions/001-caching-and-trending-strategy.md](file:///d:/Prorgram/Project/taro/docs/architecture/decisions/001-caching-and-trending-strategy.md): ADR-001 on Company Research Caching vs. Full-Kit Caching & Trending Strategy.
- [docs/architecture/decisions/002-d3-llm-pipeline-architecture.md](file:///d:/Prorgram/Project/taro/docs/architecture/decisions/002-d3-llm-pipeline-architecture.md): ADR-002 on D3 LLM Pipeline Architecture, provider fallback, and prompt engineering.
- [docs/architecture/decisions/003-d4-deterministic-logic-architecture.md](file:///d:/Prorgram/Project/taro/docs/architecture/decisions/003-d4-deterministic-logic-architecture.md): ADR-003 on D4 Deterministic Logic Architecture, sort keys, and gap repair.
- [docs/architecture/decisions/004-d5-kit-lifecycle-resilience.md](file:///d:/Prorgram/Project/taro/docs/architecture/decisions/004-d5-kit-lifecycle-resilience.md): ADR-004 on D5 Kit Lifecycle, Persistence, Polling Engine, and Resilience.
- [docs/architecture/decisions/005-d6-kit-builder-regeneration.md](file:///d:/Prorgram/Project/taro/docs/architecture/decisions/005-d6-kit-builder-regeneration.md): ADR-005 on Kit Builder, Protected Item Regeneration & OCC Versioning.


