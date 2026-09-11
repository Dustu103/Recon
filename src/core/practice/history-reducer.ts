import { PracticeHistoryEntry, PracticeConfidence } from '@taro/shared';

export interface ResolvedLatestRating {
  cardId: string;
  confidence: PracticeConfidence;
  practicedAt: Date;
  index: number;
}

/**
 * Normalizes Date | string to a valid Date object.
 */
export function normalizeDate(dateInput: Date | string | undefined | null): Date {
  if (!dateInput) return new Date();
  const d = new Date(dateInput);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Extracts the latest rating for each unique cardId from practiceHistory.
 * 
 * Invariants:
 * 1. Primary sort: practicedAt timestamp descending.
 * 2. Deterministic Tie-Breaker: When timestamps are identical (e.g. sub-millisecond
 *    in automated test runs), higher array index (later entry in append-only array) wins.
 */
export function getLatestRatingsMap(
  practiceHistory?: PracticeHistoryEntry[] | null
): Map<string, ResolvedLatestRating> {
  const map = new Map<string, ResolvedLatestRating>();
  if (!practiceHistory || !Array.isArray(practiceHistory) || practiceHistory.length === 0) {
    return map;
  }

  for (let idx = 0; idx < practiceHistory.length; idx++) {
    const entry = practiceHistory[idx];
    if (!entry || !entry.cardId || !entry.confidence) continue;

    const practicedAt = normalizeDate(entry.practicedAt);
    const existing = map.get(entry.cardId);

    if (!existing) {
      map.set(entry.cardId, {
        cardId: entry.cardId,
        confidence: entry.confidence,
        practicedAt,
        index: idx,
      });
      continue;
    }

    const currentTimestamp = practicedAt.getTime();
    const existingTimestamp = existing.practicedAt.getTime();

    // Timestamp takes priority. If equal, later index in the array wins.
    if (
      currentTimestamp > existingTimestamp ||
      (currentTimestamp === existingTimestamp && idx > existing.index)
    ) {
      map.set(entry.cardId, {
        cardId: entry.cardId,
        confidence: entry.confidence,
        practicedAt,
        index: idx,
      });
    }
  }

  return map;
}
