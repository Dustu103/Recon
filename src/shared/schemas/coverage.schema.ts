import { z } from 'zod';

/** Appendix A — coverage block */
export const CoverageSchema = z.object({
  /**
   * Requirement IDs that have zero questions after all passes.
   * Empty array = full coverage.
   */
  uncovered_requirement_ids: z.array(z.string().regex(/^r\d+$/)),
  /** Number of coverage passes executed (min 1, max 2 per plan). */
  passes: z.number().int().min(1),
});

export type Coverage = z.infer<typeof CoverageSchema>;
