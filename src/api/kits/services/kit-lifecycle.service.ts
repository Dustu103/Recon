import crypto from 'crypto';
import mongoose from 'mongoose';
import { TaroError, ErrorCode, nextOffsetFromIds } from '@/shared';
import { Kit } from '@taro/shared';
import { generateKit } from '@/core';
import { KitModel, IKit, KitStatus, IKitCheckpoints, IKitError } from '../models/kit.model';
import { getUserKitById } from './kit-scoping';
import { sanitizeJobUrl } from '@/core/crawler/job-sanitizer';
import { JobOpportunityModel } from '../../jobs/models/job-opportunity.model';

export interface ProgressSnapshot {
  kitId: string;
  status: KitStatus;
  percent: number;
  step: string;
  message: string;
  checkpoints?: IKitCheckpoints;
  error?: IKitError | string | null;
  updatedAt: Date;
}

export interface GenerateKitServiceInput {
  jd: string;
  companyUrl: string;
  days: number;
  roleTitle?: string;
  jobUrl?: string;
  mock?: boolean;
}

// In-process fast lookup table for high-frequency polling
const inMemoryProgress = new Map<string, ProgressSnapshot>();

/**
 * Computes deterministic SHA-256 hash across (userId, companyUrl, jd)
 * to detect identical duplicate generation requests.
 */
export function computeInputHash(userId: string, jd: string, companyUrl: string): string {
  const normalizedJd = jd.trim().replace(/\r\n/g, '\n');
  const normalizedUrl = companyUrl.trim().toLowerCase().replace(/\/+$/, '');
  return crypto
    .createHash('sha256')
    .update(`${userId}:${normalizedUrl}:${normalizedJd}`)
    .digest('hex');
}

/**
 * Map pipeline steps to KitStatus
 */
function mapStepToStatus(step: string): KitStatus {
  switch (step) {
    case 'extract':
      return 'extracting';
    case 'crawl':
      return 'crawling';
    case 'brief':
      return 'extracting';
    case 'questions':
    case 'flashcards':
      return 'generating';
    case 'schedule':
      return 'scheduling';
    case 'complete':
      return 'completed';
    default:
      return 'generating';
  }
}

function getFallbackPercent(status: KitStatus): number {
  switch (status) {
    case 'pending':
      return 5;
    case 'extracting':
      return 20;
    case 'crawling':
      return 40;
    case 'generating':
      return 75;
    case 'scheduling':
      return 95;
    case 'completed':
      return 100;
    case 'failed':
      return 0;
    default:
      return 10;
  }
}

function getStatusMessage(status: KitStatus): string {
  switch (status) {
    case 'pending':
      return 'Generation queued...';
    case 'crawling':
      return 'Gathering intelligence on company and architecture...';
    case 'extracting':
      return 'Extracting requirements and competencies from job description...';
    case 'generating':
      return 'Synthesizing targeted interview questions and flashcards...';
    case 'scheduling':
      return 'Structuring front-loaded day-by-day study schedule...';
    case 'completed':
      return 'Interview preparation kit generated successfully!';
    case 'failed':
      return 'Generation failed.';
    default:
      return 'Processing kit...';
  }
}

/**
 * KitLifecycleService coordinates creation, deduplication, background pipeline
 * orchestration, in-memory + durable progress updates, and fail-safe transitions.
 */
export class KitLifecycleService {
  /**
   * Checks if an identical active (non-failed) kit already exists for the user.
   * If found, returns existing kit ID. Otherwise, creates a new pending kit record.
   */
  static async createOrGetPendingKit(
    userId: string,
    input: GenerateKitServiceInput
  ): Promise<{ kitId: string; isExisting: boolean; status: KitStatus }> {
    const inputHash = computeInputHash(userId, input.jd, input.companyUrl);

    // Check for an existing non-failed kit matching this hash
    const existing = await KitModel.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      inputHash,
      status: { $ne: 'failed' },
    }).lean();

    if (existing) {
      return {
        kitId: existing._id.toString(),
        isExisting: true,
        status: existing.status,
      };
    }

    let parsedHostname = 'Company';
    try {
      parsedHostname = new URL(input.companyUrl.trim()).hostname.replace(/^www\./, '');
    } catch {
      // ignore
    }

    const defaultTitle = input.roleTitle?.trim()
      ? `${input.roleTitle.trim()} at ${parsedHostname}`
      : `Interview Kit for ${parsedHostname}`;

    const doc = await KitModel.create({
      userId: new mongoose.Types.ObjectId(userId),
      title: defaultTitle,
      companyName: parsedHostname,
      companyUrl: input.companyUrl.trim(),
      roleTitle: input.roleTitle?.trim() || '',
      days: input.days,
      jobDescription: input.jd.trim(),
      inputHash,
      status: 'pending',
      checkpoints: {},
    });

    const kitId = doc._id.toString();

    inMemoryProgress.set(kitId, {
      kitId,
      status: 'pending',
      percent: 5,
      step: 'pending',
      message: 'Generation request received and queued...',
      updatedAt: new Date(),
    });

    return {
      kitId,
      isExisting: false,
      status: 'pending',
    };
  }

  /**
   * Initiates the core generation pipeline in the background.
   * Wrapped in a fail-safe try/catch that guarantees failKit is called on error.
   */
  static startGeneration(
    kitId: string,
    userId: string,
    input: GenerateKitServiceInput
  ): void {
    // Non-blocking asynchronous execution
    (async () => {
      let currentStep = 'init';
      let lastPersistedStatus: KitStatus = 'pending';

      try {
        const kit = await generateKit({
          jd: input.jd.trim(),
          companyUrl: input.companyUrl.trim(),
          days: input.days,
          roleTitle: input.roleTitle?.trim() || undefined,
          mock: input.mock,
          onProgress: async (p) => {
            currentStep = p.step;
            const newStatus = mapStepToStatus(p.step);

            // 1. Fast in-memory update on every tick
            inMemoryProgress.set(kitId, {
              kitId,
              status: newStatus,
              percent: p.percent,
              step: p.step,
              message: p.message,
              updatedAt: new Date(),
            });

            // 2. Hybrid model: Persist durable status to MongoDB ONLY on major checkpoint transitions
            if (newStatus !== lastPersistedStatus) {
              lastPersistedStatus = newStatus;
              await KitModel.findOneAndUpdate(
                { _id: new mongoose.Types.ObjectId(kitId) },
                {
                  $set: {
                    status: newStatus,
                    updatedAt: new Date(),
                  },
                }
              ).catch((err) => {
                console.error(`[KitLifecycleService] Checkpoint update error for ${kitId}:`, err);
              });
            }
          },
        });

        // Mark kit completed durably in MongoDB
        await this.completeKit(kitId, kit, input.jobUrl || input.companyUrl);
      } catch (err: any) {
        console.error(`[KitLifecycleService] Generation failed for kit ${kitId}:`, err);
        await this.failKit(kitId, {
          code: err.code || 'GENERATION_FAILED',
          message: err.message || 'Pipeline execution encountered an unexpected error',
          step: currentStep,
          occurredAt: new Date(),
        });
      }
    })();
  }

  /**
   * Atomically transitions kit to 'completed', saves the validated kit structure,
   * updates checkpoints, and clears in-memory tracking.
   */
  static async completeKit(
    kitId: string,
    kit: Kit,
    rawJobUrl?: string
  ): Promise<void> {
    const checkpoints: IKitCheckpoints = {
      research: {
        companyName: kit.source.company,
        pagesCrawled: kit.source.pages_used?.length || 0,
      },
      role: {
        title: kit.role.title,
        seniority: kit.role.seniority,
        requirementsCount: kit.role.requirements?.length || 0,
      },
      brief: {
        companyBrief: (kit.company_brief as any)?.summary?.slice(0, 300) || '',
      },
      questionCount: kit.questions?.length || 0,
      coverage: {
        uncoveredCount: kit.coverage?.uncovered_requirement_ids?.length || 0,
        passes: kit.coverage?.passes || 1,
      },
      scheduleDays: kit.schedule?.days_available || 7,
    };

    const nextQuestionIndex = nextOffsetFromIds('q', (kit.questions || []).map((q) => q.id)) + 1;
    const nextFlashcardIndex = nextOffsetFromIds('f', (kit.flashcards || []).map((f) => f.id)) + 1;

    await KitModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(kitId) },
      {
        $set: {
          title: `${kit.role.title} at ${kit.source.company}`,
          companyName: kit.source.company,
          companyUrl: kit.source.company_url,
          roleTitle: kit.role.title,
          kit,
          nextQuestionIndex,
          nextFlashcardIndex,
          status: 'completed',
          checkpoints,
          updatedAt: new Date(),
        },
      }
    );

    // Keep completed entry in memory briefly for any in-flight pollers
    inMemoryProgress.set(kitId, {
      kitId,
      status: 'completed',
      percent: 100,
      step: 'complete',
      message: 'Interview preparation kit generated and verified successfully!',
      checkpoints,
      updatedAt: new Date(),
    });

    // Schedule cleanup of memory map after 2 minutes
    setTimeout(() => {
      inMemoryProgress.delete(kitId);
    }, 120000);

    // Fire-and-forget record verified job opportunity for recommendations
    recordOpportunityFromKit(kit, kit.source.company_url, rawJobUrl);
  }

  /**
   * Atomically transitions kit to 'failed', records error subdocument,
   * and updates in-memory snapshot.
   */
  static async failKit(
    kitId: string,
    error: IKitError
  ): Promise<void> {
    await KitModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(kitId) },
      {
        $set: {
          status: 'failed',
          error,
          updatedAt: new Date(),
        },
      }
    ).catch(() => {});

    inMemoryProgress.set(kitId, {
      kitId,
      status: 'failed',
      percent: 0,
      step: error.step || 'failed',
      message: error.message,
      error,
      updatedAt: new Date(),
    });

    // Schedule cleanup of memory map after 2 minutes
    setTimeout(() => {
      inMemoryProgress.delete(kitId);
    }, 120000);
  }

  /**
   * Retrieves current generation progress using the Hybrid Model:
   * 1. Validates user ownership via getUserKitById (ensures 404 on unowned kits).
   * 2. Returns memory snapshot if active.
   * 3. Falls back to durable Mongo document state if memory snapshot is absent.
   */
  static async getKitProgress(
    kitId: string,
    userId: string
  ): Promise<{
    kitId: string;
    status: KitStatus;
    percent: number;
    step: string;
    message: string;
    completed: boolean;
    checkpoints?: IKitCheckpoints;
    error?: IKitError | string | null;
  }> {
    // Multi-tenant authorization guard
    const kit = await getUserKitById(kitId, userId);

    // If completed or failed durably in DB
    if (kit.status === 'completed') {
      return {
        kitId,
        status: 'completed',
        percent: 100,
        step: 'complete',
        message: 'Interview preparation kit generated and verified successfully!',
        completed: true,
        checkpoints: kit.checkpoints,
      };
    }

    if (kit.status === 'failed') {
      return {
        kitId,
        status: 'failed',
        percent: 0,
        step: typeof kit.error === 'object' && kit.error?.step ? kit.error.step : 'failed',
        message:
          typeof kit.error === 'object' && kit.error?.message
            ? kit.error.message
            : typeof kit.error === 'string'
            ? kit.error
            : 'Generation failed.',
        completed: false,
        error: kit.error,
      };
    }

    // Check fast in-memory map
    const mem = inMemoryProgress.get(kitId);
    if (mem) {
      return {
        kitId,
        status: mem.status,
        percent: mem.percent,
        step: mem.step,
        message: mem.message,
        completed: mem.status === 'completed',
        checkpoints: kit.checkpoints,
        error: mem.error,
      };
    }

    // Durable fallback from MongoDB if in-memory cache is missing (e.g. process restart)
    return {
      kitId,
      status: kit.status,
      percent: getFallbackPercent(kit.status),
      step: kit.status,
      message: getStatusMessage(kit.status),
      completed: false,
      checkpoints: kit.checkpoints,
    };
  }

  /**
   * Direct inspection / test helper for in-memory store
   */
  static _getInMemorySnapshot(kitId: string): ProgressSnapshot | undefined {
    return inMemoryProgress.get(kitId);
  }

  static _clearInMemorySnapshot(kitId: string): void {
    inMemoryProgress.delete(kitId);
  }
}

/**
 * Asynchronously records or upserts verified public job opportunities
 */
function recordOpportunityFromKit(kit: any, companyUrl: string, rawJobUrl?: string) {
  try {
    const urlToUse = rawJobUrl || companyUrl;
    if (!urlToUse || typeof urlToUse !== 'string') return;
    const cleanJobUrl = sanitizeJobUrl(urlToUse);
    const cleanCompanyUrl = sanitizeJobUrl(kit.source?.company_url || cleanJobUrl);
    if (!cleanJobUrl || cleanJobUrl.length < 5) return;

    JobOpportunityModel.findOneAndUpdate(
      { jobUrl: cleanJobUrl },
      {
        $set: {
          title: kit.role?.title || 'Software Engineer',
          companyName: kit.source?.company || 'Company',
          companyUrl: cleanCompanyUrl,
          descriptionSnippet: kit.jobDescription?.slice(0, 300) || '',
          seniority: kit.role?.seniority || undefined,
          status: 'active',
          verifiedAt: new Date(),
        },
        $setOnInsert: {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day TTL
          reportedClosedCount: 0,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    ).catch(() => {
      // Non-blocking fire-and-forget
    });
  } catch {
    // Non-blocking
  }
}
