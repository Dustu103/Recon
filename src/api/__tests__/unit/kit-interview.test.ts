import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../../index';
import { connectTestDb, clearTestDb, closeTestDb } from '../setup/test-db';
import { KitModel } from '../../kits/models/kit.model';
import { SESSION_COOKIE_NAME, signSessionToken } from '../../auth/utils/jwt';
import { Kit } from '@taro/shared';

describe('AI Mock Interview API Suite', () => {
  const user1Id = new mongoose.Types.ObjectId();
  const user2Id = new mongoose.Types.ObjectId();

  let user1Cookie: string;
  let user2Cookie: string;

  const createMockKitData = (): Kit => ({
    source: {
      company: 'Uber',
      company_url: 'https://uber.com',
      role: 'Senior Software Engineer',
      location: 'San Francisco, CA',
      jd_chars: 850,
      researched_at: new Date().toISOString(),
      pages_used: ['https://uber.com/careers'],
    },
    company_brief: {
      summary: 'Uber develops technologies that power movement and logistics worldwide.',
      what_they_do: 'Ride-hailing, food delivery, and freight transportation platforms.',
      sources: ['https://uber.com'],
    },
    role: {
      title: 'Senior Software Engineer',
      seniority: 'Senior',
      responsibilities: ['Build high-throughput dispatch algorithms', 'Optimize geo-spatial queries'],
      requirements: [
        { id: 'r1', text: 'Low-latency distributed systems', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Cross-functional stakeholder communication', kind: 'behavioural', priority: 'must' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'How would you design a distributed rate limiter for millions of requests per second?',
        answer_outline: 'Token bucket with Redis cluster and local sliding windows.',
        difficulty: 3,
      },
    ],
    flashcards: [],
    schedule: {
      days_available: 2,
      days: [],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  });

  beforeAll(async () => {
    await connectTestDb();
    const token1 = signSessionToken({ userId: user1Id.toString(), email: 'u1@uber-test.ai' });
    user1Cookie = `${SESSION_COOKIE_NAME}=${token1}`;
    const token2 = signSessionToken({ userId: user2Id.toString(), email: 'u2@uber-test.ai' });
    user2Cookie = `${SESSION_COOKIE_NAME}=${token2}`;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('POST /api/kits/:id/interview/turn — processes candidate answer turn and returns AI interviewer response', async () => {
    const kit = await KitModel.create({
      userId: user1Id.toString(),
      companyUrl: 'https://uber.com',
      jobDescription: 'Senior SWE at Uber',
      days: 2,
      status: 'completed',
      kit: createMockKitData(),
    });

    const res = await request(app)
      .post(`/api/kits/${kit._id}/interview/turn`)
      .set('Cookie', user1Cookie)
      .send({
        questionId: 'q1',
        questionPrompt: 'How would you design a distributed rate limiter?',
        category: 'technical',
        userMessage: 'I would use a token bucket algorithm with Redis and in-memory local caching.',
        conversationHistory: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.interviewerReply).toBeDefined();
    expect(res.body.data.feedback).toBeDefined();
    expect(typeof res.body.data.feedback.score).toBe('number');
  });

  it('POST /api/kits/:id/interview/turn — processes turn with attached JavaScript code snippet', async () => {
    const kit = await KitModel.create({
      userId: user1Id.toString(),
      companyUrl: 'https://uber.com',
      jobDescription: 'Senior SWE at Uber',
      days: 2,
      status: 'completed',
      kit: createMockKitData(),
    });

    const res = await request(app)
      .post(`/api/kits/${kit._id}/interview/turn`)
      .set('Cookie', user1Cookie)
      .send({
        questionId: 'q1',
        questionPrompt: 'Implement a token bucket rate limiter in JavaScript.',
        category: 'technical',
        userMessage: 'Here is my implementation using sliding token refills.',
        codeSnippet: {
          language: 'javascript',
          code: 'class TokenBucket { constructor(capacity, fillPerSec) { this.capacity = capacity; } }',
        },
        conversationHistory: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.feedback.codeAnalysis).toBeDefined();
  });

  it('POST /api/kits/:id/interview/turn — processes turn with attached C++ code snippet', async () => {
    const kit = await KitModel.create({
      userId: user1Id.toString(),
      companyUrl: 'https://uber.com',
      jobDescription: 'Senior SWE at Uber',
      days: 2,
      status: 'completed',
      kit: createMockKitData(),
    });

    const res = await request(app)
      .post(`/api/kits/${kit._id}/interview/turn`)
      .set('Cookie', user1Cookie)
      .send({
        questionId: 'q1',
        questionPrompt: 'Implement a thread-safe token bucket rate limiter in C++.',
        category: 'technical',
        userMessage: 'Using std::mutex and std::chrono.',
        codeSnippet: {
          language: 'cpp',
          code: '#include <mutex>\n#include <chrono>\nclass TokenBucket { std::mutex mtx; };',
        },
        conversationHistory: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.feedback.codeAnalysis).toBeDefined();
  });

  it('POST /api/kits/:id/interview/report — generates comprehensive performance and repeating errors report with timer pacing', async () => {
    const kit = await KitModel.create({
      userId: user1Id.toString(),
      companyUrl: 'https://uber.com',
      jobDescription: 'Senior SWE at Uber',
      days: 2,
      status: 'completed',
      kit: createMockKitData(),
    });

    const res = await request(app)
      .post(`/api/kits/${kit._id}/interview/report`)
      .set('Cookie', user1Cookie)
      .send({
        questionId: 'q1',
        questionPrompt: 'How would you design a distributed rate limiter?',
        category: 'technical',
        durationSeconds: 520, // 8m 40s
        conversationHistory: [
          { role: 'interviewer', content: 'Tell me your rate limiter design.' },
          { role: 'candidate', content: 'Token bucket with Redis.' },
        ],
        codeSnippet: {
          language: 'javascript',
          code: 'class RateLimiter { check() { return true; } }',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.overallScore).toBeDefined();
    expect(res.body.data.durationFormatted).toBe('8m 40s');
    expect(res.body.data.pacingEvaluation).toBeDefined();
    expect(Array.isArray(res.body.data.repeatingErrors)).toBe(true);
    expect(Array.isArray(res.body.data.strengths)).toBe(true);
    expect(Array.isArray(res.body.data.actionablePracticePlan)).toBe(true);
  });

  it('enforces multi-tenant ownership isolation (strict 404 for unauthorized user)', async () => {
    const kit = await KitModel.create({
      userId: user1Id.toString(),
      companyUrl: 'https://uber.com',
      jobDescription: 'Senior SWE at Uber',
      days: 2,
      status: 'completed',
      kit: createMockKitData(),
    });

    // User 2 attempts to post interview turn on User 1's kit
    const res = await request(app)
      .post(`/api/kits/${kit._id}/interview/turn`)
      .set('Cookie', user2Cookie)
      .send({
        questionId: 'q1',
        questionPrompt: 'Test prompt',
        category: 'technical',
        userMessage: 'Unauthorized attempt',
        conversationHistory: [],
      });

    expect(res.status).toBe(404);
  });
});
