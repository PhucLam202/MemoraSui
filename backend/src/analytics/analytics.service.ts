import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { backendEnv } from '../config/env';
import { DatabaseService } from '../database/database.service';
import type {
  NormalizedWalletEvent,
  WalletAnalyticsRange,
  WalletAnalyticsSnapshot,
  WalletActivitySummary,
  WalletFeeSummary,
  WalletPortfolioSummary,
  WalletProtocolSummary,
} from './analytics.types';
import type { SuiNetwork } from '../sui/sui.types';
import { SuiIngestionService } from '../sui/sui-ingestion.service';
import { SuiNormalizationService } from '../sui/sui-normalization.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly suiIngestionService: SuiIngestionService,
    private readonly suiNormalizationService: SuiNormalizationService,
  ) {}

  async getWalletSnapshot(walletAddress: string, network: SuiNetwork = backendEnv.network, range: WalletAnalyticsRange = { startMs: null, endMs: null }) {
    const snapshotModel = this.getModel<Record<string, unknown>>('WalletSnapshot');
    if (!snapshotModel) {
      return this.buildWalletAnalytics(walletAddress, network, range);
    }

    const snapshotKey = this.buildSnapshotKey(walletAddress, network, range);
    const existing = await snapshotModel.findOne({ snapshotKey, network }).lean<Record<string, unknown> | null>();
    if (existing) {
      const mapped = this.mapSnapshot(existing);
      if (!this.hasUsableSnapshotSource(mapped.source) && network === 'testnet') {
        this.logger.warn(`Refreshing empty cached snapshot for wallet=${walletAddress} network=${network}.`);
        return this.refreshWalletSnapshot(walletAddress, network, range);
      }
      return mapped;
    }

    return this.refreshWalletSnapshot(walletAddress, network, range);
  }

  async refreshWalletSnapshot(walletAddress: string, network: SuiNetwork = backendEnv.network, range: WalletAnalyticsRange = { startMs: null, endMs: null }) {
    const snapshotModel = this.getModel<Record<string, unknown>>('WalletSnapshot');
    if (!snapshotModel) {
      return this.buildWalletAnalytics(walletAddress, network, range);
    }

    const summary = await this.buildWalletAnalytics(walletAddress, network, range);
    const snapshotKey = this.buildSnapshotKey(walletAddress, network, range);
    const generatedAt = new Date();

    const updated = await snapshotModel.findOneAndUpdate(
      { snapshotKey },
      {
        $set: {
          snapshotKey,
          walletAddress,
          network,
          snapshotType: 'summary',
          rangeStartMs: range.startMs,
          rangeEndMs: range.endMs,
          generatedAt,
          source: summary.source,
          summary,
          syncedAt: generatedAt,
        },
      },
      { new: true, upsert: true },
    );

    if (!updated) {
      throw new InternalServerErrorException('Failed to persist wallet snapshot.');
    }

    return this.mapSnapshot(updated.toObject<Record<string, unknown>>());
  }

  async getPortfolioSummary(walletAddress: string, network: SuiNetwork = backendEnv.network, range: WalletAnalyticsRange = { startMs: null, endMs: null }) {
    const snapshot = await this.buildWalletAnalytics(walletAddress, network, range);
    return snapshot.portfolio;
  }

  async getActivitySummary(walletAddress: string, network: SuiNetwork = backendEnv.network, range: WalletAnalyticsRange = { startMs: null, endMs: null }) {
    const snapshot = await this.buildWalletAnalytics(walletAddress, network, range);
    return snapshot.activity;
  }

  async getFeeSummary(walletAddress: string, network: SuiNetwork = backendEnv.network, range: WalletAnalyticsRange = { startMs: null, endMs: null }) {
    const snapshot = await this.buildWalletAnalytics(walletAddress, network, range);
    return snapshot.fees;
  }

  async getProtocolUsage(walletAddress: string, network: SuiNetwork = backendEnv.network, range: WalletAnalyticsRange = { startMs: null, endMs: null }) {
    const snapshot = await this.buildWalletAnalytics(walletAddress, network, range);
    return snapshot.protocols;
  }

  async buildWalletAnalytics(
    walletAddress: string,
    network: SuiNetwork = backendEnv.network,
    range: WalletAnalyticsRange = { startMs: null, endMs: null },
  ): Promise<WalletAnalyticsSnapshot> {
    const [balances, objects, events, transactions] = await Promise.all([
      this.findBalances(walletAddress, network),
      this.findObjects(walletAddress, network),
      this.findNormalizedEvents(walletAddress, network, range),
      this.findTransactions(walletAddress, network, range),
    ]);

    if (balances.length === 0 && objects.length === 0 && events.length === 0 && transactions.length === 0 && network === 'testnet') {
      this.logger.warn(`Analytics source empty for wallet=${walletAddress} network=${network}; syncing directly from RPC.`);
      const snapshot = await this.suiIngestionService.syncWallet(walletAddress, network, {
        limit: backendEnv.sui.pageSize,
      });
      const normalizedEvents = this.suiNormalizationService.normalizeTransactions(snapshot.transactions, walletAddress, network);
      return this.buildAnalyticsSnapshot(
        walletAddress,
        network,
        snapshot.coins as unknown as Record<string, unknown>[],
        snapshot.objects as unknown as Record<string, unknown>[],
        normalizedEvents,
        snapshot.transactions as unknown as Record<string, unknown>[],
      );
    }

    return this.buildAnalyticsSnapshot(walletAddress, network, balances, objects, events, transactions);
  }

  private buildAnalyticsSnapshot(
    walletAddress: string,
    network: SuiNetwork,
    balances: Record<string, unknown>[],
    objects: Record<string, unknown>[],
    events: NormalizedWalletEvent[],
    transactions: Record<string, unknown>[],
  ): WalletAnalyticsSnapshot {
    const portfolio = buildPortfolioSummary(balances, objects);
    const activity = buildActivitySummary(events);
    const fees = buildFeeSummary(transactions);
    const protocols = buildProtocolSummary(events);

    return {
      walletAddress,
      network,
      generatedAt: new Date().toISOString(),
      source: {
        transactions: transactions.length,
        normalizedEvents: events.length,
        balances: balances.length,
        objects: objects.length,
      },
      portfolio,
      activity,
      fees,
      protocols,
    };
  }

  private hasUsableSnapshotSource(source: unknown) {
    if (!source || typeof source !== 'object') {
      return false;
    }

    const payload = source as Record<string, unknown>;
    return ['transactions', 'normalizedEvents', 'balances', 'objects'].some((key) => {
      const value = payload[key];
      return typeof value === 'number' && value > 0;
    });
  }

  private async findBalances(walletAddress: string, network: SuiNetwork) {
    const model = this.getModel<Record<string, unknown>>('CoinBalance');
    if (!model) {
      return [];
    }

    return model.find({ walletAddress, network }).lean<Record<string, unknown>[]>();
  }

  private async findObjects(walletAddress: string, network: SuiNetwork) {
    const model = this.getModel<Record<string, unknown>>('ObjectPosition');
    if (!model) {
      return [];
    }

    return model.find({ walletAddress, network }).lean<Record<string, unknown>[]>();
  }

  private async findNormalizedEvents(walletAddress: string, network: SuiNetwork, range: WalletAnalyticsRange) {
    const model = this.getModel<NormalizedWalletEvent>('NormalizedEvent');
    if (!model) {
      return [];
    }

    const filter: Record<string, unknown> = { walletAddress, network };
    if (range.startMs !== null || range.endMs !== null) {
      filter.timestampMs = {};
      if (range.startMs !== null) {
        (filter.timestampMs as Record<string, unknown>).$gte = range.startMs;
      }
      if (range.endMs !== null) {
        (filter.timestampMs as Record<string, unknown>).$lte = range.endMs;
      }
    }

    return model.find(filter).sort({ timestampMs: -1 }).lean<NormalizedWalletEvent[]>();
  }

  private async findTransactions(walletAddress: string, network: SuiNetwork, range: WalletAnalyticsRange) {
    const model = this.getModel<Record<string, unknown>>('RawTransactionBlock');
    if (!model) {
      return [];
    }

    const filter: Record<string, unknown> = { walletAddress, network };
    if (range.startMs !== null || range.endMs !== null) {
      filter.timestampMs = {};
      if (range.startMs !== null) {
        (filter.timestampMs as Record<string, unknown>).$gte = range.startMs;
      }
      if (range.endMs !== null) {
        (filter.timestampMs as Record<string, unknown>).$lte = range.endMs;
      }
    }

    return model.find(filter).sort({ timestampMs: -1 }).lean<Record<string, unknown>[]>();
  }

  private getModel<T = unknown>(name: string) {
    return this.databaseService.getModel<T>(name);
  }

  private buildSnapshotKey(walletAddress: string, network: SuiNetwork, range: WalletAnalyticsRange) {
    const start = range.startMs === null ? 'all' : String(range.startMs);
    const end = range.endMs === null ? 'all' : String(range.endMs);
    return `${network}:${walletAddress.toLowerCase()}:summary:${start}:${end}`;
  }

  private mapSnapshot(document: Record<string, unknown>) {
    return {
      snapshotKey: String(document.snapshotKey),
      walletAddress: String(document.walletAddress),
      network: String(document.network),
      snapshotType: String(document.snapshotType ?? 'summary'),
      rangeStartMs: typeof document.rangeStartMs === 'number' ? document.rangeStartMs : null,
      rangeEndMs: typeof document.rangeEndMs === 'number' ? document.rangeEndMs : null,
      generatedAt: document.generatedAt ?? null,
      source: document.source ?? {},
      summary: document.summary ?? {},
      syncedAt: document.syncedAt ?? null,
    };
  }
}

function buildPortfolioSummary(
  balances: Record<string, unknown>[],
  objects: Record<string, unknown>[],
): WalletPortfolioSummary {
  const normalizedBalances = balances.map((balance) => ({
    coinType: String(balance.coinType ?? 'unknown'),
    balance: String(balance.balance ?? '0'),
    valueUsd: numberOrNull(balance.valueUsd),
    isNative: Boolean(balance.isNative),
  }));

  const totalWalletValueUsd = sumNumbers(normalizedBalances.map((balance) => balance.valueUsd));
  const topAssets = [...normalizedBalances]
    .sort((left, right) => compareNumbers(right.valueUsd, left.valueUsd) || compareBigInts(right.balance, left.balance))
    .slice(0, 10);

  const totalBalanceWeight = normalizedBalances.reduce((total, balance) => total + absBigInt(balance.balance), 0n);
  const coinDistribution = normalizedBalances.map((balance) => {
    const share = totalBalanceWeight > 0n ? Number(absBigInt(balance.balance)) / Number(totalBalanceWeight) : null;
    return {
      ...balance,
      share,
    };
  });

  const byState = objects.reduce<Record<string, number>>((accumulator, object) => {
    const state = String(object.state ?? 'unknown');
    accumulator[state] = (accumulator[state] ?? 0) + 1;
    return accumulator;
  }, {});

  const byTypeMap = objects.reduce<Map<string, number>>((accumulator, object) => {
    const type = String(object.type ?? 'unknown');
    accumulator.set(type, (accumulator.get(type) ?? 0) + 1);
    return accumulator;
  }, new Map<string, number>());

  const byType = [...byTypeMap.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);

  return {
    totalWalletValueUsd,
    topAssets,
    coinDistribution,
    objectSummary: {
      totalObjects: objects.length,
      byState,
      byType,
    },
  };
}

function buildActivitySummary(events: NormalizedWalletEvent[]): WalletActivitySummary {
  const byDay = new Map<string, number>();
  const byWeek = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const protocolUsage = new Map<string, { protocol: string; count: number; actions: Record<string, number> }>();
  const activeDays = new Set<string>();
  let incomingCount = 0;
  let outgoingCount = 0;

  for (const event of events) {
    const timestamp = event.timestampMs ?? null;
    if (timestamp !== null) {
      const date = new Date(timestamp);
      const dayKey = date.toISOString().slice(0, 10);
      const weekKey = getWeekKey(date);
      const monthKey = date.toISOString().slice(0, 7);
      byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
      byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + 1);
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + 1);
      activeDays.add(dayKey);
    }

    if (event.walletInvolvement === 'recipient') {
      incomingCount += 1;
    }

    if (event.walletInvolvement === 'sender' || event.walletInvolvement === 'both') {
      outgoingCount += 1;
    }

    const current = protocolUsage.get(event.protocol) ?? {
      protocol: event.protocol,
      count: 0,
      actions: {},
    };
    current.count += 1;
    current.actions[event.actionType] = (current.actions[event.actionType] ?? 0) + 1;
    protocolUsage.set(event.protocol, current);
  }

  return {
    txCountByDay: [...byDay.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    txCountByWeek: [...byWeek.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    txCountByMonth: [...byMonth.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((left, right) => left.month.localeCompare(right.month)),
    incomingCount,
    outgoingCount,
    activeDays: activeDays.size,
    protocolUsage: [...protocolUsage.values()].sort((left, right) => right.count - left.count),
  };
}

function buildFeeSummary(transactions: Record<string, unknown>[]): WalletFeeSummary {
  const byDay = new Map<string, { totalFee: bigint; transactionCount: number }>();
  const normalized = transactions.map((transaction) => {
    const gasFee = toBigInt(transaction.gasFee);
    const timestampMs = numberOrNull(transaction.timestampMs);
    const digest = String(transaction.digest ?? 'unknown');
    const status = String(transaction.status ?? 'unknown');
    const sender = stringOrNull(transaction.sender);
    const recipient = stringOrNull(transaction.recipient);

    if (timestampMs !== null) {
      const dayKey = new Date(timestampMs).toISOString().slice(0, 10);
      const current = byDay.get(dayKey) ?? { totalFee: 0n, transactionCount: 0 };
      current.totalFee += gasFee;
      current.transactionCount += 1;
      byDay.set(dayKey, current);
    }

    return {
      digest,
      gasFee: gasFee.toString(),
      timestampMs,
      status,
      sender,
      recipient,
    };
  });

  const totalFee = normalized.reduce((sum, transaction) => sum + toBigInt(transaction.gasFee), 0n);
  const averageFee = normalized.length > 0 ? Number(totalFee) / normalized.length : 0;

  return {
    totalFee: totalFee.toString(),
    averageFee,
    feeByDay: [...byDay.entries()]
      .map(([date, value]) => ({
        date,
        totalFee: value.totalFee.toString(),
        transactionCount: value.transactionCount,
      }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    topTransactions: normalized
      .sort((left, right) => compareBigInts(right.gasFee, left.gasFee))
      .slice(0, 10),
  };
}

function buildProtocolSummary(events: NormalizedWalletEvent[]): WalletProtocolSummary {
  const protocols = new Map<string, { protocol: string; count: number; actionBreakdown: Record<string, number> }>();
  const actionBreakdown: Record<string, number> = {};

  for (const event of events) {
    const current = protocols.get(event.protocol) ?? {
      protocol: event.protocol,
      count: 0,
      actionBreakdown: {},
    };
    current.count += 1;
    current.actionBreakdown[event.actionType] = (current.actionBreakdown[event.actionType] ?? 0) + 1;
    protocols.set(event.protocol, current);
    actionBreakdown[event.actionType] = (actionBreakdown[event.actionType] ?? 0) + 1;
  }

  return {
    interactionCount: events.length,
    topProtocols: [...protocols.values()].sort((left, right) => right.count - left.count).slice(0, 10),
    actionBreakdown,
  };
}

function getWeekKey(date: Date) {
  const year = date.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86_400_000);
  const week = Math.floor((dayOfYear + startOfYear.getUTCDay()) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function numberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function sumNumbers(values: Array<number | null>) {
  let hasValue = false;
  let total = 0;
  for (const value of values) {
    if (typeof value === 'number') {
      total += value;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function compareNumbers(left: number | null, right: number | null) {
  return (left ?? -Infinity) - (right ?? -Infinity);
}

function compareBigInts(left: string | number | null | undefined, right: string | number | null | undefined) {
  const leftValue = toBigInt(left);
  const rightValue = toBigInt(right);
  if (leftValue > rightValue) {
    return 1;
  }
  if (leftValue < rightValue) {
    return -1;
  }
  return 0;
}

function toBigInt(value: unknown) {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value.trim());
    } catch {
      return 0n;
    }
  }

  return 0n;
}

function absBigInt(value: string | number | bigint | null | undefined) {
  const bigIntValue = toBigInt(value);
  return bigIntValue < 0n ? -bigIntValue : bigIntValue;
}
