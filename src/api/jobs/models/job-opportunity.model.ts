import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IJobOpportunity extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  companyName: string;
  companyUrl: string;
  jobUrl: string;
  location?: string;
  descriptionSnippet?: string;
  seniority?: string;
  status: 'active' | 'closed' | 'reported_closed';
  reportedClosedCount: number;
  verifiedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const jobOpportunitySchema = new Schema<IJobOpportunity>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    companyUrl: {
      type: String,
      required: true,
      trim: true,
    },
    jobUrl: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    location: {
      type: String,
      trim: true,
    },
    descriptionSnippet: {
      type: String,
      trim: true,
    },
    seniority: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'closed', 'reported_closed'],
      default: 'active',
      index: true,
    },
    reportedClosedCount: {
      type: Number,
      default: 0,
    },
    verifiedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7-day TTL index
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  }
);

jobOpportunitySchema.index({ status: 1, createdAt: -1 });

export const JobOpportunityModel: Model<IJobOpportunity> =
  mongoose.models.JobOpportunity ||
  mongoose.model<IJobOpportunity>('JobOpportunity', jobOpportunitySchema);
