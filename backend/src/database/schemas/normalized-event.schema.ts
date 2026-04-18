import { Schema } from 'mongoose';

export const NormalizedEventSchema = new Schema(
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
    referenceDigest: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    actionType: {
      type: String,
      required: true,
      enum: ['transfer', 'receive', 'swap', 'mint', 'burn', 'stake', 'unstake', 'nft_buy', 'nft_sell', 'contract_call', 'unknown'],
      default: 'unknown',
      index: true,
    },
    protocol: {
      type: String,
      required: true,
      default: 'unknown',
      trim: true,
      index: true,
    },
    assetIn: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    assetOut: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    amount: {
      type: String,
      required: true,
      default: '0',
    },
    walletInvolvement: {
      type: String,
      required: true,
      enum: ['sender', 'recipient', 'both', 'observer'],
      default: 'observer',
      index: true,
    },
    counterparty: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    timestampMs: {
      type: Number,
      required: false,
      index: true,
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
    collection: 'normalized_events',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);
