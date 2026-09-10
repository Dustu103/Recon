import { describe, it, expect } from 'vitest';
import { executeSecondPassGapFill } from '../../second-pass';
import { Requirement, Question, CompanyBrief } from '@taro/shared';
import { MockLlmProvider } from '../../../llm/providers/mock.provider';
import { LlmClient } from '../../../llm/client';

describe('second-pass (Domain 4.2)', () => {
  const sampleBrief: CompanyBrief = {
    summary: 'Cloud-native infrastructure and distributed messaging platform.',
    tech_stack: ['TypeScript', 'Node.js', 'Go', 'Redis', 'Kafka'],
    culture: ['Customer obsession', 'Ownership'],
  };

  const reqMust1: Requirement = { id: 'r1', text: 'Node.js runtime internals', kind: 'technical', priority: 'must' };
  const reqMust2: Requirement = { id: 'r2', text: 'Distributed caching with Redis', kind: 'technical', priority: 'must' };
  const reqNice1: Requirement = { id: 'r3', text: 'Kafka stream processing', kind: 'technical', priority: 'nice' };

  it('skips second pass when all must-have requirements are already satisfied', async () => {
    const initialQuestions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Explain event loop',
        answer_outline: 'libuv phases',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'technical',
        prompt: 'Explain Redis cache invalidation',
        answer_outline: 'Write-through vs cache-aside',
        difficulty: 3,
      },
    ];

    const result = await executeSecondPassGapFill({
      requirements: [reqMust1, reqMust2, reqNice1],
      initialQuestions,
      brief: sampleBrief,
      nextQuestionIndex: 3,
      mock: true,
    });

    expect(result.passes).toBe(1);
    expect(result.gapQuestionsGenerated).toBe(0);
    expect(result.questions).toHaveLength(2);
    expect(result.coverage.passes).toBe(1);
    expect(result.coverage.uncovered_requirement_ids).toEqual(['r3']);
  });

  it('triggers pass 2 targeting uncovered must-have requirement and assigns monotonic IDs', async () => {
    const mockProvider = new MockLlmProvider();
    const client = new LlmClient({
      provider: mockProvider,
      geminiApiKey: 'test-key',
      groqApiKey: 'test-key',
    });

    // Only r1 is covered in initialQuestions; r2 (must) and r3 (nice) are uncovered
    const initialQuestions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Explain Node.js event loop',
        answer_outline: 'libuv...',
        difficulty: 2,
      },
    ];

    const result = await executeSecondPassGapFill({
      requirements: [reqMust1, reqMust2, reqNice1],
      initialQuestions,
      brief: sampleBrief,
      client,
      mock: true,
      nextQuestionIndex: 2,
      roleTitle: 'Staff Infrastructure Engineer',
      roleSeniority: 'Staff',
    });

    expect(result.passes).toBe(2);
    expect(result.coverage.passes).toBe(2);
    expect(result.questions.length).toBeGreaterThan(1);
    expect(result.gapQuestionsGenerated).toBeGreaterThan(0);

    // Verify IDs of gap questions start at or after nextQuestionIndex (q2, q3...)
    const newQuestions = result.questions.slice(1);
    for (const q of newQuestions) {
      expect(q.id).toMatch(/^q[2-9]\d*$/);
    }
  });

  it('does not trigger pass 2 when only nice-to-have requirements have gaps', async () => {
    const initialQuestions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1', 'r2'],
        category: 'technical',
        prompt: 'Explain Node and Redis architecture',
        answer_outline: 'Integration details...',
        difficulty: 3,
      },
    ];

    const result = await executeSecondPassGapFill({
      requirements: [reqMust1, reqMust2, reqNice1],
      initialQuestions,
      brief: sampleBrief,
      nextQuestionIndex: 2,
      mock: true,
    });

    expect(result.passes).toBe(1);
    expect(result.gapQuestionsGenerated).toBe(0);
    expect(result.coverage.uncovered_requirement_ids).toEqual(['r3']);
    expect(result.coverage.passes).toBe(1);
  });
});
