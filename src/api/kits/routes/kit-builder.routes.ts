import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../auth/middleware/require-auth';
import { KitBuilderService } from '../services/kit-builder.service';
import { TaroError, ErrorCode, QuestionCategory } from '@taro/shared';
import { getHttpStatusForErrorCode } from '../../shared/errors/status-map';

export const kitBuilderRouter = Router({ mergeParams: true });

// All builder routes require authentication
kitBuilderRouter.use(requireAuth);

/**
 * PATCH /api/kits/:id/questions/reorder
 * Reorders questions within a category slice without touching _edited flags.
 * NOTE: Placed before /:id/questions/:questionId to avoid Express parameter collision.
 */
kitBuilderRouter.patch(
  ['/:id/questions/reorder', '/:id/questions-reorder'],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const userId = req.user!.id;
      const { category, orderedIds } = req.body;

      if (!category || !['technical', 'behavioural', 'system-design', 'company-fit'].includes(category)) {
        throw new TaroError(ErrorCode.INVALID_INPUT, 'Valid category is required');
      }
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        throw new TaroError(ErrorCode.INVALID_INPUT, 'orderedIds must be a non-empty array');
      }

      const questions = await KitBuilderService.reorderCategoryQuestions(
        kitId,
        userId,
        category as QuestionCategory,
        orderedIds
      );

      res.status(200).json({
        success: true,
        questions,
      });
    } catch (err: any) {
      if (err instanceof TaroError) {
        return res.status(getHttpStatusForErrorCode(err.code)).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      next(err);
    }
  }
);

/**
 * PATCH /api/kits/:id/questions/:questionId
 * Inline edits a single question (prompt, answer_outline, difficulty, category).
 * Sets _edited: true.
 */
kitBuilderRouter.patch(
  '/:id/questions/:questionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const questionId = req.params.questionId;
      const userId = req.user!.id;

      const { prompt, answer_outline, difficulty, category } = req.body;

      if (difficulty !== undefined && ![1, 2, 3].includes(difficulty)) {
        throw new TaroError(ErrorCode.INVALID_INPUT, 'Difficulty must be 1, 2, or 3');
      }

      if (
        category !== undefined &&
        !['technical', 'behavioural', 'system-design', 'company-fit'].includes(category)
      ) {
        throw new TaroError(ErrorCode.INVALID_INPUT, 'Invalid question category');
      }

      const updatedQuestion = await KitBuilderService.patchQuestion(kitId, userId, questionId, {
        prompt,
        answer_outline,
        difficulty,
        category,
      });

      res.status(200).json({
        success: true,
        question: updatedQuestion,
      });
    } catch (err: any) {
      if (err instanceof TaroError) {
        return res.status(getHttpStatusForErrorCode(err.code)).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      next(err);
    }
  }
);

/**
 * POST /api/kits/:id/questions
 * Adds a manually created question with monotonic ID and _manual: true.
 */
kitBuilderRouter.post('/:id/questions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kitId = req.params.id;
    const userId = req.user!.id;
    const { category, prompt, answer_outline, difficulty, requirement_ids } = req.body;

    if (!category || !['technical', 'behavioural', 'system-design', 'company-fit'].includes(category)) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Valid category is required');
    }
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Prompt cannot be empty');
    }
    if (!answer_outline || typeof answer_outline !== 'string' || answer_outline.trim().length === 0) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Answer outline cannot be empty');
    }

    const question = await KitBuilderService.addManualQuestion(kitId, userId, {
      category,
      prompt,
      answer_outline,
      difficulty,
      requirement_ids,
    });

    res.status(201).json({
      success: true,
      question,
    });
  } catch (err: any) {
    if (err instanceof TaroError) {
      return res.status(getHttpStatusForErrorCode(err.code)).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }
    next(err);
  }
});

/**
 * DELETE /api/kits/:id/questions/:questionId
 * Cascading delete with OCC (__v), updating schedule & coverage, and purging progress notes/stars.
 */
kitBuilderRouter.delete(
  '/:id/questions/:questionId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const questionId = req.params.questionId;
      const userId = req.user!.id;

      const result = await KitBuilderService.deleteQuestion(kitId, userId, questionId);

      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof TaroError) {
        return res.status(getHttpStatusForErrorCode(err.code)).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      next(err);
    }
  }
);

/**
 * PATCH /api/kits/:id/company-brief
 * Inline edits the company brief, setting _edited: true.
 */
kitBuilderRouter.patch(
  '/:id/company-brief',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const userId = req.user!.id;
      const { summary, what_they_do } = req.body;

      const brief = await KitBuilderService.patchCompanyBrief(kitId, userId, {
        summary,
        what_they_do,
      });

      res.status(200).json({
        success: true,
        company_brief: brief,
      });
    } catch (err: any) {
      if (err instanceof TaroError) {
        return res.status(getHttpStatusForErrorCode(err.code)).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      next(err);
    }
  }
);

/**
 * PATCH /api/kits/:id/flashcards/:flashcardId
 * Inline edits a flashcard, setting _edited: true.
 */
kitBuilderRouter.patch(
  '/:id/flashcards/:flashcardId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const flashcardId = req.params.flashcardId;
      const userId = req.user!.id;
      const { front, back } = req.body;

      const card = await KitBuilderService.patchFlashcard(kitId, userId, flashcardId, {
        front,
        back,
      });

      res.status(200).json({
        success: true,
        flashcard: card,
      });
    } catch (err: any) {
      if (err instanceof TaroError) {
        return res.status(getHttpStatusForErrorCode(err.code)).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      next(err);
    }
  }
);

/**
 * POST /api/kits/:id/flashcards
 * Adds a manual flashcard.
 */
kitBuilderRouter.post('/:id/flashcards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kitId = req.params.id;
    const userId = req.user!.id;
    const { front, back, requirement_ids } = req.body;

    if (!front || typeof front !== 'string' || front.trim().length === 0) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Front prompt cannot be empty');
    }
    if (!back || typeof back !== 'string' || back.trim().length === 0) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Back content cannot be empty');
    }

    const card = await KitBuilderService.addManualFlashcard(kitId, userId, {
      front,
      back,
      requirement_ids,
    });

    res.status(201).json({
      success: true,
      flashcard: card,
    });
  } catch (err: any) {
    if (err instanceof TaroError) {
      return res.status(getHttpStatusForErrorCode(err.code)).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }
    next(err);
  }
});

/**
 * DELETE /api/kits/:id/flashcards/:flashcardId
 * Deletes a flashcard.
 */
kitBuilderRouter.delete(
  '/:id/flashcards/:flashcardId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const flashcardId = req.params.flashcardId;
      const userId = req.user!.id;

      const result = await KitBuilderService.deleteFlashcard(kitId, userId, flashcardId);

      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof TaroError) {
        return res.status(getHttpStatusForErrorCode(err.code)).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      next(err);
    }
  }
);

/**
 * POST /api/kits/:id/regenerate
 * Single-section regeneration with CONFIRMATION_REQUIRED (428) for edited briefs,
 * and 200 OK deduplication for active jobs.
 */
kitBuilderRouter.post('/:id/regenerate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kitId = req.params.id;
    const userId = req.user!.id;
    const { section, category, force } = req.body;

    if (!section || !['questions', 'flashcards', 'company_brief'].includes(section)) {
      throw new TaroError(
        ErrorCode.INVALID_INPUT,
        'Section must be "questions", "flashcards", or "company_brief"'
      );
    }

    if (section === 'questions' && !category) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Category is required when regenerating questions');
    }

    const result = await KitBuilderService.startSectionRegeneration(
      kitId,
      userId,
      section,
      category,
      force === true
    );

    res.status(202).json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    if (err instanceof TaroError) {
      return res.status(getHttpStatusForErrorCode(err.code)).json({
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }
    next(err);
  }
});

/**
 * PATCH /api/kits/:id/candidate-progress
 * Updates notes, stars, flashcard mastery, and study day checkoffs.
 */
kitBuilderRouter.patch(
  ['/:id/candidate-progress', '/:id/progress'],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const userId = req.user!.id;

      const progress = await KitBuilderService.updateCandidateProgress(kitId, userId, req.body);

      res.status(200).json({
        success: true,
        progress,
      });
    } catch (err: any) {
      if (err instanceof TaroError) {
        return res.status(getHttpStatusForErrorCode(err.code)).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      next(err);
    }
  }
);

/**
 * PATCH /api/kits/:id/schedule/move-question
 * Moves a scheduled question to a different day and recomputes daily minutes.
 */
kitBuilderRouter.patch(
  '/:id/schedule/move-question',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const userId = req.user!.id;
      const { questionId, targetDay, expectedVersion } = req.body;

      if (!questionId || typeof questionId !== 'string') {
        throw new TaroError(ErrorCode.INVALID_INPUT, 'questionId string is required');
      }
      if (typeof targetDay !== 'number' || targetDay < 1) {
        throw new TaroError(ErrorCode.INVALID_INPUT, 'targetDay positive integer is required');
      }

      const kit = await KitBuilderService.moveQuestionDay(
        userId,
        kitId,
        questionId,
        targetDay,
        expectedVersion
      );

      res.status(200).json({
        success: true,
        schedule: kit.kit?.schedule,
        version: kit.__v,
      });
    } catch (err: any) {
      if (err instanceof TaroError) {
        return res.status(getHttpStatusForErrorCode(err.code)).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      next(err);
    }
  }
);

