import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { backendEnv } from '../config/env';

type HealthState = {
  enabled: boolean;
  status: 'disabled' | 'idle' | 'ready' | 'error';
  detail: string;
};

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: IORedis | null = null;
  private healthState: HealthState = backendEnv.redis.enabled
    ? {
        enabled: true,
        status: 'idle',
        detail: 'Redis configured but not connected yet.',
      }
    : {
        enabled: false,
        status: 'disabled',
        detail: 'Set REDIS_ENABLED=true to activate Redis.',
      };

  async onModuleInit() {
    if (!backendEnv.redis.enabled) {
      return;
    }

    this.client = new IORedis(backendEnv.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });

    this.client.on('ready', () => {
      this.healthState = {
        enabled: true,
        status: 'ready',
        detail: 'Redis connection established.',
      };
      this.logger.log('Redis connected.');
    });

    this.client.on('error', (error) => {
      this.healthState = {
        enabled: true,
        status: 'error',
        detail: error.message,
      };
      this.logger.error(`Redis error: ${error.message}`);
    });

    try {
      await this.client.connect();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      this.healthState = {
        enabled: true,
        status: 'error',
        detail,
      };

      this.logger.error(`Redis connection failed: ${detail}`);
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  getHealthState() {
    return this.healthState;
  }

  getClient() {
    return this.client;
  }
}
