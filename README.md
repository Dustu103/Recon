# Recon — AI Interview Prep Kit

> **Transform any job description and company URL into a structured, hyper-personalized interview preparation kit.**

Recon is built to fulfill `FS-AI-INTERVIEW-01`, engineered with a **Streamlined Unified Architecture** combining a robust Express backend API, a deterministic domain intelligence engine, and a modern Next.js 14 web application.

---

## Architecture & Layout

The repository utilizes a unified root workspace to eliminate multi-package compilation friction while keeping strict domain boundaries:

```
taro/
├── package.json               # Unified dependencies & scripts (Express, Zod, Cheerio, Vitest, etc.)
├── tsconfig.json              # TypeScript configuration with path aliases (@/shared, @/core, @/api, @/cli)
├── vitest.config.ts           # Unified Vitest runner for all 156 unit & integration tests
├── .env.example               # Committed environment variable contract
├── .env.test                  # Committed test mocks & secrets
├── src/
│   ├── shared/                # Foundation: Appendix A Schemas, Frozen Error Enum, ID Generator
│   ├── core/                  # Headless Domain Logic: Crawler, LLM Client, Pipeline Steps, Deterministic Math
│   ├── api/                   # HTTP & Persistence: Express Server, Auth Routes, Kit Lifecycle, Polling Progress
│   └── cli/                   # Batch Evaluation CLI: "npm run evaluate -- --input ... --output ..."
├── apps/
│   └── web/                   # Frontend Workspace: Next.js 14, Tailwind CSS, Interactive Builder
├── docs/                      # Technical specifications, architecture docs, and operational runbooks
└── tests/
    └── cli/fixtures/          # Evaluation test fixtures
```

---

## Quick Start

### 1. Prerequisites
- **Node.js**: v20.x or v22.x LTS
- **npm**: v10.x or higher

### 2. Installation
```bash
git clone <repository-url>
cd taro
npm install
```

### 3. Environment Configuration
```bash
cp .env.example .env
```
Open `.env` and configure your credentials:
- Provide an LLM key (`GEMINI_API_KEY` or `GROQ_API_KEY`).
- For server and web execution, provide `MONGODB_URI` and `JWT_SECRET`.
*(Note: Running `npm test` or `npm run evaluate` requires zero manual environment configuration).*

### 4. Running the Development Servers
Starts both the Express API (`http://localhost:4000`) and the Next.js web application (`http://localhost:3000`):
```bash
npm run dev
```

---

## Batch Evaluation CLI (Section 9 / Appendix B)

The evaluation runner operates completely headless without requiring a database connection or running server:

```bash
npm run evaluate -- --input tests/cli/fixtures/test-cases.json --output scratch/output.json
```

- Ingests test cases (each with `id`, `jd`, `company_url`, `days`).
- Evaluates cases individually and isolates failures.
- Emits a single JSON file strictly validated against `BatchOutputSchema` (Appendix B).

---

## Verification & Testing

Taro includes a hermetic test suite with **160 tests across 10 test suites** with 100% pass rate:

```bash
npm test              # Run all 160 unit & integration tests (~3.5s)
npm run test:shared   # Test Appendix A schemas, error codes, ID generators (120 tests)
npm run test:core     # Test crawler, HTML cleaning, link ranker (12 tests)
npm run test:api      # Test Express API, auth integration, kit scoping (24 tests)
npm run test:cli      # Test evaluation CLI runner (4 tests)
npm run lint          # Run Next.js ESLint (0 errors, 0 warnings)
npm run build         # Build backend API and Next.js web production bundle
```

---

## Implemented Milestones

| Domain | Scope | Status | Highlights |
| :--- | :--- | :--- | :--- |
| **D0: Foundation** | Infrastructure & Contracts | **Complete** | Monorepo consolidation, Appendix A/B Zod schemas, 24 frozen error codes, monotonic ID generator, `.env` validator. |
| **D1: Identity** | Auth, Sessions & Multi-Tenancy | **Complete** | Cookie-only auth (`taro_session`, `HttpOnly`, `SameSite=Lax`), 8–72 char passwords, 2-tier rate limiting (20/min burst, 5 failed/15min), timing attack defense, tenant isolation (strict 404), Next.js `<ProtectedRoute>` and pages. |
| **D2: Research** | Crawler & Extraction | Up Next | SSRF shield, HTML cleaner, dynamic link ranker, discussion notes retriever, quality gate. |
| **D3: AI Generation** | LLM Pipeline Steps 1–4 | Pending | Prompt injection guards, per-category question calls, flashcard generation, retry backoff. |
| **D4: Deterministic** | Math & Scheduling | Pending | Greedy / linear programming schedule allocator, 2-pass coverage guarantee. |
| **D5: Kit Lifecycle** | Persistence & Polling | Pending | MongoDB kit lifecycle, 4-second polling progress engine with durable step checkpoints. |
| **D6: Builder** | Interactive Editor UI | Pending | Inline editing, sectional regenerations, monotonic ID preservation. |
| **D7: Practice** | Mock Simulation | Pending | Audio transcription, AI interviewer follow-ups, depth rubric evaluation. |
| **D8: Evaluation** | Appendix B Orchestration | Pending | Core pipeline wiring to `npm run evaluate`. |
| **D9: Release** | Production Hardening | Pending | Containerization, deployment guides, smoke tests. |

---

## Documentation Index

- [docs/monorepo.md](file:///d:/Prorgram/Project/taro/docs/monorepo.md): Monorepo structure, domain boundaries, and import invariants.
- [docs/schema.md](file:///d:/Prorgram/Project/taro/docs/schema.md): Appendix A & B schema contracts, referential integrity rules, and Canonical Error Registry.
- [docs/auth.md](file:///d:/Prorgram/Project/taro/docs/auth.md): Authentication endpoints, cookie specs, session format, and frontend architecture.
- [docs/security.md](file:///d:/Prorgram/Project/taro/docs/security.md): Security controls, threat models, and explicit architectural trade-offs.
- [docs/operations/environment.md](file:///d:/Prorgram/Project/taro/docs/operations/environment.md): Environment variable reference and resolution hierarchy.
- [docs/operations/runbook.md](file:///d:/Prorgram/Project/taro/docs/operations/runbook.md): Developer runbook, operations guide, and troubleshooting.
