import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { backendEnv } from '../config/env';

type HealthState = {
  enabled: boolean;
  status: 'disabled' | 'idle' | 'ready' | 'error';
  detail: string;
};

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private queue: Queue | null = null;
  private connection: IORedis | null = null;
  private healthState: HealthState = backendEnv.redis.enabled
    ? {
        enabled: true,
        status: 'idle',
        detail: 'Queue scaffold ready. Waiting for Redis to boot.',
      }
    : {
        enabled: false,
        status: 'disabled',
        detail: 'Queue stays disabled until REDIS_ENABLED=true.',
      };

  async onModuleInit() {
    if (!backendEnv.redis.enabled) {
      return;
    }

    try {
      this.silenceBullMqEvictionWarning();
      this.connection = new IORedis(backendEnv.redis.url, {
        lazyConnect: true,
        maxRetriesPerRequest: null,
      });
      await this.connection.connect();

      this.queue = new Queue(backendEnv.queueName, {
        connection: this.connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      });

      this.healthState = {
        enabled: true,
        status: 'ready',
        detail: `BullMQ queue "${backendEnv.queueName}" is ready.`,
      };

      this.logger.log(`Queue "${backendEnv.queueName}" initialized.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      this.healthState = {
        enabled: true,
        status: 'error',
        detail,
      };

      this.logger.error(`Queue initialization failed: ${detail}`);
    }
  }

  async onModuleDestroy() {
    if (this.queue) {
      await this.queue.close();
    }

    if (this.connection) {
      await this.connection.quit();
    }
  }

  getHealthState() {
    return this.healthState;
  }

  getQueue() {
    return this.queue;
  }

  private silenceBullMqEvictionWarning() {
    const originalWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      const message = args
        .map((value) => (typeof value === 'string' ? value : String(value)))
        .join(' ');

      if (message.includes('IMPORTANT! Eviction policy is') && message.includes('volatile-lru')) {
        return;
      }

      originalWarn(...args);
    };
  }
}
