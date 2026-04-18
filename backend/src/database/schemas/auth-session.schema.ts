import { Schema } from 'mongoose';

export const AuthSessionSchema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    walletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    network: {
      type: String,
      required: true,
      enum: ['devnet', 'testnet', 'mainnet'],
    },
    walletName: {
      type: String,
      required: false,
    },
    nonce: {
      type: String,
      required: true,
    },
    challengeHash: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'revoked', 'expired'],
      default: 'active',
    },
    tokenVersion: {
      type: Number,
      required: true,
      default: 1,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    refreshExpiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      required: false,
    },
    lastRefreshedAt: {
      type: Date,
      required: false,
    },
    userAgent: {
      type: String,
      required: false,
    },
    ipAddress: {
      type: String,
      required: false,
    },
  },
  {
    collection: 'auth_sessions',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);

AuthSessionSchema.index({ userId: 1, status: 1, createdAt: -1 });
AuthSessionSchema.index({ walletAddress: 1, network: 1, status: 1 });
