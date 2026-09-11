import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../index';
import { connectTestDb, clearTestDb, closeTestDb } from '../setup/test-db';
import { KitModel } from '../../kits/models/kit.model';
import { SESSION_COOKIE_NAME, signSessionToken } from '../../auth/utils/jwt';
import { Kit } from '@taro/shared';

describe('Domain 7: Practice & Weak-Spot Radar API Suite', () => {
  const user1Id = new mongoose.Types.ObjectId();
  const user2Id = new mongoose.Types.ObjectId();

  let user1Cookie: string;
  let user2Cookie: string;

  const createMockKitData = (): Kit => ({
    source: {
      company: 'Datadog',
      company_url: 'https://datadoghq.com',
      role: 'Staff SRE',
      location: 'Remote',
      jd_chars: 600,
      researched_at: new Date().toISOString(),
      pages_used: ['https://datadoghq.com/careers'],
    },
    company_brief: {
      summary: 'Datadog is an observability service for cloud-scale applications.',
      what_they_do: 'Monitoring, APM, log management, and security analysis.',
      sources: ['https://datadoghq.com'],
    },
    role: {
      title: 'Staff SRE',
      seniority: 'Staff',
      responsibilities: ['Scale monitoring agents', 'Drive zero-outage culture'],
      requirements: [
        { id: 'r1', text: 'Distributed tracing systems', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Incident leadership and post-mortems', kind: 'behavioural', priority: 'must' },
        { id: 'r3', text: 'Go runtime profiling', kind: 'technical', priority: 'nice' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'How do you prevent trace sampling bias in high-volume microservices?',
        answer_outline: 'Tail-based vs head-based sampling strategies.',
        difficulty: 3,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is head-based sampling?',
        back: 'Sampling decision made at the ingress point before span completes.',
        requirement_ids: ['r1'],
      },
      {
        id: 'f2',
        front: 'What is tail-based sampling?',
        back: 'Buffering traces until completion to sample based on error or latency.',
        requirement_ids: ['r1'],
      },
      {
        id: 'f3',
        front: 'What is a blameless post-mortem?',
        back: 'Focusing on systemic and process vulnerabilities rather than individual fault.',
        requirement_ids: ['r2'],
      },
      {
        id: 'f4',
        front: 'What is Go pprof execution tracer?',
        back: 'Visualizes goroutine scheduling, blocking syscalls, and GC pauses.',
        requirement_ids: ['r3'],
      },
    ],
    schedule: {
      days_available: 3,
      days: [
        { day: 1, focus: 'Tracing', question_ids: ['q1'], minutes: 45 },
        { day: 2, focus: 'Incident Response', question_ids: ['q1'], minutes: 45 },
        { day: 3, focus: 'Profiling', question_ids: ['q1'], minutes: 45 },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  });

  beforeAll(async () => {
    await connectTestDb();
    user1Cookie = `${SESSION_COOKIE_NAME}=${signSessionToken({ userId: user1Id.toString(), email: 'sre1@datadog.com' })}`;
    user2Cookie = `${SESSION_COOKIE_NAME}=${signSessionToken({ userId: user2Id.toString(), email: 'sre2@datadog.com' })}`;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('POST /api/kits/:id/practice persists ratings to practiceHistory and updates progress mastery', async () => {
    const kitDoc = await KitModel.create({
      userId: user1Id,
      title: 'Datadog Staff SRE Kit',
      companyName: 'Datadog',
      companyUrl: 'https://datadoghq.com',
      roleTitle: 'Staff SRE',
      days: 3,
      status: 'completed',
      kit: createMockKitData(),
      practiceHistory: [],
    });

    const res = await request(app)
      .post(`/api/kits/${kitDoc._id}/practice`)
      .set('Cookie', user1Cookie)
      .send({
        ratings: [
          { cardId: 'f1', confidence: 3 }, // Mastered
          { cardId: 'f2', confidence: 1 }, // Shaky
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.recordedCount).toBe(2);
    expect(res.body.data.practicedCardCount).toBe(2);
    expect(res.body.data.totalCards).toBe(4);
    expect(res.body.data.coveragePercentage).toBe(50); // 2 out of 4 cards

    // Check Weak-Spot Radar in response
    const r1 = res.body.data.weakSpotRadar.requirements.find((r: any) => r.requirementId === 'r1');
    expect(r1).toBeDefined();
    // r1 has 2 cards: f1=3, f2=1 -> (3 + 1) / (2 * 3) = 4 / 6 = 67%
    expect(r1.readiness).toBe(67);
    expect(r1.isDangerZone).toBe(false);

    // Verify database document
    const updated = await KitModel.findById(kitDoc._id).lean();
    expect(updated?.practiceHistory?.length).toBe(2);
    expect(updated?.progress?.flashcardMastery?.f1).toBe('mastered');
    expect(updated?.progress?.flashcardMastery?.f2).toBe('shaky');
  });

  it('POST /api/kits/:id/practice rejects non-existent card ID with 400 INVALID_INPUT', async () => {
    const kitDoc = await KitModel.create({
      userId: user1Id,
      title: 'Datadog Staff SRE Kit',
      status: 'completed',
      kit: createMockKitData(),
    });

    const res = await request(app)
      .post(`/api/kits/${kitDoc._id}/practice`)
      .set('Cookie', user1Cookie)
      .send({
        ratings: [{ cardId: 'f999', confidence: 2 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  it('appends multiple practice sessions chronologically in practiceHistory', async () => {
    const kitDoc = await KitModel.create({
      userId: user1Id,
      title: 'Datadog Staff SRE Kit',
      status: 'completed',
      kit: createMockKitData(),
      practiceHistory: [],
    });

    // Session 1: rate f1 as Shaky
    await request(app)
      .post(`/api/kits/${kitDoc._id}/practice`)
      .set('Cookie', user1Cookie)
      .send({ ratings: [{ cardId: 'f1', confidence: 1 }] });

    // Session 2: re-rate f1 as Mastered and f3 as Good
    const res2 = await request(app)
      .post(`/api/kits/${kitDoc._id}/practice`)
      .set('Cookie', user1Cookie)
      .send({
        ratings: [
          { cardId: 'f1', confidence: 3 },
          { cardId: 'f3', confidence: 2 },
        ],
      });

    expect(res2.status).toBe(200);

    const updated = await KitModel.findById(kitDoc._id).lean();
    expect(updated?.practiceHistory?.length).toBe(3); // 1 + 2 entries
    // Latest mastery for f1 updated to mastered
    expect(updated?.progress?.flashcardMastery?.f1).toBe('mastered');
    expect(updated?.progress?.flashcardMastery?.f3).toBe('good');
  });

  it('GET /api/kits/:id/practice retrieves queue and radar analytics with danger zone alerts', async () => {
    const kitDoc = await KitModel.create({
      userId: user1Id,
      title: 'Datadog Staff SRE Kit',
      status: 'completed',
      kit: createMockKitData(),
      practiceHistory: [
        { cardId: 'f1', confidence: 3, practicedAt: new Date() },
        { cardId: 'f2', confidence: 3, practicedAt: new Date() },
        // r2 (f3) is completely unpracticed -> must trigger danger zone!
      ],
    });

    const res = await request(app)
      .get(`/api/kits/${kitDoc._id}/practice`)
      .set('Cookie', user1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const radar = res.body.data.weakSpotRadar;
    expect(radar.hasDangerZone).toBe(true);
    expect(radar.dangerZoneCount).toBe(1); // r2 is a 'must' req with 0 cards practiced

    const r2 = radar.requirements.find((r: any) => r.requirementId === 'r2');
    expect(r2.isDangerZone).toBe(true);
    expect(r2.readiness).toBe(0);

    // Verify queue returned
    expect(res.body.data.queue.length).toBe(4);
    // Unpracticed cards (f3, f4) must be at front of queue
    expect(res.body.data.queue[0].isUnpracticed).toBe(true);
    expect(res.body.data.queue[1].isUnpracticed).toBe(true);
  });

  it('rejects cross-tenant practice access with 404', async () => {
    const kitDoc = await KitModel.create({
      userId: user1Id, // Owned by user 1
      title: 'Private Kit',
      status: 'completed',
      kit: createMockKitData(),
    });

    // User 2 attempts to post practice
    const res = await request(app)
      .post(`/api/kits/${kitDoc._id}/practice`)
      .set('Cookie', user2Cookie)
      .send({ ratings: [{ cardId: 'f1', confidence: 2 }] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
