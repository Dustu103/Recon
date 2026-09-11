import { KitModel } from '../models/kit.model';
import { getUserKitById } from './kit-scoping';
import {
  TaroError,
  ErrorCode,
  PracticeRatingItem,
  PracticeHistoryEntry,
  SpacedRepetitionFilter,
  CONFIDENCE_MAP,
} from '@taro/shared';
import {
  calculateWeakSpotRadar,
  buildSpacedRepetitionQueue,
  getLatestRatingsMap,
} from '@/core';

export class KitPracticeService {
  /**
   * Records a batch of flashcard confidence ratings for a kit practice session.
   *
   * Invariants:
   * 1. Appends entries to practiceHistory array for longitudinal tracking.
   * 2. Updates progress.flashcardMastery for instant UI sync (shaky/good/mastered).
   * 3. Recalculates Spaced Repetition Queue and Weak-Spot Gap Radar.
   */
  static async recordPracticeSession(
    kitId: string,
    userId: string,
    ratings: PracticeRatingItem[]
  ) {
    if (!ratings || !Array.isArray(ratings) || ratings.length === 0) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'At least one practice rating is required');
    }

    const kitDoc = await getUserKitById(kitId, userId);
    if (!kitDoc.kit) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Kit has not finished generation yet');
    }

    const flashcards = kitDoc.kit.flashcards || [];
    const validCardIds = new Set(flashcards.map((f) => f.id));

    // Validate that rated cards actually belong to this kit
    for (const r of ratings) {
      if (!validCardIds.has(r.cardId)) {
        throw new TaroError(
          ErrorCode.INVALID_INPUT,
          `Card ID "${r.cardId}" does not exist in this kit`
        );
      }
    }

    const now = new Date();
    const newHistoryEntries: PracticeHistoryEntry[] = ratings.map((r) => ({
      cardId: r.cardId,
      confidence: r.confidence,
      practicedAt: r.practicedAt ? new Date(r.practicedAt) : now,
    }));

    // Build update payload
    const updateOps: any = {
      $push: {
        practiceHistory: { $each: newHistoryEntries },
      },
      $set: {},
    };

    // Update progress.flashcardMastery atomically
    for (const r of ratings) {
      const label = CONFIDENCE_MAP[r.confidence];
      updateOps.$set[`progress.flashcardMastery.${r.cardId}`] = label;
    }

    // Clean $set if empty
    if (Object.keys(updateOps.$set).length === 0) {
      delete updateOps.$set;
    }

    const updatedDoc = await KitModel.findByIdAndUpdate(kitId, updateOps, {
      new: true,
      lean: true,
    });

    if (!updatedDoc || !updatedDoc.kit) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit document not found after update');
    }

    const updatedHistory: PracticeHistoryEntry[] = updatedDoc.practiceHistory || [];
    const weakSpotRadar = calculateWeakSpotRadar(
      updatedDoc.kit.role,
      updatedDoc.kit.flashcards,
      updatedHistory
    );

    const queue = buildSpacedRepetitionQueue(
      updatedDoc.kit.flashcards,
      updatedHistory,
      'all',
      now
    );

    const latestMap = getLatestRatingsMap(updatedHistory);
    const totalCards = updatedDoc.kit.flashcards.length;
    const practicedCardCount = latestMap.size;
    const coveragePercentage =
      totalCards > 0 ? Math.round((practicedCardCount / totalCards) * 100) : 0;

    return {
      recordedCount: ratings.length,
      coveragePercentage,
      practicedCardCount,
      totalCards,
      weakSpotRadar,
      queue,
    };
  }

  /**
   * Fetches practice analytics, Spaced Repetition Queue, and Weak-Spot Gap Radar.
   */
  static async getPracticeAnalytics(
    kitId: string,
    userId: string,
    filter: SpacedRepetitionFilter = 'all'
  ) {
    const kitDoc = await getUserKitById(kitId, userId);
    if (!kitDoc.kit) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Kit has not finished generation yet');
    }

    const flashcards = kitDoc.kit.flashcards || [];
    const history: PracticeHistoryEntry[] = kitDoc.practiceHistory || [];
    const now = new Date();

    const weakSpotRadar = calculateWeakSpotRadar(
      kitDoc.kit.role,
      flashcards,
      history
    );

    const queue = buildSpacedRepetitionQueue(flashcards, history, filter, now);
    const latestMap = getLatestRatingsMap(history);
    const totalCards = flashcards.length;
    const practicedCardCount = latestMap.size;
    const coveragePercentage =
      totalCards > 0 ? Math.round((practicedCardCount / totalCards) * 100) : 0;

    return {
      totalCards,
      practicedCardCount,
      coveragePercentage,
      weakSpotRadar,
      queue,
    };
  }
}
