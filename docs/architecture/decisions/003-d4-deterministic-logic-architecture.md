# ADR-003: Domain 4 — Deterministic Logic Architecture

**Status**: Accepted  
**Date**: 2026-09-11  
**Deciders**: Engineering Team  
**Supersedes**: Inline placeholder implementations in `kit-orchestrator.ts` (D3)

---

## Context & Problem Statement

After the LLM pipeline (D3) generates an initial question bank, three deterministic post-processing steps are required before a kit can be delivered:

1. **Coverage validation**: Were all must-have requirements covered by at least one question?
2. **Gap repair**: If must-have gaps exist, can targeted LLM generation fix them within a bounded number of calls?
3. **Study scheduling**: How should questions be distributed across the user's preparation days to maximize learning effectiveness?

The original D3 orchestrator contained placeholder implementations for these functions (uniform round-robin scheduling, single-pass coverage with no gap repair). This ADR documents the decisions made when replacing them with the deterministic D4 subsystem.

---

## Decisions

### D4.1: Coverage Checker Design

**Decision**: Implement granular coverage analysis that distinguishes Must-Have from Nice-to-Have requirement gaps rather than treating all uncovered requirements equally.

**Rationale**: The downstream gap-fill decision (D4.2) must be triggered **only** by must-have gaps, not nice-to-have gaps. Treating all gaps equally would cause unnecessary second LLM calls when only optional requirements are uncovered, increasing cost and latency without improving interview readiness.

**Interface**:
```ts
checkCoverage(requirements: Requirement[], questions: Question[]): CoverageResult
```
Returns: `{ uncoveredMustIds, uncoveredNiceIds, hasMustGaps, isFullyCovered, coveragePercentage, ... }`

---

### D4.2: Second-Pass Gap Fill — Explicit Conditional (Not a Loop)

**Decision**: Implement the gap fill as a **single explicit conditional**, not a while-loop. Maximum passes = 2.

**Rationale**: An unbounded loop risks runaway LLM spend and unpredictable latency. The design decision is conservative — if two passes cannot achieve full must-have coverage (e.g. LLM refuses to generate questions for an unusual requirement), the kit still ships with the best available coverage recorded in the Appendix A `Coverage` object. Users can inspect `uncovered_requirement_ids` to understand residual gaps.

**Execution Logic**:
1. Evaluate `hasMustGaps` after initial question generation.
2. If `false` → return immediately with `passes: 1`, 0 extra LLM calls.
3. If `true` → filter requirements to only `uncoveredMustIds`, invoke `generateQuestionsForRequirements` once, assign monotonically-increasing IDs starting at `nextQuestionIndex`.
4. Always exit after step 3 regardless of remaining gaps → `passes: 2`.

---

### D4.3: Study Scheduler Sort Key

**Decision**: Adopt the lexicographic triple `(difficulty DESC, isMust DESC, id ASC)` as the canonical sort key for question ordering before partitioning into study days.

**The Rejected Alternative — Why `(isMust DESC, difficulty DESC)` Was Disqualified**:

This alternative was explicitly evaluated against the following counterexample:
- 3 × Difficulty-1 Must-haves (`m1`, `m2`, `m3`)
- 3 × Difficulty-3 Nice-to-haves (`n1`, `n2`, `n3`)
- Split across 2 days

Under `(isMust DESC, difficulty DESC)`:
```
Day 1: [m1 (diff 1), m2 (diff 1), m3 (diff 1)] → avgDifficulty = 1.0
Day 2: [n1 (diff 3), n2 (diff 3), n3 (diff 3)] → avgDifficulty = 3.0
```
Result: `day[0].avgDifficulty (1.0) < day[1].avgDifficulty (3.0)` — **front-loading invariant violated**.

Under `(difficulty DESC, isMust DESC, id ASC)`:
```
Day 1: [n1 (diff 3), n2 (diff 3), n3 (diff 3)] → avgDifficulty = 3.0
Day 2: [m1 (diff 1), m2 (diff 1), m3 (diff 1)] → avgDifficulty = 1.0
```
Result: `day[0].avgDifficulty (3.0) ≥ day[1].avgDifficulty (1.0)` ✅

**Front-Loading Invariant**: `day[0].avgDifficulty ≥ day[N-1].avgDifficulty`

This is our operationalization of the brief's requirement that *"harder and higher-priority material lands earlier, not the night before."* It is a deliberate engineering judgment — when a hard nice-to-have conflicts with an easy must-have, difficulty takes precedence so that cognitively demanding content receives maximum incubation time.

**Tie-Breaking in Sort Key**:
- `isMust DESC` as secondary key places must-have questions earlier within each difficulty tier, without disturbing cross-tier difficulty ordering.
- `id ASC` as tertiary key (`q1` < `q2` < ...) provides deterministic, reproducible output regardless of the order questions arrive from LLM batches.

---

### D4.3: Scheduling Cases & Remainder Distribution

| Case | Condition | Strategy |
| :--- | :--- | :--- |
| **A (Degenerate)** | `Q = 0` | All days generated with `question_ids: []`, `minutes: 0` (strict non-negative integer, no `NaN`). |
| **B (Sparse)** | `0 < Q < D` | Days `1…Q` get 1 question each (difficulty-sorted). Days `Q+1…D` backfill spaced repetition from the sorted pool cyclically. |
| **C (Normal)** | `Q ≥ D` | Contiguous block slicing. Base = `⌊Q/D⌋`. First `R = Q mod D` days get `base + 1` questions (front-loaded remainder). |

**Sparse-Case Caveat** (see also [`docs/deterministic.md`](file:///d:/Prorgram/Project/taro/docs/deterministic.md)):
> The sparse-review backfill intentionally revisits earlier (harder) material rather than monotonically decreasing. The `day[0].avgDifficulty ≥ day[N-1].avgDifficulty` invariant holds for first/last day comparison only, not day-over-day across the full sparse schedule.

---

### D4.3: Category Focus Tie-Breaking

When multiple question categories tie on count within a day's block, the dominant category is resolved via explicit precedence:
```
system-design > technical > behavioural > company-fit
```

**Rationale**: System design and technical depth have the highest study-time leverage for engineering roles (and the longest preparation lead time), making them the natural winner in a tie.

---

## Consequences

### Positive
- **Verifiable correctness**: The front-loading invariant is tested in `scheduler.test.ts` against multiple day counts (2, 3, 5, 7) and the explicit counterexample, providing ongoing regression protection.
- **Bounded cost**: Second-pass gap fill is strictly capped at 1 extra LLM batch, preventing runaway API spend.
- **Schema compliance**: All three schedule cases (`Q=0`, `Q<D`, `Q≥D`) are validated via `ScheduleSchema.parse()` at the end of `buildSchedule`, turning runtime errors into hard failures that surface immediately in tests.
- **Determinism**: Given the same question bank and requirement set, `buildSchedule` always produces byte-identical output (no `Math.random()`, no timestamp-based ordering).

### Trade-Offs
- When all must-have requirements are covered in pass 1, nice-to-have gaps remain permanently unfilled (no third pass). This is the designed behavior: better to deliver a timely kit with partial nice-to-have coverage than to over-invest in optional content.
- The difficulty-first sort means an extremely important but easy must-have (e.g. required compliance knowledge with difficulty=1) will land later in the schedule than a hard nice-to-have (difficulty=3). Teams that disagree with this operationalization can swap the sort key — the invariant proof and tests document the expected behavior for any chosen key.

---

## Related Documents
- [`src/core/deterministic/`](file:///d:/Prorgram/Project/taro/src/core/deterministic/)
- [`docs/deterministic.md`](file:///d:/Prorgram/Project/taro/docs/deterministic.md) — detailed proof and framing
- [`src/core/deterministic/__tests__/unit/scheduler.test.ts`](file:///d:/Prorgram/Project/taro/src/core/deterministic/__tests__/unit/scheduler.test.ts)
