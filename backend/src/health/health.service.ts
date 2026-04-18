import { Injectable } from '@nestjs/common';
import { backendEnv } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../queue/redis.service';
import { MetricsService } from '../observability/metrics.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
    private readonly metricsService: MetricsService,
  ) {}

  getHealth() {
    return {
      appName: backendEnv.appName,
      network: backendEnv.network,
      timestamp: new Date().toISOString(),
      services: {
        api: {
          enabled: true,
          status: 'ready' as const,
          detail: `NestJS API is serving on port ${backendEnv.port}.`,
        },
        mongodb: this.databaseService.getHealthState(),
        redis: this.redisService.getHealthState(),
        queue: this.queueService.getHealthState(),
      },
      metrics: this.metricsService.getSnapshot(),
    };
  }
}
