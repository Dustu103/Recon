import { z } from 'zod';
import { RequirementSchema } from './requirement.schema';

/** Appendix A — role block */
export const RoleSchema = z.object({
  title: z.string().min(1),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(RequirementSchema).min(1),
});

export type Role = z.infer<typeof RoleSchema>;
