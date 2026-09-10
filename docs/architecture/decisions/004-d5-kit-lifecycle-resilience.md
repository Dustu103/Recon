# ADR-004: Domain 5 — Kit Lifecycle, Persistence & Resilience Architecture

**Status**: Accepted  
**Date**: 2026-09-11  
**Deciders**: Engineering Team  
**Supersedes**: Synchronous / SSE-based kit generation route in `kit.routes.ts`

---

## Context & Problem Statement

In Domain 3, kit generation was initially invoked synchronously over HTTP or via Server-Sent Events (SSE). While effective for local prototyping, this approach suffered from critical operational vulnerabilities in real-world deployment topologies:

1. **Proxy Buffering & SSE Breakage**: In production architectures employing reverse proxies or Next.js rewrites (such as Vercel same-origin `/api/:path*` rewrites required to bypass third-party cookie restrictions under `SameSite=Strict`), HTTP streaming responses are buffered until completion. This prevents incremental SSE events from reaching the browser in real time.
2. **Crash Fragility**: If the Node.js process restarts, crashes, or terminates mid-pipeline, synchronous connections drop with an unhelpful 502/504 error, leaving orphaned records stuck in undefined states with no recovery path.
3. **Duplicate Submission Vulnerability**: Double-clicking form submissions or network retries spawned duplicate LLM pipeline runs for the exact same input, exhausting token rate limits and creating duplicate database documents.
4. **Multi-Tenant Data Leakage**: Without strict scoping at the lifecycle state layer, job polling and progress updates could risk exposing kit generation metadata across user boundaries.

---

## Decisions

### D5.1: HTTP Polling as Primary Delivery Protocol (Deprecating SSE)

**Decision**: Deprecate SSE streaming for kit generation progress and promote standard HTTP polling (`GET /api/kits/:id/progress` every 2.5s) to the primary delivery protocol. The generation endpoint (`POST /api/kits/generate`) returns `202 Accepted` immediately with `{ kitId, progressUrl }`.

**Rationale**:
- Vercel's `next.config.js` same-origin rewrites (`/api/:path* -> backend:4000/api/:path*`) buffer chunked transfer encoding, destroying true real-time SSE streaming for client viewers.
- Standard HTTP `GET` requests with JSON payloads work uniformly across all CDN edges, load balancers, serverless proxies, corporate firewalls, and mobile browsers without requiring connection hijacking or keep-alive streaming infrastructure.

---

### D5.2: Hybrid Progress Engine (In-Memory Fast Path + MongoDB Checkpoints)

**Decision**: Implement a two-tier hybrid progress architecture:
1. High-frequency progress ticks (e.g. 10%, 25%, 45%, 70%) update a non-blocking in-memory `Map<string, ProgressSnapshot>`.
2. Major lifecycle milestone transitions (`pending` → `crawling` → `extracting` → `generating` → `scheduling` → `completed` / `failed`) write durable checkpoints to MongoDB via `Kit.findOneAndUpdate`.

**Rationale**: Polling every 2.5 seconds by multiple active candidates would create excessive write load and lock contention if every minor percentage increment hit the database. In-memory reads satisfy client polling with sub-millisecond response times, while durable milestone persistence guarantees that system restarts retain state and history. If an in-memory cache miss occurs, the query seamlessly falls back to MongoDB.

---

### D5.3: Idempotent Input Deduplication via SHA-256 Hashes

**Decision**: Compute a deterministic SHA-256 hash across normalized candidate parameters:
```ts
inputHash = sha256(`${userId}:${normalizedCompanyUrl}:${normalizedJd}`)
```
When `POST /api/kits/generate` is called:
- Check if an active kit (`status` in `['pending', 'crawling', 'extracting', 'generating', 'scheduling']`) already exists for `(userId, inputHash)`.
- If an active job exists, return HTTP `200 OK` with the existing `kitId` and `progressUrl`, rather than spawning a concurrent duplicate pipeline.
- If a previous run failed, permit a fresh generation attempt by provisioning a new document.

---

### D5.4: Crash-Safe Execution & Guaranteed `failKit` Transition

**Decision**: Wrap asynchronous pipeline execution in an ironclad `try / catch` boundary. Any unhandled exception or rejected promise inside `generateKit()` triggers `failKit(kitId, errorCode, message, phase)`.

The failed state records structured diagnostic telemetry:
```ts
error: {
  code: ErrorCode,
  message: string,
  phase: KitStatus,
  occurredAt: Date
}
```
This guarantees that kit status transitions are monotonic and terminal — no kit remains permanently stuck in an active state when a runtime failure occurs.

---

### D5.5: Background Stale-Job Reaper Service

**Decision**: Run a background sweeping service (`StaleReaperService`) initialized on server boot (`src/api/index.ts`) that executes every 60 seconds.

**Sweep Rule**:
Any kit with status in `['pending', 'crawling', 'extracting', 'generating', 'scheduling']` whose `updatedAt` timestamp is older than 15 minutes (`STALE_TIMEOUT_MS = 900,000`) is automatically transitioned to `status: 'failed'` with error code `TIMEOUT` ("Generation timed out or worker crashed").

**Rationale**: In the event of catastrophic worker node termination (e.g. OOM kill, host reboot, container eviction) where Node.js `catch` blocks cannot run, the stale reaper ensures orphaned kits cleanly surface as failed to the user rather than hanging indefinitely.

---

### D5.6: Headless CLI Engine Isolation Preserved

**Decision**: The core pipeline (`src/core/pipeline/kit-orchestrator.ts`) remains strictly headless and decoupled from Express, Mongoose, and MongoDB.

**Architecture**:
The `KitLifecycleService` wraps the headless `generateKit` function, providing progress callbacks and persistence hooks. Batch evaluation via `src/cli/evaluate.ts` continues to call `generateKit` directly with zero HTTP or database overhead.

---

## State Machine Diagram

```
                 [ POST /api/kits/generate ]
                              │
                     (Dedup Guard Check)
                     /                 \
        [Existing In-Progress]    [New Unique Input]
                  │                       │
           Return 200 OK           Return 202 Accepted
          (Reuse kitId)                   │
                                          ▼
                                     ┌─────────┐
                                     │ pending │
                                     └────┬────┘
                                          │
                                          ▼
                                    ┌──────────┐
                                    │ crawling │
                                    └─────┬────┘
                                          │
                                          ▼
                                   ┌────────────┐
                                   │ extracting │
                                   └──────┬─────┘
                                          │
                        ┌─────────────────┴─────────────────┐
                        │                                   │
                  (Success path)                     (Any Exception)
                        │                                   │
                        ▼                                   ▼
                 ┌────────────┐                        ┌────────┐
                 │ generating │                        │ failed │
                 └──────┬─────┘                        └────────┘
                        │                                   ▲
                        ▼                                   │
                 ┌────────────┐                             │
                 │ scheduling │                             │
                 └──────┬─────┘                             │
                        │                                   │
                        ├───────────────────────────────────┘
                        ▼
                 ┌───────────┐
                 │ completed │
                 └───────────┘
```

---

## Consequences

### Positive
- **Universal compatibility**: Works seamlessly across Vercel reverse proxies, Docker compose environments, and cloud CDNs.
- **Cost & rate-limit protection**: Hash-based deduplication stops accidental double-billing or redundant LLM invocations.
- **Zero permanent hangs**: The combination of `failKit` catch handlers and the 15-minute `StaleReaperService` guarantees every job terminates deterministically.
- **Sub-millisecond polling**: Hybrid memory cache avoids database lockups during concurrent progress queries.
- **Multi-tenant isolation**: All `/progress` queries enforce strict `userId` ownership checks.

### Trade-Offs
- Polling introduces up to 2.5 seconds of latency between actual generation completion and UI detection. Given that end-to-end kit generation takes 15–40 seconds, a 2.5s polling interval is well within human perceptual tolerance.
