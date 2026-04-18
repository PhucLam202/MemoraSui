import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { backendEnv } from '../config/env';
import { SuiNormalizationService } from './sui-normalization.service';
import { SuiClientService } from './sui-client.service';
import { SuiRpcCacheService } from './sui-rpc-cache.service';
import { SuiSyncPlannerService } from './sui-sync-planner.service';
import type {
  SuiCacheKeyParts,
  SuiCoinSnapshot,
  SuiObjectSnapshot,
  SuiRpcPage,
  SuiNetwork,
  SuiSyncWindow,
  SuiTransactionChange,
  SuiTransactionSummary,
  SuiWalletSyncSnapshot,
} from './sui.types';

interface FetchOptions {
  cursor?: string | null;
  limit?: number;
  relation?: 'sender' | 'recipient' | 'all';
  window?: SuiSyncWindow;
}

@Injectable()
export class SuiIngestionService {
  private readonly logger = new Logger(SuiIngestionService.name);

  constructor(
    private readonly suiClientService: SuiClientService,
    private readonly suiRpcCacheService: SuiRpcCacheService,
    private readonly syncPlannerService: SuiSyncPlannerService,
    private readonly databaseService: DatabaseService,
    private readonly suiNormalizationService: SuiNormalizationService,
  ) {}

  async syncWallet(walletAddress: string, network: SuiNetwork, options: FetchOptions = {}): Promise<SuiWalletSyncSnapshot> {
    const window = options.window ?? this.syncPlannerService.createIncrementalPlan({
      startCursor: options.cursor ?? null,
      limit: options.limit ?? backendEnv.sui.pageSize,
    });

    const [transactions, coins, objects] = await Promise.all([
      this.fetchWalletTransactions(walletAddress, network, {
        cursor: window.startCursor ?? options.cursor ?? null,
        limit: window.limit,
        relation: options.relation ?? 'all',
        window,
      }),
      this.fetchCoinSnapshots(walletAddress, network, {
        cursor: window.startCursor ?? options.cursor ?? null,
        limit: window.limit,
        window,
      }),
      this.fetchObjectSnapshots(walletAddress, network, {
        cursor: window.startCursor ?? options.cursor ?? null,
        limit: window.limit,
        window,
      }),
    ]);

    const snapshot: SuiWalletSyncSnapshot = {
      transactions: transactions.data,
      coins,
      objects,
      cursor: window.startCursor ?? options.cursor ?? null,
      nextCursor: transactions.nextCursor,
      hasNextPage: transactions.hasNextPage,
      mode: window.mode,
      network,
    };

    await this.persistSnapshot(walletAddress, network, snapshot);
    this.logger.log(
      `Synced wallet ${walletAddress} on ${network}: ${snapshot.transactions.length} tx, ${snapshot.coins.length} balances, ${snapshot.objects.length} objects.`,
    );

    return snapshot;
  }

  async fetchWalletTransactions(
    walletAddress: string,
    network: SuiNetwork,
    options: FetchOptions = {},
  ): Promise<SuiRpcPage<SuiTransactionSummary>> {
    if ((options.relation ?? 'all') === 'all') {
      const [senderPage, recipientPage] = await Promise.all([
        this.fetchWalletTransactions(walletAddress, network, {
          ...options,
          relation: 'sender',
        }),
        this.fetchWalletTransactions(walletAddress, network, {
          ...options,
          relation: 'recipient',
        }),
      ]);

      const merged = this.mergeTransactionPages(senderPage, recipientPage);
      return merged;
    }

    const relation: 'sender' | 'recipient' = options.relation === 'recipient' ? 'recipient' : 'sender';
    const cacheKeyParts: SuiCacheKeyParts = {
      chain: network,
      walletAddress,
      cursor: options.cursor ?? null,
      windowStart: options.window?.startTime ?? null,
      windowEnd: options.window?.endTime ?? null,
      relation,
    };

    const cachedPage = await this.suiRpcCacheService.remember(
      'transaction-blocks',
      cacheKeyParts,
      async () => {
        const response = await this.queryTransactionBlocksWithFallback(walletAddress, network, relation, options.cursor ?? undefined, options.limit ?? backendEnv.sui.pageSize);

        const data = this.normalizeTransactionResponse(response, walletAddress);
        return {
          data,
          nextCursor: this.readCursor(response),
          hasNextPage: Boolean(this.readHasNextPage(response)),
          source: 'rpc' as const,
        };
      },
      {
        ttlSeconds: backendEnv.sui.cache.transactionTtlSeconds,
        staleWhileRevalidateSeconds: backendEnv.sui.cache.staleSeconds,
      },
    );

    return cachedPage.data;
  }

  private async queryTransactionBlocksWithFallback(
    walletAddress: string,
    network: SuiNetwork,
    relation: 'sender' | 'recipient',
    cursor: string | undefined,
    limit: number,
  ) {
    const query = {
      filter: relation === 'sender'
        ? { FromAddress: walletAddress }
        : { ToAddress: walletAddress },
      cursor,
      limit,
      order: 'descending' as const,
    };

    try {
      return await this.suiClientService.queryTransactionBlocks(
        {
          ...query,
          options: {
            showEffects: true,
            showInput: true,
            showEvents: true,
            showObjectChanges: true,
            showBalanceChanges: true,
          },
        },
        network,
      );
    } catch (error) {
      if (!this.isEmptyEffectError(error)) {
        throw error;
      }

      this.logger.warn(
        `queryTransactionBlocks fallback for wallet=${walletAddress} network=${network} relation=${relation}: retrying without balance/object changes.`,
      );

      return this.suiClientService.queryTransactionBlocks(
        {
          ...query,
          options: {
            showEffects: true,
            showInput: true,
            showEvents: true,
          },
        },
        network,
      );
    }
  }

  async fetchCoinSnapshots(
    walletAddress: string,
    network: SuiNetwork,
    options: FetchOptions = {},
  ): Promise<SuiCoinSnapshot[]> {
    const cacheKeyParts: SuiCacheKeyParts = {
      chain: network,
      walletAddress,
      cursor: options.cursor ?? null,
      windowStart: options.window?.startTime ?? null,
      windowEnd: options.window?.endTime ?? null,
    };

    const [allBalances, transactions] = await Promise.all([
      this.suiRpcCacheService.remember(
        'coin-balances',
        cacheKeyParts,
        async () => this.suiClientService.getAllBalances(walletAddress, network),
        {
          ttlSeconds: backendEnv.sui.cache.balanceTtlSeconds,
          staleWhileRevalidateSeconds: backendEnv.sui.cache.staleSeconds,
        },
      ),
      this.fetchWalletTransactions(walletAddress, network, {
        cursor: options.cursor ?? null,
        limit: options.limit ?? backendEnv.sui.pageSize,
        relation: 'all',
        window: options.window,
      }),
    ]);

    const coinChanges = aggregateCoinChanges(transactions.data, walletAddress);
    const balances = extractArrayPayload(allBalances.data);

    return balances.map((balance) => {
      const coinType = String(balance.coinType ?? balance.type ?? 'unknown');
      const valueUsd =
        toNumber(balance.valueUsd) ??
        toNumber(balance.usdValue) ??
        toNumber(balance.totalBalanceUsd) ??
        toNumber(balance.totalBalanceInUsd) ??
        null;
      return {
        coinType,
        balance: String(balance.totalBalance ?? balance.balance ?? '0'),
        valueUsd,
        change: coinChanges[coinType] ?? '0',
        isNative: coinType === '0x2::sui::SUI',
        totalCoinObjects: toNumber(balance.coinObjectCount),
        transactionDigest: options.cursor ?? null,
        raw: balance,
      };
    });
  }

  async fetchObjectSnapshots(
    walletAddress: string,
    network: SuiNetwork,
    options: FetchOptions = {},
  ): Promise<SuiObjectSnapshot[]> {
    const cacheKeyParts: SuiCacheKeyParts = {
      chain: network,
      walletAddress,
      cursor: options.cursor ?? null,
      windowStart: options.window?.startTime ?? null,
      windowEnd: options.window?.endTime ?? null,
    };

    const response = await this.suiRpcCacheService.remember(
      'owned-objects',
      cacheKeyParts,
      async () =>
        this.suiClientService.getOwnedObjects(
          walletAddress,
          options.cursor ?? null,
          options.limit ?? backendEnv.sui.pageSize,
          network,
        ),
      {
        ttlSeconds: backendEnv.sui.cache.objectTtlSeconds,
        staleWhileRevalidateSeconds: backendEnv.sui.cache.staleSeconds,
      },
    );

    return this.normalizeOwnedObjects(response.data);
  }

  async fetchWalletEvents(
    walletAddress: string,
    network: SuiNetwork,
    options: FetchOptions = {},
  ): Promise<SuiRpcPage<Record<string, unknown>>> {
    const cacheKeyParts: SuiCacheKeyParts = {
      chain: network,
      walletAddress,
      cursor: options.cursor ?? null,
      windowStart: options.window?.startTime ?? null,
      windowEnd: options.window?.endTime ?? null,
    };

    const cachedPage = await this.suiRpcCacheService.remember(
      'events',
      cacheKeyParts,
      async () => {
        const response = await this.suiClientService.queryEvents({
          query: { Sender: walletAddress },
          cursor: options.cursor ?? undefined,
          limit: options.limit ?? backendEnv.sui.pageSize,
          order: 'descending',
        }, network);

        const data = extractArrayPayload(response);

        return {
          data,
          nextCursor: this.readCursor(response),
          hasNextPage: Boolean(this.readHasNextPage(response)),
          source: 'rpc' as const,
        };
      },
      {
        ttlSeconds: backendEnv.sui.cache.eventTtlSeconds,
        staleWhileRevalidateSeconds: backendEnv.sui.cache.staleSeconds,
      },
    );

    return cachedPage.data;
  }

  private normalizeTransactionResponse(response: unknown, walletAddress: string): SuiTransactionSummary[] {
    const data = extractArrayPayload(response);

    return data
      .map((entry) => this.normalizeTransactionBlock(entry, walletAddress))
      .filter((entry): entry is SuiTransactionSummary => entry !== null);
  }

  private normalizeTransactionBlock(entry: unknown, walletAddress: string): SuiTransactionSummary | null {
    const raw = toRecord(entry);
    const effects = toRecord(raw.effects);
    const transaction = toRecord(raw.transaction);
    const data = toRecord(transaction.data);
    const balanceChanges = Array.isArray(raw.balanceChanges) ? raw.balanceChanges : [];
    const objectChanges = Array.isArray(raw.objectChanges) ? raw.objectChanges : [];
    const events = Array.isArray(raw.events?.data) ? raw.events.data : Array.isArray(raw.events) ? raw.events : [];

    if (Object.keys(effects).length === 0) {
      this.logger.warn(`Skipping transaction ${String(raw.digest ?? 'unknown')} for wallet ${walletAddress}: effect is empty.`);
      return null;
    }

    const digest = String(raw.digest ?? effects.transactionDigest ?? data.digest ?? `tx-${Date.now()}`);
    const sender = String(data.sender ?? raw.sender ?? '');
    const recipient = resolveRecipient(balanceChanges, walletAddress);
    const status = normalizeStatus(effects.status ?? raw.status);
    const gasFee = normalizeGasFee(effects.gasUsed);
    const timestampMs = toNumber(raw.timestampMs ?? raw.timestamp);

    return {
      digest,
      sender: sender || undefined,
      recipient: recipient || undefined,
      gasFee,
      timestampMs,
      status,
      checkpoint: raw.checkpoint ?? null,
      balanceChanges: balanceChanges.map(normalizeBalanceChange),
      objectChanges: objectChanges.map(normalizeObjectChange),
      eventCount: events.length,
      raw,
    };
  }

  private normalizeOwnedObjects(response: unknown): SuiObjectSnapshot[] {
    const data = extractArrayPayload(response);

    return data.map((entry) => {
      const raw = toRecord(entry);
      const object = toRecord(raw.data ?? raw.object ?? raw);
      const owner = resolveObjectOwner(raw);
      const objectId = String(object.objectId ?? raw.objectId ?? raw.id ?? '');
      const ownerType = resolveObjectOwnerType(raw);
      const latestVersion = String(object.version ?? raw.version ?? '');
      const state = resolveObjectState(raw);
      return {
        objectId,
        owner: owner || undefined,
        ownerType: ownerType || undefined,
        type: String(object.type ?? raw.type ?? ''),
        latestVersion: latestVersion || undefined,
        version: latestVersion,
        state,
        stateSnapshot: state,
        raw,
      };
    });
  }

  private mergeTransactionPages(
    senderPage: SuiRpcPage<SuiTransactionSummary>,
    recipientPage: SuiRpcPage<SuiTransactionSummary>,
  ): SuiRpcPage<SuiTransactionSummary> {
    const byDigest = new Map<string, SuiTransactionSummary>();
    for (const item of [...senderPage.data, ...recipientPage.data]) {
      byDigest.set(item.digest, item);
    }

    const data = [...byDigest.values()].sort((left, right) => {
      const leftTime = left.timestampMs ?? 0;
      const rightTime = right.timestampMs ?? 0;
      return rightTime - leftTime;
    });

    return {
      data,
      nextCursor: senderPage.nextCursor ?? recipientPage.nextCursor ?? null,
      hasNextPage: senderPage.hasNextPage || recipientPage.hasNextPage,
      source: senderPage.source,
    };
  }

  private readCursor(response: unknown) {
    return toRecord(response).nextCursor ? String(toRecord(response).nextCursor) : null;
  }

  private readHasNextPage(response: unknown) {
    return Boolean(toRecord(response).hasNextPage);
  }

  private isEmptyEffectError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return /effect is empty|unable to derive balance\/object changes/i.test(message);
  }

  private async persistSnapshot(walletAddress: string, network: SuiNetwork, snapshot: SuiWalletSyncSnapshot) {
    const connection = this.databaseService.getConnection();
    if (!connection) {
      return;
    }

    const rawTransactionModel = this.databaseService.getModel('RawTransactionBlock');
    const coinBalanceModel = this.databaseService.getModel('CoinBalance');
    const objectPositionModel = this.databaseService.getModel('ObjectPosition');
    const normalizedEventModel = this.databaseService.getModel('NormalizedEvent');

    if (rawTransactionModel) {
      await Promise.all(
        snapshot.transactions.map((transaction) =>
          rawTransactionModel.updateOne(
            { walletAddress, digest: transaction.digest },
            {
              $set: {
                walletAddress,
                network,
                ...transaction,
                syncedAt: new Date(),
              },
            },
            { upsert: true },
          ),
        ),
      );
    }

    if (normalizedEventModel) {
      const normalizedEvents = this.suiNormalizationService.normalizeTransactions(snapshot.transactions, walletAddress, network);
      await Promise.all(
        normalizedEvents.map((event) =>
          normalizedEventModel.updateOne(
            { walletAddress, referenceDigest: event.referenceDigest },
            {
              $set: {
                ...event,
                syncedAt: new Date(),
              },
            },
            { upsert: true },
          ),
        ),
      );
    }

    if (coinBalanceModel) {
      await Promise.all(
        snapshot.coins.map((coin) =>
          coinBalanceModel.updateOne(
            { walletAddress, coinType: coin.coinType },
            {
              $set: {
                walletAddress,
                network,
                ...coin,
                valueUsd: coin.valueUsd ?? null,
                syncedAt: new Date(),
              },
            },
            { upsert: true },
          ),
        ),
      );
    }

    if (objectPositionModel) {
      await Promise.all(
        snapshot.objects.map((objectPosition) =>
          objectPositionModel.updateOne(
            { walletAddress, objectId: objectPosition.objectId },
            {
              $set: {
                walletAddress,
                network,
                ...objectPosition,
                ownerType: objectPosition.ownerType ?? null,
                latestVersion: objectPosition.latestVersion ?? objectPosition.version ?? null,
                stateSnapshot: objectPosition.stateSnapshot ?? objectPosition.state,
                syncedAt: new Date(),
              },
            },
            { upsert: true },
          ),
        ),
      );
    }
  }
}

function toRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as Record<string, any>;
}

function extractArrayPayload(value: unknown) {
  if (Array.isArray(value)) {
    return value as Record<string, unknown>[];
  }

  const record = toRecord(value);
  if (Array.isArray(record.data)) {
    return record.data as Record<string, unknown>[];
  }

  return [];
}

function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeStatus(value: unknown) {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized.includes('success')) {
      return 'success';
    }
    if (normalized.includes('fail')) {
      return 'failure';
    }
  }

  return 'unknown';
}

function normalizeGasFee(value: unknown) {
  const gas = toRecord(value);
  const computation = toBigInt(gas.computationCost);
  const storage = toBigInt(gas.storageCost);
  const rebate = toBigInt(gas.storageRebate);
  const nonRefundable = toBigInt(gas.nonRefundableStorageFee);
  const total = computation + storage + nonRefundable - rebate;
  return total.toString();
}

function toBigInt(value: unknown) {
  try {
    if (typeof value === 'bigint') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return BigInt(Math.trunc(value));
    }
    if (typeof value === 'string' && value.trim() !== '') {
      return BigInt(value);
    }
  } catch {
    return 0n;
  }

  return 0n;
}

function normalizeBalanceChange(entry: unknown): SuiTransactionChange {
  const raw = toRecord(entry);
  return {
    owner: raw.owner?.AddressOwner ?? raw.owner?.ObjectOwner ?? raw.owner?.SharedOwner ?? undefined,
    coinType: String(raw.coinType ?? raw.type ?? ''),
    amount: String(raw.amount ?? raw.balanceChange ?? '0'),
    kind: String(raw.kind ?? raw.changeType ?? ''),
  };
}

function normalizeObjectChange(entry: unknown): SuiTransactionChange {
  const raw = toRecord(entry);
  return {
    objectId: String(raw.objectId ?? ''),
    owner: resolveObjectOwner(raw) || undefined,
    type: String(raw.objectType ?? raw.type ?? ''),
    version: String(raw.version ?? ''),
    state: String(raw.status ?? raw.kind ?? raw.changeType ?? ''),
  };
}

function resolveRecipient(balanceChanges: unknown[], walletAddress: string) {
  for (const change of balanceChanges) {
    const raw = toRecord(change);
    const owner = raw.owner?.AddressOwner ?? raw.owner?.ObjectOwner ?? raw.owner?.SharedOwner;
    const candidate = typeof owner === 'string' ? owner : undefined;
    if (candidate && candidate !== walletAddress) {
      return candidate;
    }
  }

  return undefined;
}

function resolveObjectOwner(raw: Record<string, any>) {
  const owner = toRecord(raw.owner);
  return (
    owner.AddressOwner ??
    owner.ObjectOwner ??
    owner.SharedOwner ??
    raw.owner ??
    raw.previousOwner ??
    raw.receiver ??
    raw.recipient ??
    null
  );
}

function resolveObjectOwnerType(raw: Record<string, any>) {
  const owner = toRecord(raw.owner);
  if (owner.AddressOwner) {
    return 'address';
  }
  if (owner.ObjectOwner) {
    return 'object';
  }
  if (owner.SharedOwner) {
    return 'shared';
  }
  if (raw.immutable || String(raw.kind ?? '').toLowerCase().includes('immutable')) {
    return 'immutable';
  }

  return null;
}

function resolveObjectState(raw: Record<string, any>) {
  const kind = String(raw.status ?? raw.ownerKind ?? raw.changeType ?? raw.kind ?? '').toLowerCase();
  if (kind.includes('wrapped')) {
    return 'wrapped';
  }
  if (kind.includes('transfer')) {
    return 'transferred';
  }
  if (kind.includes('mutat')) {
    return 'mutated';
  }
  if (kind.includes('owned')) {
    return 'owned';
  }

  return 'unknown';
}

function aggregateCoinChanges(transactions: SuiTransactionSummary[], walletAddress: string) {
  const totals = new Map<string, bigint>();

  for (const transaction of transactions) {
    for (const change of transaction.balanceChanges) {
      if (!change.coinType) {
        continue;
      }

      const owner = change.owner ?? '';
      if (owner && owner !== walletAddress) {
        continue;
      }

      const current = totals.get(change.coinType) ?? 0n;
      totals.set(change.coinType, current + toBigInt(change.amount));
    }
  }

  const result: Record<string, string> = {};
  for (const [coinType, amount] of totals.entries()) {
    result[coinType] = amount.toString();
  }

  return result;
}
