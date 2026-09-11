import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../auth/middleware/require-auth';
import { KitInterviewService } from '../services/kit-interview.service';
import {
  TaroError,
  ErrorCode,
  InterviewTurnInputSchema,
  InterviewReportInputSchema,
} from '@taro/shared';
import { getHttpStatusForErrorCode } from '../../shared/errors/status-map';

export const kitInterviewRouter = Router({ mergeParams: true });

// All interview routes require candidate authentication
kitInterviewRouter.use(requireAuth);

/**
 * POST /api/kits/:id/interview/turn
 * Dispatches a candidate's turn (voice/text answer + optional C++/JS code) to the AI interviewer.
 */
kitInterviewRouter.post(
  '/:id/interview/turn',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const userId = req.user!.id;

      const parseResult = InterviewTurnInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new TaroError(
          ErrorCode.INVALID_INPUT,
          parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
        );
      }

      const result = await KitInterviewService.handleTurn(
        kitId,
        userId,
        parseResult.data
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
 * POST /api/kits/:id/interview/report
 * Generates an end-of-session evaluation analyzing pacing against the timer,
 * code quality, and recurring error anti-patterns.
 */
kitInterviewRouter.post(
  '/:id/interview/report',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id;
      const userId = req.user!.id;

      const parseResult = InterviewReportInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new TaroError(
          ErrorCode.INVALID_INPUT,
          parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
        );
      }

      const report = await KitInterviewService.handleReport(
        kitId,
        userId,
        parseResult.data
      );

      res.status(200).json({
        success: true,
        data: report,
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
