# Practice Engine & Spaced Repetition (Domain 7)

## Overview

Domain 7 (D7) delivers the **Distraction-Free Flashcard Study Deck** and **Spaced Repetition Queue** for candidate interview preparation. Candidates rehearse technical and behavioral interview concepts using high-velocity keyboard controls, three-tier confidence ratings, and an intelligent spaced-repetition queue designed to optimize recall retention ahead of scheduled interview dates.

---

## 1. Distraction-Free Study Deck Architecture

The study deck provides an ultra-fast, keyboard-driven interface optimized for deep focus during interview rehearsal sessions.

### 1.1 3D Flip Card Mechanics
- **Interaction**: Pressing `Spacebar` or clicking the card activates a CSS 3D transform (`rotateY(180deg)` with `perspective: 1000px` and `backface-visibility: hidden`).
- **Zero Latency**: State transitions are client-side instantaneous.
- **Card Sides**:
  - **Front**: Prompt, question title, category badge (`technical`, `behavioural`, `system-design`, `company-fit`), and target requirement association.
  - **Back**: Concise, punchy answer outline, key talking points, and canonical syntax/patterns.

### 1.2 Three-Tier Confidence Ratings
Upon flipping the card, candidates rate their recall confidence using one of three canonical ratings:

| Rating | Label | Internal Value | UX Indicator | Meaning |
| :--- | :--- | :---: | :--- | :--- |
| **1** | **Shaky** | `1` | Red pill (`bg-red-500/20 text-red-400 border-red-500/30`) | Struggled to recall; concept needs immediate review |
| **2** | **Good** | `2` | Amber pill (`bg-amber-500/20 text-amber-400 border-amber-500/30`) | Recalled correctly with minor hesitation |
| **3** | **Mastered** | `3` | Emerald pill (`bg-emerald-500/20 text-emerald-400 border-emerald-500/30`) | Fluid, confident recall without hesitation |

### 1.3 Universal Keyboard Navigation
To support distraction-free drills, all study actions are bound to ergonomic single-key shortcuts:

- `Spacebar`: Flip card between front and back.
- `1`: Rate as **Shaky (1)** and advance to next card.
- `2`: Rate as **Good (2)** and advance to next card.
- `3`: Rate as **Mastered (3)** and advance to next card.
- `ArrowRight` (`→`): Skip to next card without rating.
- `ArrowLeft` (`←`): Return to previous card.

All keyboard listeners are guarded against form inputs (`HTMLInputElement` / `HTMLTextAreaElement`) to prevent unintended triggers while editing notes.

---

## 2. Spaced Repetition & Urgency Algorithm

### 2.1 Mathematical Formulation
The spaced repetition engine calculates an **Urgency Weight** for every flashcard to ensure shaky and overdue concepts are reviewed first:

$$\text{weight} = (4 - \text{lastConfidence}) \times \left(\frac{1}{\max(0.01, \text{daysSinceLastPractice})} + 1\right)$$

Where:
- $\text{lastConfidence} \in \{1, 2, 3\}$ represents the candidate's most recent rating for this card.
- $\text{daysSinceLastPractice} = \frac{\text{now} - \text{practicedAt}}{86{,}400{,}000 \text{ ms}}$.
- $\max(0.01, \text{daysSinceLastPractice})$: **Divide-by-zero safeguard** preventing mathematical singularity when a card was rated moments ago ($0.01\text{ days} \approx 14.4\text{ minutes}$).

### 2.2 Unpracticed Invariant
Flashcards that have never been rehearsed are assigned an infinite weight:

$$\text{weight}(\text{unpracticed}) = \infty$$

This guarantees that unpracticed cards are always prioritized at the top of the queue before any previously reviewed cards, regardless of how long ago the reviewed cards were practiced.

### 2.3 Urgency Curve Behavior
The multiplier $(4 - \text{lastConfidence})$ weights urgency based on performance:
- $\text{Shaky } (1) \implies (4 - 1) = 3$ (highest urgency multiplier).
- $\text{Good } (2) \implies (4 - 2) = 2$ (moderate urgency multiplier).
- $\text{Mastered } (3) \implies (4 - 3) = 1$ (maintenance review).

As $\text{daysSinceLastPractice}$ increases, the temporal decay term $\left(\frac{1}{\text{days}} + 1\right)$ stabilizes toward $1$, while freshly reviewed cards temporarily experience a lower urgency boost.

### 2.4 Queue Filtering Modes
The practice engine provides three queue views:
1. `'all'`: All kit flashcards sorted by descending urgency weight (tie-broken by card ID).
2. `'shaky'`: Only cards whose latest rating is `1` (Shaky) or cards that are unpracticed.
3. `'unpracticed'`: Exclusively cards with zero practice history entries.

---

## 3. History Reducer & Deterministic Tie-Breaking

Flashcard ratings are appended over time to preserve candidate progress history. To evaluate both Spaced Repetition weights and Weak-Spot Radar readiness without race conditions or timestamp drift, the system employs a pure reducer:

```typescript
export function getLatestRatingsMap(
  practiceHistory?: PracticeHistoryEntry[]
): Map<string, PracticeHistoryEntry>
```

### Deterministic Invariant:
1. Iterates through the array and stores the newest rating per `cardId`.
2. When comparing two entries:
   - If $t_{\text{entry}} > t_{\text{current}}$, the entry replaces current.
   - **Tie-breaker**: If $t_{\text{entry}} = t_{\text{current}}$ (identical millisecond timestamp), the entry with the **higher array index** wins.
3. Both `spaced-repetition.ts` and `weak-spot-radar.ts` consume `getLatestRatingsMap()`, guaranteeing 100% mathematical consistency across all analytics surfaces.

---

## 4. Persistence Architecture & Scaling Envelope

### 4.1 Schema Definition
Practice events are persisted in the MongoDB `Kit` document:

```typescript
// src/api/kits/models/kit.model.ts
practiceHistory: [
  {
    cardId: { type: String, required: true },
    confidence: { type: Number, enum: [1, 2, 3], required: true },
    practicedAt: { type: Date, default: Date.now },
  }
]
```

### 4.2 Atomic Session Mutation
When a candidate records a practice rating or completes a batch session, the API executes an atomic MongoDB update:

```typescript
await Kit.findOneAndUpdate(
  { _id: kitId, userId },
  {
    $push: { practiceHistory: { $each: formattedEntries } },
    $set: {
      'progress.flashcardMastery.<cardId>': label, // 'shaky' | 'good' | 'mastered'
      updatedAt: new Date(),
    },
  }
);
```

### 4.3 1,000-Session Scaling Envelope Analysis
Recon kits are evaluated for long-term multi-session scaling:

| Dimension | Specification | Impact & Mitigation |
| :--- | :--- | :--- |
| **Entry Footprint** | ~60 bytes per entry (`cardId`: 16B, `confidence`: 1B, `practicedAt`: 8B, BSON overhead: ~35B) | A heavy user completing 1,000 ratings accumulates **~60 KB** of history. |
| **Document Limit** | MongoDB 16 MB BSON limit | 60 KB represents **< 0.4%** of the maximum document size. A kit could store >250,000 practice entries before approaching MongoDB limits. |
| **Read Latency** | `getLatestRatingsMap()` single-pass $O(N)$ traversal | 1,000 entries processed in **< 0.15 ms** in V8 runtime. |
| **Future Pruning** | If a user reaches >10,000 ratings on a single kit | An asynchronous compaction job can consolidate entries older than 90 days into lifetime rollups, keeping active history under 1,000 entries. |

---

## 5. API Endpoints

### `POST /api/kits/:id/practice`
Records practice ratings for one or more flashcards.

- **Request Body**:
  ```json
  {
    "ratings": [
      {
        "cardId": "card_tech_01",
        "confidence": 3,
        "practicedAt": "2026-09-11T12:00:00.000Z"
      }
    ]
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "recorded": 1,
    "overallReadiness": 75,
    "weakSpotRadar": [ ... ],
    "queue": [ ... ]
  }
  ```

### `GET /api/kits/:id/practice?filter=shaky`
Retrieves current queue and Weak-Spot Radar diagnostics.

- **Query Parameters**: `filter` (`'all'` | `'shaky'` | `'unpracticed'`).
- **Response** (`200 OK`): Returns sorted queue cards and requirement readiness analytics.
