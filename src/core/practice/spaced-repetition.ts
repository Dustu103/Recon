import {
  Flashcard,
  PracticeHistoryEntry,
  SpacedRepetitionCard,
  SpacedRepetitionFilter,
} from '@taro/shared';
import { getLatestRatingsMap } from './history-reducer';

/**
 * Parses numeric index from card ID (e.g. "f12" -> 12).
 */
function parseCardIndex(cardId: string): number {
  const match = cardId.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Builds the Spaced Repetition Queue for a flashcard deck.
 *
 * Weight Formula for practiced cards:
 *   weight = (4 - lastConfidence) * (1 / max(0.01, daysSinceLastPractice) + 1)
 *
 * For unpracticed cards:
 *   weight = Infinity (guarantees highest urgency)
 *
 * @param flashcards Full array of kit flashcards
 * @param practiceHistory Historical append-only ratings
 * @param filter 'all' | 'shaky' | 'unpracticed'
 * @param now Reference timestamp for determinism in testing
 */
export function buildSpacedRepetitionQueue(
  flashcards: Flashcard[],
  practiceHistory?: PracticeHistoryEntry[] | null,
  filter: SpacedRepetitionFilter = 'all',
  now: Date = new Date()
): SpacedRepetitionCard[] {
  if (!flashcards || flashcards.length === 0) {
    return [];
  }

  const latestMap = getLatestRatingsMap(practiceHistory);
  const nowTime = now.getTime();

  const cardsWithWeight: SpacedRepetitionCard[] = flashcards.map((card) => {
    const latest = latestMap.get(card.id);

    if (!latest) {
      return {
        card,
        weight: Infinity,
        lastPracticedAt: null,
        lastConfidence: null,
        isUnpracticed: true,
      };
    }

    const lastPracticedAt = latest.practicedAt;
    const diffMs = Math.max(0, nowTime - lastPracticedAt.getTime());
    const daysSince = diffMs / (1000 * 60 * 60 * 24);
    const safeDays = Math.max(0.01, daysSince);

    // Confidence 1 (Shaky) gets 4 - 1 = 3 multiplier
    // Confidence 2 (Good) gets 4 - 2 = 2 multiplier
    // Confidence 3 (Mastered) gets 4 - 3 = 1 multiplier
    const confidenceMultiplier = 4 - latest.confidence;
    const recencyFactor = 1 / safeDays + 1;
    const weight = confidenceMultiplier * recencyFactor;

    return {
      card,
      weight,
      lastPracticedAt,
      lastConfidence: latest.confidence,
      isUnpracticed: false,
    };
  });

  // Apply filters
  let filtered = cardsWithWeight;
  if (filter === 'shaky') {
    filtered = cardsWithWeight.filter(
      (c) => c.isUnpracticed || c.lastConfidence === 1
    );
  } else if (filter === 'unpracticed') {
    filtered = cardsWithWeight.filter((c) => c.isUnpracticed);
  }

  // Sort descending by weight, tie-breaking by card numeric id ascending
  return filtered.sort((a, b) => {
    if (a.weight !== b.weight) {
      return b.weight - a.weight;
    }
    return parseCardIndex(a.card.id) - parseCardIndex(b.card.id);
  });
}
