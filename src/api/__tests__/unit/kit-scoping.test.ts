import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../setup/test-db';
import { KitModel } from '../../kits/models/kit.model';
import { getUserKitById } from '../../kits/services/kit-scoping';
import { TaroError, ErrorCode } from '@/shared';

describe('D1 Kit Multi-Tenant Scoping (getUserKitById)', () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('returns the kit document when user owns the kit', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const kit = await KitModel.create({
      userId: ownerId,
      title: 'Senior Frontend Engineer Kit',
    });

    const found = await getUserKitById(kit._id.toString(), ownerId.toString());
    expect(found).toBeDefined();
    expect(found._id.toString()).toBe(kit._id.toString());
    expect(found.title).toBe('Senior Frontend Engineer Kit');
  });

  it('throws NOT_FOUND (404) when kit belongs to a different user (strictly no 403 leakage)', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const attackerId = new mongoose.Types.ObjectId();

    const kit = await KitModel.create({
      userId: ownerId,
      title: 'Private Executive Kit',
    });

    try {
      await getUserKitById(kit._id.toString(), attackerId.toString());
      expect.fail('Expected getUserKitById to throw NOT_FOUND');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TaroError);
      const taroErr = err as TaroError;
      expect(taroErr.code).toBe(ErrorCode.NOT_FOUND);
      expect(taroErr.message).toBe('Kit not found');
    }
  });

  it('throws NOT_FOUND (404) when kit does not exist', async () => {
    const randomKitId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    try {
      await getUserKitById(randomKitId.toString(), userId.toString());
      expect.fail('Expected getUserKitById to throw NOT_FOUND');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TaroError);
      const taroErr = err as TaroError;
      expect(taroErr.code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it('throws NOT_FOUND (404) for invalid ObjectID format without unhandled crash', async () => {
    const userId = new mongoose.Types.ObjectId().toString();

    try {
      await getUserKitById('invalid-id', userId);
      expect.fail('Expected getUserKitById to throw NOT_FOUND');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TaroError);
      const taroErr = err as TaroError;
      expect(taroErr.code).toBe(ErrorCode.NOT_FOUND);
    }

    try {
      await getUserKitById(new mongoose.Types.ObjectId().toString(), 'not-an-id');
      expect.fail('Expected getUserKitById to throw NOT_FOUND');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TaroError);
      const taroErr = err as TaroError;
      expect(taroErr.code).toBe(ErrorCode.NOT_FOUND);
    }
  });
});
