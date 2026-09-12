/**
 * D0.4 — Stable ID Generator Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { genReqIds, genQIds, genFIds, genNextIds, nextOffsetFromIds, computeKitNextIndices } from '../../id-generator';

describe('genReqIds', () => {
  it('generates sequential requirement IDs from 1', () => {
    expect(genReqIds(3)).toEqual(['r1', 'r2', 'r3']);
  });

  it('generates with offset for continuation (pass 2)', () => {
    expect(genReqIds(2, 4)).toEqual(['r5', 'r6']);
  });

  it('returns empty array for count 0', () => {
    expect(genReqIds(0)).toEqual([]);
  });

  it('never collides across two consecutive calls with correct offset', () => {
    const pass1 = genReqIds(5, 0);
    const pass2 = genReqIds(3, 5);
    const all = [...pass1, ...pass2];
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });
});

describe('genQIds', () => {
  it('generates sequential question IDs from 1', () => {
    expect(genQIds(4)).toEqual(['q1', 'q2', 'q3', 'q4']);
  });

  it('continues correctly with offset', () => {
    expect(genQIds(2, 7)).toEqual(['q8', 'q9']);
  });
});

describe('genFIds', () => {
  it('generates sequential flashcard IDs', () => {
    expect(genFIds(2)).toEqual(['f1', 'f2']);
  });

  it('offset math: genFIds(3, 10) = f11, f12, f13', () => {
    expect(genFIds(3, 10)).toEqual(['f11', 'f12', 'f13']);
  });
});

describe('genNextIds & nextOffsetFromIds (Deletion resilience)', () => {
  it('correctly calculates next offset when items are deleted (e.g. q2 deleted)', () => {
    const existing = ['q1', 'q3']; // q2 was deleted
    const nextIds = genNextIds('q', existing, 2);
    expect(nextIds).toEqual(['q4', 'q5']); // Does not collide with q3!
  });

  it('returns offset 0 for empty list', () => {
    expect(genNextIds('q', [], 2)).toEqual(['q1', 'q2']);
  });

  it('handles multi-digit numbers correctly', () => {
    const existing = ['r9', 'r10', 'r12'];
    expect(genNextIds('r', existing, 1)).toEqual(['r13']);
  });
});

describe('computeKitNextIndices', () => {
  it('computes safe continuation indices from populated kit collections', () => {
    const kit = {
      role: {
        requirements: [{ id: 'r1' }, { id: 'r2' }, { id: 'r5' }], // r3, r4 removed
      },
      questions: [{ id: 'q1' }, { id: 'q3' }, { id: 'q7' }],
      flashcards: [{ id: 'f1' }, { id: 'f2' }],
    };

    const indices = computeKitNextIndices(kit);
    expect(indices).toEqual({
      nextRequirementIndex: 6,
      nextQuestionIndex: 8,
      nextFlashcardIndex: 3,
    });
  });

  it('handles empty collections safely with base index 1', () => {
    const indices = computeKitNextIndices({});
    expect(indices).toEqual({
      nextRequirementIndex: 1,
      nextQuestionIndex: 1,
      nextFlashcardIndex: 1,
    });
  });
});

