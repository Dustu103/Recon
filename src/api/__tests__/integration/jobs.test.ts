import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index';
import { connectTestDb, clearTestDb, closeTestDb } from '../setup/test-db';
import { JobOpportunityModel } from '../../jobs/models/job-opportunity.model';
import { SESSION_COOKIE_NAME, signSessionToken } from '../../auth/utils/jwt';
import mongoose from 'mongoose';

describe('Jobs API Integration Suite', () => {
  const userId = new mongoose.Types.ObjectId();
  let userCookie: string;

  beforeAll(async () => {
    await connectTestDb();
    const token = signSessionToken({ userId: userId.toString(), email: 'candidate@recon.ai' });
    userCookie = `${SESSION_COOKIE_NAME}=${token}`;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('POST /api/jobs/publish', () => {
    it('rejects publication without jobUrl', async () => {
      const res = await request(app).post('/api/jobs/publish').send({
        title: 'Backend Engineer',
      });
      expect(res.status).toBe(400);
    });

    it('sanitizes URL, strips tracking tokens, and persists opportunity', async () => {
      const res = await request(app)
        .post('/api/jobs/publish')
        .send({
          title: 'Staff Distributed Systems Engineer',
          companyName: 'Stripe',
          companyUrl: 'https://stripe.com?utm_source=twitter',
          jobUrl:
            'https://boards.greenhouse.io/stripe/jobs/4829101?gh_src=referral&utm_campaign=hiring_2026#apply',
          location: 'San Francisco, CA',
          descriptionSnippet: 'Design high-volume ledger infrastructure.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.job.title).toBe('Staff Distributed Systems Engineer');
      expect(res.body.job.companyName).toBe('Stripe');
      expect(res.body.job.jobUrl).toBe('https://boards.greenhouse.io/stripe/jobs/4829101');
      expect(res.body.job.jobUrl).not.toContain('gh_src');
      expect(res.body.job.jobUrl).not.toContain('utm_campaign');
      expect(res.body.job.status).toBe('active');

      const saved = await JobOpportunityModel.findOne({
        jobUrl: 'https://boards.greenhouse.io/stripe/jobs/4829101',
      });
      expect(saved).not.toBeNull();
      expect(saved?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('GET /api/jobs', () => {
    beforeEach(async () => {
      await JobOpportunityModel.create([
        {
          title: 'Frontend Engineer',
          companyName: 'Vercel',
          companyUrl: 'https://vercel.com',
          jobUrl: 'https://vercel.com/careers/fe-1',
          location: 'Remote',
          descriptionSnippet: 'Next.js rendering and platform performance.',
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000 * 7),
        },
        {
          title: 'DevOps & SRE Specialist',
          companyName: 'Datadog',
          companyUrl: 'https://datadoghq.com',
          jobUrl: 'https://datadoghq.com/careers/sre-2',
          location: 'New York, NY',
          descriptionSnippet: 'Distributed tracing at scale.',
          status: 'active',
          expiresAt: new Date(Date.now() + 86400000 * 7),
        },
        {
          title: 'Closed Position',
          companyName: 'OldCorp',
          companyUrl: 'https://oldcorp.com',
          jobUrl: 'https://oldcorp.com/careers/closed-3',
          status: 'closed',
          expiresAt: new Date(Date.now() + 86400000 * 7),
        },
      ]);
    });

    it('returns only active job opportunities', async () => {
      const res = await request(app).get('/api/jobs');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.jobs).toHaveLength(2);
      expect(res.body.jobs.every((j: any) => j.status === 'active')).toBe(true);
    });

    it('filters opportunities by search keyword', async () => {
      const res = await request(app).get('/api/jobs?search=vercel');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.jobs[0].companyName).toBe('Vercel');
    });
  });

  describe('POST /api/jobs/report', () => {
    it('requires authentication to report a job', async () => {
      const res = await request(app).post('/api/jobs/report').send({
        jobId: new mongoose.Types.ObjectId().toString(),
      });
      expect(res.status).toBe(401);
    });

    it('increments report count and transitions status to reported_closed after 2 reports', async () => {
      const job = await JobOpportunityModel.create({
        title: 'Full Stack Engineer',
        companyName: 'Linear',
        companyUrl: 'https://linear.app',
        jobUrl: 'https://linear.app/careers/fs-1',
        status: 'active',
        reportedClosedCount: 0,
        expiresAt: new Date(Date.now() + 86400000 * 7),
      });

      // Report 1
      const res1 = await request(app)
        .post('/api/jobs/report')
        .set('Cookie', userCookie)
        .send({ jobId: job._id.toString() });

      expect(res1.status).toBe(200);
      expect(res1.body.reportedClosedCount).toBe(1);
      expect(res1.body.status).toBe('active');

      // Report 2
      const res2 = await request(app)
        .post('/api/jobs/report')
        .set('Cookie', userCookie)
        .send({ jobId: job._id.toString() });

      expect(res2.status).toBe(200);
      expect(res2.body.reportedClosedCount).toBe(2);
      expect(res2.body.status).toBe('reported_closed');

      // Subsequent GET /api/jobs must omit this job
      const listRes = await request(app).get('/api/jobs');
      const found = listRes.body.jobs.find((j: any) => j.id === job._id.toString());
      expect(found).toBeUndefined();
    });
  });
});
