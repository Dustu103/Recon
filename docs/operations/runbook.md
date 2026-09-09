# Developer Runbook & Operations Guide

This runbook outlines standard development, testing, building, and evaluation workflows for the Taro monorepo.

---

## Prerequisites

- **Node.js**: v20.x LTS or v22.x LTS (tested on Node 20.x/22.x)
- **npm**: v10.x or higher
- **Git**

---

## 1. Initial Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd taro
   ```

2. **Install all workspace dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   ```
   Add your Gemini or Groq API key to `.env`. See [docs/operations/environment.md](file:///d:/Prorgram/Project/taro/docs/operations/environment.md) for full configuration details.

---

## 2. Daily Development Workflows

### Starting Local Services
Runs both the backend Express server (port 4000) and Next.js frontend (port 3000):
```bash
npm run dev
```

### Running the Test Suite
Runs Vitest across the entire unified codebase:
```bash
npm test
```

To run tests for a specific domain/area:
```bash
npm run test:shared   # Foundation types, schemas, errors, env (120 tests)
npm run test:core     # Business logic, crawler, linker (12 tests)
npm run test:api      # Express API, auth routes, kit scoping (24 tests)
npm run test:cli      # Batch CLI runner (4 tests)
```

### Code Quality & Linting
Runs ESLint across `apps/web`:
```bash
npm run lint
```
*Note: Next.js 14 linting is configured with pinned ESLint 8.57.1 and eslint-plugin-react 7.35.0 to prevent circular reference serialization errors.*

### Production Build
Compiles all backend TypeScript code and builds the Next.js production bundle:
```bash
npm run build
```
This executes:
1. `npm run build:api`: Compiles `src/` to `dist/` via root `tsc -p tsconfig.json`.
2. `npm run build:web`: Compiles and exports the Next.js production build in `apps/web/`.

---

## 3. Batch Evaluation Workflow (Appendix B CLI)

To execute offline headless batch evaluation on a suite of job description cases without starting the database or web server:

```bash
npm run evaluate -- --input path/to/cases.json --output path/to/kits.json
```

### Input Format (`cases.json`)
The input file must contain a JSON array matching `BatchInputCaseSchema`:
```json
[
  {
    "id": "case-01",
    "jd": "Senior Full-Stack Engineer with 5+ years React and Node.js experience...",
    "company_url": "https://example.com",
    "days": 5
  }
]
```

### Output Format (`kits.json`)
The output file is written strictly matching `BatchOutputSchema` (Appendix B):
```json
{
  "version": "1.0",
  "generated_at": "2026-09-09T00:00:00.000Z",
  "kits": [
    {
      "id": "case-01",
      "status": "ok",
      "kit": { /* Full Appendix A Kit Object */ },
      "error": null
    }
  ]
}
```

---

## 4. Troubleshooting & Operational FAQs

### Port In Use (EADDRINUSE)
- Ensure port 4000 (Express API) and port 3000 (Next.js web) are free before launching `npm run dev`.

### MongoDB In-Memory Test Server on Windows
- Vitest automatically manages an in-memory MongoDB instance via `mongodb-memory-server` during integration tests. No local MongoDB daemon installation is required to run `npm test`.

### Clean Clone Evaluation
- `npm run evaluate` executes directly through `tsx src/cli/evaluate.ts` without requiring any prior build step or database connection.
