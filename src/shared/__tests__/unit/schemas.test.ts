/**
 * D0.3 — Zod Schema Unit Tests
 * Validates that the Appendix A and B contracts accept valid data
 * and reject specific invalid inputs with named errors.
 */
import { describe, it, expect } from 'vitest';
import {
  SourceSchema,
  CompanyBriefSchema,
  RoleSchema,
  RequirementSchema,
  QuestionSchema,
  FlashcardSchema,
  ScheduleSchema,
  CoverageSchema,
  KitSchema,
  BatchOutputSchema,
  BatchInputCaseSchema,
  BatchInputSchema,
} from '../../schemas/index';

// ── Symmetrical Canonical Fixtures ───────────────────────────────────────────

const validSource = {
  company: 'Acme Corp',
  company_url: 'https://acme.example.com',
  role: 'Senior Engineer',
  location: 'Remote',
  jd_chars: 1500,
  researched_at: '2026-09-01T09:00:00.000Z',
  pages_used: ['https://acme.example.com/careers'],
};

const validCompanyBrief = {
  summary: 'Acme builds developer tools.',
  what_they_do: 'They build CI/CD platforms.',
  sources: ['https://acme.example.com'],
};

const validRequirement = {
  id: 'r1',
  text: '5+ years with React',
  kind: 'technical' as const,
  priority: 'must' as const,
};

const validRole = {
  title: 'Senior Engineer',
  seniority: 'Senior',
  responsibilities: ['Design systems', 'Mentor juniors'],
  requirements: [validRequirement],
};

const validQuestion = {
  id: 'q1',
  requirement_ids: ['r1'],
  category: 'technical' as const,
  prompt: 'Explain React reconciliation',
  answer_outline: 'Virtual DOM diffing, fiber scheduler…',
  difficulty: 2 as const,
};

const validFlashcard = {
  id: 'f1',
  front: 'What is React reconciliation?',
  back: 'The process by which React updates the DOM…',
  requirement_ids: ['r1'],
};

const validSchedule = {
  days_available: 1,
  days: [
    { day: 1, focus: 'Technical', question_ids: ['q1'], minutes: 60 },
  ],
};

const validCoverage = {
  uncovered_requirement_ids: [],
  passes: 1,
};

const validKit = {
  source: validSource,
  company_brief: validCompanyBrief,
  role: validRole,
  questions: [validQuestion],
  flashcards: [validFlashcard],
  schedule: validSchedule,
  coverage: validCoverage,
};

const validBatchInputCase = {
  id: 'case-01',
  jd: 'Senior TypeScript Engineer with React expertise',
  company_url: 'https://acme.example.com',
  days: 5,
};

// ── Source Schema Tests ───────────────────────────────────────────────────────

describe('SourceSchema', () => {
  it('accepts a valid source payload', () => {
    expect(() => SourceSchema.parse(validSource)).not.toThrow();
  });

  it('accepts researched_at with timezone offset', () => {
    const source = { ...validSource, researched_at: '2026-09-08T23:52:03+05:30' };
    expect(() => SourceSchema.parse(source)).not.toThrow();
  });

  it('accepts empty string for location', () => {
    const source = { ...validSource, location: '' };
    expect(() => SourceSchema.parse(source)).not.toThrow();
  });

  it('rejects empty company name', () => {
    const result = SourceSchema.safeParse({ ...validSource, company: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty company_url', () => {
    const result = SourceSchema.safeParse({ ...validSource, company_url: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty role name', () => {
    const result = SourceSchema.safeParse({ ...validSource, role: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative jd_chars', () => {
    const result = SourceSchema.safeParse({ ...validSource, jd_chars: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects float jd_chars', () => {
    const result = SourceSchema.safeParse({ ...validSource, jd_chars: 1200.5 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid researched_at (not ISO 8601)', () => {
    const result = SourceSchema.safeParse({ ...validSource, researched_at: 'not-a-date' });
    expect(result.success).toBe(false);
  });
});

// ── CompanyBrief Schema Tests ─────────────────────────────────────────────────

describe('CompanyBriefSchema', () => {
  it('accepts a valid populated company brief', () => {
    expect(() => CompanyBriefSchema.parse(validCompanyBrief)).not.toThrow();
  });

  it('accepts empty summary and what_they_do for graceful crawl degradation', () => {
    const brief = { summary: '', what_they_do: '', sources: ['https://example.com'] };
    expect(() => CompanyBriefSchema.parse(brief)).not.toThrow();
  });
});

// ── Role Schema Tests ─────────────────────────────────────────────────────────

describe('RoleSchema', () => {
  it('accepts a valid role payload', () => {
    expect(() => RoleSchema.parse(validRole)).not.toThrow();
  });

  it('rejects empty role title', () => {
    const result = RoleSchema.safeParse({ ...validRole, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty requirements array', () => {
    const result = RoleSchema.safeParse({ ...validRole, requirements: [] });
    expect(result.success).toBe(false);
  });

  it('rejects role with invalid requirement child', () => {
    const result = RoleSchema.safeParse({
      ...validRole,
      requirements: [{ id: 'bad-id', text: '', kind: 'technical', priority: 'must' }],
    });
    expect(result.success).toBe(false);
  });
});

// ── Requirement Schema Tests ──────────────────────────────────────────────────

describe('RequirementSchema', () => {
  it('accepts a valid requirement', () => {
    expect(() => RequirementSchema.parse(validRequirement)).not.toThrow();
  });

  it('rejects an invalid ID format (req-1 vs r1)', () => {
    const result = RequirementSchema.safeParse({ ...validRequirement, id: 'req-1' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid kind', () => {
    const result = RequirementSchema.safeParse({ ...validRequirement, kind: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid priority', () => {
    const result = RequirementSchema.safeParse({ ...validRequirement, priority: 'maybe' });
    expect(result.success).toBe(false);
  });

  it('rejects empty requirement text', () => {
    const result = RequirementSchema.safeParse({ ...validRequirement, text: '' });
    expect(result.success).toBe(false);
  });
});

// ── Question Schema Tests ─────────────────────────────────────────────────────

describe('QuestionSchema', () => {
  it('accepts a valid question', () => {
    expect(() => QuestionSchema.parse(validQuestion)).not.toThrow();
  });

  it('rejects float difficulty (e.g. 1.5)', () => {
    const result = QuestionSchema.safeParse({ ...validQuestion, difficulty: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects difficulty 0', () => {
    const result = QuestionSchema.safeParse({ ...validQuestion, difficulty: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects difficulty 4', () => {
    const result = QuestionSchema.safeParse({ ...validQuestion, difficulty: 4 });
    expect(result.success).toBe(false);
  });

  it('accepts empty requirement_ids (for manual or general questions)', () => {
    const result = QuestionSchema.safeParse({ ...validQuestion, requirement_ids: [] });
    expect(result.success).toBe(true);
  });

  it('rejects empty prompt', () => {
    const result = QuestionSchema.safeParse({ ...validQuestion, prompt: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty answer_outline', () => {
    const result = QuestionSchema.safeParse({ ...validQuestion, answer_outline: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid question ID format', () => {
    const result = QuestionSchema.safeParse({ ...validQuestion, id: 'question-1' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category', () => {
    const result = QuestionSchema.safeParse({ ...validQuestion, category: 'unknown-category' });
    expect(result.success).toBe(false);
  });
});

// ── Flashcard Schema Tests ────────────────────────────────────────────────────

describe('FlashcardSchema', () => {
  it('accepts a valid flashcard', () => {
    expect(() => FlashcardSchema.parse(validFlashcard)).not.toThrow();
  });

  it('rejects an invalid ID format (card-1 vs f1)', () => {
    const result = FlashcardSchema.safeParse({ ...validFlashcard, id: 'card-1' });
    expect(result.success).toBe(false);
  });

  it('rejects empty front text', () => {
    const result = FlashcardSchema.safeParse({ ...validFlashcard, front: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty back text', () => {
    const result = FlashcardSchema.safeParse({ ...validFlashcard, back: '' });
    expect(result.success).toBe(false);
  });

  it('accepts empty requirement_ids (for general flashcards)', () => {
    const result = FlashcardSchema.safeParse({ ...validFlashcard, requirement_ids: [] });
    expect(result.success).toBe(true);
  });

  it('rejects invalid requirement ID in requirement_ids', () => {
    const result = FlashcardSchema.safeParse({
      ...validFlashcard,
      requirement_ids: ['invalid-id'],
    });
    expect(result.success).toBe(false);
  });
});

// ── Coverage Schema Tests ─────────────────────────────────────────────────────

describe('CoverageSchema', () => {
  it('accepts valid coverage with passes and empty uncovered list', () => {
    expect(() => CoverageSchema.parse(validCoverage)).not.toThrow();
  });

  it('accepts coverage with valid uncovered requirement IDs', () => {
    const result = CoverageSchema.safeParse({ uncovered_requirement_ids: ['r1', 'r2'], passes: 2 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid requirement ID format in uncovered list', () => {
    const result = CoverageSchema.safeParse({ uncovered_requirement_ids: ['invalid-id'], passes: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects passes < 1', () => {
    const result = CoverageSchema.safeParse({ uncovered_requirement_ids: [], passes: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects float passes', () => {
    const result = CoverageSchema.safeParse({ uncovered_requirement_ids: [], passes: 1.5 });
    expect(result.success).toBe(false);
  });
});

// ── Schedule Schema Tests ─────────────────────────────────────────────────────

describe('ScheduleSchema', () => {
  it('accepts a valid schedule', () => {
    expect(() => ScheduleSchema.parse(validSchedule)).not.toThrow();
  });

  it('accepts empty focus string per canonical Appendix A template', () => {
    const result = ScheduleSchema.safeParse({
      days_available: 1,
      days: [{ day: 1, focus: '', question_ids: ['q1'], minutes: 60 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects float minutes', () => {
    const result = ScheduleSchema.safeParse({
      days_available: 1,
      days: [{ day: 1, focus: 'Tech', question_ids: ['q1'], minutes: 60.5 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative minutes', () => {
    const result = ScheduleSchema.safeParse({
      days_available: 1,
      days: [{ day: 1, focus: 'Tech', question_ids: ['q1'], minutes: -15 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects days_available < 1', () => {
    const result = ScheduleSchema.safeParse({ days_available: 0, days: [] });
    expect(result.success).toBe(false);
  });

  it('rejects days_available > 60', () => {
    const result = ScheduleSchema.safeParse({ ...validSchedule, days_available: 61 });
    expect(result.success).toBe(false);
  });

  it('rejects schedule where days.length does not match days_available', () => {
    const result = ScheduleSchema.safeParse({
      days_available: 3,
      days: [{ day: 1, focus: 'Tech', question_ids: ['q1'], minutes: 60 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('must equal days_available');
    }
  });

  it('rejects schedule with non-sequential day numbering', () => {
    const result = ScheduleSchema.safeParse({
      days_available: 2,
      days: [
        { day: 1, focus: 'Tech', question_ids: ['q1'], minutes: 60 },
        { day: 3, focus: 'Tech', question_ids: ['q1'], minutes: 60 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects schedule with duplicate questions scheduled on the same day', () => {
    const result = ScheduleSchema.safeParse({
      days_available: 1,
      days: [{ day: 1, focus: 'Tech', question_ids: ['q1', 'q1'], minutes: 60 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('schedules duplicate question "q1"');
    }
  });
});

// ── Full Kit Schema Test ──────────────────────────────────────────────────────

describe('KitSchema', () => {
  it('accepts a complete valid kit', () => {
    expect(() => KitSchema.parse(validKit)).not.toThrow();
  });

  it('rejects kit with missing source.company', () => {
    const bad = { ...validKit, source: { ...validKit.source, company: '' } };
    const result = KitSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects kit with invalid researched_at (not ISO8601)', () => {
    const bad = { ...validKit, source: { ...validKit.source, researched_at: '2026-09-01' } };
    const result = KitSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects kit where question references non-existent requirement ID', () => {
    const bad = {
      ...validKit,
      questions: [{ ...validQuestion, requirement_ids: ['r999'] }],
    };
    const result = KitSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('references non-existent requirement ID "r999"');
    }
  });

  it('rejects kit with duplicate requirement ID', () => {
    const bad = {
      ...validKit,
      role: {
        ...validKit.role,
        requirements: [
          validRequirement,
          { ...validRequirement, text: 'Another text' }, // same id: 'r1'
        ],
      },
    };
    const result = KitSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('Duplicate requirement ID "r1"');
    }
  });

  it('rejects kit with duplicate question ID', () => {
    const bad = {
      ...validKit,
      questions: [
        validQuestion,
        { ...validQuestion, prompt: 'Another prompt' }, // same id: 'q1'
      ],
    };
    const result = KitSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('Duplicate question ID "q1"');
    }
  });

  it('rejects kit with duplicate flashcard ID', () => {
    const bad = {
      ...validKit,
      flashcards: [
        validFlashcard,
        { ...validFlashcard, front: 'Another front' }, // same id: 'f1'
      ],
    };
    const result = KitSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('Duplicate flashcard ID "f1"');
    }
  });

  it('rejects kit where flashcard references non-existent requirement ID', () => {
    const bad = {
      ...validKit,
      flashcards: [{ ...validFlashcard, requirement_ids: ['r999'] }],
    };
    const result = KitSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('Flashcard "f1" references non-existent requirement ID "r999"');
    }
  });

  it('rejects kit where schedule day references non-existent question ID', () => {
    const bad = {
      ...validKit,
      schedule: {
        days_available: 1,
        days: [{ day: 1, focus: 'Tech', question_ids: ['q999'], minutes: 60 }],
      },
    };
    const result = KitSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('Schedule day 1 references non-existent question ID "q999"');
    }
  });

  it('rejects kit where coverage uncovered list references non-existent requirement ID', () => {
    const bad = {
      ...validKit,
      coverage: {
        uncovered_requirement_ids: ['r999'],
        passes: 1,
      },
    };
    const result = KitSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('Coverage references non-existent requirement ID "r999"');
    }
  });

  it('rejects kit where requirement is both covered by a question and listed as uncovered', () => {
    const contradictoryKit = {
      ...validKit,
      // validKit has q1 covering r1
      coverage: {
        uncovered_requirement_ids: ['r1'], // Contradiction: r1 is covered by q1!
        passes: 1,
      },
    };
    const result = KitSchema.safeParse(contradictoryKit);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('Coverage inconsistency');
    }
  });
});

// ── Appendix B BatchOutputSchema ─────────────────────────────────────────────

describe('BatchOutputSchema', () => {
  it('accepts a valid batch output with ok and failed entries', () => {
    const output = {
      version: '1.0',
      generated_at: '2026-09-01T09:12:44.000Z',
      kits: [
        { id: 'case-01', status: 'ok', kit: validKit, error: null },
        {
          id: 'case-04',
          status: 'failed',
          kit: null,
          error: { code: 'COMPANY_UNREACHABLE', message: 'Site unreachable after 3 retries.' },
        },
      ],
    };
    expect(() => BatchOutputSchema.parse(output)).not.toThrow();
  });

  it('accepts generated_at with timezone offset (e.g. +05:30 or +00:00)', () => {
    const output = {
      version: '1.0' as const,
      generated_at: '2026-09-08T23:52:03+05:30',
      kits: [],
    };
    expect(() => BatchOutputSchema.parse(output)).not.toThrow();
  });

  it('rejects invalid version number', () => {
    const output = {
      version: '2.0',
      generated_at: '2026-09-08T23:52:03Z',
      kits: [],
    };
    const result = BatchOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});

// ── Section 9 BatchInputSchema & BatchInputCaseSchema ────────────────────────

describe('BatchInputSchema & BatchInputCaseSchema', () => {
  it('accepts a valid batch input case', () => {
    expect(() => BatchInputCaseSchema.parse(validBatchInputCase)).not.toThrow();
  });

  it('accepts an array of valid cases with BatchInputSchema', () => {
    const cases = [
      validBatchInputCase,
      { id: 'case-02', jd: 'Frontend Lead', company_url: 'https://example.com', days: 10 },
    ];
    expect(() => BatchInputSchema.parse(cases)).not.toThrow();
  });

  it('rejects days < 1', () => {
    const result = BatchInputCaseSchema.safeParse({ ...validBatchInputCase, days: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects days > 60', () => {
    const result = BatchInputCaseSchema.safeParse({ ...validBatchInputCase, days: 61 });
    expect(result.success).toBe(false);
  });

  it('rejects float days', () => {
    const result = BatchInputCaseSchema.safeParse({ ...validBatchInputCase, days: 3.5 });
    expect(result.success).toBe(false);
  });

  it('rejects empty jd string', () => {
    const result = BatchInputCaseSchema.safeParse({ ...validBatchInputCase, jd: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty id string', () => {
    const result = BatchInputCaseSchema.safeParse({ ...validBatchInputCase, id: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty company_url string', () => {
    const result = BatchInputCaseSchema.safeParse({ ...validBatchInputCase, company_url: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty batch cases array', () => {
    const result = BatchInputSchema.safeParse([]);
    expect(result.success).toBe(false);
  });
});
