import { Schema } from 'mongoose';

export const UserSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    primaryWalletAddress: {
      type: String,
      required: true,
      trim: true,
    },
    walletAddresses: {
      type: [String],
      required: true,
      default: [],
    },
    network: {
      type: String,
      required: true,
      enum: ['devnet', 'testnet', 'mainnet'],
    },
    lastAuthenticatedAt: {
      type: Date,
      required: false,
    },
    sessionMetadata: {
      lastSessionId: {
        type: String,
        required: false,
      },
      lastWalletName: {
        type: String,
        required: false,
      },
      lastSeenAt: {
        type: Date,
        required: false,
      },
    },
  },
  {
    collection: 'users',
    timestamps: true,
    versionKey: 'schemaVersion',
  },
);

UserSchema.index({ primaryWalletAddress: 1, network: 1 }, { unique: true });
