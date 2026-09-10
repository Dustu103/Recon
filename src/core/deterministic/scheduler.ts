/**
 * Domain 4.3: Contiguous Block Study Scheduler
 * Partitions questions across requested preparation days enforcing:
 * 1. Lexicographic sorting: (difficulty DESC, isMust DESC, id ASC)
 * 2. Front-loaded difficulty invariant: day[0].avgDifficulty >= day[N-1].avgDifficulty
 * 3. Front-loaded remainder distribution (earlier days absorb extra questions)
 * 4. Deterministic category tie-breaking for daily focus themes
 * 5. Complete NaN guards (0-question edge case returns 0 minutes)
 * 6. Spaced repetition review backfill for sparse schedules
 */
import { Requirement, Question, Schedule, Day, ScheduleSchema } from '@taro/shared';

const MINUTES_BY_DIFFICULTY: Record<number, number> = {
  1: 30, // Easy / foundations
  2: 45, // Medium / core
  3: 60, // Hard / deep dive
};

const CATEGORY_PRECEDENCE: Record<Question['category'], number> = {
  'system-design': 4,
  technical: 3,
  behavioural: 2,
  'company-fit': 1,
};

const CATEGORY_TITLES: Record<Question['category'], string> = {
  'system-design': 'System Architecture & Distributed Design',
  technical: 'Core Technical Competencies & Problem Solving',
  behavioural: 'Behavioral Competencies & Leadership Scenarios',
  'company-fit': 'Company Alignment & Culture Fit',
};

/**
 * Determines whether a question addresses at least one must-have requirement.
 */
function isQuestionMustHave(q: Question, mustRequirementIds: Set<string>): boolean {
  if (!Array.isArray(q.requirement_ids) || q.requirement_ids.length === 0) {
    return false;
  }
  return q.requirement_ids.some((rId) => mustRequirementIds.has(rId));
}

/**
 * Determines the dominant focus topic for a day's questions with deterministic tie-breaking.
 */
function determineDayFocus(
  dayQuestions: Question[],
  isLastDay: boolean,
  daysCount: number
): string {
  if (isLastDay && daysCount > 1) {
    return 'Final Mock Interview & Comprehensive Review';
  }

  if (dayQuestions.length === 0) {
    return 'Review & Self-Directed Study';
  }

  // Count frequencies per category
  const categoryCounts: Partial<Record<Question['category'], number>> = {};
  for (const q of dayQuestions) {
    categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
  }

  // Find dominant category, breaking ties using CATEGORY_PRECEDENCE
  let bestCategory: Question['category'] = dayQuestions[0].category;
  let maxCount = -1;
  let bestPrecedence = -1;

  for (const [catStr, count] of Object.entries(categoryCounts)) {
    const category = catStr as Question['category'];
    const precedence = CATEGORY_PRECEDENCE[category] ?? 0;

    if (
      count > maxCount ||
      (count === maxCount && precedence > bestPrecedence)
    ) {
      bestCategory = category;
      maxCount = count;
      bestPrecedence = precedence;
    }
  }

  return CATEGORY_TITLES[bestCategory] || 'Technical Preparation & Practice';
}

/**
 * Calculates estimated daily minutes based on question difficulties.
 * Guarantees integer minutes >= 0 without NaN.
 */
function calculateDailyMinutes(dayQuestions: Question[]): number {
  if (!dayQuestions || dayQuestions.length === 0) {
    return 0;
  }
  return dayQuestions.reduce((sum, q) => {
    const difficultyTime = MINUTES_BY_DIFFICULTY[q.difficulty] || 45;
    return sum + difficultyTime;
  }, 0);
}

/**
 * Builds a deterministic day-by-day study schedule strictly conforming to ScheduleSchema.
 */
export function buildSchedule(
  questions: Question[],
  requirements: Requirement[],
  daysAvailable: number
): Schedule {
  // Clamp days between 1 and 60
  const daysCount = Math.max(1, Math.min(60, Math.floor(daysAvailable)));

  // Identify must-have requirement IDs
  const mustReqIds = new Set(
    (requirements || [])
      .filter((r) => r.priority === 'must')
      .map((r) => r.id)
  );

  // 1. Lexicographic sort: (difficulty DESC, isMust DESC, id ASC)
  const sortedQuestions = [...questions].sort((a, b) => {
    // Primary: Difficulty descending (3 > 2 > 1)
    if (b.difficulty !== a.difficulty) {
      return b.difficulty - a.difficulty;
    }

    // Secondary: Must-have descending (must > nice)
    const aMust = isQuestionMustHave(a, mustReqIds) ? 1 : 0;
    const bMust = isQuestionMustHave(b, mustReqIds) ? 1 : 0;
    if (bMust !== aMust) {
      return bMust - aMust;
    }

    // Tertiary: ID ascending (deterministic tie-breaker)
    return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
  });

  const days: Day[] = [];
  const totalQuestions = sortedQuestions.length;

  // Case A: 0 Questions (Degenerate edge-case)
  if (totalQuestions === 0) {
    for (let dayNum = 1; dayNum <= daysCount; dayNum++) {
      days.push({
        day: dayNum,
        focus:
          dayNum === daysCount && daysCount > 1
            ? 'Final Review & Preparation'
            : 'Review & Self-Directed Study',
        question_ids: [],
        minutes: 0,
      });
    }

    const schedule: Schedule = {
      days_available: daysCount,
      days,
    };
    ScheduleSchema.parse(schedule);
    return schedule;
  }

  // Case B: Sparse Schedule (0 < questions.length < daysCount)
  if (totalQuestions < daysCount) {
    for (let i = 0; i < daysCount; i++) {
      const dayNum = i + 1;
      const isInitialDay = i < totalQuestions;

      let assignedQuestion: Question;
      let focus: string;

      if (isInitialDay) {
        // First pass: 1 question per day in difficulty order
        assignedQuestion = sortedQuestions[i];
        focus = determineDayFocus([assignedQuestion], dayNum === daysCount, daysCount);
      } else {
        // Subsequent days: Spaced repetition review of earlier questions
        const reviewIndex = (i - totalQuestions) % totalQuestions;
        assignedQuestion = sortedQuestions[reviewIndex];
        focus =
          dayNum === daysCount && daysCount > 1
            ? 'Final Comprehensive Review & Mock Practice'
            : `Spaced Repetition & Review (${CATEGORY_TITLES[assignedQuestion.category]})`;
      }

      days.push({
        day: dayNum,
        focus,
        question_ids: [assignedQuestion.id],
        minutes: calculateDailyMinutes([assignedQuestion]),
      });
    }

    const schedule: Schedule = {
      days_available: daysCount,
      days,
    };
    ScheduleSchema.parse(schedule);
    return schedule;
  }

  // Case C: Normal Distribution (questions.length >= daysCount)
  // Partition questions into contiguous blocks with front-loaded remainders
  const baseCount = Math.floor(totalQuestions / daysCount);
  const remainder = totalQuestions % daysCount;

  let sliceStart = 0;
  for (let i = 0; i < daysCount; i++) {
    const dayNum = i + 1;
    // Distribute remainder items to the earliest days
    const countForDay = baseCount + (i < remainder ? 1 : 0);
    const sliceEnd = sliceStart + countForDay;
    const dayQuestions = sortedQuestions.slice(sliceStart, sliceEnd);
    sliceStart = sliceEnd;

    const isLastDay = dayNum === daysCount;
    const focus = determineDayFocus(dayQuestions, isLastDay, daysCount);

    days.push({
      day: dayNum,
      focus,
      question_ids: dayQuestions.map((q) => q.id),
      minutes: calculateDailyMinutes(dayQuestions),
    });
  }

  const schedule: Schedule = {
    days_available: daysCount,
    days,
  };

  ScheduleSchema.parse(schedule);
  return schedule;
}

/**
 * Calculates average difficulty per day in a schedule, given the question pool.
 * Empty days return 0.
 */
export function calculateScheduleDailyAvgDifficulty(
  schedule: Schedule,
  questions: Question[]
): number[] {
  const qMap = new Map(questions.map((q) => [q.id, q]));

  return schedule.days.map((d) => {
    if (d.question_ids.length === 0) return 0;
    const totalDiff = d.question_ids.reduce((sum, qId) => {
      const q = qMap.get(qId);
      return sum + (q ? q.difficulty : 0);
    }, 0);
    return totalDiff / d.question_ids.length;
  });
}
