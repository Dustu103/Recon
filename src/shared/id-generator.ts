/**
 * D0.4 — Stable ID Continuation Generator
 *
 * Rules:
 *  - IDs are 1-indexed: r1, r2, q1, q2, f1, f2…
 *  - `offset` allows Pass-2 or Builder additions to continue from an existing
 *    sequence without any collision.
 *
 * Example — second-pass self-healing:
 *   Pass 1 produced q1..q5  (genQIds(5, 0))
 *   Pass 2 needs 2 more  →  genQIds(2, 5)  → ['q6', 'q7']
 */

function makeIds(prefix: string, count: number, offset: number): string[] {
  if (count < 0 || !Number.isInteger(count)) {
    throw new Error(`count must be a non-negative integer, got: ${count}`);
  }
  if (offset < 0 || !Number.isInteger(offset)) {
    throw new Error(`offset must be a non-negative integer, got: ${offset}`);
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${offset + i + 1}`);
}

/**
 * Computes the maximum numeric suffix among existing IDs for a given prefix.
 * Resilient against deletions: e.g. ['q1', 'q3'] -> returns 3, so next is q4.
 */
export function nextOffsetFromIds(prefix: string, existingIds: string[]): number {
  const regex = new RegExp(`^${prefix}(\\d+)$`);
  let maxNum = 0;
  for (const id of existingIds) {
    const match = regex.exec(id);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }
  return maxNum;
}

/**
 * Generate next non-colliding IDs given an existing list of IDs.
 * Immune to holes caused by user deletion (e.g. q2 deleted).
 */
export function genNextIds(prefix: string, existingIds: string[], count: number): string[] {
  const offset = nextOffsetFromIds(prefix, existingIds);
  return makeIds(prefix, count, offset);
}

/** Generate requirement IDs: r1, r2, … or r(offset+1), … */
export function genReqIds(count: number, offset = 0): string[] {
  return makeIds('r', count, offset);
}

/** Generate question IDs: q1, q2, … or q(offset+1), … */
export function genQIds(count: number, offset = 0): string[] {
  return makeIds('q', count, offset);
}

/** Generate flashcard IDs: f1, f2, … or f(offset+1), … */
export function genFIds(count: number, offset = 0): string[] {
  return makeIds('f', count, offset);
}

/**
 * Computes safe next continuation indices (nextRequirementIndex, nextQuestionIndex, nextFlashcardIndex)
 * by inspecting existing IDs in an imported or loaded kit.
 * Protects against ID collision or reset after deletions.
 */
export function computeKitNextIndices(kit: {
  role?: { requirements?: Array<{ id: string }> };
  questions?: Array<{ id: string }>;
  flashcards?: Array<{ id: string }>;
}): { nextRequirementIndex: number; nextQuestionIndex: number; nextFlashcardIndex: number } {
  const reqIds = (kit.role?.requirements || []).map((r) => r.id);
  const qIds = (kit.questions || []).map((q) => q.id);
  const fIds = (kit.flashcards || []).map((f) => f.id);

  return {
    nextRequirementIndex: nextOffsetFromIds('r', reqIds) + 1,
    nextQuestionIndex: nextOffsetFromIds('q', qIds) + 1,
    nextFlashcardIndex: nextOffsetFromIds('f', fIds) + 1,
  };
}
