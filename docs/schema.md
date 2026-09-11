# Appendix A & B Schema Contracts & Constraints

## Overview
Every interview prep kit produced by Taro must conform strictly to the Appendix A envelope. The automated grading pipeline runs against unseen job descriptions and checks every key verbatim.

---

## Appendix A: Kit Contract

```json
{
  "source": {
    "company": "Acme Corp",
    "company_url": "https://acme.com",
    "role": "Senior Engineer",
    "location": "Remote",
    "jd_chars": 1200,
    "researched_at": "2026-09-08T18:00:00.000Z",
    "pages_used": ["https://acme.com/careers"]
  },
  "company_brief": {
    "summary": "Acme builds developer productivity tools.",
    "what_they_do": "Cloud infrastructure automation.",
    "sources": ["https://acme.com/about"]
  },
  "role": {
    "title": "Senior Engineer",
    "seniority": "Senior",
    "responsibilities": ["Architect microservices", "Lead sprint planning"],
    "requirements": [
      {
        "id": "r1",
        "text": "5+ years React",
        "kind": "technical",
        "priority": "must"
      }
    ]
  },
  "questions": [
    {
      "id": "q1",
      "requirement_ids": ["r1"],
      "category": "technical",
      "prompt": "How does React reconciliation work under the hood?",
      "answer_outline": "Explain Fiber tree, work loop, and diffing algorithm.",
      "difficulty": 2
    }
  ],
  "flashcards": [
    {
      "id": "f1",
      "front": "What is React Fiber?",
      "back": "The internal reimplementation of the reconciliation engine enabling cooperative scheduling.",
      "requirement_ids": ["r1"]
    }
  ],
  "schedule": {
    "days_available": 5,
    "days": [
      {
        "day": 1,
        "focus": "Technical Fundamentals",
        "question_ids": ["q1"],
        "minutes": 60
      }
    ]
  },
  "coverage": {
    "uncovered_requirement_ids": [],
    "passes": 1
  }
}
```

---

## Exact Field Types & Invariants

| Path | Type | Constraints | Autograder Relevance |
|---|---|---|---|
| `source.jd_chars` | `number` | Non-negative integer | Checked against input length |
| `source.researched_at` | `string` | ISO 8601 (supports UTC & offsets) | Verified timestamp format |
| `role.requirements[].id` | `string` | Pattern `/^r\d+$/` (e.g. `r1`, `r2`) | Stable ID integrity |
| `role.requirements[].kind` | `string` | `'technical' \| 'behavioural' \| 'domain'` | Strictly enumerated |
| `role.requirements[].priority`| `string` | `'must' \| 'nice'` | Determines coverage check |
| `questions[].id` | `string` | Pattern `/^q\d+$/` (e.g. `q1`, `q2`) | Stable ID integrity |
| `questions[].difficulty` | `number` | Literal `1 \| 2 \| 3` (no floats) | Exact integer scale |
| `questions[].category` | `string` | `'technical' \| 'behavioural' \| 'system-design' \| 'company-fit'` | Categorized bank |
| `questions[]._edited` | `boolean` (optional) | Present when customized via inline editor | Preserves item during regeneration |
| `questions[]._manual` | `boolean` (optional) | Present when inserted manually by candidate | Preserves item during regeneration |
| `flashcards[]._edited` | `boolean` (optional) | Present when customized via inline editor | Preserves card during regeneration |
| `flashcards[]._manual` | `boolean` (optional) | Present when inserted manually by candidate | Preserves card during regeneration |
| `company_brief._edited` | `boolean` (optional) | Present when customized via inline editor | Enforces 428 confirmation gate |
| `schedule.days[].minutes` | `number` | Integer only (non-negative) | Float durations fail |
| `schedule.days_available` | `number` | Integer 1 to 60 | Must match `schedule.days.length` |
| `coverage.passes` | `number` | Integer >= 1 | Number of loop passes |

---

## Domain 5 & 6 Persistence & Progress Extensions

In addition to the Appendix A JSON document, the MongoDB kit document (`IKit`) maintains stateful metadata for workspace interactivity:

```typescript
export interface IKitProgress {
  notes?: Record<string, string>;              // Practice STAR notes keyed by question ID (e.g. { "q1": "..." })
  starred?: string[];                         // Array of bookmarked question IDs (e.g. ["q1", "q4"])
  flashcardMastery?: Record<string, string>;  // Card mastery status (e.g. { "f1": "mastered" })
  completedDays?: number[];                   // Checked-off study schedule days (e.g. [1, 2])
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `nextQuestionIndex` | `number` | `1` | Monotonic counter for allocating non-colliding `qX` IDs across manual additions and regenerations. |
| `nextFlashcardIndex`| `number` | `1` | Monotonic counter for allocating non-colliding `fX` IDs across manual additions and regenerations. |
| `progress` | `IKitProgress` | `{ notes: {}, starred: [], flashcardMastery: {}, completedDays: [] }` | Workspace candidate progress state updated via `PATCH /api/kits/:id/candidate-progress`. |
| `__v` | `number` | `0` | Mongoose OCC version key evaluated on mutations to prevent race conditions. |

---

## Referential Integrity Rules (Enforced by Zod superRefine)

1. Every ID inside `questions[].requirement_ids` must exist in `role.requirements[].id`.
2. Every ID inside `flashcards[].requirement_ids` must exist in `role.requirements[].id`.
3. Every ID inside `schedule.days[].question_ids` must exist in `questions[].id`.
4. Every ID inside `coverage.uncovered_requirement_ids` must exist in `role.requirements[].id`.

---

## Appendix B: Batch Output Contract

CLI batch evaluation produces a single JSON file adhering to `BatchOutputSchema`:

```json
{
  "version": "1.0",
  "generated_at": "2026-09-08T18:00:00.000Z",
  "kits": [
    {
      "id": "case-01",
      "status": "ok",
      "kit": { /* Appendix A Object */ },
      "error": null
    },
    {
      "id": "case-02",
      "status": "failed",
      "kit": null,
      "error": {
        "code": "COMPANY_UNREACHABLE",
        "message": "Company site unreachable after retries."
      }
    }
  ]
}
```

---

## Appendix B: Batch Input Contract

The input file fed to `npm run evaluate -- --input <cases.json>` must conform to `BatchInputSchema` (an array of `BatchInputCaseSchema` items):

```json
[
  {
    "id": "case-01",
    "jd": "Software Engineer job description with required skills...",
    "company_url": "https://example.com",
    "days": 5
  }
]
```

| Field | Type | Constraint | Description |
|---|---|---|---|
| `id` | `string` | Min 1 character | Unique test case identifier |
| `jd` | `string` | Min 1 character | Raw job description text |
| `company_url` | `string` | Valid URL (HTTP/HTTPS) | Target company website to research |
| `days` | `number` | Integer 1 to 60 | Number of preparation days allocated |

---

## D1: Authentication Schemas
 
Domain 1 introduces strict request/response contracts for candidate identity and sessions:
 
| Schema Name | Exported Type | Constraints & Behavior | Purpose |
|---|---|---|---|
| `RegisterInputSchema` | `RegisterInput` | `email`: valid format, normalized to lowercase & trimmed.<br>`password`: `min(8)`, `max(72)` (prevents bcrypt silent truncation). | User registration payload |
| `LoginInputSchema` | `LoginInput` | `email`: valid format, normalized to lowercase & trimmed.<br>`password`: string. | User login credentials |
| `UserPayloadSchema` | `UserPayload` | `id`: string.<br>`email`: string.<br>`createdAt`: optional ISO 8601 string. | Sanitized user profile returned in HTTP responses and decoded from JWT. |
 
---
 
## Canonical Error Registry & HTTP Status Mapping
 
Every failure across the Taro platform is mapped to a canonical, frozen `ErrorCode` (never arbitrary strings) with an authoritative HTTP status code:
 
| Error Code | Category | HTTP Status | Description |
| :--- | :--- | :--- | :--- |
| `INVALID_INPUT` | Validation | 400 | Malformed JSON body or failed Zod validation |
| `JD_TOO_SHORT` | Validation | 400 | Job description contains insufficient text (< 100 chars) |
| `KIT_SCHEMA_INVALID` | Validation | 400 | Output payload violated Appendix A referential integrity |
| `BATCH_SIZE_EXCEEDED` | Validation | 400 | Batch evaluation input array exceeded maximum limit |
| `UNAUTHORIZED` | Auth (D1) | 401 | Missing, malformed, or tampered session cookie |
| `TOKEN_EXPIRED` | Auth (D1) | 401 | JWT expired beyond 7-day TTL |
| `INVALID_CREDENTIALS` | Auth (D1) | 401 | Incorrect email or password (constant-time response) |
| `ROBOTS_DISALLOWED` | Crawler | 403 | Target path disallowed by company's `robots.txt` |
| `PRIVATE_IP_BLOCKED` | Crawler | 403 | SSRF protection blocked RFC 1918 / cloud metadata address |
| `UNAUTHORIZED_KIT_ACCESS`| Access (D5)| 403 | Forbidden action on kit resource |
| `NOT_FOUND` | System | 404 | Unknown API endpoint or unowned kit ID |
| `KIT_NOT_FOUND` | Access (D5)| 404 | Kit does not exist or candidate is not owner |
| `USER_EXISTS` | Auth (D1) | 409 | Candidate already registered with specified email address |
| `CONCURRENT_MODIFICATION` | Concurrency (D6) | 409 | OCC version collision (`__v` mismatch) during write race |
| `CONFIRMATION_REQUIRED` | Gate (D6) | 428 | Attempted destructive overwrite of customized singleton (`company_brief`) without `force: true` |
| `AUTH_RATE_LIMITED` | Auth (D1) | 429 | Exceeded 20 req/min burst or 5 failed logins per 15 min |
| `LLM_RATE_LIMITED` | LLM | 429 | Upstream AI provider returned 429 after 4 exponential backoff retries |
| `COMPANY_UNREACHABLE` | Crawler | 502 | Target company DNS failure, network drop, or server 5xx |
| `LLM_INVALID_JSON` | LLM | 502 | LLM produced truncated/unrepairable JSON syntax |
| `RESPONSE_TOO_LARGE` | Crawler | 502 | Scraped page body exceeded 2MB limit |
| `TIMEOUT` | Network | 504 | Scrape request exceeded 8-second HTTP timeout |
| `SCHEDULE_ALLOCATION_FAILED`| Math | 500 | Linear programming / greedy day packing failed constraint |
| `CASE_FAILED` | Batch CLI | 500 | Evaluation case failure recorded in Appendix B envelope |
| `GENERATION_IN_PROGRESS`| Lifecycle (D5) | 500 | Duplicate concurrent generation triggered for kit |
| `INTERNAL_ERROR` | System | 500 | Unhandled runtime exception |
 
---
 
## Shared Schema Registry Summary
 
All schemas are exported from `@taro/shared` with corresponding TypeScript types:
 
| Schema Name | Exported Type | Purpose |
|---|---|---|
| `RegisterInputSchema` | `RegisterInput` | D1: User registration payload (8–72 char bounds) |
| `LoginInputSchema` | `LoginInput` | D1: User login credentials |
| `UserPayloadSchema` | `UserPayload` | D1: Sanitized user session profile |
| `SourceSchema` | `Source` | Appendix A: Source metadata, JD length, timestamp, pages used |
| `CompanyBriefSchema` | `CompanyBrief` | Appendix A: Company summary, domain, sources |
| `RequirementSchema` | `Requirement` | Appendix A: Stable `r1..rn` ID, kind, priority |
| `RoleSchema` | `Role` | Appendix A: Role title, seniority, responsibilities, requirements |
| `QuestionSchema` | `Question` | Appendix A: Stable `q1..qn` ID, difficulty 1-3, requirement mapping |
| `FlashcardSchema` | `Flashcard` | Appendix A: Stable `f1..fn` ID, front/back, requirement mapping |
| `ScheduleSchema` | `Schedule` | Appendix A: Day plans, integer minutes, question mapping |
| `CoverageSchema` | `Coverage` | Appendix A: Uncovered requirements, loop passes |
| `KitSchema` | `Kit` | Full Appendix A Envelope with 4-way referential integrity |
| `BatchInputCaseSchema`| `BatchInputCase` | Single case entry for batch evaluation input |
| `BatchInputSchema` | `BatchInputCase[]`| Top-level array of cases for batch evaluation |
| `BatchOutputSchema` | `BatchOutput` | Top-level envelope for Appendix B evaluation output |



