import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../setup/test-db';
import { KitModel } from '../../kits/models/kit.model';
import { KitLifecycleService, computeInputHash } from '../../kits/services/kit-lifecycle.service';
import { reapStaleKits } from '../../kits/services/stale-reaper.service';
import { exportKitToMarkdown } from '../../kits/services/kit-export.service';
import { TaroError, ErrorCode, Kit } from '@/shared';

describe('D5 Kit Lifecycle, Hybrid Progress & Resilience Suite', () => {
  const user1Id = new mongoose.Types.ObjectId().toString();
  const user2Id = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('Duplicate Submission Guard & Input Hashing', () => {
    it('generates consistent SHA-256 hash for normalized input', () => {
      const hash1 = computeInputHash(user1Id, 'Senior Engineer  \r\nTypeScript', 'https://stripe.com/');
      const hash2 = computeInputHash(user1Id, 'Senior Engineer  \nTypeScript', 'https://stripe.com');
      expect(hash1).toBe(hash2);
    });

    it('returns existing kitId if an identical non-failed kit is already registered', async () => {
      const input = {
        jd: 'Staff Engineer at Stripe with Distributed Systems',
        companyUrl: 'https://stripe.com',
        days: 7,
      };

      // First submission: creates new pending kit
      const first = await KitLifecycleService.createOrGetPendingKit(user1Id, input);
      expect(first.isExisting).toBe(false);
      expect(first.kitId).toBeDefined();

      // Second submission: returns existing kitId
      const second = await KitLifecycleService.createOrGetPendingKit(user1Id, input);
      expect(second.isExisting).toBe(true);
      expect(second.kitId).toBe(first.kitId);

      // Verify only 1 document in MongoDB
      const count = await KitModel.countDocuments({ userId: new mongoose.Types.ObjectId(user1Id) });
      expect(count).toBe(1);
    });

    it('creates a new kit if previous identical submission had failed', async () => {
      const input = {
        jd: 'Staff Engineer at Stripe',
        companyUrl: 'https://stripe.com',
        days: 7,
      };

      const first = await KitLifecycleService.createOrGetPendingKit(user1Id, input);
      expect(first.isExisting).toBe(false);

      // Mark first as failed
      await KitLifecycleService.failKit(first.kitId, {
        code: 'TEST_FAILURE',
        message: 'LLM Rate limit exceeded',
        step: 'questions',
      });

      // Second submission should create a fresh pending kit because first failed
      const second = await KitLifecycleService.createOrGetPendingKit(user1Id, input);
      expect(second.isExisting).toBe(false);
      expect(second.kitId).not.toBe(first.kitId);

      const total = await KitModel.countDocuments({ userId: new mongoose.Types.ObjectId(user1Id) });
      expect(total).toBe(2);
    });

    it('isolates duplicate checks between different users', async () => {
      const input = {
        jd: 'Identical Job Description',
        companyUrl: 'https://amazon.com',
        days: 5,
      };

      const u1 = await KitLifecycleService.createOrGetPendingKit(user1Id, input);
      const u2 = await KitLifecycleService.createOrGetPendingKit(user2Id, input);

      expect(u1.kitId).not.toBe(u2.kitId);
      expect(u2.isExisting).toBe(false);
    });
  });

  describe('Hybrid Progress Model & Fast Memory Reads', () => {
    it('reads fast from in-memory snapshot and falls back durably to DB on cache miss', async () => {
      const input = {
        jd: 'React Native Developer',
        companyUrl: 'https://meta.com',
        days: 7,
      };

      const { kitId } = await KitLifecycleService.createOrGetPendingKit(user1Id, input);

      // Fast in-memory read
      const initialProgress = await KitLifecycleService.getKitProgress(kitId, user1Id);
      expect(initialProgress.status).toBe('pending');
      expect(initialProgress.percent).toBe(5);

      // Simulate step update in memory
      const memSnapshot = KitLifecycleService._getInMemorySnapshot(kitId);
      expect(memSnapshot).toBeDefined();
      if (memSnapshot) {
        memSnapshot.percent = 45;
        memSnapshot.step = 'crawl';
        memSnapshot.message = 'Crawling company pages...';
      }

      const updatedProgress = await KitLifecycleService.getKitProgress(kitId, user1Id);
      expect(updatedProgress.percent).toBe(45);
      expect(updatedProgress.step).toBe('crawl');

      // Clear in-memory cache to simulate server restart / worker cache miss
      KitLifecycleService._clearInMemorySnapshot(kitId);

      // Should fall back gracefully to MongoDB durable state without crash
      const fallbackProgress = await KitLifecycleService.getKitProgress(kitId, user1Id);
      expect(fallbackProgress.status).toBe('pending');
      expect(fallbackProgress.percent).toBe(5); // fallback percent for pending
    });

    it('strictly enforces multi-tenant boundary on progress queries (404 on unowned)', async () => {
      const input = {
        jd: 'Backend Engineer',
        companyUrl: 'https://google.com',
        days: 10,
      };

      const { kitId } = await KitLifecycleService.createOrGetPendingKit(user1Id, input);

      // User 1 can view
      const p1 = await KitLifecycleService.getKitProgress(kitId, user1Id);
      expect(p1.kitId).toBe(kitId);

      // User 2 cannot view (throws NOT_FOUND 404, strictly no 403 leakage)
      try {
        await KitLifecycleService.getKitProgress(kitId, user2Id);
        expect.fail('Should have thrown NOT_FOUND');
      } catch (err) {
        expect(err).toBeInstanceOf(TaroError);
        expect((err as TaroError).code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  describe('Durable Failure Transition & Stale-Job Reaper', () => {
    it('records structured error payload on failKit and updates progress to failed', async () => {
      const input = {
        jd: 'Cloud Architect',
        companyUrl: 'https://microsoft.com',
        days: 14,
      };

      const { kitId } = await KitLifecycleService.createOrGetPendingKit(user1Id, input);

      await KitLifecycleService.failKit(kitId, {
        code: 'NETWORK_TIMEOUT',
        message: 'Upstream crawler failed to connect to host',
        step: 'crawl',
      });

      const p = await KitLifecycleService.getKitProgress(kitId, user1Id);
      expect(p.status).toBe('failed');
      expect(p.percent).toBe(0);
      expect(p.message).toBe('Upstream crawler failed to connect to host');
      expect(p.completed).toBe(false);

      const doc = await KitModel.findById(kitId);
      expect(doc!.status).toBe('failed');
      expect((doc!.error as any).code).toBe('NETWORK_TIMEOUT');
    });

    it('reaps active kits that have been stuck beyond timeout window', async () => {
      // 1. Create a stale kit stuck in crawling 20 minutes ago
      const staleDate = new Date(Date.now() - 20 * 60 * 1000);
      const staleKit = await KitModel.create({
        userId: new mongoose.Types.ObjectId(user1Id),
        title: 'Stale Kit',
        companyUrl: 'https://stale.com',
        status: 'crawling',
        updatedAt: staleDate,
      });
      // Force update updatedAt in mongo without Mongoose timestamp override
      await KitModel.updateOne(
        { _id: staleKit._id },
        { $set: { updatedAt: staleDate } },
        { timestamps: false }
      );

      // 2. Create an active kit updated 2 minutes ago (fresh)
      const freshKit = await KitModel.create({
        userId: new mongoose.Types.ObjectId(user1Id),
        title: 'Fresh Kit',
        companyUrl: 'https://fresh.com',
        status: 'generating',
        updatedAt: new Date(Date.now() - 2 * 60 * 1000),
      });

      // Run reaper with 15-minute timeout
      const result = await reapStaleKits(15 * 60 * 1000);

      expect(result.reapedCount).toBe(1);
      expect(result.reapedIds).toContain(staleKit._id.toString());

      // Verify stale kit is now marked 'failed'
      const reapedDoc = await KitModel.findById(staleKit._id);
      expect(reapedDoc!.status).toBe('failed');
      expect((reapedDoc!.error as any).code).toBe('STALE_GENERATION_TIMEOUT');

      // Verify fresh kit remains untouched in 'generating'
      const freshDoc = await KitModel.findById(freshKit._id);
      expect(freshDoc!.status).toBe('generating');
    });
  });

  describe('exportKitToMarkdown', () => {
    it('formats a complete kit into structured Markdown with all 5 sections', () => {
      const mockKit: Kit = {
        source: {
          company: 'Stripe',
          company_url: 'https://stripe.com',
          role: 'Backend Engineer',
          location: 'San Francisco',
          jd_chars: 1200,
          researched_at: '2026-09-12T00:00:00Z',
          pages_used: ['https://stripe.com/about'],
        },
        company_brief: {
          summary: 'Financial infrastructure platform.',
          what_they_do: 'Global online payments and billing.',
          sources: ['https://stripe.com/about'],
        },
        role: {
          title: 'Backend Engineer',
          seniority: 'Senior',
          responsibilities: ['Architect APIs', 'Ensure 99.999% uptime'],
          requirements: [
            { id: 'r1', text: 'Distributed systems experience', kind: 'technical', priority: 'must' },
            { id: 'r2', text: 'Mentorship', kind: 'behavioural', priority: 'nice' },
          ],
        },
        questions: [
          {
            id: 'q1',
            prompt: 'Explain idempotency keys in payment APIs',
            answer_outline: 'Unique request tokens stored in Redis with TTL',
            category: 'technical',
            difficulty: 3,
            requirement_ids: ['r1'],
          },
        ],
        flashcards: [
          { id: 'f1', front: 'What is 2PC?', back: 'Two-phase commit protocol', requirement_ids: ['r1'] },
        ],
        schedule: {
          days_available: 3,
          days: [
            { day: 1, focus: 'Technical Core', question_ids: ['q1'], minutes: 60 },
            { day: 2, focus: 'Review', question_ids: [], minutes: 0 },
            { day: 3, focus: 'Final Review', question_ids: [], minutes: 0 },
          ],
        },
        coverage: {
          uncovered_requirement_ids: [],
          passes: 1,
        },
      };

      const markdown = exportKitToMarkdown(mockKit, 'Custom Title');
      expect(markdown).toContain('# Custom Title');
      expect(markdown).toContain('## 1. Company Intelligence Brief');
      expect(markdown).toContain('Financial infrastructure platform.');
      expect(markdown).toContain('## 2. Job Description Requirements');
      expect(markdown).toContain('**`r1`** **[MUST-HAVE]** (technical): Distributed systems experience');
      expect(markdown).toContain('## 3. Targeted Question Bank');
      expect(markdown).toContain('#### [q1] Explain idempotency keys in payment APIs');
      expect(markdown).toContain('## 4. Rapid-Revision Flashcard Deck');
      expect(markdown).toContain('### [f1] What is 2PC?');
      expect(markdown).toContain('## 5. Day-by-Day Study Schedule');
      expect(markdown).toContain('### Day 1: Technical Core (60 Minutes)');
    });
  });
});

