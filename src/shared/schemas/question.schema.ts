import { z } from 'zod';

/** Appendix A — a single question inside questions[] */
export const QuestionSchema = z.object({
  /** Stable ID, e.g. "q1". Must match /^q\d+$/ */
  id: z.string().regex(/^q\d+$/, 'Question ID must be q1, q2, … format'),
  /** IDs of requirements this question covers (empty for manual/general questions). */
  requirement_ids: z.array(z.string().regex(/^r\d+$/)),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
  prompt: z.string().min(1),
  answer_outline: z.string().min(1),
  /** 1 = easy, 2 = medium, 3 = hard. Exact integer — no floats. */
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export type Question = z.infer<typeof QuestionSchema>;
