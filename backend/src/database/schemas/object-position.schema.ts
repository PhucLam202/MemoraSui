import { Schema } from 'mongoose';

export const ObjectPositionSchema = new Schema(
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
    objectId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    owner: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    ownerType: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    latestVersion: {
      type: String,
      required: false,
    },
    version: {
      type: String,
      required: false,
    },
    state: {
      type: String,
      required: true,
      enum: ['owned', 'wrapped', 'transferred', 'mutated', 'unknown'],
      default: 'unknown',
      index: true,
    },
    stateSnapshot: {
      type: String,
      required: false,
      index: true,
    },
    display: {
      type: Schema.Types.Mixed,
      required: false,
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
    collection: 'object_positions',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);
