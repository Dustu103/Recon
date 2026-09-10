import { describe, it, expect } from 'vitest';
import { extractRequirements } from '../../step1-extract';
import { TaroError, ErrorCode } from '@taro/shared';

describe('Step 1: JD Requirement Extractor', () => {
  it('throws INVALID_INPUT on empty or whitespace JD', async () => {
    await expect(extractRequirements('')).rejects.toThrow(TaroError);
    try {
      await extractRequirements('   ');
    } catch (err) {
      expect((err as TaroError).code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  it('extracts role, responsibilities, and monotonic requirement IDs (r1..rn)', async () => {
    const jd = `
      Senior Backend Engineer
      We are looking for a Senior Backend Engineer to join our platform team.
      Responsibilities:
      - Build high-throughput APIs in Node.js and TypeScript.
      - Manage PostgreSQL schemas and migrations.
      Requirements:
      - 5+ years of production experience with TypeScript.
      - Deep familiarity with relational databases.
      - Preferred: Experience with Kubernetes.
    `;

    const res = await extractRequirements(jd, { mock: true });

    expect(res.role.title).toBe('Senior Software Engineer');
    expect(res.role.seniority).toBe('Senior');
    expect(res.role.requirements.length).toBeGreaterThan(0);

    // Monotonic IDs
    const ids = res.role.requirements.map((r) => r.id);
    expect(ids).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(res.nextRequirementIndex).toBe(6);

    // Schema conformance
    for (const req of res.role.requirements) {
      expect(['technical', 'behavioural', 'domain']).toContain(req.kind);
      expect(['must', 'nice']).toContain(req.priority);
    }
  });

  it('handles thin 2-line stub without crashing or inflating requirements', async () => {
    const thinJd = 'Looking for a React developer with Redux experience.';
    const res = await extractRequirements(thinJd, { mock: true });

    expect(res.isThinJd).toBe(true);
    expect(res.role.requirements.length).toBeGreaterThan(0);
  });
});
