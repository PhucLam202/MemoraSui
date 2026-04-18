import { Schema } from 'mongoose';

export const ChatMessageSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    walletId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      enum: ['user', 'assistant', 'system', 'tool'],
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    toolCalls: {
      type: [Schema.Types.Mixed],
      required: true,
      default: [],
    },
    memoryReferences: {
      type: [Schema.Types.Mixed],
      required: true,
      default: [],
    },
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    collection: 'chat_messages',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);

ChatMessageSchema.index({ sessionId: 1, timestamp: 1 });
