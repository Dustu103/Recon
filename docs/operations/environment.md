# Environment Variables & Operational Configuration

This document specifies the environment variable contracts, auto-loading behavior, security requirements, and execution mode configurations for the Taro monorepo.

---

## Quick Setup for Developers

1. Copy the example configuration to the project root:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and configure your credentials:
   - Provide at least one LLM key (`GEMINI_API_KEY` or `GROQ_API_KEY`).
   - If running the Express server or Next.js web application, provide `MONGODB_URI` and `JWT_SECRET`.
3. For unit testing, `.env.test` is pre-configured and committed; no manual test setup is required.

---

## Execution Modes & Contracts

The application runtime distinguishes between two operational footprints to maintain zero-setup batch evaluation while enforcing strict security for production servers:

| Execution Mode | Validated By | Required Variables | Intended For |
|---|---|---|---|
| **Server Mode** | `validateServerEnv()` | `MONGODB_URI`, `JWT_SECRET`, and at least one LLM key (`GEMINI_API_KEY` \| `GROQ_API_KEY`) | `src/api` (Express server), `apps/web` |
| **Headless CLI Mode** | `validateCliEnv()` | At least one LLM key (`GEMINI_API_KEY` \| `GROQ_API_KEY`). `MONGODB_URI` and `JWT_SECRET` are optional. | `src/cli` (`npm run evaluate`) |
| **Test Mode** | `autoLoadEnv('test')` | Reads `.env.test` with safe mocked secrets (`GEMINI_API_KEY=test_key_placeholder`). | `npm test` across all suites |

---

## Variable Reference Table

| Variable | Type | Mode | Default | Constraints & Description |
|---|---|---|---|---|
| `GEMINI_API_KEY` | `string` | CLI / Server | `undefined` | Google AI Studio API key. At least one of `GEMINI_API_KEY` or `GROQ_API_KEY` must be set. Empty strings (`""`) automatically coerce to `undefined`. |
| `GROQ_API_KEY` | `string` | CLI / Server | `undefined` | Groq Cloud API key. At least one of `GEMINI_API_KEY` or `GROQ_API_KEY` must be set. Empty strings (`""`) automatically coerce to `undefined`. |
| `MONGODB_URI` | `string` | Server only | `undefined` | MongoDB connection string (e.g. `mongodb+srv://...` or `mongodb://localhost:27017/taro`). Required when booting the Express server (`src/api`). Optional for CLI evaluation. |
| `JWT_SECRET` | `string` | Server only | `undefined` | Secret key used to sign and verify authentication tokens. **Minimum 32 characters** required. Generate with `openssl rand -hex 32`. |
| `PORT` | `number \| string` | Server | `4000` | HTTP port on which the Express server listens. Coerced to integer between 1 and 65535. |
| `NODE_ENV` | `enum` | All | `development` | Runtime environment: `'development' \| 'test' \| 'production' \| 'evaluate'`. |
| `ALLOWED_ORIGINS` | `string \| string[]` | Server | `http://localhost:3000` | CORS permitted origins. Comma-separated string or array. Trims whitespace and strips empty entries. |
| `LLM_TPM_LIMIT` | `number \| string` | All | `100000` | Tokens per minute soft ceiling for LLM rate limiter. Positive integer. |
| `LLM_RPM_LIMIT` | `number \| string` | All | `15` | Requests per minute soft ceiling for LLM rate limiter. Positive integer. |
| `LLM_MAX_RETRIES` | `number \| string` | All | `4` | Maximum retries on 429 / 503 from upstream LLM before failing with `LLM_RATE_LIMITED`. Integer between 1 and 10. |

---

## Auto-Loading & Resolution Hierarchy

All environment resolution is handled transparently by zero-dependency utilities in `@taro/shared/env`:

1. **`autoLoadEnv(targetMode?: string)`**:
   - Inspects `NODE_ENV` (or the passed mode).
   - If `mode === 'test'`, searches for `.env.test`, `../../.env.test`, and `../../../.env.test`.
   - If `mode !== 'test'`, searches for `.env`, `../../.env`, and `../../../.env`.
   - The first existing file found is loaded.
2. **Non-Destructive Ingestion (`override = false`)**:
   - Variables already present in `process.env` (e.g. injected by Docker, CI/CD runners, or cloud hosts) take precedence and are never overwritten by `.env` file contents.
3. **Empty String Coercion**:
   - Variables declared as `KEY=` in `.env` are transformed by Zod into `undefined`. This prevents empty string values from bypassing presence checks and causing silent runtime failures.

---

## Provider Credential Setup

### 1. Google Gemini (Primary LLM)
- Obtain a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
- Paste into `.env`:
  ```bash
  GEMINI_API_KEY=AIzaSy...
  ```

### 2. Groq Llama-3.3-70B (Fallback LLM)
- Obtain a free API key at [Groq Console](https://console.groq.com/keys).
- Paste into `.env`:
  ```bash
  GROQ_API_KEY=gsk_...
  ```

### 3. MongoDB Atlas (Database)
- Provision a free M0 cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
- Generate a user and password, then copy the connection string into `.env`:
  ```bash
  MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/taro?retryWrites=true&w=majority
  ```

### 4. JWT Secret Key
- Generate a secure 32-byte hexadecimal string:
  ```bash
  openssl rand -hex 32
  ```
- Set the generated string in `.env`:
  ```bash
  JWT_SECRET=4f8b9e2... (must be >= 32 characters)
  ```

---

## Security Invariants

- `.env` must **never** be committed to source control. It is explicitly listed in `.gitignore`.
- `.env.example` contains only documentation and blank or placeholder values; it must never contain real production secrets.
- `.env.test` is committed to source control and must contain **only** safe offline mocks (`mongodb://localhost:27017/taro_test`, `test_jwt_secret...`, `test_key_placeholder`).
- Unit tests must be completely hermetic and must pass with zero internet connectivity and zero external services running.
