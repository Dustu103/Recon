import { z } from 'zod';
import { Flashcard } from './flashcard.schema';
import { Requirement } from './requirement.schema';

/**
 * D7 Practice Confidence Scale:
 * 1: Shaky (Needs Review)
 * 2: Good (Familiar)
 * 3: Mastered (Confident)
 */
export const PracticeConfidenceSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export type PracticeConfidence = z.infer<typeof PracticeConfidenceSchema>;

export type ConfidenceLabel = 'shaky' | 'good' | 'mastered';

export const CONFIDENCE_MAP: Record<PracticeConfidence, ConfidenceLabel> = {
  1: 'shaky',
  2: 'good',
  3: 'mastered',
};

export const LABEL_TO_CONFIDENCE: Record<ConfidenceLabel, PracticeConfidence> = {
  shaky: 1,
  good: 2,
  mastered: 3,
};

/**
 * Individual practice rating submitted by candidate
 */
export const PracticeRatingItemSchema = z.object({
  cardId: z.string().regex(/^f\d+$/, 'Card ID must follow format f1, f2, ...'),
  confidence: PracticeConfidenceSchema,
  practicedAt: z.string().datetime({ offset: true }).optional(),
});

export type PracticeRatingItem = z.infer<typeof PracticeRatingItemSchema>;

/**
 * Batch session input schema for POST /api/kits/:id/practice
 */
export const PracticeSessionInputSchema = z.object({
  ratings: z.array(PracticeRatingItemSchema).min(1, 'At least one rating must be provided'),
});

export type PracticeSessionInput = z.infer<typeof PracticeSessionInputSchema>;

/**
 * In-memory / MongoDB stored practice entry
 */
export interface PracticeHistoryEntry {
  cardId: string;
  confidence: PracticeConfidence;
  practicedAt: Date | string;
}

/**
 * Spaced Repetition Queue Filters
 */
export type SpacedRepetitionFilter = 'all' | 'shaky' | 'unpracticed';

/**
 * Card representation in Spaced Repetition Queue
 */
export interface SpacedRepetitionCard {
  card: Flashcard;
  weight: number;
  lastPracticedAt: Date | null;
  lastConfidence: PracticeConfidence | null;
  isUnpracticed: boolean;
}

/**
 * Granular requirement readiness output for Weak-Spot Gap Radar
 */
export interface RequirementReadiness {
  requirementId: string;
  text: string;
  kind: Requirement['kind'];
  priority: Requirement['priority'];
  readiness: number; // 0 to 100 percentage
  totalLinkedCards: number;
  practicedCardCount: number;
  unpracticedCardCount: number;
  isDangerZone: boolean; // priority === 'must' && readiness === 0 && totalLinkedCards > 0
  isPartiallyUnprepared: boolean; // priority === 'must' && (readiness < 50 || unpracticedCardCount > 0) && !isDangerZone
}

/**
 * Aggregated Weak-Spot Gap Radar analysis
 */
export interface WeakSpotRadarAnalysis {
  overallReadiness: number; // 0 to 100 percentage
  totalMustRequirements: number;
  dangerZoneCount: number;
  hasDangerZone: boolean;
  requirements: RequirementReadiness[];
}
