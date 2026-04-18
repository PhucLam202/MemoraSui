import { Schema } from 'mongoose';

export const SyncJobSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    walletId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      default: 'initial-sync',
    },
    status: {
      type: String,
      required: true,
      enum: ['queued', 'running', 'completed', 'failed'],
      default: 'queued',
    },
    retryCount: {
      type: Number,
      required: true,
      default: 0,
    },
    startedAt: {
      type: Date,
      required: false,
    },
    finishedAt: {
      type: Date,
      required: false,
    },
  },
  {
    collection: 'sync_jobs',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);

SyncJobSchema.index({ walletId: 1, status: 1, createdAt: -1 });
