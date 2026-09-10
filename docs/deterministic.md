# Domain 4: Deterministic Logic Architecture

This document describes the design, formal mathematical guarantees, trade-offs, and implementation details of Taro's deterministic logic engine (`src/core/deterministic/`).

The deterministic engine is responsible for three core post-generation functions:
1. **D4.1 Coverage Checker (`coverage-checker.ts`)**: Evaluates whether all discrete requirements extracted from the job description are covered by generated questions, tracking must-have vs. nice-to-have requirements.
2. **D4.2 Second-Pass Gap Fill (`second-pass.ts`)**: A targeted conditional repair pass that generates additional questions specifically for any uncovered must-have requirements, strictly capped at two passes.
3. **D4.3 Contiguous Block Study Scheduler (`scheduler.ts`)**: Partitions the question bank across the user's available preparation timeline ($1 \le \text{days} \le 60$) using a lexicographically sorted, contiguous-block assignment algorithm.

---

## 1. Study Schedule Front-Loading: Rationale & Framing

### 1.1 Origin & Framing of the Invariant

The project brief specifies that:
> *"harder and higher-priority material lands earlier, not the night before."*

The brief's prose is intentionally open, stating elsewhere: *"where this brief does not prescribe an exact implementation, choose an approach you can defend."*

To operationalize this requirement into a rigorous, verifiable automated test, we established the mathematical condition:
$$\text{day}[0].\text{avgDifficulty} \ge \text{day}[N-1].\text{avgDifficulty}$$

**Important Framing:**
This inequality is **our chosen operationalization of the brief's front-loading requirement**, not literal text or an externally-graded point requirement from the brief. Treating it as a self-chosen engineering commitment ensures that we document the trade-offs inherent in this formalization rather than presenting it as an absolute decree.

### 1.2 The Deliberate Priority Conflict Trade-Off

The brief contains a two-clause instruction: *"harder **and** higher-priority material lands earlier."* When both criteria align (e.g. a difficult must-have vs. an easy nice-to-have), the scheduling order is unambiguous. However, when an easy must-have (Difficulty 1, Priority Must) conflicts with a hard nice-to-have (Difficulty 3, Priority Nice), an engineering judgment call must be made: which criterion dominates?

In our engine, **difficulty dominates priority**:
$$\text{SortKey} = (\text{difficulty DESC},\; \text{isMust DESC},\; \text{id ASC})$$

This means a Difficulty 3 Nice-to-Have will be scheduled earlier than a Difficulty 1 Must-Have.

**Why this is defensible:**
High-difficulty concepts (e.g., distributed consensus, architectural trade-offs, low-level concurrency) require the longest cognitive incubation and repeated mental consolidation. Landing these topics early gives candidates maximum runway to digest complex material.

**The competing trade-off:**
A reasonable alternative reading could argue that a stressed candidate with limited preparation time (e.g., 2 days remaining) would derive more immediate interview security by mastering the easy must-haves before tackling hard optional skills. We document this as a deliberate engineering choice among competing reasonable interpretations, not something forced by the math. The math guarantees internal consistency with the chosen formalization, not that the formalization is the only valid reading of the brief's prose.

---

## 2. Lexicographic Sort Key: Why `(difficulty DESC, isMust DESC, id ASC)` Holds

### 2.1 The Broken Alternative: `(isMust DESC, difficulty DESC)`

An alternative proposal was considered: sorting by `(isMust DESC, difficulty DESC)` to prioritize all must-haves before nice-to-haves. However, this ordering breaks the very front-loading guarantee it sought to protect.

**The Counterexample:**
Consider a candidate preparing over 2 days with 6 questions:
- Three Difficulty 1 Must-haves ($m_1, m_2, m_3$)
- Three Difficulty 3 Nice-to-haves ($n_1, n_2, n_3$)

Under `(isMust DESC, difficulty DESC)`, the sorted array is:
$$[m_1 (\text{diff } 1), m_2 (\text{diff } 1), m_3 (\text{diff } 1), n_1 (\text{diff } 3), n_2 (\text{diff } 3), n_3 (\text{diff } 3)]$$

Partitioning into 2 contiguous 3-question blocks yields:
- **Day 1**: $[m_1, m_2, m_3] \implies \text{avgDifficulty} = 1.0$
- **Day 2**: $[n_1, n_2, n_3] \implies \text{avgDifficulty} = 3.0$

Here, $\text{day}[0].\text{avgDifficulty} (1.0) < \text{day}[1].\text{avgDifficulty} (3.0)$. The candidate is given elementary material on Day 1 and slammed with maximum-difficulty material on Day 2—the exact inversion the invariant exists to prevent.

### 2.2 Proof of Correctness for `(difficulty DESC, isMust DESC, id ASC)`

By making `difficulty DESC` the primary sort key:
1. All Difficulty 3 questions appear before all Difficulty 2 questions.
2. All Difficulty 2 questions appear before all Difficulty 1 questions.
3. Within any single difficulty tier, `isMust DESC` places must-have questions ahead of nice-to-have questions.
4. Within identical difficulty and priority tiers, `id ASC` breaks ties deterministically.

Because `isMust` only reorders elements that already share an identical difficulty value, it can **never** invert a block average. For any partition of this sorted array into contiguous slices $B_0, B_1, \dots, B_{N-1}$:
$$\min(B_0) \ge \max(B_{N-1}) \implies \text{avg}(B_0) \ge \text{avg}(B_{N-1})$$

The front-loading invariant $\text{day}[0].\text{avgDifficulty} \ge \text{day}[N-1].\text{avgDifficulty}$ is therefore preserved mathematically for all non-empty question banks.

---

## 3. Partitioning & Edge Case Handling

The scheduler (`buildSchedule`) partitions questions across $D$ days ($1 \le D \le 60$) using three explicit execution paths:

### 3.1 Case A: Degenerate Case (0 Questions)
When the question bank is empty ($Q = 0$):
- $D$ days are constructed strictly matching `ScheduleSchema`.
- Each day receives `question_ids: []`.
- Daily minutes are explicitly set to `minutes = 0` (strictly non-negative integer, eliminating any potential `NaN` division artifacts).
- Focus is set to `'Review & Self-Directed Study'` (or `'Final Review & Preparation'` on Day $D$).

### 3.2 Case B: Sparse Case ($0 < Q < D$)
When there are fewer questions than available days (e.g., 3 questions over 7 days):
- **Days $1 \dots Q$**: Each day is assigned one question in strictly decreasing difficulty order ($q_1 \to q_2 \to q_3$).
- **Days $Q+1 \dots D$**: Spaced repetition review backfills earlier questions in cyclical order to prevent empty days and consolidate learning.
- Each day contains exactly 1 unique question ID, satisfying the schema constraint prohibiting duplicate questions on the same day.

> [!NOTE]
> **Interior-Day Non-Monotonicity Caveat:**
> The sparse-review backfill intentionally revisits earlier (harder) material rather than monotonically continuing to decrease, since spaced repetition benefits from re-exposure to harder content; this means only the first/last-day comparison is guaranteed, not day-over-day monotonicity across the full sparse schedule.

### 3.3 Case C: Normal Distribution ($Q \ge D$)
When questions equal or exceed days:
- Base questions per day: $\text{base} = \lfloor Q / D \rfloor$.
- Remainder questions: $R = Q \pmod D$.
- **Front-Loaded Remainder Distribution**: The first $R$ days each receive $\text{base} + 1$ questions, while subsequent days receive $\text{base}$ questions.
  - *Example*: 10 questions across 3 days yields $4 + 3 + 3 = 10$.
  - Heavier question volumes land on earlier days when energy and capacity are highest.
- Questions are assigned as contiguous slices from the sorted list, preserving difficulty clustering within each block.

---

## 4. Deterministic Focus Theme Selection

Each day's `focus` label is derived deterministically from the category composition of its assigned questions:
- Categories: `system-design`, `technical`, `behavioural`, `company-fit`.
- If one category is dominant in a day's questions, its title is selected.
- In the event of a tie (e.g., 1 `system-design` question and 1 `technical` question), ties are broken via explicit precedence:
  $$\text{system-design} > \text{technical} > \text{behavioural} > \text{company-fit}$$
- The final day (when $D > 1$) is titled `'Final Mock Interview & Comprehensive Review'`.

---

## 5. Coverage Checker (D4.1) & Second-Pass Gap Fill (D4.2)

### 5.1 Coverage Checker (`coverage-checker.ts`)
- Scans `role.requirements` against `questions[].requirement_ids`.
- Computes `uncoveredIds`, separating `uncoveredMustIds` from `uncoveredNiceIds`.
- Emits overall coverage percentage and boolean flags `isFullyCovered` and `hasMustGaps`.
- Generates the Appendix A `Coverage` envelope:
  ```json
  {
    "uncovered_requirement_ids": ["r3"],
    "passes": 1
  }
  ```

### 5.2 Second-Pass Gap Fill (`second-pass.ts`)
- **Explicit Conditional (Not a Loop)**: If `hasMustGaps` is false after initial question generation (Pass 1), the engine immediately exits with `passes: 1` and 0 additional LLM calls.
- If `uncoveredMustIds` exist:
  1. Filters requirements strictly to the missing must-haves.
  2. Dispatches a single targeted generation call (`generateQuestionsForRequirements`).
  3. Appends new questions with monotonically increasing IDs (`nextQuestionIndex`).
  4. Re-computes final coverage and returns `passes: 2`.
- Strictly capped at two passes; avoids unbounded loops and unnecessary cost.

---

## 6. Verification Matrix

| Component | Test File | Key Scenarios Verified |
| :--- | :--- | :--- |
| **D4.1 Coverage Checker** | `coverage-checker.test.ts` | 100% coverage, partial coverage, must vs nice breakdown, empty requirements, passes clamping |
| **D4.2 Second-Pass Gap Fill** | `second-pass.test.ts` | Pass 1 skip when satisfied, Pass 2 execution for missing musts, monotonic ID assignment, nice gaps non-trigger |
| **D4.3 Study Scheduler** | `scheduler.test.ts` | Lexicographic sort, counterexample preservation ($3.0 \ge 1.0$), mathematical invariant across 2/3/5/7 days, 10-question 4/3/3 remainder, 0-question NaN guard, sparse spaced repetition, category tie-breaking, integer minutes |
| **End-to-End Orchestrator** | `kit-orchestrator.test.ts` | Complete kit generation with D4.1 $\to$ D4.2 $\to$ D4.3 pipeline integration and strict `KitSchema` validation |
