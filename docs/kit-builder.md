# Domain 6: Kit Builder & Workspace Interactivity

## Overview

The Kit Builder delivers granular inline editing, manual question/flashcard insertion, non-destructive category reordering, single-section regeneration with hand-edit protection, referential cascading deletion, optimistic concurrency control, and candidate progress tracking.

---

## 1. Protected Item Invariant & Merge Semantics

Every mutable section in a Recon kit supports optional metadata flags:
```typescript
_edited?: boolean;  // Set to true whenever a candidate modifies AI-generated content
_manual?: boolean;  // Set to true whenever a candidate manually inserts an item
```

### Visual Badges in UI:
- **`Customized` (Amber Badge)**: Displayed on any question, flashcard, or company brief where `_edited === true`.
- **`Hand-Crafted` (Purple Badge)**: Displayed on any question or flashcard where `_manual === true`.

### Regeneration Rules:
1. **Questions Category Regeneration (`POST /api/kits/:id/regenerate` with `section: "questions", category: "technical"`)**:
   - Retains all questions in other categories completely untouched.
   - For the targeted category slice:
     - Retains all questions where `_edited === true` or `_manual === true`.
     - Discards unprotected AI questions.
     - Calculates uncovered requirement gaps:
       $$\text{gaps} = \text{allRequirements} \setminus \text{requirementsCoveredByRetained}$$
     - Prompts the LLM pipeline for fresh questions covering only the gap requirements.
     - Recomputes the difficulty-first study schedule `(difficulty DESC, isMust DESC, id ASC)` and coverage envelope.
2. **Flashcard Deck Regeneration (`section: "flashcards"`)**:
   - Retains all flashcards where `_edited === true` or `_manual === true`.
   - Discards unprotected flashcards and generates fresh cards covering remaining requirements.
3. **Company Brief Regeneration (`section: "company_brief"`)**:
   - Singleton structure cannot be merged automatically.
   - If `company_brief._edited === true` and `force !== true`, returns **HTTP 428 `CONFIRMATION_REQUIRED`**.
   - If `force === true`, regenerates the brief and sets `_edited: false` **only upon database commit**. If regeneration fails mid-flight, `_edited` remains `true` and user text is preserved.

---

## 2. Workspace Navigation & Tabs

The Recon candidate workspace at `/kits/[id]` provides five specialized tabs:

1. **Study Schedule (`study_schedule`)**:
   - Displays day-by-day prep plan with question count, estimated study minutes, and focus areas.
   - Interactive checkbox toggles day completion, updating the workspace header progress bar (e.g., `1 / 7 Days Done`).
2. **Question Bank (`question_bank`)**:
   - Filter by category (`all`, `technical`, `behavioural`, `system-design`, `company-fit`).
   - Inline edit prompt, answer outline, category, and difficulty (1–3).
   - "Add Question" modal generates monotonic ID (`qX`) and sets `_manual: true`.
   - Star questions to bookmark high-priority items (`starred` count displayed in header).
   - Expandable candidate practice notes for formulating STAR-method responses.
   - Move Up / Move Down buttons for non-destructive reordering within category slices.
   - Cascading delete with OCC validation.
3. **Flashcards (`flashcards`)**:
   - Interactive 3D flip card (Question/Prompt front, Key Concepts & Answer Bullets back).
   - Card deck carousel navigation (`1 / N`).
   - "Mark Mastered" toggle with green badge state tracked in candidate progress.
   - Inline front/back editing and "Add Card" modal with monotonic ID (`fX`).
4. **Company Brief (`company_brief`)**:
   - Inline editable company executive summary and core systems overview.
   - "Regenerate Brief" button wired to HTTP 428 confirmation modal (`Overwrite Customized Brief? Confirmation Required`).
   - Discard / Keep My Edits action gates.
5. **Role Breakdown (`role_breakdown`)**:
   - Visual inspection of target title, seniority level, core responsibilities, and extracted must/nice requirements.

---

## 3. API Endpoints Reference

All endpoints are mounted under `/api/kits/:id/...` and require authentication.

| Method | Endpoint | Description | Status Code |
|---|---|---|---|
| `PATCH` | `/:id/questions/:questionId` | Inline edits question (`prompt`, `outline`, `difficulty`, `category`). Sets `_edited: true`. | `200 OK` |
| `POST` | `/:id/questions` | Inserts manual question with monotonic ID (`qX`) and `_manual: true`. | `201 Created` |
| `DELETE` | `/:id/questions/:questionId` | Cascading delete with OCC version check (`__v`), updating schedule, coverage, notes & stars. | `200 OK` |
| `PATCH` | `/:id/questions/reorder` | Reorders questions within a category slice without touching `_edited` flags. | `200 OK` |
| `PATCH` | `/:id/company-brief` | Inline edits company summary and what they do. Sets `_edited: true`. | `200 OK` |
| `PATCH` | `/:id/flashcards/:flashcardId` | Inline edits flashcard front/back. Sets `_edited: true`. | `200 OK` |
| `POST` | `/:id/flashcards` | Inserts manual flashcard with monotonic ID (`fX`) and `_manual: true`. | `201 Created` |
| `DELETE` | `/:id/flashcards/:flashcardId` | Deletes flashcard and purges mastery tracking. | `200 OK` |
| `POST` | `/:id/regenerate` | Triggers single-section regeneration in background. Checks confirmation gate (428) for brief. | `202 Accepted` |
| `PATCH` | `/:id/candidate-progress` | Updates candidate notes, stars, flashcard mastery, and study day checkoffs. | `200 OK` |

> **Express Route Ordering Invariant**: Static routes such as `/:id/questions/reorder` must be declared **before** parameterized routes like `/:id/questions/:questionId` in Express router registration; otherwise Express parses the literal string `'reorder'` as the `:questionId` parameter.

---

## 4. Payload Schemas

### Edit Question (`PATCH /api/kits/:id/questions/:questionId`)
```json
{
  "prompt": "How does React reconciliation work under the hood?",
  "answer_outline": "Explain Fiber tree and cooperative scheduling.",
  "difficulty": 3,
  "category": "technical",
  "expectedVersion": 4
}
```

### Add Question (`POST /api/kits/:id/questions`)
```json
{
  "prompt": "Describe how you optimize Redis memory usage.",
  "answer_outline": "Hash max ziplist entries, jemalloc fragmentation tracking.",
  "category": "technical",
  "difficulty": 3,
  "expectedVersion": 4
}
```

### Reorder Questions (`PATCH /api/kits/:id/questions/reorder`)
```json
{
  "category": "technical",
  "orderedIds": ["q4", "q1", "q2"],
  "expectedVersion": 5
}
```

### Candidate Progress (`PATCH /api/kits/:id/candidate-progress`)
```json
{
  "notes": { "q1": "Emphasize React 18 concurrent features" },
  "starred": ["q1", "q4"],
  "flashcardMastery": { "f1": "mastered" },
  "completedDays": [1, 2]
}
```

---

## 5. Error Handling

- **`409 CONCURRENT_MODIFICATION`**: Raised when document version `__v` does not match `expectedVersion` during an atomic mutation.
- **`428 CONFIRMATION_REQUIRED`**: Raised when attempting to overwrite an edited singleton (`company_brief`) without `force: true`.
- **`404 NOT_FOUND`**: Raised when kit, question, or flashcard does not exist or is not owned by the authenticated user.
- **`400 INVALID_INPUT`**: Raised when validation fails for required fields, categories, or difficulty levels.

---

## 6. Verification & Testing

Run unit and integration suites:
```bash
npx vitest run src/core/builder/__tests__/unit/regeneration-engine.test.ts
npx vitest run src/api/__tests__/unit/kit-builder.test.ts
```

