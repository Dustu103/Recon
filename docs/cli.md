# Domain 8: Batch Evaluation CLI (`npm run evaluate`)

## Overview

Domain 8 (D8) implements the automated **Batch Evaluation CLI** specified in Section 9 of the assessment. It provides a headless CLI runner that executes the identical core generation pipeline used by the web application (`generateKit` from `@taro/core`), enforcing zero parallel implementations, full per-case fault isolation, localhost test server compatibility, and strict compliance with the **Appendix B** JSON contract.

---

## 1. Command Syntax & Usage

The CLI is invoked via the root `package.json` script:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json> [--mock]
```

### Argument Reference

| Flag | Alias | Description | Required | Default |
| :--- | :---: | :--- | :---: | :--- |
| `--input` | `-i` | Path to the input JSON file containing an array of test cases. | **Yes** | — |
| `--output` | `-o` | Destination path where the Appendix B JSON result file will be written. Parent directories are created automatically. | **Yes** | — |
| `--mock` | `-m` | Enables the hermetic offline mock provider. Generates realistic, schema-valid Appendix A kits without consuming live LLM API credits. | No | `false` |

### Examples

```bash
# Production live evaluation against real companies / LLM APIs
npm run evaluate -- --input ./cases.json --output ./results.json

# Offline autograder / CI verification run using mock provider
npm run evaluate -- --input ./tests/cli/fixtures/test-cases.json --output ./tmp/output.json --mock
```

---

## 2. Installation from a Clean Clone

To run the evaluation CLI on a fresh environment:

```bash
# 1. Clone repository
git clone https://github.com/Dustu103/Recon.git
cd Recon

# 2. Install dependencies
npm install

# 3. Configure environment variables (optional for mock mode; required for live LLM generation)
cp .env.example .env
# Edit .env and supply GEMINI_API_KEY or GROQ_API_KEY

# 4. Run automated test suite
npm test

# 5. Run evaluation CLI
npm run evaluate -- --input tests/cli/fixtures/test-cases.json --output tmp/kits.json --mock
```

---

## 3. Architecture Invariant: Zero Parallel Implementation

To satisfy the core assessment requirement, the evaluation CLI does **not** reimplement prompt logic, scraping, or scheduling:

```
src/cli/evaluate.ts
      │
      ▼ (direct import)
src/core/index.ts (generateKit)
      ├── D2: crawlCompany (SSRF-shielded crawler, Cheerio cleaner)
      ├── D3: extractRequirements & synthesizeCompanyBrief (LLM Step 1 & 2)
      ├── D3: generateQuestionsForRequirements (Per-category LLM calls)
      ├── D4: executeSecondPassGapFill (Deterministic self-healing loop)
      ├── D3: generateFlashcards (Rapid revision deck)
      └── D4: buildSchedule (Contiguous block difficulty-first allocator)
```

Both the **Next.js Web App** and the **CLI Runner** call the exact same `generateKit()` function, guaranteeing 100% behavioral parity.

---

## 4. Batch Fault Isolation & Never-Abort Guarantee

The CLI guarantees that the failure of any single case **never aborts the overall batch execution**:

1. **Input Validation Isolation**: Each case in the input array is parsed against `BatchInputCaseSchema`. If a case has an empty `jd`, invalid `company_url`, or out-of-range `days`, it is immediately recorded as `status: "failed"` with `error.code: "INVALID_INPUT"` while subsequent cases continue processing.
2. **Generation Pipeline Isolation**: Each valid case is wrapped in an isolated `try / catch` block. If an individual case encounters an unreachable host or an LLM provider error, the specific error code is recorded, and the runner immediately proceeds to the next case.
3. **Appendix B Strict Validation**: The complete output payload is parsed against `BatchOutputSchema` before writing to disk, ensuring 100% autograder compatibility.

---

## 5. Appendix B Contract Specification

The output file written to `--output` strictly adheres to Appendix B:

```json
{
  "version": "1.0",
  "generated_at": "2026-09-12T00:00:00.000Z",
  "kits": [
    {
      "id": "case-01",
      "status": "ok",
      "kit": {
        "source": { ... },
        "company_brief": { ... },
        "role": { ... },
        "requirements": [ ... ],
        "questions": [ ... ],
        "flashcards": [ ... ],
        "schedule": { ... },
        "coverage": { ... }
      },
      "error": null
    },
    {
      "id": "case-02",
      "status": "failed",
      "kit": null,
      "error": {
        "code": "INVALID_INPUT",
        "message": "Input validation failed: [days] Number must be less than or equal to 60"
      }
    }
  ]
}
```

### Error Code Mapping

All failure states return one of the canonical frozen error codes:

| Error Code | Trigger Condition |
| :--- | :--- |
| `INVALID_INPUT` | Malformed case object, empty `jd`, invalid URL scheme, or `days` not in range 1–60. |
| `COMPANY_UNREACHABLE` | Target company URL fails DNS resolution or returns TCP connection error in production. |
| `SSRF_BLOCKED` | Target company URL resolves to a forbidden private, loopback, or cloud metadata IP. |
| `ROBOTS_DISALLOWED` | Company robots.txt prohibits automated crawler access. |
| `LLM_RATE_LIMITED` | Exhaustion of LLM API quota after 4 exponential backoff retry attempts. |
| `CASE_FAILED` | Unhandled pipeline exception during generation. |

---

## 6. Localhost & Section 9 Autograder Compatibility

Section 9 benchmark cases often point to local mock HTTP servers (e.g. `http://localhost:8099/acme/`).

To prevent the SSRF shield from blocking evaluation test fixtures:
- The CLI automatically initializes `process.env.TARO_CLI_MODE = 'evaluate'`.
- `url-validator.ts` and `research-orchestrator.ts` detect `TARO_CLI_MODE === 'evaluate'` and permit loopback/localhost connections while keeping cloud metadata IP protections active.

---

## 7. 15-Minute Throughput & Rate-Limit Arithmetic

Section 9 requires evaluating a batch of **5 cases in under 15 minutes**:

1. **Call Budget per Kit**:
   - Step 1 (Extract): 1 call
   - Step 2 (Brief): 1 call
   - Step 3 (Questions): 2–3 category-separated calls
   - Step 4 (Flashcards): 1 call
   - *Total*: ~5–6 LLM calls per kit.
2. **Batch Budget (5 cases)**:
   - $5 \times 6 = 30$ total LLM calls.
3. **Throughput Analysis**:
   - Under free-tier rate limits (15 RPM), serial execution processes a kit in ~60–90 seconds.
   - 5 cases complete in **~5.0 to 7.5 minutes**, which is well under the 15-minute window (50% margin of safety).
   - Under `--mock` mode, 5 cases complete in **< 1.5 seconds**.
