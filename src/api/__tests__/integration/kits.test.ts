import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index';
import { connectTestDb, clearTestDb, closeTestDb } from '../setup/test-db';
import { KitModel } from '../../kits/models/kit.model';
import { SESSION_COOKIE_NAME, signSessionToken } from '../../auth/utils/jwt';
import mongoose from 'mongoose';

describe('D3 Kit API Integration Suite', () => {
  const user1Id = new mongoose.Types.ObjectId();
  const user2Id = new mongoose.Types.ObjectId();

  let user1Cookie: string;
  let user2Cookie: string;

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

  describe('POST /api/kits/generate', () => {
    it('requires authentication (401)', async () => {
      const res = await request(app)
        .post('/api/kits/generate')
        .send({
          jd: 'Senior Engineer with TypeScript and Node.js',
          companyUrl: 'http://localhost:3000',
          days: 7,
        });

      expect(res.status).toBe(401);
    });

    it('rejects invalid inputs (missing jd, missing companyUrl, invalid days)', async () => {
      const res1 = await request(app)
        .post('/api/kits/generate')
        .set('Cookie', user1Cookie)
        .send({
          jd: '',
          companyUrl: 'http://localhost:3000',
          days: 7,
        });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/kits/generate')
        .set('Cookie', user1Cookie)
        .send({
          jd: 'Valid JD',
          companyUrl: '',
          days: 7,
        });
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .post('/api/kits/generate')
        .set('Cookie', user1Cookie)
        .send({
          jd: 'Valid JD',
          companyUrl: 'http://localhost:3000',
          days: 100,
        });
      expect(res3.status).toBe(400);
    });

    it('successfully generates a kit and persists it in MongoDB scoped to user', async () => {
      const res = await request(app)
        .post('/api/kits/generate')
        .set('Cookie', user1Cookie)
        .send({
          jd: 'Senior Full Stack Engineer with TypeScript, React, and Node.js microservices.',
          companyUrl: 'http://localhost:3000',
          days: 5,
          roleTitle: 'Senior Full Stack Engineer',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.kitId).toBeDefined();
      expect(res.body.data.kit).toBeDefined();

      const kit = res.body.data.kit;
      expect(kit.role.title).toBe('Senior Full Stack Engineer');
      expect(kit.questions.length).toBeGreaterThan(0);
      expect(kit.schedule.days_available).toBe(5);

      // Verify MongoDB persistence
      const doc = await KitModel.findById(res.body.data.kitId);
      expect(doc).not.toBeNull();
      expect(doc!.userId.toString()).toBe(user1Id.toString());
      expect(doc!.status).toBe('completed');
    });
  });

  describe('GET /api/kits and GET /api/kits/:id', () => {
    it('strictly isolates kits between tenants', async () => {
      // Create a kit for user1
      const kit1 = await KitModel.create({
        userId: user1Id,
        title: 'User 1 Kit',
        companyName: 'Stripe',
        companyUrl: 'https://stripe.com',
        roleTitle: 'Staff Engineer',
        days: 7,
        jobDescription: 'Staff Engineer JD',
        kit: { test: true },
        status: 'completed',
      });

      // User 1 sees kit1
      const resUser1List = await request(app)
        .get('/api/kits')
        .set('Cookie', user1Cookie);

      expect(resUser1List.status).toBe(200);
      expect(resUser1List.body.data).toHaveLength(1);
      expect(resUser1List.body.data[0]._id).toBe(kit1._id.toString());

      // User 2 sees 0 kits
      const resUser2List = await request(app)
        .get('/api/kits')
        .set('Cookie', user2Cookie);

      expect(resUser2List.status).toBe(200);
      expect(resUser2List.body.data).toHaveLength(0);

      // User 2 cannot access user 1 kit by ID (404)
      const resUser2Get = await request(app)
        .get(`/api/kits/${kit1._id}`)
        .set('Cookie', user2Cookie);

      expect(resUser2Get.status).toBe(404);

      // User 1 can access their kit
      const resUser1Get = await request(app)
        .get(`/api/kits/${kit1._id}`)
        .set('Cookie', user1Cookie);

      expect(resUser1Get.status).toBe(200);
      expect(resUser1Get.body.data._id).toBe(kit1._id.toString());
    });
  });

  describe('PATCH /api/kits/:id and DELETE /api/kits/:id', () => {
    it('allows owner to update and delete their kit', async () => {
      const kit = await KitModel.create({
        userId: user1Id,
        title: 'Initial Title',
        companyName: 'Amazon',
        companyUrl: 'https://amazon.jobs',
        roleTitle: 'SDE II',
        days: 10,
        jobDescription: 'SDE II JD',
        kit: { questions: [] },
        status: 'completed',
      });

      // PATCH
      const patchRes = await request(app)
        .patch(`/api/kits/${kit._id}`)
        .set('Cookie', user1Cookie)
        .send({ title: 'Updated Title' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.title).toBe('Updated Title');

      // DELETE
      const deleteRes = await request(app)
        .delete(`/api/kits/${kit._id}`)
        .set('Cookie', user1Cookie);

      expect(deleteRes.status).toBe(200);

      // Verify gone from DB
      const afterDelete = await KitModel.findById(kit._id);
      expect(afterDelete).toBeNull();
    });
  });
});
