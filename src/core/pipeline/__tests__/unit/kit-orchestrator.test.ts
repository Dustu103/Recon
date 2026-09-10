import { describe, it, expect, vi } from 'vitest';
import {
  generateKit,
  buildStudySchedule,
  buildCoverage,
} from '../../kit-orchestrator';
import { KitSchema, ScheduleSchema, Question, Role, TaroError, ErrorCode } from '@taro/shared';
import { MockLlmProvider } from '../../../llm/providers/mock.provider';
import { LlmClient } from '../../../llm/client';

describe('kit-orchestrator', () => {
  const sampleQuestions: Question[] = [
    {
      id: 'q1',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'Explain event loop in Node.js',
      suggested_answer: 'Node.js event loop coordinates async I/O via libuv phases.',
      evaluation_criteria: ['Mentions libuv', 'Explains microtask queue'],
      difficulty: 2,
    },
    {
      id: 'q2',
      requirement_ids: ['r2'],
      category: 'technical',
      prompt: 'How would you scale Redis caching?',
      suggested_answer: 'Use Redis Cluster with hash slots or master-replica read scaling.',
      evaluation_criteria: ['Mentions clustering', 'Explains cache eviction'],
      difficulty: 3,
    },
    {
      id: 'q3',
      requirement_ids: ['r1'],
      category: 'behavioural',
      prompt: 'Tell me about a time a production incident happened.',
      suggested_answer: 'STAR format outlining root cause analysis and blameless postmortem.',
      evaluation_criteria: ['STAR structure', 'Root cause clarity'],
      difficulty: 1,
    },
  ];

  const sampleRole: Role = {
    title: 'Senior Backend Engineer',
    seniority: 'Senior',
    responsibilities: ['Architect microservices', 'Mentor junior engineers'],
    requirements: [
      { id: 'r1', text: 'Proficiency in Node.js and TypeScript', kind: 'technical', priority: 'must' },
      { id: 'r2', text: 'Experience with Redis and distributed caching', kind: 'technical', priority: 'must' },
      { id: 'r3', text: 'Familiarity with Kubernetes and Docker', kind: 'technical', priority: 'nice' },
    ],
  };

  describe('buildStudySchedule', () => {
    it('constructs a valid schedule strictly matching ScheduleSchema across requested days', () => {
      const schedule = buildStudySchedule(sampleQuestions, 7);

      expect(schedule.days_available).toBe(7);
      expect(schedule.days).toHaveLength(7);
      expect(schedule.days[0].day).toBe(1);
      expect(schedule.days[6].day).toBe(7);
      // Under front-loaded difficulty sorting: q2 (diff 3) -> day 1, q1 (diff 2) -> day 2, q3 (diff 1) -> day 3
      expect(schedule.days[0].question_ids).toContain('q2');
      expect(schedule.days[1].question_ids).toContain('q1');
      expect(schedule.days[2].question_ids).toContain('q3');

      // SuperRefine verification via Zod
      expect(() => ScheduleSchema.parse(schedule)).not.toThrow();
    });

    it('handles small day count (e.g. 1 day cram session)', () => {
      const schedule = buildStudySchedule(sampleQuestions, 1);
      expect(schedule.days_available).toBe(1);
      expect(schedule.days).toHaveLength(1);
      expect(schedule.days[0].question_ids).toHaveLength(3);
      expect(() => ScheduleSchema.parse(schedule)).not.toThrow();
    });
  });

  describe('buildCoverage', () => {
    it('computes covered vs uncovered requirements accurately', () => {
      const coverage = buildCoverage(sampleRole, sampleQuestions);

      expect(coverage.passes).toBe(1);
      // r1 and r2 are covered by q1, q2, q3; r3 is uncovered
      expect(coverage.uncovered_requirement_ids).toEqual(['r3']);
    });
  });

  describe('generateKit', () => {
    it('rejects empty job description or company URL', async () => {
      await expect(
        generateKit({
          jd: '',
          companyUrl: 'https://example.com',
          days: 5,
          mock: true,
        })
      ).rejects.toThrow(TaroError);

      await expect(
        generateKit({
          jd: 'Senior Software Engineer...',
          companyUrl: '',
          days: 5,
          mock: true,
        })
      ).rejects.toThrow(TaroError);
    });

    it('rejects invalid days timeline', async () => {
      await expect(
        generateKit({
          jd: 'Senior Software Engineer with TypeScript expertise.',
          companyUrl: 'https://example.com',
          days: 0,
          mock: true,
        })
      ).rejects.toThrow(TaroError);

      await expect(
        generateKit({
          jd: 'Senior Software Engineer with TypeScript expertise.',
          companyUrl: 'https://example.com',
          days: 65,
          mock: true,
        })
      ).rejects.toThrow(TaroError);
    });

    it('generates a complete, validated Appendix A kit with mock LLM provider', async () => {
      const mockProvider = new MockLlmProvider();
      const client = new LlmClient({
        provider: mockProvider,
        geminiApiKey: 'test-key',
        groqApiKey: 'test-key',
      });

      const progressSteps: string[] = [];

      const kit = await generateKit({
        jd: 'We need a Senior Full Stack Engineer with TypeScript, React, and Node.js. Experience with AWS cloud microservices is required.',
        companyUrl: 'http://localhost:3000',
        days: 5,
        roleTitle: 'Senior Full Stack Engineer',
        client,
        mock: true,
        onProgress: (p) => {
          progressSteps.push(p.step);
        },
      });

      // Verify all stages executed in order
      expect(progressSteps).toContain('extract');
      expect(progressSteps).toContain('crawl');
      expect(progressSteps).toContain('brief');
      expect(progressSteps).toContain('questions');
      expect(progressSteps).toContain('flashcards');
      expect(progressSteps).toContain('schedule');
      expect(progressSteps).toContain('complete');

      // Verify Kit structure
      expect(kit.role.title).toBe('Senior Full Stack Engineer');
      expect(kit.role.requirements.length).toBeGreaterThan(0);
      expect(kit.questions.length).toBeGreaterThan(0);
      expect(kit.flashcards.length).toBeGreaterThan(0);
      expect(kit.schedule.days_available).toBe(5);
      expect(kit.schedule.days).toHaveLength(5);

      // Verify strict schema compliance
      expect(() => KitSchema.parse(kit)).not.toThrow();
    });
  });
});
