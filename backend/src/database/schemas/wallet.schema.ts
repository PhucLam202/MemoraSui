import { Schema } from 'mongoose';

export const WalletSchema = new Schema(
  {
    userId: {
      type: String,
      required: false,
      index: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    network: {
      type: String,
      required: true,
      enum: ['devnet', 'testnet', 'mainnet'],
    },
    label: {
      type: String,
      required: false,
    },
    isPrimary: {
      type: Boolean,
      required: true,
      default: true,
    },
    lastAuthenticatedAt: {
      type: Date,
      required: false,
    },
    lastSyncedAt: {
      type: Date,
      required: false,
    },
    syncCursor: {
      type: String,
      required: false,
    },
  },
  {
    collection: 'wallets',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);

WalletSchema.index({ address: 1, network: 1 }, { unique: true });
WalletSchema.index({ userId: 1, isPrimary: 1 }, { unique: true, partialFilterExpression: { isPrimary: true } });
