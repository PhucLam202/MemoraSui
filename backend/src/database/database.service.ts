import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import mongoose, { type Connection, type Model } from 'mongoose';
import { backendEnv } from '../config/env';
import { AuthSessionSchema } from './schemas/auth-session.schema';
import { ChatMessageSchema } from './schemas/chat-message.schema';
import { ChatSessionSchema } from './schemas/chat-session.schema';
import { CoinBalanceSchema } from './schemas/coin-balance.schema';
import { NormalizedEventSchema } from './schemas/normalized-event.schema';
import { ObjectPositionSchema } from './schemas/object-position.schema';
import { RawTransactionBlockSchema } from './schemas/raw-transaction-block.schema';
import { SyncJobSchema } from './schemas/sync-job.schema';
import { UserSchema } from './schemas/user.schema';
import { WalletSnapshotSchema } from './schemas/wallet-snapshot.schema';
import { WalletSchema } from './schemas/wallet.schema';

type HealthState = {
  enabled: boolean;
  status: 'disabled' | 'idle' | 'ready' | 'error';
  detail: string;
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private connection: Connection | null = null;
  private healthState: HealthState = backendEnv.mongodb.enabled
    ? {
        enabled: true,
        status: 'idle',
        detail: 'MongoDB configured but not connected yet.',
      }
    : {
        enabled: false,
        status: 'disabled',
        detail: 'Set MONGODB_ENABLED=true to activate MongoDB.',
      };

  async onModuleInit() {
    if (!backendEnv.mongodb.enabled) {
      return;
    }

    try {
      this.connection = await mongoose
        .createConnection(backendEnv.mongodb.uri, {
          serverSelectionTimeoutMS: 5000,
        })
        .asPromise();

      this.connection.model('Wallet', WalletSchema);
      this.connection.model('SyncJob', SyncJobSchema);
      this.connection.model('User', UserSchema);
      this.connection.model('AuthSession', AuthSessionSchema);
      this.connection.model('RawTransactionBlock', RawTransactionBlockSchema);
      this.connection.model('NormalizedEvent', NormalizedEventSchema);
      this.connection.model('CoinBalance', CoinBalanceSchema);
      this.connection.model('ObjectPosition', ObjectPositionSchema);
      this.connection.model('WalletSnapshot', WalletSnapshotSchema);
      this.connection.model('ChatSession', ChatSessionSchema);
      this.connection.model('ChatMessage', ChatMessageSchema);

      this.healthState = {
        enabled: true,
        status: 'ready',
        detail: 'MongoDB connection established and base models registered.',
      };

      this.logger.log('MongoDB connected.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      this.healthState = {
        enabled: true,
        status: 'error',
        detail,
      };

      this.logger.error(`MongoDB connection failed: ${detail}`);
    }
  }

  async onModuleDestroy() {
    if (this.connection) {
      await this.connection.close();
    }
  }

  getHealthState() {
    return this.healthState;
  }

  getConnection() {
    return this.connection;
  }

  getModel<T = unknown>(name: string): Model<T> | null {
    if (!this.connection) {
      return null;
    }

    return this.connection.model<T>(name);
  }
}
