import { z } from 'zod';

/**
 * Appendix A — source block
 * Metadata about what was crawled / processed.
 */
export const SourceSchema = z.object({
  company: z.string().min(1),
  company_url: z.string().min(1),
  role: z.string().min(1),
  /** Location from JD, or empty string if not stated. */
  location: z.string(),
  /** Number of characters in the raw job description. */
  jd_chars: z.number().int().nonnegative(),
  /** ISO8601 timestamp of when research ran (UTC or offset). */
  researched_at: z.string().datetime({ offset: true }),
  /** Absolute URLs of pages actually fetched and used. */
  pages_used: z.array(z.string()),
});

export type Source = z.infer<typeof SourceSchema>;
