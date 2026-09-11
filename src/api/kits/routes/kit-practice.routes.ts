import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../auth/middleware/require-auth';
import { KitPracticeService } from '../services/kit-practice.service';
import {
  TaroError,
  ErrorCode,
  PracticeSessionInputSchema,
  SpacedRepetitionFilter,
} from '@taro/shared';
import { getHttpStatusForErrorCode } from '../../shared/errors/status-map';

export const kitPracticeRouter = Router({ mergeParams: true });

// All practice routes require authentication
kitPracticeRouter.use(requireAuth);

/**
 * POST /api/kits/:id/practice
 * Records a practice session with one or more flashcard confidence ratings.
 */
kitPracticeRouter.post(
  '/:id/practice',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const userId = req.user!.id;

      const parseResult = PracticeSessionInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new TaroError(
          ErrorCode.INVALID_INPUT,
          parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
        );
      }

      const result = await KitPracticeService.recordPracticeSession(
        kitId,
        userId,
        parseResult.data.ratings
      );

      res.status(200).json({
        success: true,
        data: result,
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
 * GET /api/kits/:id/practice
 * Retrieves Spaced Repetition Queue and Weak-Spot Gap Radar analysis for a kit.
 */
kitPracticeRouter.get(
  '/:id/practice',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const userId = req.user!.id;
      const filter = (req.query.filter as SpacedRepetitionFilter) || 'all';

      if (!['all', 'shaky', 'unpracticed'].includes(filter)) {
        throw new TaroError(
          ErrorCode.INVALID_INPUT,
          'Invalid filter parameter: must be "all", "shaky", or "unpracticed"'
        );
      }

      const analytics = await KitPracticeService.getPracticeAnalytics(
        kitId,
        userId,
        filter
      );

      res.status(200).json({
        success: true,
        data: analytics,
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
