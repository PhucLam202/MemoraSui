import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createMemWalClient, type MemWalClientLike } from './memwal.client';
import { backendEnv } from '../../config/env';

@Injectable()
export class MemWalService implements OnModuleInit {
  private readonly logger = new Logger(MemWalService.name);
  private client: MemWalClientLike | null = null;
  private memWalLimiter: Promise<void> = Promise.resolve();
  private memWalNextAllowedAt = Date.now();
  private healthState: { enabled: boolean; ready: boolean; detail: string } = {
    enabled: false,
    ready: false,
    detail: 'MemWal disabled.',
  };

  async onModuleInit() {
    this.client = await createMemWalClient();
    if (!this.client) {
      this.healthState = {
        enabled: false,
        ready: false,
        detail: 'MemWal is disabled or missing credentials.',
      };
      return;
    }

    try {
      const result = await this.client.health();
      this.healthState = {
        enabled: true,
        ready: true,
        detail: `${result.status}@${result.version}`,
      };
      this.logger.log(`MemWal ready: ${result.status}@${result.version}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.healthState = {
        enabled: true,
        ready: false,
        detail,
      };
      this.logger.warn(`MemWal health check failed: ${detail}`);
    }
  }

  getHealthState() {
    return this.healthState;
  }

  isEnabled() {
    return this.client !== null;
  }

  async health() {
    if (!this.client) {
      return {
        status: this.healthState.ready ? 'ready' : 'disabled',
        version: 'n/a',
      };
    }

    return this.client.health();
  }

  async remember(text: string, namespace?: string) {
    if (!this.client) {
      return null;
    }

    return this.runWithRateLimit(() => this.client!.remember(text, namespace));
  }

  async recall(query: string, limit = 5, namespace?: string) {
    if (!this.client) {
      return {
        results: [],
        total: 0,
      };
    }

    return this.runWithRateLimit(() => this.client!.recall(query, limit, namespace));
  }

  async analyze(text: string, namespace?: string) {
    if (!this.client) {
      return {
        facts: [],
        total: 0,
        owner: 'disabled',
      };
    }

    return this.runWithRateLimit(() => this.client!.analyze(text, namespace));
  }

  async restore(namespace: string, limit = 50) {
    if (!this.client) {
      return {
        restored: 0,
        skipped: 0,
        total: 0,
        namespace,
        owner: 'disabled',
      };
    }

    return this.runWithRateLimit(() => this.client!.restore(namespace, limit));
  }

  private async runWithRateLimit<T>(task: () => Promise<T>) {
    let release: () => void = () => {};
    const previous = this.memWalLimiter;
    this.memWalLimiter = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const intervalMs = Math.max(1, Math.floor(1000 / backendEnv.memwal.rateLimitPerSecond));
    const waitMs = Math.max(0, this.memWalNextAllowedAt - Date.now());
    this.memWalNextAllowedAt = Math.max(this.memWalNextAllowedAt, Date.now()) + intervalMs;
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }

    try {
      return await task();
    } finally {
      release();
    }
  }
}
