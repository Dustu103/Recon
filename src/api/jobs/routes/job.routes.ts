import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { JobOpportunityModel } from '../models/job-opportunity.model';
import { sanitizeJobUrl } from '@/core/crawler/job-sanitizer';
import { TaroError, ErrorCode } from '@/shared';
import { requireAuth } from '../../auth/middleware/require-auth';

export const jobRouter = Router();

/**
 * GET /api/jobs
 * Returns verified, active job opportunities sorted by recent publication.
 */
jobRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const filter: Record<string, any> = {
      status: 'active',
    };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
      ];
    }

    const jobs = await JobOpportunityModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      jobs: jobs.map((j) => ({
        id: j._id.toString(),
        title: j.title,
        companyName: j.companyName,
        companyUrl: j.companyUrl,
        jobUrl: j.jobUrl,
        location: j.location,
        descriptionSnippet: j.descriptionSnippet,
        seniority: j.seniority,
        status: j.status,
        verifiedAt: j.verifiedAt,
        createdAt: j.createdAt,
      })),
      total: jobs.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/jobs/publish
 * Registers or upserts a sanitized public job opportunity.
 */
jobRouter.post('/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobUrl, companyUrl, title, companyName, location, descriptionSnippet, seniority } = req.body;

    if (!jobUrl || typeof jobUrl !== 'string') {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'jobUrl is required');
    }

    const cleanJobUrl = sanitizeJobUrl(jobUrl);
    const cleanCompanyUrl = sanitizeJobUrl(companyUrl || cleanJobUrl);

    if (!cleanJobUrl) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Valid job URL is required');
    }

    const resolvedTitle = (title && String(title).trim()) || 'Software Engineer';
    const resolvedCompany = (companyName && String(companyName).trim()) || 'Technology Company';

    const job = await JobOpportunityModel.findOneAndUpdate(
      { jobUrl: cleanJobUrl },
      {
        $set: {
          title: resolvedTitle,
          companyName: resolvedCompany,
          companyUrl: cleanCompanyUrl,
          location: location ? String(location).trim() : undefined,
          descriptionSnippet: descriptionSnippet ? String(descriptionSnippet).trim() : undefined,
          seniority: seniority ? String(seniority).trim() : undefined,
          status: 'active',
          verifiedAt: new Date(),
        },
        $setOnInsert: {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          reportedClosedCount: 0,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({
      success: true,
      job: {
        id: job._id.toString(),
        title: job.title,
        companyName: job.companyName,
        companyUrl: job.companyUrl,
        jobUrl: job.jobUrl,
        location: job.location,
        descriptionSnippet: job.descriptionSnippet,
        seniority: job.seniority,
        status: job.status,
        verifiedAt: job.verifiedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/jobs/report
 * Allows authenticated candidates to report an expired or filled position.
 * If 2 or more candidates report it closed, status transitions to reported_closed.
 */
jobRouter.post('/report', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.body;

    if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Valid jobId is required');
    }

    const job = await JobOpportunityModel.findById(jobId);
    if (!job) {
      throw new TaroError(ErrorCode.NOT_FOUND, 'Job opportunity not found');
    }

    job.reportedClosedCount += 1;
    if (job.reportedClosedCount >= 2) {
      job.status = 'reported_closed';
    }

    await job.save();

    res.json({
      success: true,
      jobId: job._id.toString(),
      status: job.status,
      reportedClosedCount: job.reportedClosedCount,
    });
  } catch (error) {
    next(error);
  }
});
