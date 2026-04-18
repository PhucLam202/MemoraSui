import { Schema } from 'mongoose';

export const RawTransactionBlockSchema = new Schema(
  {
    walletAddress: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    network: {
      type: String,
      required: true,
      enum: ['devnet', 'testnet', 'mainnet'],
      index: true,
    },
    digest: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    sender: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    recipient: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    gasFee: {
      type: String,
      required: false,
    },
    timestampMs: {
      type: Number,
      required: false,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['success', 'failure', 'unknown'],
      default: 'unknown',
      index: true,
    },
    checkpoint: {
      type: String,
      required: false,
      index: true,
    },
    balanceChanges: {
      type: [Schema.Types.Mixed],
      required: true,
      default: [],
    },
    objectChanges: {
      type: [Schema.Types.Mixed],
      required: true,
      default: [],
    },
    eventCount: {
      type: Number,
      required: true,
      default: 0,
    },
    raw: {
      type: Schema.Types.Mixed,
      required: true,
    },
    syncedAt: {
      type: Date,
      required: false,
    },
  },
  {
    collection: 'raw_transaction_blocks',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);
