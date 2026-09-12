import { describe, it, expect } from 'vitest';
import {
  buildSchedule,
  calculateScheduleDailyAvgDifficulty,
  moveScheduledQuestion,
} from '../../scheduler';
import { Question, Requirement, ScheduleSchema } from '@taro/shared';

describe('scheduler (Domain 4.3)', () => {
  const reqMust: Requirement = { id: 'r1', text: 'Core Architecture', kind: 'technical', priority: 'must' };
  const reqNice: Requirement = { id: 'r2', text: 'Optional tooling', kind: 'technical', priority: 'nice' };
  const sampleReqs: Requirement[] = [reqMust, reqNice];

  it('enforces lexicographic sort (difficulty DESC, isMust DESC, id ASC)', () => {
    const questions: Question[] = [
      { id: 'q1', requirement_ids: ['r2'], category: 'technical', prompt: 'q1 nice diff 2', answer_outline: 'ans', difficulty: 2 },
      { id: 'q2', requirement_ids: ['r1'], category: 'technical', prompt: 'q2 must diff 2', answer_outline: 'ans', difficulty: 2 },
      { id: 'q3', requirement_ids: ['r2'], category: 'technical', prompt: 'q3 nice diff 3', answer_outline: 'ans', difficulty: 3 },
      { id: 'q4', requirement_ids: ['r1'], category: 'technical', prompt: 'q4 must diff 1', answer_outline: 'ans', difficulty: 1 },
      { id: 'q5', requirement_ids: ['r1'], category: 'technical', prompt: 'q5 must diff 3', answer_outline: 'ans', difficulty: 3 },
      { id: 'q6', requirement_ids: ['r1'], category: 'technical', prompt: 'q6 must diff 2', answer_outline: 'ans', difficulty: 2 },
    ];

    const schedule = buildSchedule(questions, sampleReqs, 1);
    const day1QIds = schedule.days[0].question_ids;

    // Expected order:
    // Diff 3: q5 (must), q3 (nice)
    // Diff 2: q2 (must, id q2), q6 (must, id q6), q1 (nice)
    // Diff 1: q4 (must)
    expect(day1QIds).toEqual(['q5', 'q3', 'q2', 'q6', 'q1', 'q4']);
  });

  it('protects front-loading guarantee against counterexample (3 diff-1 musts + 3 diff-3 nices across 2 days)', () => {
    // Counterexample where must-tier-first would have grouped diff-1 on day 1 (avg 1) and diff-3 on day 2 (avg 3)
    const questions: Question[] = [
      { id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'm1', answer_outline: 'ans', difficulty: 1 },
      { id: 'q2', requirement_ids: ['r1'], category: 'technical', prompt: 'm2', answer_outline: 'ans', difficulty: 1 },
      { id: 'q3', requirement_ids: ['r1'], category: 'technical', prompt: 'm3', answer_outline: 'ans', difficulty: 1 },
      { id: 'q4', requirement_ids: ['r2'], category: 'technical', prompt: 'n1', answer_outline: 'ans', difficulty: 3 },
      { id: 'q5', requirement_ids: ['r2'], category: 'technical', prompt: 'n2', answer_outline: 'ans', difficulty: 3 },
      { id: 'q6', requirement_ids: ['r2'], category: 'technical', prompt: 'n3', answer_outline: 'ans', difficulty: 3 },
    ];

    const schedule = buildSchedule(questions, sampleReqs, 2);
    const avgDiffs = calculateScheduleDailyAvgDifficulty(schedule, questions);

    // Day 1 has three diff-3 questions (avg = 3.0)
    // Day 2 has three diff-1 questions (avg = 1.0)
    expect(avgDiffs[0]).toBe(3.0);
    expect(avgDiffs[1]).toBe(1.0);
    expect(avgDiffs[0]).toBeGreaterThanOrEqual(avgDiffs[1]);
  });

  it('strictly satisfies day[0].avgDifficulty >= day[N-1].avgDifficulty across varied question sets', () => {
    const questions: Question[] = [
      { id: 'q1', requirement_ids: ['r1'], category: 'system-design', prompt: 'p1', answer_outline: 'a1', difficulty: 3 },
      { id: 'q2', requirement_ids: ['r1'], category: 'system-design', prompt: 'p2', answer_outline: 'a2', difficulty: 3 },
      { id: 'q3', requirement_ids: ['r1'], category: 'technical', prompt: 'p3', answer_outline: 'a3', difficulty: 2 },
      { id: 'q4', requirement_ids: ['r2'], category: 'technical', prompt: 'p4', answer_outline: 'a4', difficulty: 2 },
      { id: 'q5', requirement_ids: ['r2'], category: 'behavioural', prompt: 'p5', answer_outline: 'a5', difficulty: 2 },
      { id: 'q6', requirement_ids: ['r1'], category: 'behavioural', prompt: 'p6', answer_outline: 'a6', difficulty: 1 },
      { id: 'q7', requirement_ids: ['r2'], category: 'company-fit', prompt: 'p7', answer_outline: 'a7', difficulty: 1 },
    ];

    for (const days of [2, 3, 5, 7]) {
      const schedule = buildSchedule(questions, sampleReqs, days);
      const avgDiffs = calculateScheduleDailyAvgDifficulty(schedule, questions);

      expect(schedule.days_available).toBe(days);
      expect(schedule.days).toHaveLength(days);
      expect(avgDiffs[0]).toBeGreaterThanOrEqual(avgDiffs[days - 1]);
      expect(() => ScheduleSchema.parse(schedule)).not.toThrow();
    }
  });

  it('front-loads remainders: 10 questions across 3 days yields 4 / 3 / 3', () => {
    const tenQuestions: Question[] = Array.from({ length: 10 }, (_, i) => ({
      id: `q${i + 1}`,
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: `prompt ${i + 1}`,
      answer_outline: 'outline',
      difficulty: (i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1) as 1 | 2 | 3,
    }));

    const schedule = buildSchedule(tenQuestions, sampleReqs, 3);

    expect(schedule.days[0].question_ids).toHaveLength(4);
    expect(schedule.days[1].question_ids).toHaveLength(3);
    expect(schedule.days[2].question_ids).toHaveLength(3);
    expect(() => ScheduleSchema.parse(schedule)).not.toThrow();
  });

  it('handles 0-question degenerate case safely without NaN, returning minutes = 0', () => {
    const schedule = buildSchedule([], sampleReqs, 5);

    expect(schedule.days_available).toBe(5);
    expect(schedule.days).toHaveLength(5);

    schedule.days.forEach((day, idx) => {
      expect(day.day).toBe(idx + 1);
      expect(day.question_ids).toEqual([]);
      expect(day.minutes).toBe(0);
      expect(Number.isNaN(day.minutes)).toBe(false);
    });

    expect(() => ScheduleSchema.parse(schedule)).not.toThrow();
  });

  it('handles sparse schedule (3 questions, 7 days) with spaced repetition and zero duplicate question IDs per day', () => {
    const threeQuestions: Question[] = [
      { id: 'q1', requirement_ids: ['r1'], category: 'system-design', prompt: 'Arch', answer_outline: 'a', difficulty: 3 },
      { id: 'q2', requirement_ids: ['r1'], category: 'technical', prompt: 'Algorithms', answer_outline: 'a', difficulty: 2 },
      { id: 'q3', requirement_ids: ['r2'], category: 'behavioural', prompt: 'Conflict', answer_outline: 'a', difficulty: 1 },
    ];

    const schedule = buildSchedule(threeQuestions, sampleReqs, 7);

    expect(schedule.days_available).toBe(7);
    expect(schedule.days).toHaveLength(7);

    // Verify first 3 days have questions in decreasing order
    expect(schedule.days[0].question_ids).toEqual(['q1']);
    expect(schedule.days[1].question_ids).toEqual(['q2']);
    expect(schedule.days[2].question_ids).toEqual(['q3']);

    // Trailing days 4-7 backfill spaced repetition
    expect(schedule.days[3].question_ids).toEqual(['q1']);
    expect(schedule.days[4].question_ids).toEqual(['q2']);
    expect(schedule.days[5].question_ids).toEqual(['q3']);
    expect(schedule.days[6].question_ids).toEqual(['q1']);

    // Verify endpoint invariant holds
    const avgDiffs = calculateScheduleDailyAvgDifficulty(schedule, threeQuestions);
    expect(avgDiffs[0]).toBeGreaterThanOrEqual(avgDiffs[6]);

    // SuperRefine check: no duplicates within any single day
    expect(() => ScheduleSchema.parse(schedule)).not.toThrow();
  });

  it('breaks category tie deterministically: system-design > technical > behavioural > company-fit', () => {
    // 1 system-design vs 1 technical -> system-design wins
    const sysVsTech: Question[] = [
      { id: 'q1', requirement_ids: ['r1'], category: 'system-design', prompt: 'p', answer_outline: 'a', difficulty: 2 },
      { id: 'q2', requirement_ids: ['r1'], category: 'technical', prompt: 'p', answer_outline: 'a', difficulty: 2 },
    ];
    const sched1 = buildSchedule(sysVsTech, sampleReqs, 1);
    expect(sched1.days[0].focus).toContain('System Architecture');

    // 1 technical vs 1 behavioural -> technical wins
    const techVsBeh: Question[] = [
      { id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'p', answer_outline: 'a', difficulty: 2 },
      { id: 'q2', requirement_ids: ['r1'], category: 'behavioural', prompt: 'p', answer_outline: 'a', difficulty: 2 },
    ];
    const sched2 = buildSchedule(techVsBeh, sampleReqs, 1);
    expect(sched2.days[0].focus).toContain('Technical Competencies');

    // 1 behavioural vs 1 company-fit -> behavioural wins
    const behVsFit: Question[] = [
      { id: 'q1', requirement_ids: ['r1'], category: 'behavioural', prompt: 'p', answer_outline: 'a', difficulty: 2 },
      { id: 'q2', requirement_ids: ['r1'], category: 'company-fit', prompt: 'p', answer_outline: 'a', difficulty: 2 },
    ];
    const sched3 = buildSchedule(behVsFit, sampleReqs, 1);
    expect(sched3.days[0].focus).toContain('Behavioral Competencies');
  });

  it('computes integer minutes based on question difficulties without decimals', () => {
    const questions: Question[] = [
      { id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'p1', answer_outline: 'a1', difficulty: 3 }, // 60m
      { id: 'q2', requirement_ids: ['r1'], category: 'technical', prompt: 'p2', answer_outline: 'a2', difficulty: 2 }, // 45m
    ];

    const schedule = buildSchedule(questions, sampleReqs, 1);
    expect(schedule.days[0].minutes).toBe(105);
    expect(Number.isInteger(schedule.days[0].minutes)).toBe(true);
  });

  describe('moveScheduledQuestion', () => {
    it('moves a question from Day 1 to Day 2 and recomputes minutes and focus correctly', () => {
      const questions: Question[] = [
        { id: 'q1', requirement_ids: ['r1'], category: 'system-design', prompt: 'Arch', answer_outline: 'a', difficulty: 3 }, // 60m
        { id: 'q2', requirement_ids: ['r1'], category: 'technical', prompt: 'Coding', answer_outline: 'a', difficulty: 2 },     // 45m
      ];

      const initialSchedule = buildSchedule(questions, sampleReqs, 2);
      expect(initialSchedule.days[0].question_ids).toContain('q1');
      expect(initialSchedule.days[1].question_ids).toContain('q2');
      expect(initialSchedule.days[0].minutes).toBe(60);
      expect(initialSchedule.days[1].minutes).toBe(45);

      // Move q1 to Day 2
      const updatedSchedule = moveScheduledQuestion(initialSchedule, questions, 'q1', 2);
      expect(updatedSchedule.days[0].question_ids).toEqual([]);
      expect(updatedSchedule.days[0].minutes).toBe(0);
      expect(updatedSchedule.days[1].question_ids).toEqual(['q2', 'q1']);
      expect(updatedSchedule.days[1].minutes).toBe(105);
      expect(() => ScheduleSchema.parse(updatedSchedule)).not.toThrow();
    });

    it('throws when targetDay is out of bounds or question does not exist', () => {
      const questions: Question[] = [
        { id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'Coding', answer_outline: 'a', difficulty: 1 },
      ];
      const schedule = buildSchedule(questions, sampleReqs, 2);

      expect(() => moveScheduledQuestion(schedule, questions, 'q1', 3)).toThrow('Target day 3 is out of bounds');
      expect(() => moveScheduledQuestion(schedule, questions, 'q999', 1)).toThrow('does not exist');
    });
  });
});

