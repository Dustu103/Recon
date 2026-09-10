import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../auth/middleware/require-auth';
import { crawlCompany } from '@/core';
import { TaroError, ErrorCode } from '@/shared';

export const researchRouter = Router();

/**
 * POST /api/research/crawl
 * Triggers full bounded depth-2 company crawling with SSRF protection,
 * RFC 9309 robots.txt validation, tech stack detection, and interview discussion retrieval.
 */
researchRouter.post('/crawl', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { companyUrl } = req.body;
    if (!companyUrl || typeof companyUrl !== 'string') {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'companyUrl string is required');
    }

    const trimmedUrl = companyUrl.trim();
    const result = await crawlCompany(trimmedUrl);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});
