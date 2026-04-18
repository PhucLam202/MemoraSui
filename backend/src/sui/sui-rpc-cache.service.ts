import { Injectable, Logger } from '@nestjs/common';
import { backendEnv } from '../config/env';
import { RedisService } from '../queue/redis.service';
import type { SuiCacheKeyParts, SuiCachePolicy } from './sui.types';

interface CachedRecord<T> {
  value: T;
  savedAt: number;
  expiresAt: number;
  staleUntil: number;
}

interface InMemoryEntry<T> {
  value: T;
  savedAt: number;
  expiresAt: number;
  staleUntil: number;
}

@Injectable()
export class SuiRpcCacheService {
  private readonly logger = new Logger(SuiRpcCacheService.name);
  private readonly memoryStore = new Map<string, InMemoryEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly redisService: RedisService) {}

  buildCacheKey(namespace: string, keyParts: SuiCacheKeyParts) {
    const normalized = Object.entries(keyParts)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}:${String(value)}`)
      .join('|');

    return `sui:rpc:${namespace}:${normalized || 'default'}`;
  }

  async remember<T>(
    namespace: string,
    keyParts: SuiCacheKeyParts,
    loader: () => Promise<T>,
    policy: SuiCachePolicy,
  ): Promise<{ data: T; source: 'cache' | 'rpc' }> {
    if (policy.cacheable === false) {
      return { data: await loader(), source: 'rpc' };
    }

    const cacheKey = this.buildCacheKey(namespace, keyParts);
    const cached = await this.readRecord<T>(cacheKey);
    if (cached) {
      const now = Date.now();
      if (cached.expiresAt > now) {
        return { data: cached.value, source: 'cache' };
      }

      if (cached.staleUntil > now) {
        void this.refreshInBackground(cacheKey, loader, policy);
        return { data: cached.value, source: 'cache' };
      }
    }

    const data = await this.dedupe(cacheKey, () => this.loadAndStore(cacheKey, loader, policy));
    return { data, source: 'rpc' };
  }

  private async dedupe<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = loader().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise as Promise<unknown>);
    return promise;
  }

  private async refreshInBackground<T>(
    key: string,
    loader: () => Promise<T>,
    policy: SuiCachePolicy,
  ) {
    if (this.inFlight.has(key)) {
      return;
    }

    void this.dedupe(key, () => this.loadAndStore(key, loader, policy)).catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Sui cache refresh failed for ${key}: ${detail}`);
    });
  }

  private async loadAndStore<T>(
    key: string,
    loader: () => Promise<T>,
    policy: SuiCachePolicy,
  ): Promise<T> {
    const value = await loader();
    await this.writeRecord(key, value, policy);
    return value;
  }

  private async readRecord<T>(key: string): Promise<CachedRecord<T> | null> {
    const redis = this.redisService.getClient();
    if (redis) {
      const payload = await redis.get(key);
      if (payload) {
        return JSON.parse(payload) as CachedRecord<T>;
      }
    }

    const entry = this.memoryStore.get(key) as InMemoryEntry<T> | undefined;
    if (!entry) {
      return null;
    }

    return {
      value: entry.value,
      savedAt: entry.savedAt,
      expiresAt: entry.expiresAt,
      staleUntil: entry.staleUntil,
    };
  }

  private async writeRecord<T>(
    key: string,
    value: T,
    policy: SuiCachePolicy,
  ): Promise<void> {
    const savedAt = Date.now();
    const expiresAt = savedAt + policy.ttlSeconds * 1000;
    const staleUntil =
      expiresAt + Math.max(0, policy.staleWhileRevalidateSeconds ?? backendEnv.sui.cache.staleSeconds) * 1000;
    const record: CachedRecord<T> = {
      value,
      savedAt,
      expiresAt,
      staleUntil,
    };

    const redis = this.redisService.getClient();
    if (redis) {
      const ttlSeconds = Math.max(1, Math.ceil((staleUntil - savedAt) / 1000));
      await redis.set(key, JSON.stringify(record), 'EX', ttlSeconds);
      return;
    }

    this.memoryStore.set(key, {
      value,
      savedAt,
      expiresAt,
      staleUntil,
    });
  }
}
