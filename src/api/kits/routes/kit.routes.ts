import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../../auth/middleware/require-auth';
import { KitModel } from '../models/kit.model';
import { KitLifecycleService } from '../services/kit-lifecycle.service';
import { getUserKitById } from '../services/kit-scoping';
import { generateKit } from '@/core';
import { TaroError, ErrorCode } from '@/shared';

import { kitBuilderRouter } from './kit-builder.routes';
import { kitPracticeRouter } from './kit-practice.routes';
import { kitInterviewRouter } from './kit-interview.routes';

export const kitRouter = Router();

// Mount Domain 6 Builder routes (inline editing, additions, section regeneration, candidate progress)
kitRouter.use(kitBuilderRouter);

// Mount Domain 7 Practice routes (session persistence, spaced repetition queue, weak-spot radar)
kitRouter.use(kitPracticeRouter);

// Mount AI Mock Interview Simulator routes (voice/chat turns and session reports)
kitRouter.use(kitInterviewRouter);

/**
 * POST /api/kits/generate
 * Initiates an end-to-end interview prep kit generation.
 * D5 Primary Model: Returns 202 Accepted immediately with kitId and progressUrl.
 * The client polls GET /api/kits/:id/progress every 2-4 seconds.
 * Deduplication: Returns existing kitId if an active identical generation already exists.
 * (Optional ?sync=true query parameter allows synchronous awaiting for testing/scripts).
 */
kitRouter.post('/generate', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { jd, companyUrl, days, roleTitle, jobUrl } = req.body;

    if (!jd || typeof jd !== 'string' || jd.trim().length === 0) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Job description (jd) is required');
    }

    if (!companyUrl || typeof companyUrl !== 'string' || companyUrl.trim().length === 0) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Company URL (companyUrl) is required');
    }

    const parsedDays = parseInt(String(days), 10);
    if (isNaN(parsedDays) || parsedDays < 1 || parsedDays > 60) {
      throw new TaroError(
        ErrorCode.INVALID_INPUT,
        'Days must be an integer between 1 and 60'
      );
    }

    const isSync = req.query.sync === 'true';

    // 1. Create or get existing active kit (Duplicate Submission Guard)
    const { kitId, isExisting, status } = await KitLifecycleService.createOrGetPendingKit(
      userId,
      {
        jd: jd.trim(),
        companyUrl: companyUrl.trim(),
        days: parsedDays,
        roleTitle: typeof roleTitle === 'string' ? roleTitle.trim() : undefined,
        jobUrl: typeof jobUrl === 'string' ? jobUrl.trim() : undefined,
      }
    );

    // If synchronous mode is requested (e.g. test harness)
    if (isSync) {
      if (status === 'completed') {
        const doc = await KitModel.findById(kitId).lean();
        return res.status(200).json({
          success: true,
          data: {
            kitId,
            kit: doc?.kit,
            isExisting: true,
          },
        });
      }

      // Execute synchronously
      const kit = await generateKit({
        jd: jd.trim(),
        companyUrl: companyUrl.trim(),
        days: parsedDays,
        roleTitle: typeof roleTitle === 'string' ? roleTitle.trim() : undefined,
      });

      await KitLifecycleService.completeKit(kitId, kit, jobUrl || companyUrl);

      return res.status(201).json({
        success: true,
        data: {
          kitId,
          kit,
        },
      });
    }

    // 2. Start background generation pipeline if it was newly created
    if (!isExisting || status === 'pending') {
      KitLifecycleService.startGeneration(kitId, userId, {
        jd: jd.trim(),
        companyUrl: companyUrl.trim(),
        days: parsedDays,
        roleTitle: typeof roleTitle === 'string' ? roleTitle.trim() : undefined,
        jobUrl: typeof jobUrl === 'string' ? jobUrl.trim() : undefined,
      });
    }

    // 3. Return 202 Accepted with polling URL
    return res.status(202).json({
      success: true,
      data: {
        kitId,
        status: status || 'pending',
        isExisting,
        progressUrl: `/api/kits/${kitId}/progress`,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/kits/:id/progress
 * High-frequency polling endpoint (recommended: every 2-4 seconds).
 * Reads from fast in-memory map if available; falls back to durable Mongo state.
 * Strictly scopes ownership to authenticated user (404 on unowned).
 */
kitRouter.get('/:id/progress', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new TaroError(ErrorCode.NOT_FOUND, 'Kit not found');
    }

    const progress = await KitLifecycleService.getKitProgress(id, userId);

    return res.status(200).json({
      success: true,
      data: progress,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/kits
 * Lists all kits for the authenticated user (sorted by most recent).
 */
kitRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const kits = await KitModel.find({ userId: new mongoose.Types.ObjectId(userId) })
      .select('_id title companyName companyUrl roleTitle days status checkpoints error createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: kits,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/kits/:id
 * Fetches a single kit by ID, scoped strictly to the authenticated user.
 * If generation is still pending/in-progress, returns 200 with partial state.
 */
kitRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const doc = await getUserKitById(id, userId);

    return res.status(200).json({
      success: true,
      data: doc,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/kits/:id
 * Updates or reshapes kit content (e.g. customized questions, schedule adjustments).
 */
kitRouter.patch('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new TaroError(ErrorCode.NOT_FOUND, 'Kit not found');
    }

    const { kit, title } = req.body;
    const updatePayload: Record<string, unknown> = {};

    if (title && typeof title === 'string') {
      updatePayload.title = title.trim();
    }
    if (kit && typeof kit === 'object') {
      updatePayload.kit = kit;
    }

    const updated = await KitModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        userId: new mongoose.Types.ObjectId(userId),
      },
      { $set: updatePayload },
      { new: true }
    ).lean();

    if (!updated) {
      throw new TaroError(ErrorCode.NOT_FOUND, 'Kit not found');
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/kits/:id
 * Deletes a kit owned by the authenticated user and removes memory tracking.
 */
kitRouter.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new TaroError(ErrorCode.NOT_FOUND, 'Kit not found');
    }

    const deleted = await KitModel.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!deleted) {
      throw new TaroError(ErrorCode.NOT_FOUND, 'Kit not found');
    }

    KitLifecycleService._clearInMemorySnapshot(id);

    return res.status(200).json({
      success: true,
      message: 'Kit deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});
