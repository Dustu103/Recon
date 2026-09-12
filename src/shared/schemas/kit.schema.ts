import { z } from 'zod';
import { SourceSchema } from './source.schema';
import { CompanyBriefSchema } from './company-brief.schema';
import { RoleSchema } from './role.schema';
import { QuestionSchema } from './question.schema';
import { FlashcardSchema } from './flashcard.schema';
import { ScheduleSchema } from './schedule.schema';
import { CoverageSchema } from './coverage.schema';

/**
 * D0.3 — Full Appendix A Kit Schema
 *
 * This is the canonical contract. Every generated kit is validated against
 * this schema before being saved to MongoDB or written to the batch output.
 *
 * Do NOT add fields here without also updating Appendix B compliance tests.
 */
export const KitSchema = z
  .object({
    source: SourceSchema,
    company_brief: CompanyBriefSchema,
    role: RoleSchema,
    questions: z.array(QuestionSchema).min(1),
    flashcards: z.array(FlashcardSchema),
    schedule: ScheduleSchema,
    coverage: CoverageSchema,
    schema_version: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // 0. Enforce unique IDs within the kit
    const seenReqIds = new Set<string>();
    data.role.requirements.forEach((r, idx) => {
      if (seenReqIds.has(r.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate requirement ID "${r.id}" in role.requirements`,
          path: ['role', 'requirements', idx, 'id'],
        });
      }
      seenReqIds.add(r.id);
    });

    const seenQIds = new Set<string>();
    data.questions.forEach((q, idx) => {
      if (seenQIds.has(q.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate question ID "${q.id}" in questions`,
          path: ['questions', idx, 'id'],
        });
      }
      seenQIds.add(q.id);
    });

    const seenFIds = new Set<string>();
    data.flashcards.forEach((f, idx) => {
      if (seenFIds.has(f.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate flashcard ID "${f.id}" in flashcards`,
          path: ['flashcards', idx, 'id'],
        });
      }
      seenFIds.add(f.id);
    });

    // 1. All question.requirement_ids must exist in role.requirements
    const reqIds = seenReqIds;
    data.questions.forEach((q, qIdx) => {
      q.requirement_ids.forEach((rId, rIdx) => {
        if (!reqIds.has(rId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Question "${q.id}" references non-existent requirement ID "${rId}"`,
            path: ['questions', qIdx, 'requirement_ids', rIdx],
          });
        }
      });
    });

    // 2. All flashcard.requirement_ids must exist in role.requirements
    data.flashcards.forEach((f, fIdx) => {
      f.requirement_ids.forEach((rId, rIdx) => {
        if (!reqIds.has(rId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Flashcard "${f.id}" references non-existent requirement ID "${rId}"`,
            path: ['flashcards', fIdx, 'requirement_ids', rIdx],
          });
        }
      });
    });

    // 3. All schedule.days[].question_ids must exist in questions
    const qIds = new Set(data.questions.map((q) => q.id));
    data.schedule.days.forEach((day, dayIdx) => {
      day.question_ids.forEach((qId, qIdx) => {
        if (!qIds.has(qId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Schedule day ${day.day} references non-existent question ID "${qId}"`,
            path: ['schedule', 'days', dayIdx, 'question_ids', qIdx],
          });
        }
      });
    });

    // 4. Coverage consistency: uncovered_requirement_ids must exist in role.requirements
    // and CANNOT be simultaneously covered by any question in questions[]
    const coveredReqIds = new Set<string>();
    data.questions.forEach((q) => {
      q.requirement_ids.forEach((rId) => coveredReqIds.add(rId));
    });

    data.coverage.uncovered_requirement_ids.forEach((rId, idx) => {
      if (!reqIds.has(rId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Coverage references non-existent requirement ID "${rId}"`,
          path: ['coverage', 'uncovered_requirement_ids', idx],
        });
      }
      if (coveredReqIds.has(rId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Coverage inconsistency: requirement "${rId}" is listed as uncovered but is covered by a question`,
          path: ['coverage', 'uncovered_requirement_ids', idx],
        });
      }
    });
  });

export type Kit = z.infer<typeof KitSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Appendix B — Batch Output Schema
// ─────────────────────────────────────────────────────────────────────────────

const BatchErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

const BatchKitEntrySchema = z.discriminatedUnion('status', [
  z.object({
    id: z.string().min(1),
    status: z.literal('ok'),
    kit: KitSchema,
    error: z.null(),
  }),
  z.object({
    id: z.string().min(1),
    status: z.literal('failed'),
    kit: z.null(),
    error: BatchErrorSchema,
  }),
]);

export const BatchOutputSchema = z.object({
  version: z.literal('1.0'),
  generated_at: z.string().datetime({ offset: true }),
  kits: z.array(BatchKitEntrySchema),
});

export type BatchKitEntry = z.infer<typeof BatchKitEntrySchema>;
export type BatchOutput = z.infer<typeof BatchOutputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Batch Input Schema (for CLI --input file)
// ─────────────────────────────────────────────────────────────────────────────

export const BatchInputCaseSchema = z.object({
  id: z.string().min(1),
  jd: z.string().min(1),
  company_url: z.string().min(1), // validated further by SSRF shield in core
  days: z.number().int().min(1).max(60),
});

export const BatchInputSchema = z.array(BatchInputCaseSchema).min(1);

export type BatchInputCase = z.infer<typeof BatchInputCaseSchema>;
