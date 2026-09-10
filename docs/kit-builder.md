# Domain 6: Kit Builder & Workspace Interactivity

## Overview

The Kit Builder delivers granular inline editing, manual question/flashcard insertion, drag-and-drop category reordering, single-section regeneration with hand-edit protection, referential cascading deletion, and candidate progress tracking.

---

## 1. Protected Item Invariant & Merge Semantics

Every mutable section in a Recon kit supports optional metadata flags:
```typescript
_edited?: boolean;  // Set to true whenever a candidate modifies AI-generated content
_manual?: boolean;  // Set to true whenever a candidate manually inserts an item
```

### Regeneration Rules:
1. **Questions Category Regeneration (`POST /api/kits/:id/regenerate` with `section: "questions", category: "technical"`)**:
   - Retains all questions in other categories completely untouched.
   - For the targeted category slice:
     - Retains all questions where `_edited === true` or `_manual === true`.
     - Discards unprotected AI questions.
     - Calculates uncovered requirement gaps:
       $$\text{gaps} = \text{allRequirements} \setminus \text{requirementsCoveredByRetained}$$
     - Prompts the LLM pipeline for fresh questions covering only the gap requirements.
     - Recomputes the difficulty-first study schedule and coverage envelope.
2. **Flashcard Deck Regeneration (`section: "flashcards"`)**:
   - Retains all flashcards where `_edited === true` or `_manual === true`.
   - Discards unprotected flashcards and generates fresh cards covering remaining requirements.
3. **Company Brief Regeneration (`section: "company_brief"`)**:
   - Singleton structure cannot be merged automatically.
   - If `company_brief._edited === true` and `force !== true`, returns **HTTP 428 `CONFIRMATION_REQUIRED`**.
   - If `force === true`, regenerates the brief and sets `_edited: false` **only upon database commit**.

---

## 2. API Endpoints Reference

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

---

## 3. Error Handling

- **`409 CONCURRENT_MODIFICATION`**: Raised when document version `__v` does not match the expected version during an atomic mutation.
- **`428 CONFIRMATION_REQUIRED`**: Raised when attempting to overwrite an edited singleton (`company_brief`) without `force: true`.
- **`404 NOT_FOUND`**: Raised when kit, question, or flashcard does not exist or is not owned by the authenticated user.
- **`400 INVALID_INPUT`**: Raised when validation fails for required fields, categories, or difficulty levels.

---

## 4. Verification & Testing

Run unit and integration suites:
```bash
npx vitest run src/core/builder/__tests__/unit/regeneration-engine.test.ts
npx vitest run src/api/__tests__/unit/kit-builder.test.ts
```
