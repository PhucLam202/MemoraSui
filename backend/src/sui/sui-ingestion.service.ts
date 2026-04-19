import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { backendEnv } from '../config/env';
import { SuiNormalizationService } from './sui-normalization.service';
import { SuiClientService } from './sui-client.service';
import { SuiRpcCacheService } from './sui-rpc-cache.service';
import { SuiSyncPlannerService } from './sui-sync-planner.service';
import { TokenPriceService } from '../pricing/token-price.service';
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
  relation?: 'sender' | 'all';
  window?: SuiSyncWindow;
}

type CoinMetadataSnapshot = {
  symbol: string;
  name: string;
  decimals: number | null;
};

function fallbackCoinMetadata(coinType: string): CoinMetadataSnapshot {
  const suffix = coinType.split('::').pop()?.trim() || 'UNKNOWN';
  const normalizedSymbol = suffix.toUpperCase();
  if (coinType === '0x2::sui::SUI') {
    return { symbol: 'SUI', name: 'Sui', decimals: 9 };
  }

  if (normalizedSymbol === 'WAL' || coinType.toLowerCase().includes('wal')) {
    return { symbol: 'WAL', name: suffix, decimals: 9 };
  }

  return {
    symbol: normalizedSymbol,
    name: suffix,
    decimals: 9,
  };
}

function normalizeCoinMetadata(raw: unknown, coinType: string): CoinMetadataSnapshot {
  const fallback = fallbackCoinMetadata(coinType);
  const payload = toRecord(raw);
  const decimals = toNumber(payload.decimals);

  return {
    symbol: String(payload.symbol ?? fallback.symbol),
    name: String(payload.name ?? fallback.name),
    decimals: typeof decimals === 'number' && Number.isFinite(decimals) ? decimals : fallback.decimals,
  };
}

function formatAmountFromRaw(balanceRaw: string, decimals: number | null): { amountHuman: number | null; balanceFormatted: string } {
  if (decimals === null || decimals < 0) {
    return {
      amountHuman: null,
      balanceFormatted: `${balanceRaw} raw units`,
    };
  }

  const negative = balanceRaw.startsWith('-');
  const digits = balanceRaw.replace('-', '').replace(/^0+(?=\d)/, '') || '0';
  const padded = digits.padStart(decimals + 1, '0');
  const integerPart = decimals === 0 ? padded : padded.slice(0, -decimals);
  const fractionFull = decimals === 0 ? '' : padded.slice(-decimals);
  const fractionShort = fractionFull.replace(/0+$/, '').slice(0, 4);
  const formattedNumber = fractionShort ? `${integerPart}.${fractionShort}` : integerPart;
  const signedValue = `${negative ? '-' : ''}${formattedNumber}`;
  const amountHuman = Number(signedValue);

  return {
    amountHuman: Number.isFinite(amountHuman) ? amountHuman : null,
    balanceFormatted: signedValue,
  };
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
    private readonly tokenPriceService: TokenPriceService,
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
    this.logger.verbose(
      `Synced wallet ${walletAddress} on ${network}: ${snapshot.transactions.length} tx, ${snapshot.coins.length} balances, ${snapshot.objects.length} objects.`,
    );

    return snapshot;
  }

  async fetchWalletTransactions(
    walletAddress: string,
    network: SuiNetwork,
    options: FetchOptions = {},
  ): Promise<SuiRpcPage<SuiTransactionSummary>> {
    const relation: 'sender' = 'sender';
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
    relation: 'sender',
    cursor: string | undefined,
    limit: number,
  ) {
    const filter =
      relation === 'sender'
        ? { FromAddress: walletAddress }
        : { FromOrToAddress: { addr: walletAddress } };
    const query = {
      filter,
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
    const metadataByCoinType = await Promise.all(
      balances.map(async (balance) => {
        const coinType = String(balance.coinType ?? balance.type ?? 'unknown');
        try {
          const metadata = await this.suiRpcCacheService.remember(
            'coin-metadata',
            { chain: network, coinType },
            async () => this.suiClientService.getCoinMetadata(coinType, network),
            {
              ttlSeconds: backendEnv.sui.cache.balanceTtlSeconds,
              staleWhileRevalidateSeconds: backendEnv.sui.cache.staleSeconds,
            },
          );
          return [coinType, normalizeCoinMetadata(metadata.data, coinType)] as const;
        } catch {
          return [coinType, fallbackCoinMetadata(coinType)] as const;
        }
      }),
    );
    const metadataMap = new Map(metadataByCoinType);

    return Promise.all(balances.map(async (balance) => {
      const coinType = String(balance.coinType ?? balance.type ?? 'unknown');
      const metadata = metadataMap.get(coinType) ?? fallbackCoinMetadata(coinType);
      const balanceRaw = String(balance.totalBalance ?? balance.balance ?? '0');
      const { amountHuman, balanceFormatted } = formatAmountFromRaw(balanceRaw, metadata.decimals);
      const existingValueUsd =
        toNumber(balance.valueUsd) ??
        toNumber(balance.usdValue) ??
        toNumber(balance.totalBalanceUsd) ??
        toNumber(balance.totalBalanceInUsd) ??
        null;
      const existingPriceUsd = toNumber(balance.priceUsd) ?? null;
      const symbol = metadata.symbol.toUpperCase();
      const shouldFetchPrice = existingValueUsd === null || existingPriceUsd === null;
      const fetchedPrice = shouldFetchPrice ? await this.tokenPriceService.getTokenPrice(symbol, amountHuman) : { valueUsd: null, priceUsd: null };
      const valueUsd = existingValueUsd ?? fetchedPrice.valueUsd;
      const priceUsd = existingPriceUsd ?? fetchedPrice.priceUsd ?? (valueUsd !== null && amountHuman !== null && amountHuman > 0 ? valueUsd / amountHuman : null);
      return {
        coinType,
        balance: balanceRaw,
        balanceRaw,
        balanceFormatted: `${balanceFormatted} ${metadata.symbol}`.trim(),
        amountHuman,
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
        valueUsd,
        priceUsd,
        change: coinChanges[coinType] ?? '0',
        isNative: coinType === '0x2::sui::SUI',
        totalCoinObjects: toNumber(balance.coinObjectCount),
        transactionDigest: options.cursor ?? null,
        raw: balance,
      };
    }));
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
      this.logger.warn(`Transaction ${String(raw.digest ?? 'unknown')} for wallet ${walletAddress} has empty effects; keeping raw block.`);
    }

    const digest = String(raw.digest ?? effects.transactionDigest ?? data.digest ?? `tx-${Date.now()}`);
    const sender = String(data.sender ?? raw.sender ?? '');
    const recipient = resolveRecipient(balanceChanges, walletAddress);
    const status = Object.keys(effects).length === 0 ? normalizeStatus(raw.status) : normalizeStatus(effects.status ?? raw.status);
    const gasFee = normalizeGasFee(effects.gasUsed);
    const timestampMs =
      toNumber(raw.timestampMs) ??
      toNumber(raw.timestamp) ??
      toNumber(effects.timestampMs) ??
      toNumber(effects.timestamp) ??
      toNumber(transaction.timestampMs) ??
      toNumber(transaction.timestamp) ??
      toNumber(data.timestampMs) ??
      toNumber(data.timestamp) ??
      null;

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
