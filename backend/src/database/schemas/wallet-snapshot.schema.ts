import { Schema } from 'mongoose';

export const WalletSnapshotSchema = new Schema(
  {
    snapshotKey: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
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
    snapshotType: {
      type: String,
      required: true,
      default: 'summary',
      index: true,
    },
    rangeStartMs: {
      type: Number,
      required: false,
      index: true,
    },
    rangeEndMs: {
      type: Number,
      required: false,
      index: true,
    },
    generatedAt: {
      type: Date,
      required: true,
      index: true,
    },
    source: {
      type: Schema.Types.Mixed,
      required: true,
    },
    summary: {
      type: Schema.Types.Mixed,
      required: true,
    },
    syncedAt: {
      type: Date,
      required: false,
    },
  },
  {
    collection: 'wallet_snapshots',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);
