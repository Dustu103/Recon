import { KitModel } from '../models/kit.model';
import { KitLifecycleService } from './kit-lifecycle.service';

export interface ReapResult {
  reapedCount: number;
  reapedIds: string[];
}

/**
 * Sweeps the database for orphaned kit generations stuck in active states
 * for longer than the timeout period (default: 15 minutes) and marks them as failed.
 */
export async function reapStaleKits(
  timeoutMs: number = 15 * 60 * 1000
): Promise<ReapResult> {
  const cutoff = new Date(Date.now() - timeoutMs);

  const activeStatuses = [
    'pending',
    'crawling',
    'extracting',
    'generating',
    'scheduling',
  ];

  const staleKits = await KitModel.find({
    status: { $in: activeStatuses },
    updatedAt: { $lt: cutoff },
  })
    .select('_id status updatedAt')
    .lean();

  if (staleKits.length === 0) {
    return { reapedCount: 0, reapedIds: [] };
  }

  const reapedIds: string[] = [];

  for (const kit of staleKits) {
    const kitId = kit._id.toString();
    try {
      await KitModel.updateOne(
        { _id: kit._id },
        {
          $set: {
            status: 'failed',
            error: {
              code: 'STALE_GENERATION_TIMEOUT',
              message:
                'Generation job timed out without progress updates and was safely terminated by the stale-job reaper.',
              step: kit.status,
              occurredAt: new Date(),
            },
            updatedAt: new Date(),
          },
        }
      );

      // Clean up in-memory tracking
      KitLifecycleService._clearInMemorySnapshot(kitId);
      reapedIds.push(kitId);
    } catch (err) {
      console.error(`[StaleReaper] Failed to reap stale kit ${kitId}:`, err);
    }
  }

  return {
    reapedCount: reapedIds.length,
    reapedIds,
  };
}

/**
 * Initializes a background daemon interval to periodically reap stale jobs.
 */
export function startStaleReaper(
  intervalMs: number = 60 * 1000,
  timeoutMs: number = 15 * 60 * 1000
): NodeJS.Timeout {
  // Execute once immediately upon startup
  reapStaleKits(timeoutMs).catch((err) => {
    console.error('[StaleReaper] Initial reaper run error:', err);
  });

  const timer = setInterval(() => {
    reapStaleKits(timeoutMs).catch((err) => {
      console.error('[StaleReaper] Periodic reaper run error:', err);
    });
  }, intervalMs);

  timer.unref();
  return timer;
}
