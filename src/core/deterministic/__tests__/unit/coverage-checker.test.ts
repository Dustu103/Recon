import { describe, it, expect } from 'vitest';
import { checkCoverage, buildCoverageEnvelope } from '../../coverage-checker';
import { Requirement, Question } from '@taro/shared';

describe('coverage-checker (Domain 4.1)', () => {
  const reqMust1: Requirement = { id: 'r1', text: 'TypeScript & Node.js', kind: 'technical', priority: 'must' };
  const reqMust2: Requirement = { id: 'r2', text: 'System Architecture', kind: 'technical', priority: 'must' };
  const reqNice1: Requirement = { id: 'r3', text: 'GraphQL knowledge', kind: 'technical', priority: 'nice' };
  const reqNice2: Requirement = { id: 'r4', text: 'Kubernetes deployment', kind: 'technical', priority: 'nice' };

  it('reports 100% coverage when all requirements are covered by questions', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1', 'r3'],
        category: 'technical',
        prompt: 'Explain TS types',
        answer_outline: 'TS type system...',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2', 'r4'],
        category: 'system-design',
        prompt: 'Design scalable backend',
        answer_outline: 'Microservices architecture...',
        difficulty: 3,
      },
    ];

    const result = checkCoverage([reqMust1, reqMust2, reqNice1, reqNice2], questions);

    expect(result.isFullyCovered).toBe(true);
    expect(result.hasMustGaps).toBe(false);
    expect(result.uncoveredIds).toHaveLength(0);
    expect(result.uncoveredMustIds).toHaveLength(0);
    expect(result.uncoveredNiceIds).toHaveLength(0);
    expect(result.coveredMustCount).toBe(2);
    expect(result.totalMustCount).toBe(2);
    expect(result.coveragePercentage).toBe(100);
  });

  it('accurately identifies must-have gaps and nice-to-have gaps', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Explain TS types',
        answer_outline: 'TS type system...',
        difficulty: 2,
      },
    ];

    const result = checkCoverage([reqMust1, reqMust2, reqNice1, reqNice2], questions);

    expect(result.isFullyCovered).toBe(false);
    expect(result.hasMustGaps).toBe(true);
    expect(result.uncoveredIds).toEqual(['r2', 'r3', 'r4']);
    expect(result.uncoveredMustIds).toEqual(['r2']);
    expect(result.uncoveredNiceIds).toEqual(['r3', 'r4']);
    expect(result.coveredMustCount).toBe(1);
    expect(result.totalMustCount).toBe(2);
    expect(result.coveragePercentage).toBe(25);
  });

  it('differentiates when all must-haves are covered but nice-to-haves remain uncovered', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1', 'r2'],
        category: 'technical',
        prompt: 'Node & Architecture',
        answer_outline: 'Outline...',
        difficulty: 3,
      },
    ];

    const result = checkCoverage([reqMust1, reqMust2, reqNice1], questions);

    expect(result.isFullyCovered).toBe(false);
    expect(result.hasMustGaps).toBe(false);
    expect(result.uncoveredIds).toEqual(['r3']);
    expect(result.uncoveredMustIds).toEqual([]);
    expect(result.uncoveredNiceIds).toEqual(['r3']);
    expect(result.coveredMustCount).toBe(2);
    expect(result.totalMustCount).toBe(2);
    expect(result.coveragePercentage).toBe(67);
  });

  it('handles empty requirements array gracefully without throwing', () => {
    const result = checkCoverage([], []);
    expect(result.isFullyCovered).toBe(true);
    expect(result.hasMustGaps).toBe(false);
    expect(result.uncoveredIds).toEqual([]);
    expect(result.coveragePercentage).toBe(100);
  });

  it('buildCoverageEnvelope produces Appendix A compliant schema object and clamps passes', () => {
    const env1 = buildCoverageEnvelope(['r3', 'r4'], 1);
    expect(env1.uncovered_requirement_ids).toEqual(['r3', 'r4']);
    expect(env1.passes).toBe(1);

    const env2 = buildCoverageEnvelope([], 2);
    expect(env2.uncovered_requirement_ids).toEqual([]);
    expect(env2.passes).toBe(2);

    // Clamping checks
    const envClampedLow = buildCoverageEnvelope([], 0);
    expect(envClampedLow.passes).toBe(1);

    const envClampedHigh = buildCoverageEnvelope([], 5);
    expect(envClampedHigh.passes).toBe(2);
  });
});
