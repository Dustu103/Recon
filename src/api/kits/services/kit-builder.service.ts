/**
 * Domain 6: Kit Builder & Workspace Mutation Service
 *
 * Implements granular inline editing, manual additions, cascading deletes with OCC (__v),
 * drag-and-drop category reordering, candidate progress tracking, and section regeneration.
 */
import mongoose from 'mongoose';
import {
  TaroError,
  ErrorCode,
  Kit,
  KitSchema,
  Question,
  QuestionCategory,
  Flashcard,
  nextOffsetFromIds,
} from '@taro/shared';
import { KitModel, IKit } from '../models/kit.model';
import { getUserKitById } from './kit-scoping';
import {
  regenerateQuestionsCategory,
  regenerateCompanyBrief,
  regenerateFlashcards,
} from '@/core';
import { checkCoverage, buildCoverageEnvelope } from '@/core/deterministic/coverage-checker';
import { buildSchedule } from '@/core/deterministic/scheduler';

export interface ActiveRegeneration {
  kitId: string;
  section: 'questions' | 'flashcards' | 'company_brief';
  category?: QuestionCategory;
  startedAt: Date;
}

// In-memory active regeneration tracking for instantaneous duplicate detection
const activeRegenerations = new Map<string, ActiveRegeneration>();

function makeRegenerationKey(kitId: string, section: string, category?: string): string {
  return `${kitId}:${section}:${category || 'all'}`;
}

export class KitBuilderService {
  /**
   * Validates that the targeted category or section is not actively locked by an in-flight regeneration.
   */
  private static checkRegenerationLock(kit: IKit, section: string, category?: string): void {
    if (!kit.regenerationLock) return;

    const lock = kit.regenerationLock;
    const isExpired = lock.expiresAt && new Date(lock.expiresAt).getTime() <= Date.now();
    if (isExpired) return;

    if (lock.section === section && (!category || !lock.category || lock.category === category)) {
      throw new TaroError(
        ErrorCode.CONCURRENT_MODIFICATION,
        `Section "${section}"${category ? ` (category: ${category})` : ''} is currently undergoing regeneration. Please wait for completion.`
      );
    }
  }

  /**
   * Inline edits a single question (prompt, answer_outline, difficulty, category).
   * Automatically marks _edited: true.
   */
  static async patchQuestion(
    kitId: string,
    userId: string,
    questionId: string,
    patch: {
      prompt?: string;
      answer_outline?: string;
      difficulty?: 1 | 2 | 3;
      category?: QuestionCategory;
    }
  ): Promise<Question> {
    const kit = await getUserKitById(kitId, userId);
    if (!kit.kit) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit has no generated content');
    }

    const question = (kit.kit.questions || []).find((q) => q.id === questionId);
    if (!question) {
      throw new TaroError(ErrorCode.NOT_FOUND, `Question "${questionId}" not found in kit`);
    }

    // Guard against editing questions in a category currently regenerating
    this.checkRegenerationLock(kit, 'questions', question.category);
    if (patch.category && patch.category !== question.category) {
      this.checkRegenerationLock(kit, 'questions', patch.category);
    }

    const updateFields: Record<string, any> = {
      'kit.questions.$[elem]._edited': true,
      updatedAt: new Date(),
    };

    if (patch.prompt !== undefined && patch.prompt.trim().length > 0) {
      updateFields['kit.questions.$[elem].prompt'] = patch.prompt.trim();
    }
    if (patch.answer_outline !== undefined && patch.answer_outline.trim().length > 0) {
      updateFields['kit.questions.$[elem].answer_outline'] = patch.answer_outline.trim();
    }
    if (patch.difficulty !== undefined) {
      updateFields['kit.questions.$[elem].difficulty'] = patch.difficulty;
    }
    if (patch.category !== undefined) {
      updateFields['kit.questions.$[elem].category'] = patch.category;
    }

    const updated = await KitModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(userId),
      },
      {
        $set: updateFields,
        $inc: { __v: 1 },
      },
      {
        arrayFilters: [{ 'elem.id': questionId }],
        new: true,
      }
    );

    if (!updated || !updated.kit) {
      throw new TaroError(ErrorCode.NOT_FOUND, 'Kit could not be updated');
    }

    const updatedQ = updated.kit.questions.find((q) => q.id === questionId);
    if (!updatedQ) {
      throw new TaroError(ErrorCode.NOT_FOUND, 'Updated question could not be found');
    }

    return updatedQ;
  }

  /**
   * Adds a manually-created question with a monotonic ID and _manual: true.
   */
  static async addManualQuestion(
    kitId: string,
    userId: string,
    payload: {
      category: QuestionCategory;
      prompt: string;
      answer_outline: string;
      difficulty?: 1 | 2 | 3;
      requirement_ids?: string[];
    }
  ): Promise<Question> {
    const kit = await getUserKitById(kitId, userId);
    if (!kit.kit) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit has no generated content');
    }

    this.checkRegenerationLock(kit, 'questions', payload.category);

    const existingQuestions = kit.kit.questions || [];
    const nextId = Math.max(
      kit.nextQuestionIndex || 1,
      nextOffsetFromIds('q', existingQuestions.map((q) => q.id)) + 1
    );
    const questionId = `q${nextId}`;

    const newQuestion: Question = {
      id: questionId,
      requirement_ids: payload.requirement_ids || [],
      category: payload.category,
      prompt: payload.prompt.trim(),
      answer_outline: payload.answer_outline.trim(),
      difficulty: payload.difficulty ?? 2,
      _manual: true,
    };

    const updated = await KitModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(userId),
        __v: kit.__v,
      },
      {
        $push: { 'kit.questions': newQuestion },
        $set: { nextQuestionIndex: nextId + 1, updatedAt: new Date() },
        $inc: { __v: 1 },
      },
      { new: true }
    );

    if (!updated) {
      throw new TaroError(
        ErrorCode.CONCURRENT_MODIFICATION,
        'Kit was modified concurrently. Please retry.'
      );
    }

    return newQuestion;
  }

  /**
   * Cascading deletes a question, recomputes D4 coverage & schedule, and purges orphaned progress entries.
   * Guarded via Optimistic Concurrency Control (__v).
   */
  static async deleteQuestion(
    kitId: string,
    userId: string,
    questionId: string
  ): Promise<{ success: boolean; remainingCount: number; coverage: any }> {
    const kit = await getUserKitById(kitId, userId);
    if (!kit.kit) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit has no generated content');
    }

    const existingQuestions = kit.kit.questions || [];
    const targetQ = existingQuestions.find((q) => q.id === questionId);
    if (!targetQ) {
      throw new TaroError(ErrorCode.NOT_FOUND, `Question "${questionId}" not found in kit`);
    }

    this.checkRegenerationLock(kit, 'questions', targetQ.category);

    // 1. Remove from questions array
    const remainingQuestions = existingQuestions.filter((q) => q.id !== questionId);

    // 2. Recalculate D4 coverage
    const coverageResult = checkCoverage(kit.kit.role.requirements, remainingQuestions);
    const coverageEnvelope = buildCoverageEnvelope(
      coverageResult.uncoveredIds,
      kit.kit.coverage?.passes || 1
    );

    // 3. Rebuild D4 study schedule to prevent empty days and preserve front-loading
    const daysCount =
      kit.kit.schedule?.days_available ||
      kit.kit.schedule?.days?.length ||
      7;
    const schedule = buildSchedule(remainingQuestions, kit.kit.role.requirements, daysCount);

    const updatedKit: Kit = {
      ...kit.kit,
      questions: remainingQuestions,
      coverage: coverageEnvelope,
      schedule,
    };

    // 4. Validate referential integrity before committing
    KitSchema.parse(updatedKit);

    // 5. Atomic write with OCC (__v) + orphaned progress purge
    const updated = await KitModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(userId),
        __v: kit.__v,
      },
      {
        $set: {
          kit: updatedKit,
          updatedAt: new Date(),
        },
        $unset: {
          [`progress.notes.${questionId}`]: '',
        },
        $pull: {
          'progress.starred': questionId,
        },
        $inc: { __v: 1 },
      },
      { new: true }
    );

    if (!updated) {
      throw new TaroError(
        ErrorCode.CONCURRENT_MODIFICATION,
        'Kit was modified concurrently. Please retry.'
      );
    }

    return {
      success: true,
      remainingCount: remainingQuestions.length,
      coverage: coverageEnvelope,
    };
  }

  /**
   * Reorders questions within a category slice without altering _edited flags.
   */
  static async reorderCategoryQuestions(
    kitId: string,
    userId: string,
    category: QuestionCategory,
    orderedIds: string[]
  ): Promise<Question[]> {
    const kit = await getUserKitById(kitId, userId);
    if (!kit.kit) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit has no generated content');
    }

    this.checkRegenerationLock(kit, 'questions', category);

    const existingQuestions = kit.kit.questions || [];
    const catQuestions = existingQuestions.filter((q) => q.category === category);

    // Verify all IDs match exactly the category slice
    const existingCatIdSet = new Set(catQuestions.map((q) => q.id));
    if (
      orderedIds.length !== catQuestions.length ||
      !orderedIds.every((id) => existingCatIdSet.has(id))
    ) {
      throw new TaroError(
        ErrorCode.INVALID_INPUT,
        `Provided question IDs do not match the ${category} category slice`
      );
    }

    const questionMap = new Map(catQuestions.map((q) => [q.id, q]));
    const reorderedCatSlice = orderedIds.map((id) => questionMap.get(id)!);

    // Assemble new full array: replace category slice while preserving other categories
    const newQuestionsList: Question[] = [];
    let insertedCat = false;

    for (const q of existingQuestions) {
      if (q.category === category) {
        if (!insertedCat) {
          newQuestionsList.push(...reorderedCatSlice);
          insertedCat = true;
        }
      } else {
        newQuestionsList.push(q);
      }
    }

    const updated = await KitModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(userId),
        __v: kit.__v,
      },
      {
        $set: {
          'kit.questions': newQuestionsList,
          updatedAt: new Date(),
        },
        $inc: { __v: 1 },
      },
      { new: true }
    );

    if (!updated) {
      throw new TaroError(
        ErrorCode.CONCURRENT_MODIFICATION,
        'Kit was modified concurrently. Please retry.'
      );
    }

    return reorderedCatSlice;
  }

  /**
   * Inline edits the company brief, setting _edited: true.
   */
  static async patchCompanyBrief(
    kitId: string,
    userId: string,
    patch: { summary?: string; what_they_do?: string }
  ): Promise<any> {
    const kit = await getUserKitById(kitId, userId);
    if (!kit.kit) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit has no generated content');
    }

    this.checkRegenerationLock(kit, 'company_brief');

    const updateFields: Record<string, any> = {
      'kit.company_brief._edited': true,
      updatedAt: new Date(),
    };

    if (patch.summary !== undefined && patch.summary.trim().length > 0) {
      updateFields['kit.company_brief.summary'] = patch.summary.trim();
    }
    if (patch.what_they_do !== undefined && patch.what_they_do.trim().length > 0) {
      updateFields['kit.company_brief.what_they_do'] = patch.what_they_do.trim();
    }

    const updated = await KitModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(userId),
        __v: kit.__v,
      },
      {
        $set: updateFields,
        $inc: { __v: 1 },
      },
      { new: true }
    );

    if (!updated) {
      throw new TaroError(
        ErrorCode.CONCURRENT_MODIFICATION,
        'Kit was modified concurrently. Please retry.'
      );
    }

    return updated.kit?.company_brief;
  }

  /**
   * Inline edits a single flashcard, setting _edited: true.
   */
  static async patchFlashcard(
    kitId: string,
    userId: string,
    flashcardId: string,
    patch: { front?: string; back?: string }
  ): Promise<Flashcard> {
    const kit = await getUserKitById(kitId, userId);
    if (!kit.kit) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit has no generated content');
    }

    this.checkRegenerationLock(kit, 'flashcards');

    const card = (kit.kit.flashcards || []).find((f) => f.id === flashcardId);
    if (!card) {
      throw new TaroError(ErrorCode.NOT_FOUND, `Flashcard "${flashcardId}" not found in kit`);
    }

    const updateFields: Record<string, any> = {
      'kit.flashcards.$[elem]._edited': true,
      updatedAt: new Date(),
    };

    if (patch.front !== undefined && patch.front.trim().length > 0) {
      updateFields['kit.flashcards.$[elem].front'] = patch.front.trim();
    }
    if (patch.back !== undefined && patch.back.trim().length > 0) {
      updateFields['kit.flashcards.$[elem].back'] = patch.back.trim();
    }

    const updated = await KitModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(userId),
      },
      {
        $set: updateFields,
        $inc: { __v: 1 },
      },
      {
        arrayFilters: [{ 'elem.id': flashcardId }],
        new: true,
      }
    );

    if (!updated || !updated.kit) {
      throw new TaroError(ErrorCode.NOT_FOUND, 'Kit could not be updated');
    }

    const updatedCard = updated.kit.flashcards.find((f) => f.id === flashcardId);
    if (!updatedCard) {
      throw new TaroError(ErrorCode.NOT_FOUND, 'Updated flashcard could not be found');
    }

    return updatedCard;
  }

  /**
   * Adds a manually-created flashcard.
   */
  static async addManualFlashcard(
    kitId: string,
    userId: string,
    payload: { front: string; back: string; requirement_ids?: string[] }
  ): Promise<Flashcard> {
    const kit = await getUserKitById(kitId, userId);
    if (!kit.kit) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit has no generated content');
    }

    this.checkRegenerationLock(kit, 'flashcards');

    const existingCards = kit.kit.flashcards || [];
    const nextId = Math.max(
      kit.nextFlashcardIndex || 1,
      nextOffsetFromIds('f', existingCards.map((f) => f.id)) + 1
    );
    const flashcardId = `f${nextId}`;

    const newCard: Flashcard = {
      id: flashcardId,
      front: payload.front.trim(),
      back: payload.back.trim(),
      requirement_ids: payload.requirement_ids || [],
      _manual: true,
    };

    const updated = await KitModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(userId),
        __v: kit.__v,
      },
      {
        $push: { 'kit.flashcards': newCard },
        $set: { nextFlashcardIndex: nextId + 1, updatedAt: new Date() },
        $inc: { __v: 1 },
      },
      { new: true }
    );

    if (!updated) {
      throw new TaroError(
        ErrorCode.CONCURRENT_MODIFICATION,
        'Kit was modified concurrently. Please retry.'
      );
    }

    return newCard;
  }

  /**
   * Deletes a flashcard and cleans up associated mastery tracking.
   */
  static async deleteFlashcard(
    kitId: string,
    userId: string,
    flashcardId: string
  ): Promise<{ success: boolean }> {
    const kit = await getUserKitById(kitId, userId);
    if (!kit.kit) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit has no generated content');
    }

    this.checkRegenerationLock(kit, 'flashcards');

    const existingCards = kit.kit.flashcards || [];
    const remainingCards = existingCards.filter((f) => f.id !== flashcardId);

    const updated = await KitModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(userId),
        __v: kit.__v,
      },
      {
        $set: {
          'kit.flashcards': remainingCards,
          updatedAt: new Date(),
        },
        $unset: {
          [`progress.flashcardMastery.${flashcardId}`]: '',
        },
        $inc: { __v: 1 },
      },
      { new: true }
    );

    if (!updated) {
      throw new TaroError(
        ErrorCode.CONCURRENT_MODIFICATION,
        'Kit was modified concurrently. Please retry.'
      );
    }

    return { success: true };
  }

  /**
   * Initiates single-section regeneration in the background.
   * Returns HTTP 200 with progressUrl on duplicate request.
   */
  static async startSectionRegeneration(
    kitId: string,
    userId: string,
    section: 'questions' | 'flashcards' | 'company_brief',
    category?: QuestionCategory,
    force?: boolean
  ): Promise<{ kitId: string; status: string; progressUrl: string }> {
    const kit = await getUserKitById(kitId, userId);
    if (!kit.kit) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit has no generated content');
    }

    const regKey = makeRegenerationKey(kitId, section, category);

    // 1. Idempotent duplicate check: return 200 if already running
    if (activeRegenerations.has(regKey)) {
      return {
        kitId,
        status: 'generating',
        progressUrl: `/api/kits/${kitId}/progress`,
      };
    }

    // 2. Singleton confirmation check for company brief
    if (section === 'company_brief' && kit.kit.company_brief._edited === true && !force) {
      throw new TaroError(
        ErrorCode.CONFIRMATION_REQUIRED,
        'Company brief contains hand-edits. Pass force: true to overwrite.'
      );
    }

    // 3. Register lock in-memory and in DB document (60s expiry)
    const lockExpiry = new Date(Date.now() + 60000);
    activeRegenerations.set(regKey, {
      kitId,
      section,
      category,
      startedAt: new Date(),
    });

    await KitModel.updateOne(
      { _id: kit._id },
      {
        $set: {
          regenerationLock: {
            section,
            category,
            lockedAt: new Date(),
            expiresAt: lockExpiry,
          },
        },
      }
    );

    // 4. Background regeneration execution (non-blocking)
    (async () => {
      try {
        if (section === 'questions' && category) {
          const result = await regenerateQuestionsCategory(kit.kit!, category, {
            nextQuestionIndex: kit.nextQuestionIndex,
          });

          await KitModel.findOneAndUpdate(
            { _id: kit._id, userId: kit.userId, __v: kit.__v },
            {
              $set: {
                kit: result.kit,
                nextQuestionIndex: result.nextQuestionIndex,
                regenerationLock: null,
                updatedAt: new Date(),
              },
              $inc: { __v: 1 },
            }
          );
        } else if (section === 'company_brief') {
          const result = await regenerateCompanyBrief(kit.kit!, { force: true });

          await KitModel.findOneAndUpdate(
            { _id: kit._id, userId: kit.userId, __v: kit.__v },
            {
              $set: {
                kit: result.kit,
                regenerationLock: null,
                updatedAt: new Date(),
              },
              $inc: { __v: 1 },
            }
          );
        } else if (section === 'flashcards') {
          const result = await regenerateFlashcards(kit.kit!, {
            nextFlashcardIndex: kit.nextFlashcardIndex,
          });

          await KitModel.findOneAndUpdate(
            { _id: kit._id, userId: kit.userId, __v: kit.__v },
            {
              $set: {
                kit: result.kit,
                nextFlashcardIndex: result.nextFlashcardIndex,
                regenerationLock: null,
                updatedAt: new Date(),
              },
              $inc: { __v: 1 },
            }
          );
        }
      } catch (err) {
        console.error(`[KitBuilder] Regeneration failed for ${regKey}:`, err);
        // On error, leave original kit untouched and release lock
        await KitModel.updateOne({ _id: kit._id }, { $set: { regenerationLock: null } });
      } finally {
        activeRegenerations.delete(regKey);
      }
    })();

    return {
      kitId,
      status: 'generating',
      progressUrl: `/api/kits/${kitId}/progress`,
    };
  }

  /**
   * Candidate Progress Updates (D6-B: notes, stars, mastery, completed days).
   * Uses per-key dot-notation and atomic operators ($addToSet, $pull).
   */
  static async updateCandidateProgress(
    kitId: string,
    userId: string,
    update: {
      // Structured style
      note?: { questionId: string; text: string };
      star?: { questionId: string; isStarred: boolean };
      flashcardMastery?: { flashcardId: string; verdict: string | boolean };
      completedDay?: { dayNumber: number; isCompleted: boolean } | number;
      // Flat style (ergonomic for client UI)
      questionId?: string;
      noteText?: string;
      starred?: boolean;
      flashcardId?: string;
      mastered?: boolean;
      [key: string]: any;
    }
  ): Promise<any> {
    const kit = await getUserKitById(kitId, userId);

    const updateOps: Record<string, any> = {};

    // 1. Note handling (both structured and flat)
    const noteQId = update.note?.questionId || update.questionId;
    const noteContent =
      update.note?.text !== undefined
        ? update.note.text
        : update.noteText !== undefined
        ? update.noteText
        : typeof update.note === 'string'
        ? update.note
        : undefined;

    if (noteQId && noteContent !== undefined) {
      if (typeof noteContent === 'string' && noteContent.trim().length > 0) {
        updateOps.$set = updateOps.$set || {};
        updateOps.$set[`progress.notes.${noteQId}`] = noteContent.trim();
      } else {
        updateOps.$unset = updateOps.$unset || {};
        updateOps.$unset[`progress.notes.${noteQId}`] = '';
      }
    }

    // 2. Star handling
    const starQId = update.star?.questionId || update.questionId;
    const isStarred =
      update.star?.isStarred !== undefined
        ? update.star.isStarred
        : update.starred !== undefined
        ? update.starred
        : undefined;

    if (starQId && isStarred !== undefined) {
      if (isStarred) {
        updateOps.$addToSet = updateOps.$addToSet || {};
        updateOps.$addToSet['progress.starred'] = starQId;
      } else {
        updateOps.$pull = updateOps.$pull || {};
        updateOps.$pull['progress.starred'] = starQId;
      }
    }

    // 3. Flashcard Mastery
    const fId = update.flashcardMastery?.flashcardId || update.flashcardId;
    const fMastery =
      update.flashcardMastery?.verdict !== undefined
        ? update.flashcardMastery.verdict
        : update.mastered !== undefined
        ? update.mastered
        : undefined;

    if (fId && fMastery !== undefined) {
      updateOps.$set = updateOps.$set || {};
      updateOps.$set[`progress.flashcardMastery.${fId}`] = fMastery;
    }

    // 4. Completed Days
    if (typeof update.completedDay === 'number') {
      updateOps.$addToSet = updateOps.$addToSet || {};
      updateOps.$addToSet['progress.completedDays'] = update.completedDay;
    } else if (update.completedDay && typeof update.completedDay === 'object') {
      if (update.completedDay.isCompleted) {
        updateOps.$addToSet = updateOps.$addToSet || {};
        updateOps.$addToSet['progress.completedDays'] = update.completedDay.dayNumber;
      } else {
        updateOps.$pull = updateOps.$pull || {};
        updateOps.$pull['progress.completedDays'] = update.completedDay.dayNumber;
      }
    }

    updateOps.$set = updateOps.$set || {};
    updateOps.$set.updatedAt = new Date();

    const updated = await KitModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(userId),
      },
      updateOps,
      { new: true }
    );

    if (!updated) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit could not be found');
    }

    return updated.progress;
  }
}
