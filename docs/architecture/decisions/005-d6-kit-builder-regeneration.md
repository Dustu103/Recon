# ADR 005: Kit Builder, Protected Item Regeneration & OCC Versioning

**Date:** 2026-09-11  
**Status:** Accepted  
**Domain:** Domain 6 — Kit Builder & Workspace Interactivity  
**Authors:** Recon Core Architecture Team  

---

## 1. Context & Problem Statement

In Recon, interview preparation kits are initialized through an end-to-end AI synthesis pipeline (D3) and mathematically packed using deterministic coverage algorithms (D4). However, real candidates have unique contexts:
1. They need to fine-tune AI-generated questions to reflect their specific past experiences or target role specifics (prompt, rubric, difficulty, category).
2. They need to inject custom questions or flashcards from their own prep notes.
3. When a specific section or category of questions is refreshed using newly synthesized AI intelligence ("Regenerate"), **all customized items (`_edited: true`) and hand-crafted additions (`_manual: true`) must be unconditionally preserved**.
4. Singletons (like `company_brief`) cannot be merged by array union; overwriting an edited brief risks destroying candidate modifications without notice.
5. In-flight background regeneration and concurrent client mutations risk race conditions and orphaned data.

---

## 2. Decision & Architectural Guarantees

### Decision 1: Strict Array Merge vs. Singleton Confirmation Gate
- **Array Sections (`questions[]`, `flashcards[]`)**:
  - Unprotected items in the target category slice are discarded and replaced with freshly generated items.
  - Protected items (`_edited: true` or `_manual: true`) are unconditionally retained in their exact state.
  - Dynamically calculates requirement gaps: requirements already covered by retained items are subtracted from prompt requirements, preventing duplicate coverage.
- **Singleton Sections (`company_brief`)**:
  - Cannot be partitioned into sub-elements without loss of narrative coherence.
  - If `company_brief._edited === true` and `force !== true`, the API rejects the request immediately with **HTTP 428 `CONFIRMATION_REQUIRED`**.
  - Only when `force: true` is explicitly passed will the brief be regenerated.
  - **Commit Invariant**: `company_brief._edited` is reset to `false` only upon successful database write. If regeneration fails mid-flight, rollback preserves `_edited === true` and the user's text.

### Decision 2: Distinct Canonical Error Codes
To prevent client ambiguity:
- `409 CONCURRENT_MODIFICATION`: Reserved strictly for OCC version collisions (`__v` mismatch) during write races.
- `428 CONFIRMATION_REQUIRED`: Reserved strictly for intentional single-actor destructive overwrites of customized singleton sections.
- `GENERATION_IN_PROGRESS`: Reserved for kit lifecycle states (D5), never reused for OCC.

### Decision 3: Monotonic Counters for ID Monotonicity
- Mongo `$inc` cannot be evaluated atomically inside an embedded `$push` array.
- In-memory computation guarantees monotonically increasing IDs:
  $$\text{nextId} = \max(\text{kit.nextQuestionIndex} \mathbin{\Vert} 1, \text{nextOffsetFromIds}(\text{kit.questions}) + 1)$$
- Persists `nextQuestionIndex: nextId + 1` atomically on every manual addition or regeneration batch.

### Decision 4: Referential Cascading Deletion
When `DELETE /api/kits/:id/questions/:questionId` executes:
1. Deletes question from `kit.questions[]`.
2. Prunes `questionId` from all `kit.schedule.days[].question_ids` arrays.
3. Recomputes coverage envelope and uncovered requirement counts.
4. Purges question references from candidate progress (`progress.notes`, `progress.starred`).
5. Enforces OCC (`__v`) check to prevent deleting an already-modified question.

### Decision 5: Non-destructive Category Reordering
- `PATCH /api/kits/:id/questions/reorder` reorders questions within a category slice.
- Does **not** flip `_edited: true` on questions, ensuring that reordering items does not falsely classify them as content-customized.

---

## 3. Verification & Compliance

1. **Hermetic Unit & Integration Tests**:
   - `src/core/builder/__tests__/unit/regeneration-engine.test.ts` (6 tests passing): Verifies protected item preservation, gap subtraction, monotonic ID generation, and schema validation.
   - `src/api/__tests__/unit/kit-builder.test.ts` (12 tests passing): Verifies inline edits, monotonic manual additions, cascading deletes, 428 confirmation required, 409 OCC conflicts, and candidate progress.
2. **Schema Export Purity**:
   - Clean export sanitizer strips `_edited` and `_manual` metadata flags when generating Appendix A export JSON, preserving external consumer contract fidelity.
