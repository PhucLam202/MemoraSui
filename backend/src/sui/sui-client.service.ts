import { Injectable, Logger } from '@nestjs/common';
import { backendEnv } from '../config/env';
import type { SuiNetwork } from './sui.types';
import { MetricsService } from '../observability/metrics.service';

// CommonJS import keeps TypeScript module resolution compatible with the backend tsconfig.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const suiJsonRpc = require('@mysten/sui/jsonRpc') as {
  getJsonRpcFullnodeUrl: (network: 'devnet' | 'testnet' | 'mainnet') => string;
  SuiJsonRpcClient: new (options: { url: string; network?: 'devnet' | 'testnet' | 'mainnet' }) => any;
};

type RpcTask<T> = () => Promise<T>;

@Injectable()
export class SuiClientService {
  private readonly logger = new Logger(SuiClientService.name);
  private readonly clients = new Map<SuiNetwork, any>();
  private readonly rateLimitIntervalMs = Math.max(1, Math.floor(1000 / backendEnv.sui.rateLimitPerSecond));
  private rateLimitChain: Promise<void> = Promise.resolve();
  private nextAvailableAt = Date.now();

  constructor(private readonly metricsService: MetricsService) {
    for (const network of ['devnet', 'testnet', 'mainnet'] as const) {
      this.getClient(network);
    }
  }

  getRpcUrl(network: SuiNetwork = backendEnv.network) {
    const configuredUrl = backendEnv.sui.rpcUrl.trim();
    if (configuredUrl && network === backendEnv.network) {
      return configuredUrl;
    }

    return suiJsonRpc.getJsonRpcFullnodeUrl(network);
  }

  getClient(network: SuiNetwork = backendEnv.network) {
    const existing = this.clients.get(network);
    if (existing) {
      return existing;
    }

    const url = this.getRpcUrl(network);
    const client = new suiJsonRpc.SuiJsonRpcClient({
      url,
      network,
    });
    this.clients.set(network, client);
    this.logger.log(`Sui RPC client initialized for ${network} at ${url}.`);
    return client;
  }

  async getRpcApiVersion(network: SuiNetwork = backendEnv.network) {
    const client = this.getClient(network);
    return this.execute('getRpcApiVersion', () => client.getRpcApiVersion());
  }

  async getBalance(owner: string, coinType?: string, network: SuiNetwork = backendEnv.network) {
    const client = this.getClient(network);
    return this.execute('getBalance', () =>
      client.getBalance({
        owner,
        coinType,
      } as never),
    );
  }

  async getAllBalances(owner: string, network: SuiNetwork = backendEnv.network) {
    const client = this.getClient(network);
    return this.execute('getAllBalances', () =>
      client.getAllBalances({
        owner,
      } as never),
    );
  }

  async getCoins(owner: string, cursor?: string | null, limit?: number, network: SuiNetwork = backendEnv.network) {
    const client = this.getClient(network);
    return this.execute('getCoins', () =>
      client.getCoins({
        owner,
        cursor: cursor ?? undefined,
        limit,
      } as never),
    );
  }

  async getOwnedObjects(owner: string, cursor?: string | null, limit?: number, network: SuiNetwork = backendEnv.network) {
    const client = this.getClient(network);
    return this.execute('getOwnedObjects', () =>
      client.getOwnedObjects({
        owner,
        cursor: cursor ?? undefined,
        limit,
      } as never),
    );
  }

  async getObject(objectId: string, network: SuiNetwork = backendEnv.network) {
    const client = this.getClient(network);
    return this.execute('getObject', () =>
      client.getObject({
        id: objectId,
      } as never),
    );
  }

  async queryTransactionBlocks(params: Record<string, unknown>, network: SuiNetwork = backendEnv.network) {
    const client = this.getClient(network);
    return this.execute('queryTransactionBlocks', () =>
      client.queryTransactionBlocks(params as never),
    );
  }

  async getTransactionBlock(params: Record<string, unknown>, network: SuiNetwork = backendEnv.network) {
    const client = this.getClient(network);
    return this.execute('getTransactionBlock', () =>
      client.getTransactionBlock(params as never),
    );
  }

  async queryEvents(params: Record<string, unknown>, network: SuiNetwork = backendEnv.network) {
    const client = this.getClient(network);
    return this.execute('queryEvents', () =>
      client.queryEvents(params as never),
    );
  }

  async call<T = unknown>(method: string, params: unknown[], network: SuiNetwork = backendEnv.network) {
    const client = this.getClient(network);
    return this.execute(method, () => client.call(method, params)) as Promise<T>;
  }

  private async execute<T>(label: string, task: RpcTask<T>): Promise<T> {
    const attempts = backendEnv.sui.maxRetries + 1;
    let lastError: unknown = null;
    const startedAt = Date.now();

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await this.runWithRateLimit(() =>
          this.withTimeout(task(), backendEnv.sui.timeoutMs, `${label} timed out`),
        );
        this.metricsService.recordRpcCall(true, Date.now() - startedAt);
        return result;
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || !this.isRetryable(error)) {
          break;
        }

        await this.sleep(this.getBackoffDelayMs(attempt));
      }
    }

    this.metricsService.recordRpcCall(false, Date.now() - startedAt);
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async runWithRateLimit<T>(task: RpcTask<T>): Promise<T> {
    let release: () => void = () => {};
    const previous = this.rateLimitChain;
    this.rateLimitChain = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    const waitMs = Math.max(0, this.nextAvailableAt - Date.now());
    this.nextAvailableAt = Math.max(Date.now(), this.nextAvailableAt) + this.rateLimitIntervalMs;

    if (waitMs > 0) {
      await this.sleep(waitMs);
    }

    try {
      return await task();
    } finally {
      release();
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(label)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private isRetryable(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return /timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed|429|503|502|rate limit/i.test(message);
  }

  private getBackoffDelayMs(attempt: number) {
    return Math.min(1000 * 2 ** (attempt - 1), 10_000);
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
