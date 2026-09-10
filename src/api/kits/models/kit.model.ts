import mongoose, { Schema, Document, Model } from 'mongoose';
import { Kit } from '@taro/shared';

export type KitStatus =
  | 'pending'
  | 'crawling'
  | 'extracting'
  | 'generating'
  | 'scheduling'
  | 'completed'
  | 'failed';

export interface IKitCheckpoints {
  research?: {
    companyName?: string;
    pagesCrawled?: number;
    techStack?: string[];
  };
  role?: {
    title?: string;
    seniority?: string;
    requirementsCount?: number;
  };
  brief?: {
    companyBrief?: string;
    mission?: string;
  };
  questionCount?: number;
  coverage?: {
    uncoveredCount?: number;
    passes?: number;
  };
  scheduleDays?: number;
}

export interface IKitError {
  code: string;
  message: string;
  step?: string;
  occurredAt?: Date;
}

export interface IKit extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  companyName: string;
  companyUrl: string;
  roleTitle: string;
  days: number;
  jobDescription: string;
  inputHash?: string | null;
  kit: Kit | null;
  status: KitStatus;
  checkpoints?: IKitCheckpoints;
  error?: IKitError | string | null;
  nextQuestionIndex?: number;
  nextFlashcardIndex?: number;
  regenerationLock?: { section: string; category?: string; lockedAt: Date; expiresAt: Date } | null;
  progress?: {
    notes?: Record<string, string>;
    starred?: string[];
    flashcardMastery?: Record<string, string>;
    completedDays?: number[];
  };
  __v?: number;
  createdAt: Date;
  updatedAt: Date;
}

const kitSchema = new Schema<IKit>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: 'Untitled Kit',
      trim: true,
    },
    companyName: {
      type: String,
      default: '',
      trim: true,
    },
    companyUrl: {
      type: String,
      default: '',
      trim: true,
    },
    roleTitle: {
      type: String,
      default: '',
      trim: true,
    },
    days: {
      type: Number,
      default: 7,
    },
    jobDescription: {
      type: String,
      default: '',
    },
    inputHash: {
      type: String,
      default: null,
      index: true,
    },
    kit: {
      type: Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'crawling',
        'extracting',
        'generating',
        'scheduling',
        'completed',
        'failed',
      ],
      default: 'pending',
    },
    checkpoints: {
      type: Schema.Types.Mixed,
      default: {},
    },
    error: {
      type: Schema.Types.Mixed,
      default: null,
    },
    nextQuestionIndex: {
      type: Number,
      default: 1,
    },
    nextFlashcardIndex: {
      type: Number,
      default: 1,
    },
    regenerationLock: {
      type: Schema.Types.Mixed,
      default: null,
    },
    progress: {
      type: Schema.Types.Mixed,
      default: () => ({ notes: {}, starred: [], flashcardMastery: {}, completedDays: [] }),
    },
  },
  {
    timestamps: true,
    versionKey: '__v',
  }
);

// Compound index for fast tenant kit querying sorted by recency
kitSchema.index({ userId: 1, createdAt: -1 });

// Compound index for duplicate generation detection (userId + inputHash + status)
kitSchema.index({ userId: 1, inputHash: 1, status: 1 });

// Compound index for stale-job reaper sweeping
kitSchema.index({ status: 1, updatedAt: 1 });

export const KitModel: Model<IKit> =
  (mongoose.models.Kit as Model<IKit>) || mongoose.model<IKit>('Kit', kitSchema);

