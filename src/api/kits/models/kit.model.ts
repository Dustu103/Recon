import mongoose, { Schema, Document, Model } from 'mongoose';
import { Kit } from '@taro/shared';

export interface IKit extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  companyName: string;
  companyUrl: string;
  roleTitle: string;
  days: number;
  jobDescription: string;
  kit: Kit | null;
  status: 'generating' | 'completed' | 'failed';
  error?: string | null;
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
    kit: {
      type: Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ['generating', 'completed', 'failed'],
      default: 'completed',
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound index for fast tenant kit querying sorted by recency
kitSchema.index({ userId: 1, createdAt: -1 });

export const KitModel: Model<IKit> =
  (mongoose.models.Kit as Model<IKit>) || mongoose.model<IKit>('Kit', kitSchema);
