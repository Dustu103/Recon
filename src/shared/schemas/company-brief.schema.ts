import { z } from 'zod';

/** Appendix A — company_brief block */
export const CompanyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
  /** Optional metadata: true if customized via inline editor */
  _edited: z.boolean().optional(),
});

export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;
