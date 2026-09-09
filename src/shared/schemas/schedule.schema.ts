import { z } from 'zod';

/** A single day entry in the study schedule. */
const DaySchema = z.object({
  /** 1-indexed day number. */
  day: z.number().int().min(1),
  /** Human-readable focus label, e.g. "Technical Deep Dive", or empty per Appendix A template. */
  focus: z.string(),
  /** Question IDs scheduled for this day. Must reference existing questions. */
  question_ids: z.array(z.string().regex(/^q\d+$/)),
  /** Integer minutes only — NO floats, NO "about an hour". */
  minutes: z.number().int().nonnegative(),
});

export const ScheduleSchema = z
  .object({
    /** Must exactly equal the user's requested days. */
    days_available: z.number().int().min(1).max(60),
    days: z.array(DaySchema),
  })
  .superRefine((data, ctx) => {
    if (data.days.length !== data.days_available) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Schedule days length (${data.days.length}) must equal days_available (${data.days_available})`,
        path: ['days'],
      });
    }

    data.days.forEach((d, idx) => {
      if (d.day !== idx + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Day at index ${idx} must have day number ${idx + 1}, got ${d.day}`,
          path: ['days', idx, 'day'],
        });
      }

      // Disallow duplicate questions scheduled on the same day
      const seenDayQ = new Set<string>();
      d.question_ids.forEach((qId, qIdx) => {
        if (seenDayQ.has(qId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Day ${d.day} schedules duplicate question "${qId}"`,
            path: ['days', idx, 'question_ids', qIdx],
          });
        }
        seenDayQ.add(qId);
      });
    });
  });

export type Day = z.infer<typeof DaySchema>;
export type Schedule = z.infer<typeof ScheduleSchema>;
