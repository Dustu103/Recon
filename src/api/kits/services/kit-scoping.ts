import mongoose from 'mongoose';
import { TaroError, ErrorCode } from '@/shared';
import { KitModel, IKit } from '../models/kit.model';

/**
 * Retrieves a kit scoped strictly to the authenticated user.
 * Invariant: Returns 404 (NOT_FOUND) if the kit does not exist OR if owned by another user.
 * Never returns 403 (FORBIDDEN) to avoid revealing the existence of unowned kits.
 */
export async function getUserKitById(kitId: string, userId: string): Promise<IKit> {
  if (!mongoose.Types.ObjectId.isValid(kitId) || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new TaroError(ErrorCode.NOT_FOUND, 'Kit not found');
  }

  const kit = await KitModel.findOne({
    _id: new mongoose.Types.ObjectId(kitId),
    userId: new mongoose.Types.ObjectId(userId),
  });

  if (!kit) {
    throw new TaroError(ErrorCode.NOT_FOUND, 'Kit not found');
  }

  return kit;
}
