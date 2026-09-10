import { describe, it, expect } from 'vitest';
import { validateDraftKitEnvelope } from '../../validation-gate';
import { DraftKitEnvelope } from '../../types';
import { TaroError, ErrorCode } from '@taro/shared';

describe('Pre-D4 Handoff Validation Gate', () => {
  const validEnvelope: DraftKitEnvelope = {
    role: {
      title: 'Backend Engineer',
      seniority: 'Mid-Level',
      responsibilities: ['API development'],
      requirements: [
        { id: 'r1', text: 'TypeScript', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Team player', kind: 'behavioural', priority: 'nice' },
      ],
    },
    company_brief: {
      summary: 'A tech company',
      what_they_do: 'Software services',
      sources: ['https://example.com'],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'TypeScript generics question',
        answer_outline: 'Explain type parameters',
        difficulty: 2,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is a union type?',
        back: 'A type formed from two or more other types.',
        requirement_ids: ['r1'],
      },
    ],
    nextRequirementIndex: 3,
    nextQuestionIndex: 2,
    nextFlashcardIndex: 2,
    degradations: [],
  };

  it('passes a fully compliant draft envelope without error', () => {
    expect(() => validateDraftKitEnvelope(validEnvelope)).not.toThrow();
  });

  it('rejects questions referencing non-existent requirement IDs', () => {
    const invalidEnvelope: DraftKitEnvelope = {
      ...validEnvelope,
      questions: [
        {
          id: 'q1',
          requirement_ids: ['r99'], // invalid!
          category: 'technical',
          prompt: 'Question',
          answer_outline: 'Outline',
          difficulty: 2,
        },
      ],
    };

    expect(() => validateDraftKitEnvelope(invalidEnvelope)).toThrow(TaroError);
    try {
      validateDraftKitEnvelope(invalidEnvelope);
    } catch (err) {
      expect((err as TaroError).code).toBe(ErrorCode.KIT_SCHEMA_INVALID);
    }
  });

  it('rejects questions with invalid difficulty (e.g. 0 or 4)', () => {
    const invalidEnvelope: DraftKitEnvelope = {
      ...validEnvelope,
      questions: [
        {
          id: 'q1',
          requirement_ids: ['r1'],
          category: 'technical',
          prompt: 'Question',
          answer_outline: 'Outline',
          difficulty: 4 as any, // invalid!
        },
      ],
    };

    expect(() => validateDraftKitEnvelope(invalidEnvelope)).toThrow(TaroError);
  });
});
