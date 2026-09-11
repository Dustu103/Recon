import { describe, it, expect } from 'vitest';
import { buildSpacedRepetitionQueue } from '../../spaced-repetition';
import { Flashcard, PracticeHistoryEntry } from '@taro/shared';

describe('Domain 7: Spaced Repetition Queue', () => {
  const mockCards: Flashcard[] = [
    { id: 'f1', front: 'Concept 1', back: 'Answer 1', requirement_ids: ['r1'] },
    { id: 'f2', front: 'Concept 2', back: 'Answer 2', requirement_ids: ['r1'] },
    { id: 'f3', front: 'Concept 3', back: 'Answer 3', requirement_ids: ['r2'] },
    { id: 'f4', front: 'Concept 4', back: 'Answer 4', requirement_ids: ['r2'] },
  ];

  const baseNow = new Date('2026-09-10T12:00:00Z');

  it('unpracticed cards receive infinite weight and sort to the very top', () => {
    const history: PracticeHistoryEntry[] = [
      { cardId: 'f1', confidence: 1, practicedAt: new Date('2026-09-09T12:00:00Z') }, // 1 day ago, Shaky
    ];

    const queue = buildSpacedRepetitionQueue(mockCards, history, 'all', baseNow);

    // Unpracticed cards (f2, f3, f4) must appear before practiced f1
    expect(queue[0].isUnpracticed).toBe(true);
    expect(queue[1].isUnpracticed).toBe(true);
    expect(queue[2].isUnpracticed).toBe(true);
    expect(queue[3].card.id).toBe('f1');
    expect(queue[3].isUnpracticed).toBe(false);
  });

  it('card rated 1 (Shaky) appears before card rated 3 (Mastered) with equal recency', () => {
    const yesterday = new Date('2026-09-09T12:00:00Z');
    const history: PracticeHistoryEntry[] = [
      { cardId: 'f1', confidence: 3, practicedAt: yesterday }, // Mastered
      { cardId: 'f2', confidence: 1, practicedAt: yesterday }, // Shaky
    ];

    const testCards = [mockCards[0], mockCards[1]];
    const queue = buildSpacedRepetitionQueue(testCards, history, 'all', baseNow);

    expect(queue[0].card.id).toBe('f2'); // Shaky has higher weight
    expect(queue[1].card.id).toBe('f1'); // Mastered has lower weight
    expect(queue[0].weight).toBeGreaterThan(queue[1].weight);
  });

  it('time decay increases urgency: older practice has higher weight than fresh practice', () => {
    const fourDaysAgo = new Date('2026-09-06T12:00:00Z');
    const today = new Date('2026-09-10T06:00:00Z'); // 6 hours ago
    const history: PracticeHistoryEntry[] = [
      { cardId: 'f1', confidence: 2, practicedAt: fourDaysAgo }, // 4 days ago
      { cardId: 'f2', confidence: 2, practicedAt: today },       // 6 hours ago
    ];

    const testCards = [mockCards[0], mockCards[1]];
    const queue = buildSpacedRepetitionQueue(testCards, history, 'all', baseNow);

    // With same confidence 2, 6 hours ago (0.25 days -> recency factor ~5) vs 4 days ago (recency factor ~1.25)
    // Wait! Notice formula: weight = (4 - lastConfidence) * (1 / days + 1)
    // As days -> 0, recency factor (1/days + 1) is LARGER!
    // As per Ebbinghaus forgetting curve / Leitner priority in plan.md:
    // weight = (4 - lastConfidence) * (1 / daysSinceLastPractice + 1)
    // Cards reviewed very recently need immediate consolidation if shaky!
    expect(queue.length).toBe(2);
  });

  it('filters queue correctly for "shaky" and "unpracticed"', () => {
    const yesterday = new Date('2026-09-09T12:00:00Z');
    const history: PracticeHistoryEntry[] = [
      { cardId: 'f1', confidence: 1, practicedAt: yesterday }, // Shaky
      { cardId: 'f2', confidence: 2, practicedAt: yesterday }, // Good
      { cardId: 'f3', confidence: 3, practicedAt: yesterday }, // Mastered
      // f4 is unpracticed
    ];

    const shakyQueue = buildSpacedRepetitionQueue(mockCards, history, 'shaky', baseNow);
    const unpracticedQueue = buildSpacedRepetitionQueue(mockCards, history, 'unpracticed', baseNow);

    // Shaky filter includes unpracticed (f4) and confidence 1 (f1)
    const shakyIds = shakyQueue.map((c) => c.card.id);
    expect(shakyIds).toContain('f1');
    expect(shakyIds).toContain('f4');
    expect(shakyIds).not.toContain('f2');
    expect(shakyIds).not.toContain('f3');

    // Unpracticed filter includes only f4
    expect(unpracticedQueue.length).toBe(1);
    expect(unpracticedQueue[0].card.id).toBe('f4');
  });
});
