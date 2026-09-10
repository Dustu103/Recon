import { describe, it, expect } from 'vitest';
import {
  matchCuratedQuestions,
  CURATED_QUESTION_TEMPLATES,
} from '../../curated-questions';
import { Requirement, QuestionSchema } from '@taro/shared';

describe('curated-questions', () => {
  it('contains at least 15 comprehensive gold-standard question templates', () => {
    expect(CURATED_QUESTION_TEMPLATES.length).toBeGreaterThanOrEqual(15);

    for (const t of CURATED_QUESTION_TEMPLATES) {
      expect(t.prompt.length).toBeGreaterThan(10);
      expect(t.answer_outline.length).toBeGreaterThan(10);
      expect(t.evaluation_criteria.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(t.difficulty);
      expect(['technical', 'behavioural', 'system-design', 'company-fit']).toContain(t.category);
    }
  });

  it('matches technical requirements dynamically and binds exact requirement IDs', () => {
    const requirements: Requirement[] = [
      {
        id: 'r1',
        text: 'Experience with Redis distributed caching and cache invalidation strategies',
        kind: 'technical',
        priority: 'must',
      },
      {
        id: 'r2',
        text: 'Deep understanding of Node.js event loop and asynchronous programming in TypeScript',
        kind: 'technical',
        priority: 'must',
      },
    ];

    const result = matchCuratedQuestions(requirements, 1, 2);

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].id).toBe('q1');
    expect(result.questions[0].requirement_ids).toEqual(['r1']);
    expect(result.questions[0].prompt.toLowerCase()).toContain('cache');

    expect(result.questions[1].id).toBe('q2');
    expect(result.questions[1].requirement_ids).toEqual(['r2']);
    expect(result.questions[1].prompt.toLowerCase()).toContain('event loop');

    expect(result.nextQuestionIndex).toBe(3);
    expect(result.coveredRequirementIds.has('r1')).toBe(true);
    expect(result.coveredRequirementIds.has('r2')).toBe(true);

    // Validate each question conforms strictly to QuestionSchema
    for (const q of result.questions) {
      expect(() => QuestionSchema.parse(q)).not.toThrow();
    }
  });

  it('matches behavioral requirements with STAR leadership templates', () => {
    const requirements: Requirement[] = [
      {
        id: 'r3',
        text: 'Demonstrated customer obsession and strong ownership mindset',
        kind: 'behavioural',
        priority: 'must',
      },
    ];

    const result = matchCuratedQuestions(requirements, 5, 1);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].id).toBe('q5');
    expect(result.questions[0].requirement_ids).toEqual(['r3']);
    expect(result.questions[0].category).toBe('behavioural');
    expect(result.nextQuestionIndex).toBe(6);
  });

  it('does not force matches for unrelated niche requirements', () => {
    const requirements: Requirement[] = [
      {
        id: 'r10',
        text: 'Familiarity with proprietary COBOL punch-card legacy batch scheduler',
        kind: 'technical',
        priority: 'nice',
      },
    ];

    const result = matchCuratedQuestions(requirements, 1, 2);
    expect(result.questions).toHaveLength(0);
    expect(result.coveredRequirementIds.size).toBe(0);
    expect(result.nextQuestionIndex).toBe(1);
  });
});
