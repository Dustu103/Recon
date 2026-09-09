import { z } from 'zod';

/** Appendix A — a single requirement inside role.requirements[] */
export const RequirementSchema = z.object({
  /** Stable ID, e.g. "r1", "r2". Must match /^r\d+$/ */
  id: z.string().regex(/^r\d+$/, 'Requirement ID must be r1, r2, … format'),
  text: z.string().min(1),
  kind: z.enum(['technical', 'behavioural', 'domain']),
  priority: z.enum(['must', 'nice']),
});

export type Requirement = z.infer<typeof RequirementSchema>;
