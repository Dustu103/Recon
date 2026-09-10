# Developer Runbook & Operations Guide

This runbook outlines standard development, testing, building, and evaluation workflows for the Taro monorepo.

> **Current test status**: 36 test files · 314 tests · 0 failures

---

## Prerequisites

- **Node.js**: v20.x LTS or v22.x LTS (tested on Node 20.x/22.x)
- **npm**: v10.x or higher
- **Git**
- **Docker Desktop** (optional but recommended for local MongoDB & Redis)

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

### Starting Local Services (with Docker)

For the best local dev experience, start Docker-managed MongoDB first:
```bash
docker run -d --name recon-mongodb -p 27017:27017 mongo:7
```

Then start both servers:
```bash
npm run dev
```
This runs:
- **API server** on `http://localhost:4000` (Express + MongoDB)
- **Web app** on `http://localhost:3000` (Next.js 14)

> **Redis**: The application includes an automatic in-memory Redis fallback. For production-equivalent local testing, run `docker run -d --name recon-redis -p 6379:6379 redis:7` to enable Docker Redis.

### Running the Test Suite
Runs Vitest across the entire unified codebase (no external services required — all tests are hermetic):
```bash
npm test
```

To run tests for a specific domain/area:
```bash
npm run test:shared   # Foundation types, schemas, errors, env
npm run test:core     # Core engine: crawler, LLM pipeline, deterministic logic (D4)
npm run test:api      # Express API, auth routes, kit scoping, OTP, password reset
npm run test:cli      # Batch CLI runner (Appendix B)
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
- Find and kill occupying processes: `netstat -ano | findstr :4000` then `taskkill /PID <pid> /F`.

### MongoDB In-Memory Test Server on Windows
- Vitest automatically manages an in-memory MongoDB instance via `mongodb-memory-server` during integration tests. No local MongoDB daemon installation is required to run `npm test`.
- When Docker MongoDB is running on `localhost:27017`, integration tests will use it directly (faster, ~275ms vs ~2100ms cold-start).

### Redis Fallback
- If Docker Redis is not running, the application automatically falls back to an in-memory Redis store (`[Redis] Docker Redis unreachable, using in-memory store.`). This is fully functional for development and testing.
- To enable Docker Redis: `docker run -d --name recon-redis -p 6379:6379 redis:7`

### Docker Container Management
```bash
# Check running containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Start stopped MongoDB container
docker start recon-mongodb

# View MongoDB logs
docker logs recon-mongodb
```

### Clean Clone Evaluation
- `npm run evaluate` executes directly through `tsx src/cli/evaluate.ts` without requiring any prior build step or database connection.
