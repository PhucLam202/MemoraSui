import { Schema } from 'mongoose';

export const ChatSessionSchema = new Schema(
  {
    walletId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    lastMessageAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    collection: 'chat_sessions',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);

ChatSessionSchema.index({ walletId: 1, lastMessageAt: -1 });
