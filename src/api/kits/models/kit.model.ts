import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Minimal D1 Kit model stub.
 * Owns userId multi-tenant scoping and indexing.
 * D5 will extend this schema with Appendix A payloads, raw inputs, and progress tracking.
 */
export interface IKit extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const KitModel: Model<IKit> =
  (mongoose.models.Kit as Model<IKit>) || mongoose.model<IKit>('Kit', kitSchema);
