# Kit Lifecycle, Persistence & Resilience Engine (Domain 5)

## Overview

Domain 5 (D5) delivers the production lifecycle, persistence, and resilience engine for Recon interview preparation kits. It decouples long-running AI extraction, question generation, and deterministic scheduling from synchronous HTTP connections, providing an asynchronous, crash-resilient, multi-tenant architecture.

---

## 1. Core Objectives & Architectural Invariants

1. **Non-Blocking Asynchronous API**: Form submissions trigger generation jobs and return HTTP `202 Accepted` immediately with a progress URL, eliminating proxy timeout risks (504 Gateway Timeout).
2. **Universal Client Polling**: Standard HTTP polling (`GET /api/kits/:id/progress` at 2.5s intervals) serves as the primary real-time feedback mechanism, sidestepping proxy buffering issues with Server-Sent Events (SSE) across Next.js and Vercel same-origin rewrites.
3. **Hybrid Progress Performance**:
   - In-memory `Map<string, ProgressSnapshot>` handles high-frequency polling reads at sub-millisecond latencies.
   - MongoDB checkpoint writes are triggered only at significant lifecycle phase transitions, keeping database I/O minimal.
4. **Idempotent Input Deduplication**: A deterministic SHA-256 hash computed over normalized candidate inputs prevents duplicate pipelines from spawning on accidental double-clicks or rapid re-submissions.
5. **Crash Resilience & Stale Sweeping**:
   - Process-level `try / catch` ensures unhandled exceptions execute `failKit()` with structured error diagnostics.
   - Background `StaleReaperService` automatically reaps orphaned jobs older than 15 minutes if worker processes crash without executing shutdown handlers.
6. **Multi-Tenant Ownership Scoping**: Every progress and kit fetch query strictly validates the session candidate ID against the document `userId`. Unowned queries return HTTP `404 Not Found` (never leaking resource existence).

---

## 2. System Architecture & Flow

```
Candidate Browser                     Express API (src/api)                  MongoDB / Core Engine
       │                                        │                                       │
       │── POST /api/kits/generate ────────────>│                                       │
       │   { companyUrl, jd, days }             │── SHA-256 inputHash check ───────────>│
       │                                        │   (dedup guard: active job?)          │
       │<── 202 Accepted { kitId, progressUrl }─│                                       │
       │                                        │                                       │
       │                                        │── startGeneration(kitId) (async) ────>│
       │                                        │                                       │
       │── GET /api/kits/:id/progress ─────────>│                                       │
       │                                        │── Read from in-memory Map             │
       │<── 200 OK { progress: 25, phase } ─────│   (fallback to Mongo on miss)         │
       │                                        │                                       │
       │                                        │                                       │
       │                                        │<── Phase: 'extracting' (onProgress) ──│
       │                                        │── Update in-memory Map & DB Checkpoint│
       │                                        │                                       │
       │── GET /api/kits/:id/progress ─────────>│                                       │
       │<── 200 OK { progress: 75, phase } ─────│                                       │
       │                                        │                                       │
       │                                        │<── Complete: Appendix A Kit JSON ─────│
       │                                        │── Kit.findOneAndUpdate(completed) ───>│
       │                                        │                                       │
       │── GET /api/kits/:id/progress ─────────>│                                       │
       │<── 200 OK { status: 'completed' } ─────│                                       │
       │                                        │                                       │
       │── GET /api/kits/:id ──────────────────>│── Kit.findOne({ _id, userId }) ──────>│
       │<── 200 OK { kit: Appendix A } ─────────│<── Returns Full Kit Document ─────────│
```

---

## 3. Lifecycle States & Phase Progression

The generation pipeline moves through seven discrete states:

| Phase | Progress (%) | Stage Description |
|---|---|---|
| `pending` | 0% | Request validated and accepted; queued for execution. |
| `crawling` | 10% – 30% | Deep careers crawler inspecting company domain, culture, and requirements. |
| `extracting` | 30% – 50% | LLM parsing job description into structured requirements and role taxonomy. |
| `generating` | 50% – 85% | Multi-batch LLM question bank and flashcard synthesis. |
| `scheduling` | 85% – 95% | Deterministic coverage check, 2nd-pass gap repair, and study schedule packing. |
| `completed` | 100% | Appendix A kit validated and persisted; ready for study. |
| `failed` | Terminated | Generation halted; structured error diagnostic recorded. |

---

## 4. API Specification

### 4.1 Generate Prep Kit
- **Route**: `POST /api/kits/generate`
- **Auth**: Required (Candidate JWT cookie)
- **Body**:
  ```json
  {
    "companyUrl": "https://stripe.com",
    "jd": "Staff Systems Engineer with 8+ years distributed systems experience...",
    "days": 7
  }
  ```
- **Response** (`202 Accepted`):
  ```json
  {
    "success": true,
    "kitId": "6aa314e260efbb0c90a532c2",
    "status": "pending",
    "progressUrl": "/api/kits/6aa314e260efbb0c90a532c2/progress"
  }
  ```
- **Idempotency**: If an identical active request was submitted by the same candidate, returns HTTP `200 OK` with the existing `kitId`.

---

### 4.2 Query Progress
- **Route**: `GET /api/kits/:id/progress`
- **Auth**: Required (Candidate JWT cookie)
- **Response** (`200 OK`):
  ```json
  {
    "kitId": "6aa314e260efbb0c90a532c2",
    "status": "generating",
    "progress": 65,
    "phase": "generating",
    "message": "Synthesizing interview questions..."
  }
  ```

---

### 4.3 Retrieve Completed Kit
- **Route**: `GET /api/kits/:id`
- **Auth**: Required (Candidate JWT cookie)
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "kit": {
      "source": { ... },
      "company_brief": { ... },
      "role": { ... },
      "questions": [ ... ],
      "flashcards": [ ... ],
      "schedule": { ... },
      "coverage": { ... }
    }
  }
  ```

---

## 5. Resilience & Fault Tolerance Mechanisms

### 5.1 In-Memory Fast Path + DB Persistence
To prevent database connection saturation from high-frequency polling:
- `KitLifecycleService` maintains `progressMap: Map<string, ProgressSnapshot>`.
- Client polling queries the in-memory map first (0 DB queries).
- On cache miss (e.g. process restart), it queries MongoDB lean documents (`findOne({ _id, userId }).select('status progress checkpoints error').lean()`).

### 5.2 Structured Error Handling
All errors thrown during pipeline execution (e.g., crawler timeouts, LLM rate limits, schema validation failures) are caught and stored in the kit document:
```ts
kit.error = {
  code: error.code || 'INTERNAL_ERROR',
  message: error.message,
  phase: currentPhase,
  occurredAt: new Date()
};
kit.status = 'failed';
```

### 5.3 Stale Reaper Daemon
- Runs every 60 seconds (`setInterval`).
- Queries MongoDB for kits in incomplete states where `updatedAt < Date.now() - 15 * 60 * 1000`.
- Transitions stuck kits to `status: 'failed'` with code `TIMEOUT`.

---

## 6. Verification & Test Suite

The D5 engine is thoroughly tested under hermetic unit and integration tests:

1. **`src/api/__tests__/unit/kit-lifecycle.test.ts`** (8 test suites):
   - Deterministic SHA-256 input hash normalization.
   - Duplicate submission deduplication and reuse of active kit IDs.
   - Safe retry allowing new kit generation after previous failure.
   - Multi-tenant hash isolation (different users with identical inputs get unique kits).
   - In-memory fast cache hit vs. MongoDB fallback.
   - Multi-tenant 404 security boundary enforcement.
   - Structured error payload recording on `failKit()`.
   - Stale reaper timeout expiration.

2. **Integration Verification**:
   - `npm test`: All 36 test files, 314 tests passing.
   - Next.js production build (`npm run build:web`): All routes compile cleanly.
