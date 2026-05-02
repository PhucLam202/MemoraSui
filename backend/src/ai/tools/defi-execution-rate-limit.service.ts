import { Injectable } from '@nestjs/common';
import { RedisService } from '../../queue/redis.service';
import { EXEC_RATE_LIMIT_WINDOW_MS, MAX_EXEC_REQUESTS_PER_5M } from './defi-security-guard';

type RateLimitRecord = {
  count: number;
  expiresAt: number;
};

@Injectable()
export class DefiExecutionRateLimitService {
  private readonly localWindow = new Map<string, RateLimitRecord>();

  constructor(private readonly redisService: RedisService) {}

  async consume(input: { walletAddress: string; intent: 'swap' | 'rebalance' | 'deepbook_order' }) {
    const key = `defi_exec_rate:${input.walletAddress.toLowerCase()}:${input.intent}`;
    const redisClient = this.redisService.getClient();
    if (redisClient) {
      const now = Date.now();
      const expiresAt = now + EXEC_RATE_LIMIT_WINDOW_MS;
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.pexpire(key, EXEC_RATE_LIMIT_WINDOW_MS);
      }
      const ttlMs = await redisClient.pttl(key);
      const resetAt = now + Math.max(ttlMs, 0);
      return {
        allowed: count <= MAX_EXEC_REQUESTS_PER_5M,
        count,
        limit: MAX_EXEC_REQUESTS_PER_5M,
        resetAt: new Date(ttlMs > 0 ? resetAt : expiresAt).toISOString(),
      };
    }

    const now = Date.now();
    const current = this.localWindow.get(key);
    if (!current || current.expiresAt <= now) {
      this.localWindow.set(key, {
        count: 1,
        expiresAt: now + EXEC_RATE_LIMIT_WINDOW_MS,
      });
      return {
        allowed: true,
        count: 1,
        limit: MAX_EXEC_REQUESTS_PER_5M,
        resetAt: new Date(now + EXEC_RATE_LIMIT_WINDOW_MS).toISOString(),
      };
    }
    current.count += 1;
    this.localWindow.set(key, current);
    return {
      allowed: current.count <= MAX_EXEC_REQUESTS_PER_5M,
      count: current.count,
      limit: MAX_EXEC_REQUESTS_PER_5M,
      resetAt: new Date(current.expiresAt).toISOString(),
    };
  }
}
