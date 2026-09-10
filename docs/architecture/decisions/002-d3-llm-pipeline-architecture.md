# ADR 002: Domain 3 (D3) AI Generation Engine & LLM Pipeline Architecture

- **Status**: Accepted
- **Date**: 2026-09-10
- **Context**: Domain 3 (AI Interview Kit Generator) & Sections 3, 8, 9, 10, 11 of Assessment `FS-AI-INTERVIEW-01`
- **Deciders**: Engineering Team

---

## 1. Context & Problem Statement

In `FS-AI-INTERVIEW-01`, Domain 3 transforms unstructured input (raw Job Description text + Domain 2 crawled company intelligence) into high-fidelity, structured prep kit content conforming to **Appendix A**:
1. `role`: Job title, seniority level, responsibilities, and discrete requirements marked `must`/`nice` and `technical`/`behavioural`/`domain`.
2. `company_brief`: Grounded synthesis of what the company does, their business model, and verified source URLs.
3. `questions`: Targeted interview questions mapped to requirements, including prompts, 5-point evaluation answer outlines, and integer difficulty `1` to `3`.
4. `flashcards`: Rapid-revision cards with concept front and answer back mapped to requirement IDs.

### Primary Architectural Constraints:
- **Constraint A (Assessment Spec Section 3)**: Single-shot generation is strictly prohibited: *"a requirement like five years of React leads to technical questions while mentoring junior engineers leads to behavioural ones; the two should not come from the same call with the same instructions."*
- **Constraint B (Free-Tier Rate Limiting & Throughput)**: Free-tier LLM providers enforce tight TPM/RPM caps (Groq: 30 RPM, 6,000–14,400 TPM; Gemini: 15 RPM). Section 9 mandates completing 5 evaluation cases within 15 minutes.
- **Constraint C (Security & Prompt Injection)**: Crawled HTML and pasted JDs are untrusted external data. The pipeline must be immune to instruction hijack.
- **Constraint D (Automated Evaluation & Hermetic Tests)**: Automated grading (`npm run evaluate`) and unit tests must execute with 100% hermetic offline pass rates without depending on third-party network access.

---

## 2. Considered Options

### Decision Fork 1: Pipeline Macro-Architecture

#### Option A: Single Massive Mega-Prompt
Send the entire JD and crawled company pages to the LLM in one single prompt asking for the complete Appendix A JSON envelope.
- **Pros**: Only 1 LLM request per kit.
- **Cons (REJECTED — Direct Violation of Assessment Brief)**:
  - Section 3 explicitly forbids this: *"the two should not come from the same call with the same instructions."*
  - Context exhaustion and JSON truncation: Generating the entire kit at once exceeds output token limits, resulting in truncated JSON.
  - Zero granular retry: If question generation fails, the entire extraction and brief synthesis must be redone.
  - **Verdict**: **REJECTED**.

#### Option B: Unbounded Parallel Multi-Prompting
Fire 5–7 simultaneous LLM calls in parallel using `Promise.all`:
- Call 1: Extract requirements
- Call 2: Synthesize brief
- Call 3: Technical questions
- Call 4: Behavioural questions
- Call 5: Flashcards
- **Pros**: Lower wall-clock latency if provider has infinite concurrency.
- **Cons (REJECTED — Guaranteed Free-Tier 429 Failure & Circular Dependencies)**:
  - With Groq's 6,000 TPM limit, firing 5 concurrent requests consuming ~1,200 tokens each immediately exhausts the minute budget within seconds.
  - Circular data dependencies: Question calls cannot generate valid `requirement_ids` before extraction completes and assigns monotonic IDs (`r1..rn`).
  - **Verdict**: **REJECTED**.

#### Option C: Staged Dependency Pipeline with Join Gate (Selected)
Structure the pipeline into dependency-ordered phases:
- **Phase 1 (Ingestion Fork)**: Bounded 2-branch concurrency (`extractRequirements` and `synthesizeCompanyBrief` run independently as they share zero data dependencies).
- **Join Gate**: Stage 3 waits for both Phase 1 branches to resolve before generating questions.
- **Phase 2 (Questions)**: Conditional, category-isolated calls for `technical`, `behavioural`, `system-design`, and `company-fit`.
- **Phase 3 (Flashcards)**: Synthesizes revision deck from resolved requirements and questions.
- **Phase 4 (Validation Gate)**: Validates intermediate envelope before handing off to Domain 4.
- **Verdict**: **ACCEPTED**.

---

### Decision Fork 2: Stage 3 Question Generation Granularity

#### Option D1: Per-Requirement LLM Invocations (1 Call per Requirement)
Loop over every extracted requirement and trigger an independent LLM call:
```typescript
for (const req of requirements) {
  await generateQuestionForSingleRequirement(req);
}
```
- **Pros**: Narrow prompt context per call; maximum theoretical focus.
- **Cons (REJECTED — Catastrophic Rate Limit Failure)**:
  - A standard JD produces 8–14 requirements. With extraction, brief, and flashcards, a single kit would require **11–17 sequential LLM calls**.
  - At Groq's 30 RPM limit or Gemini's 15 RPM limit, processing 5 batch cases would demand **55–85 LLM requests**, triggering severe HTTP 429 rate-limit lockouts and blowing well past the 15-minute evaluation ceiling in Section 9.
  - High fixed token overhead: Re-transmitting system instructions and role context 14 times wastes thousands of prompt tokens.
  - **Verdict**: **REJECTED**.

#### Option D2: Per-Category Batched Invocations (Selected)
Group requirements by category and trigger **at most one call per active category**, passing all requirements of that kind as a structured array:
```typescript
// Call 3a: Batches all technical requirements into 1 call
await generateTechnicalQuestions(technicalRequirements, brief);
// Call 3b: Batches all behavioural requirements into 1 call
await generateBehaviouralQuestions(behaviouralRequirements, brief);
```
- **Pros**:
  - **Bounded Call Count**: At most 4 calls for Stage 3 (and typically only 1–2 calls due to conditional firing).
  - **Total Pipeline Calls Per Kit**: Strictly bounded to **4–7 calls total in Pass 1**:
    $$\text{Total Calls} = 1\text{ (extract)} + 1\text{ (brief)} + [1\text{ to }4\text{ (conditional categories)}] + 1\text{ (flashcards)}$$
  - **Safe Token Math**: Total tokens per kit = ~3,500–5,800 tokens, comfortably within Groq's 6,000–14,400 TPM limit.
  - Satisfies the assessment requirement for category instruction isolation while maintaining free-tier feasibility.
- **Verdict**: **ACCEPTED**.

---

## 3. Detailed Architectural Specifications

### 3.1 Pipeline Execution Topology & Join Gate

The pipeline executes through a staged-dependency graph with an explicit join gate:

```
[Candidate Pastes JD + Enters Company URL]
                  │
                  ▼
         [Domain 2: Crawler]
                  │
                  ▼
    ┌─────────────────────────────┐
    │  PHASE 1: INGESTION FORK    │
    │  (Bounded 2-Way Concurrency)│
    └─────────────┬───────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌──────────────────┐ ┌───────────────────────────────────┐
│ Stage 1: Extract │ │ Stage 2: Company Brief            │
│ - Raw JD input   │ │ - Crawled Top-K pages input       │
│ - Monotonic r#   │ │ - Context bounded (max 16k chars) │
│ - Must vs. Nice  │ │ - Discovered sources listed       │
│ - Tech/Behav/Dom │ │ - Honest fallback if blocked      │
└────────┬─────────┘ └──────────────┬────────────────────┘
         │                          │
         └────────────┬─────────────┘
                      │
                      ▼
         ═════════════════════════════
         STAGE 3 JOIN GATE (BARRIER)
         Requires: Requirements + Brief
         ═════════════════════════════
                      │
                      ▼
    ┌─────────────────────────────┐
    │ PHASE 2: TARGETED QUESTIONS │
    │ (Conditional Firing Rules)  │
    └─────────────┬───────────────┘
                  │
  ├─ Call 3a: Technical      ──► Fires ONLY IF technical requirements exist
  ├─ Call 3b: Behavioural    ──► Fires ONLY IF behavioural requirements exist
  ├─ Call 3c: System Design  ──► Fires ONLY IF System Design Rule triggers
  └─ Call 3d: Company Fit    ──► Fires ONLY IF domain reqs OR culture discovered
                  │
                  ▼
    ┌─────────────────────────────┐
    │   PHASE 3: REVISION DECK    │
    │ Stage 4: Flashcard Gen      │
    │ - Monotonic f1..fn          │
    │ - Maps to requirement IDs   │
    │ - Brief bulleted backs      │
    └─────────────┬───────────────┘
                  │
                  ▼
         ═════════════════════════════
         PRE-D4 HANDOFF VALIDATION
         Validates DraftKitSchema:
         - Appendix A type contracts
         - Referential integrity check
         - Difficulty 1..3 integer check
         ═════════════════════════════
                  │
                  ▼
[Ready for Domain 4: Coverage Checker & Scheduler]
```

---

### 3.2 Stage 3 Conditional Firing Rules & System Design Trigger

Category calls in Stage 3 **never fire blindly**. Each call requires underlying ground truth:

1. **Call 3a (Technical)**:
   - **Condition**: `requirements.some(r => r.kind === 'technical')`.
   - **If False**: Omitted.
2. **Call 3b (Behavioural)**:
   - **Condition**: `requirements.some(r => r.kind === 'behavioural')`.
   - **If False**: **Skipped entirely**. Prevents the model from fabricating generic HR questions when the JD had zero behavioural requirements.
3. **Call 3c (System Design — Explicit Heuristic Rule)**:
   - **Condition**:
     $$\text{Trigger} = \left(\text{D2.4 discovered a System Design interview round}\right) \lor \left(\text{isSenior} \land \text{matchesTrackRegex}(\text{role.title})\right)$$
   - **Where**:
     - `isSenior` is derived from `role.seniority` $\in \{\text{'Senior'}, \text{'Lead'}, \text{'Staff'}, \text{'Principal'}\}$.
     - `matchesTrackRegex(title)` evaluates against:
       ```typescript
       const SYSTEM_DESIGN_TRACK_REGEX = /\b(backend|infra|infrastructure|platform|distributed|systems|cloud|data engineer|sre|devops|architect)\b/i;
       ```
     - For ambiguous titles like "Full-Stack Engineer": triggers only if extracted technical requirements contain 2+ distributed/infrastructure/database skills (`/(database|sql|nosql|cache|redis|kafka|queue|scale|microservice|concurrency|throughput)/i`).
   - **If False**: **Skipped entirely**. Junior or frontend roles without explicit system design interview signals do not receive system design questions.
4. **Call 3d (Company Fit)**:
   - **Condition**: `requirements.some(r => r.kind === 'domain')` $\lor$ `D2 discovered culture/values page`.
   - **If False**: **Skipped entirely**. Prevents hallucinating company cultural pillars when none were discovered.

*Impact on Thin JDs*: A 2-line stub produces only 1–2 technical requirements. Calls 3b, 3c, and 3d are **skipped**, executing only **Call 3a**. This bounds Stage 3 to **1 call**, saving tokens and eliminating hallucinations.

---

### 3.3 Stage 2 Token Budget Bounding (Top-K Link-Ranker Page Selection)

To maximize the return on Domain 2's depth-2 crawl without blowing model context windows:
- **Hard Cap**: Stage 2 prompt context is strictly capped at **4,000 tokens (~16,000 characters)** total.
- **Top-K Selection & Budget Allocation**:
  1. `rootPage.cleanedText`: Allocated up to **4,000 characters** (core company overview).
  2. `discoveredPages`: Filtered and sorted descending by **D2 link-ranker score** (`rankLinks`). Top-K pages (typically 2–3 pages) share an aggregate budget of up to **8,000 characters** (e.g. careers page: 3.5k chars; engineering blog: 3k chars; culture handbook: 1.5k chars).
  3. `discussionNotes` (from D2.4): Allocated up to **4,000 characters**.
  4. Any excess text beyond these per-section thresholds is deterministically truncated with `[...truncated for context window...]`.
- **Empty Crawl Handling**: If crawler returned 0 pages (404, timeout, robots block), Stage 2 produces:
  ```json
  {
    "summary": "Company website could not be retrieved from public sources.",
    "what_they_do": "Unknown from public web crawl.",
    "sources": []
  }
  ```

---

### 3.4 Second-Pass (D4.2) Direct Generator Reuse

To avoid parallel implementations, `generateQuestionsForRequirements()` is exported as a re-entrant, pure function:
```typescript
export async function generateQuestionsForRequirements(
  targetRequirements: Requirement[],
  brief: CompanyBrief,
  options: {
    nextQuestionIndex: number;
    categoryOverride?: QuestionCategory;
  }
): Promise<Question[]>
```
- In **Stage 3**, it processes all initial requirements.
- In **Domain 4.2 (Second-Pass Coverage Loop)**, when the coverage checker detects uncovered must-haves, it calls this **exact same function** with `targetRequirements = uncoveredMustRequirements` and `nextQuestionIndex = kit.nextQuestionIndex`. Zero duplicate prompt templates or logic.

---

### 3.5 Referential-Integrity Failure Handling Protocol (Drop Orphan, No False Coverage)

When an LLM hallucinates an invalid requirement ID (e.g. `r99` or empty array):
1. **Sanitization Phase**: Post-generation, every `question.requirement_ids` is filtered against the `Set<string>` of valid requirement IDs from Stage 1:
   ```typescript
   q.requirement_ids = q.requirement_ids.filter(id => validIdSet.has(id));
   ```
2. **Orphan Drop Phase (Anti-False-Coverage Guarantee)**: If filtering leaves `q.requirement_ids.length === 0`:
   - The question is **dropped outright**. It is **never** arbitrarily reattached to an unlinked requirement, which would manufacture false coverage and deceive the coverage checker.
   - A degradation warning is recorded in `kit.degradations`: `["Dropped orphan question with invalid requirement mapping: q#"]`.
3. **Deterministic Coverage Healing**: Domain 4.1's coverage checker evaluates the remaining genuine questions. If dropping the invalid question leaves a must-have requirement uncovered, Domain 4.2's Second Pass fires and generates a real, properly attributed replacement.

---

### 3.6 Category-Level Failure Isolation

If a single Stage 3 category call fails (e.g. Call 3b Behavioural times out or exhausts retries):
- **Isolation Policy**: The failure does **NOT** abort the kit.
- **Behavior**:
  - The successfully generated categories (e.g. Technical) are preserved.
  - The failed category is recorded in `kit.degradations`: `["Failed to generate behavioural questions: LLM_RATE_LIMITED"]`.
  - The pipeline advances to Stage 4 (Flashcards) and Domain 4 (Coverage).
  - Uncovered behavioural requirements are honestly recorded in `coverage.uncovered_requirement_ids`.
  - The kit completes and is emitted with `status: 'ok'` in Appendix B batch output.

---

### 3.7 Resilient LLM Client Engine Architecture & Provider Failover

All LLM operations route through `src/core/llm/client.ts`:

```
                    [Pipeline Stage Request]
                               │
                               ▼
           [Execution Mode: NODE_ENV === 'test' or --mock?]
           ├─ YES ──► Deterministic MockLlmProvider (Hermetic Offline)
           └─ NO  ──► Live Production Provider Chain:
                               │
                               ▼
          ┌──────────────────────────────────────────┐
          │ 1. Token-Bucket Queue (TPM / RPM)       │
          │ 2. Prompt Guard (<untrusted_content>)    │
          └────────────────────┬─────────────────────┘
                               │
                               ▼
                [PRIMARY: GeminiProvider]
               (Model: gemini-3.6-flash)
                               │
              On 429/503 exhausted after 4 retries
                               ▼
               [FALLBACK: GroqProvider]
            (Model: openai/gpt-oss-120b)
                               │
                     If Groq ALSO fails:
                               ▼
             Throw TaroError(LLM_PROVIDER_ERROR)
             (NEVER silently substitute Mock in prod!)
```

#### Strict Rule: Mock Provider is Orthogonal, Not a Production Fallback
`MockLlmProvider` is active **only** when `NODE_ENV === 'test'` or an explicit `--mock` flag is provided. If both Gemini and Groq fail in production, the system raises an explicit `LLM_PROVIDER_ERROR` or isolates that category per Section 3.6. It **never** silently serves mock fixtures in production, preventing synthetic data fabrication.

---

## 4. Key Invariants & Guarantees

1. **Category Isolation Invariant**: Technical questions and behavioural questions are produced by distinct prompt templates and separate network invocations.
2. **Referential Integrity & Drop-Orphan Invariant**: Every `question.requirement_ids` and `flashcard.requirement_ids` references an existing `role.requirements[].id`. Orphan questions are dropped outright, never arbitrarily re-linked.
3. **Monotonic Continuation Invariant**: ID counters (`r1..rn`, `q1..qn`, `f1..fn`) strictly increment and never derive from array lengths, preventing collisions across deletions and second passes.
4. **Honest Degradation & Context Bounding Invariant**: A 2-line JD yields only explicitly stated requirements; unreachable companies yield honest fallbacks; Stage 2 crawl context is strictly bounded to $\le 16,000$ characters via Top-K ranker selection.
5. **Conditional Category Firing Invariant**: Category calls in Stage 3 only fire if there is underlying ground truth (Section 3.2). Unneeded calls are skipped, conserving tokens and preventing hallucinations.
6. **Category Failure Isolation Invariant**: A failure in one question category call degrades that category honestly without aborting the entire kit.
7. **Hermetic Test Portability Invariant**: All tests and Section 9 evaluations execute offline against `MockLlmProvider` without requiring external network access or live API credits.
