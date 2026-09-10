import { describe, it, expect } from 'vitest';
import { generateFlashcards } from '../../step4-flashcards';
import { Requirement, Question } from '@taro/shared';

describe('Step 4: Flashcard Deck Generator', () => {
  const reqs: Requirement[] = [
    { id: 'r1', text: 'Node.js event loop', kind: 'technical', priority: 'must' },
    { id: 'r2', text: 'Distributed CAP theorem', kind: 'technical', priority: 'must' },
  ];

  const questions: Question[] = [
    {
      id: 'q1',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'Explain the event loop phases.',
      answer_outline: 'Explain timers, pending callbacks, poll, check, close.',
      difficulty: 2,
    },
  ];

  it('generates flashcards with monotonic IDs (f1..fn) mapped to requirement IDs', async () => {
    const res = await generateFlashcards(reqs, questions, {
      mock: true,
      nextFlashcardIndex: 1,
    });

    expect(res.flashcards.length).toBeGreaterThan(0);
    expect(res.nextFlashcardIndex).toBe(res.flashcards.length + 1);

    for (const card of res.flashcards) {
      expect(card.id.startsWith('f')).toBe(true);
      expect(card.front.length).toBeGreaterThan(0);
      expect(card.back.length).toBeGreaterThan(0);
      expect(card.requirement_ids.length).toBeGreaterThan(0);
      for (const id of card.requirement_ids) {
        expect(['r1', 'r2']).toContain(id);
      }
    }
  });

  it('supports offset continuation', async () => {
    const res = await generateFlashcards(reqs, questions, {
      mock: true,
      nextFlashcardIndex: 4,
    });

    expect(res.flashcards[0].id).toBe('f4');
    expect(res.nextFlashcardIndex).toBe(4 + res.flashcards.length);
  });
});
