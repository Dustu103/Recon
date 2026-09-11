import {
  Role,
  Flashcard,
  PracticeHistoryEntry,
  RequirementReadiness,
  WeakSpotRadarAnalysis,
} from '@taro/shared';
import { getLatestRatingsMap } from './history-reducer';

/**
 * Calculates the Weak-Spot Gap Radar analysis for a kit.
 *
 * Maps flashcard confidence history directly back to role requirements.
 *
 * Formula per requirement:
 *   readiness = (sum of confidence ratings for linked cards) / (total_linked_cards * 3) * 100
 *
 * Invariants:
 * 1. Unpracticed cards contribute 0 in the numerator, but 3 in the denominator (N * 3).
 * 2. If total_linked_cards === 0, readiness = 0% (zero-overstatement guarantee).
 * 3. isDangerZone is true strictly when a 'must' requirement has 0 practice recorded.
 * 4. isPartiallyUnprepared is true when a 'must' requirement has partial practice (< 50% or unpracticed cards remaining).
 */
export function calculateWeakSpotRadar(
  role: Role,
  flashcards: Flashcard[],
  practiceHistory?: PracticeHistoryEntry[] | null
): WeakSpotRadarAnalysis {
  const requirements = role?.requirements || [];
  if (requirements.length === 0) {
    return {
      overallReadiness: 0,
      totalMustRequirements: 0,
      dangerZoneCount: 0,
      hasDangerZone: false,
      requirements: [],
    };
  }

  const latestMap = getLatestRatingsMap(practiceHistory);

  // Inverted index: requirementId -> Flashcard[]
  const reqToCards = new Map<string, Flashcard[]>();
  for (const card of flashcards || []) {
    for (const rId of card.requirement_ids || []) {
      const list = reqToCards.get(rId) || [];
      list.push(card);
      reqToCards.set(rId, list);
    }
  }

  let totalReadinessSum = 0;
  let totalMustCount = 0;
  let dangerZoneCount = 0;

  const requirementReadinessList: RequirementReadiness[] = requirements.map((req) => {
    const isMust = req.priority === 'must';
    if (isMust) {
      totalMustCount++;
    }

    const linkedCards = reqToCards.get(req.id) || [];
    const totalLinkedCards = linkedCards.length;

    // Zero-overstatement rule: 0 cards linked -> 0% readiness
    if (totalLinkedCards === 0) {
      const isDanger = isMust;
      if (isDanger) {
        dangerZoneCount++;
      }
      return {
        requirementId: req.id,
        text: req.text,
        kind: req.kind,
        priority: req.priority,
        readiness: 0,
        totalLinkedCards: 0,
        practicedCardCount: 0,
        unpracticedCardCount: 0,
        isDangerZone: isDanger,
        isPartiallyUnprepared: false,
      };
    }

    let sumConfidence = 0;
    let practicedCardCount = 0;

    for (const card of linkedCards) {
      const rating = latestMap.get(card.id);
      if (rating) {
        sumConfidence += rating.confidence;
        practicedCardCount++;
      }
    }

    const unpracticedCardCount = totalLinkedCards - practicedCardCount;
    const maxPossible = totalLinkedCards * 3;
    const rawReadiness = (sumConfidence / maxPossible) * 100;
    // Round to 1 decimal place or whole number
    const readiness = Math.round(rawReadiness);

    totalReadinessSum += readiness;

    // Strict Danger Zone: 'must' requirement with ZERO cards practiced
    const isDangerZone = isMust && practicedCardCount === 0;
    if (isDangerZone) {
      dangerZoneCount++;
    }

    // Partially Unprepared: 'must' requirement with some practice, but readiness < 50% or unpracticed cards remaining
    const isPartiallyUnprepared =
      isMust &&
      !isDangerZone &&
      (readiness < 50 || unpracticedCardCount > 0);

    return {
      requirementId: req.id,
      text: req.text,
      kind: req.kind,
      priority: req.priority,
      readiness,
      totalLinkedCards,
      practicedCardCount,
      unpracticedCardCount,
      isDangerZone,
      isPartiallyUnprepared,
    };
  });

  const overallReadiness =
    requirements.length > 0
      ? Math.round(totalReadinessSum / requirements.length)
      : 0;

  return {
    overallReadiness,
    totalMustRequirements: totalMustCount,
    dangerZoneCount,
    hasDangerZone: dangerZoneCount > 0,
    requirements: requirementReadinessList,
  };
}
