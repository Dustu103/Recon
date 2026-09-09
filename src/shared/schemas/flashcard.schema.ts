import { z } from 'zod';

/** Appendix A — a single flashcard inside flashcards[] */
export const FlashcardSchema = z.object({
  /** Stable ID, e.g. "f1". Must match /^f\d+$/ */
  id: z.string().regex(/^f\d+$/, 'Flashcard ID must be f1, f2, … format'),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string().regex(/^r\d+$/)),
});

export type Flashcard = z.infer<typeof FlashcardSchema>;
