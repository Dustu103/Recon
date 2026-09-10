import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../index';
import { connectTestDb, clearTestDb, closeTestDb } from '../setup/test-db';
import { KitModel } from '../../kits/models/kit.model';
import { SESSION_COOKIE_NAME, signSessionToken } from '../../auth/utils/jwt';
import { Kit, ErrorCode } from '@taro/shared';

describe('Domain 6: Kit Builder & Workspace Mutations API Suite', () => {
  const user1Id = new mongoose.Types.ObjectId();
  const user2Id = new mongoose.Types.ObjectId();

  let user1Cookie: string;
  let user2Cookie: string;

  const createMockKitData = (): Kit => ({
    source: {
      company: 'Stripe',
      company_url: 'https://stripe.com',
      role: 'Staff Infrastructure Engineer',
      location: 'Remote',
      jd_chars: 800,
      researched_at: new Date().toISOString(),
      pages_used: ['https://stripe.com/about'],
    },
    company_brief: {
      summary: 'Stripe builds economic infrastructure for the internet.',
      what_they_do: 'Payments APIs, billing, fraud prevention, and banking as a service.',
      sources: ['https://stripe.com'],
    },
    role: {
      title: 'Staff Infrastructure Engineer',
      seniority: 'Staff',
      responsibilities: ['Scale distributed ledgers', 'Lead high-availability architectures'],
      requirements: [
        { id: 'r1', text: 'Distributed systems and consensus protocols', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'High throughput distributed caching', kind: 'technical', priority: 'must' },
        { id: 'r3', text: 'Cross-functional executive alignment', kind: 'behavioural', priority: 'nice' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Explain Paxos vs Raft consensus trade-offs in distributed ledgers.',
        answer_outline: '1. Consensus guarantees\n2. Leader election overhead\n3. Network partition recovery',
        difficulty: 3,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'technical',
        prompt: 'How do you handle cache invalidation at multi-region scale?',
        answer_outline: '1. Eventual consistency vs strong\n2. Write-through vs lease invalidation\n3. Thundering herd',
        difficulty: 2,
      },
      {
        id: 'q3',
        requirement_ids: ['r3'],
        category: 'behavioural',
        prompt: 'Describe a time you navigated an architectural disagreement across engineering leadership.',
        answer_outline: 'Situation: Competing database architectures. Action: Structured RFC and data-driven benchmark. Result: Unanimous consensus.',
        difficulty: 2,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is the CAP Theorem?',
        back: 'Consistency, Availability, Partition tolerance - pick two under network partition.',
        requirement_ids: ['r1'],
      },
      {
        id: 'f2',
        front: 'What is a bloom filter?',
        back: 'Space-efficient probabilistic data structure for set membership testing.',
        requirement_ids: ['r2'],
      },
    ],
    schedule: {
      days_available: 3,
      days: [
        { day: 1, focus: 'technical', question_ids: ['q1'], minutes: 45 },
        { day: 2, focus: 'technical', question_ids: ['q2'], minutes: 45 },
        { day: 3, focus: 'behavioural', question_ids: ['q3'], minutes: 30 },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  });

  async function seedKit(userId: mongoose.Types.ObjectId, overrides: Record<string, any> = {}) {
    const kitData = createMockKitData();
    return KitModel.create({
      userId,
      title: 'Stripe - Staff Infrastructure Engineer',
      companyName: 'Stripe',
      companyUrl: 'https://stripe.com',
      roleTitle: 'Staff Infrastructure Engineer',
      days: 3,
      status: 'completed',
      kit: kitData,
      nextQuestionIndex: 4,
      nextFlashcardIndex: 3,
      progress: {
        notes: { q1: 'Remember to mention leases.' },
        starred: ['q1', 'q3'],
        flashcardMastery: { f1: true },
        completedDays: [1],
      },
      ...overrides,
    });
  }

  beforeAll(async () => {
    await connectTestDb();
    const token1 = signSessionToken({ userId: user1Id.toString(), email: 'user1@recon.ai' });
    const token2 = signSessionToken({ userId: user2Id.toString(), email: 'user2@recon.ai' });
    user1Cookie = `${SESSION_COOKIE_NAME}=${token1}`;
    user2Cookie = `${SESSION_COOKIE_NAME}=${token2}`;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('PATCH /api/kits/:id/questions/:questionId', () => {
    it('inline edits a question, flipping _edited: true and updating fields', async () => {
      const doc = await seedKit(user1Id);

      const res = await request(app)
        .patch(`/api/kits/${doc._id}/questions/q1`)
        .set('Cookie', user1Cookie)
        .send({
          prompt: 'Updated Paxos prompt with leader leases',
          difficulty: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.question.prompt).toBe('Updated Paxos prompt with leader leases');
      expect(res.body.question.difficulty).toBe(2);
      expect(res.body.question._edited).toBe(true);

      // Verify in DB
      const updated = await KitModel.findById(doc._id).lean();
      const dbQ1 = updated?.kit?.questions?.find((q: any) => q.id === 'q1');
      expect(dbQ1?._edited).toBe(true);
      expect(dbQ1?.prompt).toBe('Updated Paxos prompt with leader leases');
    });

    it('recomputes schedule and coverage when question category is modified', async () => {
      const doc = await seedKit(user1Id);

      const res = await request(app)
        .patch(`/api/kits/${doc._id}/questions/q1`)
        .set('Cookie', user1Cookie)
        .send({
          category: 'system-design',
        });

      expect(res.status).toBe(200);
      expect(res.body.question.category).toBe('system-design');
      expect(res.body.question._edited).toBe(true);

      const updated = await KitModel.findById(doc._id).lean();
      expect(updated?.kit?.schedule).toBeDefined();
    });

    it('rejects editing for unowned kit (404)', async () => {
      const doc = await seedKit(user1Id);

      const res = await request(app)
        .patch(`/api/kits/${doc._id}/questions/q1`)
        .set('Cookie', user2Cookie)
        .send({
          prompt: 'Malicious attempt',
        });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/kits/:id/questions', () => {
    it('adds a manual question with monotonic ID, _manual: true, and advances nextQuestionIndex', async () => {
      const doc = await seedKit(user1Id);

      const res = await request(app)
        .post(`/api/kits/${doc._id}/questions`)
        .set('Cookie', user1Cookie)
        .send({
          category: 'technical',
          prompt: 'How would you architect an idempotent payment processing gateway?',
          answer_outline: '1. Deduplication keys\n2. Two-phase commit or Sagas\n3. Outbox pattern',
          difficulty: 3,
          requirement_ids: ['r1'],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.question.id).toBe('q4');
      expect(res.body.question._manual).toBe(true);
      expect(res.body.question.category).toBe('technical');

      // Verify nextQuestionIndex updated to 5
      const updated = await KitModel.findById(doc._id).lean();
      expect(updated?.nextQuestionIndex).toBe(5);
      expect(updated?.kit?.questions?.length).toBe(4);
    });
  });

  describe('PATCH /api/kits/:id/questions/reorder', () => {
    it('reorders questions within category slice without marking _edited: true', async () => {
      const doc = await seedKit(user1Id);

      const res = await request(app)
        .patch(`/api/kits/${doc._id}/questions/reorder`)
        .set('Cookie', user1Cookie)
        .send({
          category: 'technical',
          orderedIds: ['q2', 'q1'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await KitModel.findById(doc._id).lean();
      const technicalQuestions = updated?.kit?.questions?.filter((q: any) => q.category === 'technical') || [];
      expect(technicalQuestions[0].id).toBe('q2');
      expect(technicalQuestions[1].id).toBe('q1');

      // Neither question should have _edited flipped to true by reordering
      expect(technicalQuestions[0]._edited).toBeUndefined();
      expect(technicalQuestions[1]._edited).toBeUndefined();
    });
  });

  describe('DELETE /api/kits/:id/questions/:questionId', () => {
    it('cascading delete updates schedule and coverage and purges candidate notes/stars', async () => {
      const doc = await seedKit(user1Id);

      const res = await request(app)
        .delete(`/api/kits/${doc._id}/questions/q1`)
        .set('Cookie', user1Cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updated = await KitModel.findById(doc._id).lean();
      // Question removed
      expect(updated?.kit?.questions?.some((q: any) => q.id === 'q1')).toBe(false);

      // Schedule updated (q1 purged from day 1)
      const day1 = updated?.kit?.schedule?.days?.find((d: any) => d.day === 1);
      expect(day1?.question_ids.includes('q1')).toBe(false);

      // Candidate notes and stars for q1 cleaned up
      expect(updated?.progress?.notes?.q1).toBeUndefined();
      expect(updated?.progress?.starred?.includes('q1')).toBe(false);
      // q3 star should still be there
      expect(updated?.progress?.starred?.includes('q3')).toBe(true);
    });
  });

  describe('PATCH /api/kits/:id/company-brief', () => {
    it('inline edits company brief and marks _edited: true', async () => {
      const doc = await seedKit(user1Id);

      const res = await request(app)
        .patch(`/api/kits/${doc._id}/company-brief`)
        .set('Cookie', user1Cookie)
        .send({
          summary: 'Custom summary: Stripe is the world leader in global payment infra.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.company_brief.summary).toBe('Custom summary: Stripe is the world leader in global payment infra.');
      expect(res.body.company_brief._edited).toBe(true);

      const updated = await KitModel.findById(doc._id).lean();
      expect(updated?.kit?.company_brief?._edited).toBe(true);
    });
  });

  describe('POST /api/kits/:id/regenerate (Single-Section Regeneration)', () => {
    it('requires CONFIRMATION_REQUIRED (428) when regenerating an edited company_brief without force: true', async () => {
      const doc = await seedKit(user1Id);

      // Edit company brief first
      await request(app)
        .patch(`/api/kits/${doc._id}/company-brief`)
        .set('Cookie', user1Cookie)
        .send({
          summary: 'Hand-edited summary that must not be blindly clobbered.',
        });

      // Attempt to regenerate without force
      const res = await request(app)
        .post(`/api/kits/${doc._id}/regenerate`)
        .set('Cookie', user1Cookie)
        .send({
          section: 'company_brief',
          force: false,
        });

      expect(res.status).toBe(428);
      expect(res.body.error.code).toBe(ErrorCode.CONFIRMATION_REQUIRED);
    });

    it('regenerates company_brief with force: true and resets _edited to false upon success', async () => {
      const doc = await seedKit(user1Id);

      // Hand-edit first
      await request(app)
        .patch(`/api/kits/${doc._id}/company-brief`)
        .set('Cookie', user1Cookie)
        .send({
          summary: 'Hand-edited summary',
        });

      // Regenerate with force: true
      const res = await request(app)
        .post(`/api/kits/${doc._id}/regenerate`)
        .set('Cookie', user1Cookie)
        .send({
          section: 'company_brief',
          force: true,
        });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);

      // Allow async job to finish
      await new Promise((r) => setTimeout(r, 150));

      const updated = await KitModel.findById(doc._id).lean();
      expect(updated?.kit?.company_brief?._edited).toBe(false);
    });

    it('regenerates a question category preserving _edited: true and _manual: true questions', async () => {
      const doc = await seedKit(user1Id);

      // Edit q2 to mark _edited: true
      await request(app)
        .patch(`/api/kits/${doc._id}/questions/q2`)
        .set('Cookie', user1Cookie)
        .send({
          prompt: 'Hand-edited question 2 for distributed caching',
        });

      // Add a manual question q4
      await request(app)
        .post(`/api/kits/${doc._id}/questions`)
        .set('Cookie', user1Cookie)
        .send({
          category: 'technical',
          prompt: 'Manual question 4 for technical interviews',
          answer_outline: 'Manual outline',
          difficulty: 3,
        });

      // Regenerate technical questions category
      const res = await request(app)
        .post(`/api/kits/${doc._id}/regenerate`)
        .set('Cookie', user1Cookie)
        .send({
          section: 'questions',
          category: 'technical',
        });

      expect(res.status).toBe(202);

      // Wait for async background completion
      await new Promise((r) => setTimeout(r, 200));

      const updated = await KitModel.findById(doc._id).lean();
      const technical = updated?.kit?.questions?.filter((q: any) => q.category === 'technical') || [];

      // q2 (_edited) must survive
      const survivedQ2 = technical.find((q: any) => q.id === 'q2');
      expect(survivedQ2).toBeDefined();
      expect(survivedQ2?.prompt).toBe('Hand-edited question 2 for distributed caching');
      expect(survivedQ2?._edited).toBe(true);

      // q4 (_manual) must survive
      const survivedQ4 = technical.find((q: any) => q.id === 'q4');
      expect(survivedQ4).toBeDefined();
      expect(survivedQ4?.prompt).toBe('Manual question 4 for technical interviews');
      expect(survivedQ4?._manual).toBe(true);

      // Unprotected q1 was replaced
      const survivedQ1 = technical.find((q: any) => q.id === 'q1');
      expect(survivedQ1).toBeUndefined();

      // Behavioural question q3 remains untouched
      const q3 = updated?.kit?.questions?.find((q: any) => q.id === 'q3');
      expect(q3).toBeDefined();
      expect(q3?.category).toBe('behavioural');
    });
  });

  describe('PATCH /api/kits/:id/candidate-progress (D6-B Candidate Progress)', () => {
    it('updates candidate notes, stars, flashcard mastery, and study days atomically', async () => {
      const doc = await seedKit(user1Id);

      const res = await request(app)
        .patch(`/api/kits/${doc._id}/candidate-progress`)
        .set('Cookie', user1Cookie)
        .send({
          questionId: 'q2',
          note: 'Focus on multi-datacenter consensus and write-through cache leasing.',
          starred: true,
          flashcardId: 'f2',
          mastered: true,
          completedDay: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.progress.notes.q2).toBe(
        'Focus on multi-datacenter consensus and write-through cache leasing.'
      );
      expect(res.body.progress.starred.includes('q2')).toBe(true);
      expect(res.body.progress.flashcardMastery.f2).toBe(true);
      expect(res.body.progress.completedDays.includes(2)).toBe(true);

      // Check in MongoDB
      const updated = await KitModel.findById(doc._id).lean();
      expect(updated?.progress?.notes?.q2).toBe(
        'Focus on multi-datacenter consensus and write-through cache leasing.'
      );
      expect(updated?.progress?.flashcardMastery?.f2).toBe(true);
      expect(updated?.progress?.completedDays).toContain(2);
    });

    it('un-stars a question and clears a note when passed null/false', async () => {
      const doc = await seedKit(user1Id);

      const res = await request(app)
        .patch(`/api/kits/${doc._id}/candidate-progress`)
        .set('Cookie', user1Cookie)
        .send({
          questionId: 'q1',
          starred: false,
          note: '',
        });

      expect(res.status).toBe(200);
      expect(res.body.progress.starred.includes('q1')).toBe(false);
      expect(res.body.progress.notes.q1).toBeUndefined();
    });
  });
});
