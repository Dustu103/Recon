import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../../auth/middleware/require-auth';
import { KitModel } from '../models/kit.model';
import { JobOpportunityModel } from '../../jobs/models/job-opportunity.model';
import { sanitizeJobUrl } from '@/core/crawler/job-sanitizer';
import { generateKit } from '@/core';
import { TaroError, ErrorCode } from '@/shared';

export const kitRouter = Router();

/**
 * POST /api/kits/generate
 * Generates an end-to-end interview prep kit from Job Description, Company URL, and Days.
 * Supports both SSE streaming (when stream=true or Accept: text/event-stream) and standard JSON.
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

    const isStream =
      req.query.stream === 'true' ||
      Boolean(req.headers.accept?.includes('text/event-stream'));

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const kit = await generateKit({
          jd: jd.trim(),
          companyUrl: companyUrl.trim(),
          days: parsedDays,
          roleTitle: typeof roleTitle === 'string' ? roleTitle.trim() : undefined,
          onProgress: (p) => {
            sendEvent('progress', p);
          },
        });

        const doc = await KitModel.create({
          userId: new mongoose.Types.ObjectId(userId),
          title: `${kit.role.title} at ${kit.source.company}`,
          companyName: kit.source.company,
          companyUrl: kit.source.company_url,
          roleTitle: kit.role.title,
          days: parsedDays,
          jobDescription: jd.trim(),
          kit,
          status: 'completed',
        });

        sendEvent('complete', {
          kitId: doc._id.toString(),
          kit,
        });

        // Fire-and-forget record verified job opportunity for recommendations
        recordOpportunityFromKit(kit, jd, jobUrl || companyUrl);

        res.end();
      } catch (err: any) {
        sendEvent('error', {
          code: err.code || 'GENERATION_FAILED',
          message: err.message || 'Failed to generate kit',
        });
        res.end();
      }
      return;
    }

    // Standard JSON Response
    const kit = await generateKit({
      jd: jd.trim(),
      companyUrl: companyUrl.trim(),
      days: parsedDays,
      roleTitle: typeof roleTitle === 'string' ? roleTitle.trim() : undefined,
    });

    const doc = await KitModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: `${kit.role.title} at ${kit.source.company}`,
      companyName: kit.source.company,
      companyUrl: kit.source.company_url,
      roleTitle: kit.role.title,
      days: parsedDays,
      jobDescription: jd.trim(),
      kit,
      status: 'completed',
    });

    // Fire-and-forget record verified job opportunity for recommendations
    recordOpportunityFromKit(kit, jd, jobUrl || companyUrl);

    return res.status(201).json({
      success: true,
      data: {
        kitId: doc._id.toString(),
        kit,
      },
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
      .select('_id title companyName companyUrl roleTitle days status createdAt updatedAt')
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
 * Fetches a single kit by ID, scoped to the authenticated user.
 */
kitRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Invalid kit ID format');
    }

    const doc = await KitModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    }).lean();

    if (!doc) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit not found');
    }

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
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Invalid kit ID format');
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
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit not found');
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
 * Deletes a kit owned by the authenticated user.
 */
kitRouter.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Invalid kit ID format');
    }

    const deleted = await KitModel.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!deleted) {
      throw new TaroError(ErrorCode.KIT_NOT_FOUND, 'Kit not found');
    }

    return res.status(200).json({
      success: true,
      message: 'Kit deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Asynchronously records or upserts verified public job opportunities
 * to build up the recommendation feed for candidates.
 */
function recordOpportunityFromKit(kit: any, jd: string, rawJobUrl?: string) {
  try {
    const urlToUse = rawJobUrl || kit.source?.company_url;
    if (!urlToUse || typeof urlToUse !== 'string') return;
    const cleanJobUrl = sanitizeJobUrl(urlToUse);
    const cleanCompanyUrl = sanitizeJobUrl(kit.source?.company_url || cleanJobUrl);
    if (!cleanJobUrl || cleanJobUrl.length < 5) return;

    JobOpportunityModel.findOneAndUpdate(
      { jobUrl: cleanJobUrl },
      {
        $set: {
          title: kit.role?.title || 'Software Engineer',
          companyName: kit.source?.company || 'Company',
          companyUrl: cleanCompanyUrl,
          descriptionSnippet: jd.trim().slice(0, 300),
          seniority: kit.role?.seniority || undefined,
          status: 'active',
          verifiedAt: new Date(),
        },
        $setOnInsert: {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day TTL
          reportedClosedCount: 0,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    ).catch(() => {
      // Non-blocking fire-and-forget
    });
  } catch {
    // Non-blocking
  }
}

