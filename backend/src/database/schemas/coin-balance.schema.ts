import { Schema } from 'mongoose';

export const CoinBalanceSchema = new Schema(
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
    coinType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    balance: {
      type: String,
      required: true,
    },
    valueUsd: {
      type: Number,
      required: false,
    },
    change: {
      type: String,
      required: false,
    },
    isNative: {
      type: Boolean,
      required: true,
      default: false,
    },
    totalCoinObjects: {
      type: Number,
      required: false,
    },
    transactionDigest: {
      type: String,
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
    collection: 'coin_balances',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);
