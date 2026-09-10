import { describe, it, expect } from 'vitest';
import { generateQuestionsForRequirements } from '../../step3-questions';
import { Requirement, CompanyBrief } from '@taro/shared';

describe('Step 3: Targeted Question Generator', () => {
  const mockBrief: CompanyBrief = {
    summary: 'Cloud infrastructure provider',
    what_they_do: 'Distributed databases and edge compute',
    sources: ['https://example.com'],
  };

  const sampleReqs: Requirement[] = [
    { id: 'r1', text: '5+ years Node.js and TypeScript', kind: 'technical', priority: 'must' },
    { id: 'r2', text: 'Distributed concurrency and database scaling', kind: 'technical', priority: 'must' },
    { id: 'r3', text: 'Mentoring junior engineers and team leadership', kind: 'behavioural', priority: 'must' },
  ];

  it('generates questions with category separation and monotonic IDs (q1..qn)', async () => {
    const res = await generateQuestionsForRequirements(sampleReqs, mockBrief, {
      mock: true,
      nextQuestionIndex: 1,
      roleSeniority: 'Senior',
      roleTitle: 'Senior Backend Engineer',
    });

    expect(res.questions.length).toBeGreaterThan(0);
    expect(res.nextQuestionIndex).toBe(res.questions.length + 1);

    for (const q of res.questions) {
      expect(['technical', 'behavioural', 'system-design', 'company-fit']).toContain(q.category);
      expect([1, 2, 3]).toContain(q.difficulty);
      expect(q.requirement_ids.length).toBeGreaterThan(0);
    }
  });

  it('preserves referential integrity and drops orphan questions rather than falsely attaching them', async () => {
    // Only pass r1
    const singleReq: Requirement[] = [
      { id: 'r1', text: 'Node.js', kind: 'technical', priority: 'must' },
    ];

    const res = await generateQuestionsForRequirements(singleReq, mockBrief, {
      mock: true,
      nextQuestionIndex: 1,
    });

    // All returned questions must strictly point only to valid IDs in singleReq
    for (const q of res.questions) {
      for (const id of q.requirement_ids) {
        expect(id).toBe('r1');
      }
    }
  });

  it('supports direct re-entrance with an offset for Domain 4.2 Second Pass', async () => {
    const gapReqs: Requirement[] = [
      { id: 'r4', text: 'Docker and CI/CD automation', kind: 'technical', priority: 'must' },
    ];

    // Simulate Pass 1 already produced q1..q4, so nextQuestionIndex is 5
    const res = await generateQuestionsForRequirements(gapReqs, mockBrief, {
      mock: true,
      nextQuestionIndex: 5,
    });

    expect(res.questions[0].id).toBe('q5');
    expect(res.nextQuestionIndex).toBe(5 + res.questions.length);
  });
});
