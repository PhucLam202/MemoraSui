import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { backendEnv } from '../config/env';
import {
  buildPaginationResult,
  normalizeSearch,
  parseSortOrder,
  pickSortField,
  type DateRangeParams,
  type PaginationParams,
  type PaginationResult,
} from '../common/query.utils';
import { DatabaseService } from '../database/database.service';
import type { SuiNetwork, SuiWalletSyncSnapshot } from '../sui/sui.types';
import { SuiIngestionService } from '../sui/sui-ingestion.service';
import { SuiNormalizationService } from '../sui/sui-normalization.service';

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly analyticsService: AnalyticsService,
    private readonly suiIngestionService: SuiIngestionService,
    private readonly suiNormalizationService: SuiNormalizationService,
  ) {}

  async getTransactions(input: BaseWalletQueryInput) {
    return this.queryCollection('RawTransactionBlock', input, {
      defaultSortField: 'timestampMs',
      searchFields: ['digest', 'sender', 'recipient', 'status'],
      allowedSortFields: ['timestampMs', 'createdAt', 'digest', 'status'],
      dateField: 'timestampMs',
    });
  }

  async getNormalizedEvents(input: BaseWalletQueryInput) {
    return this.queryCollection('NormalizedEvent', input, {
      defaultSortField: 'timestampMs',
      searchFields: ['referenceDigest', 'actionType', 'protocol', 'assetIn', 'assetOut', 'counterparty'],
      allowedSortFields: ['timestampMs', 'createdAt', 'actionType', 'protocol'],
      dateField: 'timestampMs',
    });
  }

  async getBalances(input: BaseWalletQueryInput) {
    return this.queryCollection('CoinBalance', input, {
      defaultSortField: 'valueUsd',
      searchFields: ['coinType', 'transactionDigest'],
      allowedSortFields: ['valueUsd', 'createdAt', 'coinType', 'balance'],
    });
  }

  async getObjects(input: BaseWalletQueryInput) {
    return this.queryCollection('ObjectPosition', input, {
      defaultSortField: 'updatedAt',
      searchFields: ['objectId', 'type', 'owner', 'state'],
      allowedSortFields: ['updatedAt', 'createdAt', 'type', 'state'],
    });
  }

  async getSnapshot(walletAddress: string, network?: SuiNetwork, range?: DateRangeParams) {
    return this.analyticsService.getWalletSnapshot(walletAddress, network, range ?? { startMs: null, endMs: null });
  }

  async getObjectSummary(walletAddress: string, network?: SuiNetwork) {
    const model = this.databaseService.getModel<Record<string, unknown>>('ObjectPosition');
    if (!model) {
      return {
        totalObjects: 0,
        byState: {},
        byType: [],
      };
    }

    const items = await model.find({ walletAddress, ...(network ? { network } : {}) }).lean<Record<string, unknown>[]>();
    const byState: Record<string, number> = {};
    const byTypeMap = new Map<string, number>();

    for (const item of items) {
      const state = typeof item.state === 'string' ? item.state : 'unknown';
      const type = typeof item.type === 'string' ? item.type : 'unknown';

      byState[state] = (byState[state] ?? 0) + 1;
      byTypeMap.set(type, (byTypeMap.get(type) ?? 0) + 1);
    }

    return {
      totalObjects: items.length,
      byState,
      byType: Array.from(byTypeMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 20),
    };
  }

  private async queryCollection(
    modelName: string,
    input: BaseWalletQueryInput,
    options: {
      defaultSortField: string;
      allowedSortFields: string[];
      searchFields: string[];
      dateField?: string;
    },
  ): Promise<PaginationResult<Record<string, unknown>>> {
    const targetNetwork = input.network ?? 'testnet';
    const model = this.databaseService.getModel<Record<string, unknown>>(modelName);
    if (!model) {
      return this.buildRpcFallbackResult(modelName, { ...input, network: targetNetwork }, options);
    }

    const filter: Record<string, unknown> = {
      walletAddress: input.walletAddress,
    };
    if (targetNetwork) {
      filter.network = targetNetwork;
    }
    if (options.dateField && (input.range.startMs !== null || input.range.endMs !== null)) {
      filter[options.dateField] = {};
      if (input.range.startMs !== null) {
        (filter[options.dateField] as Record<string, unknown>).$gte = input.range.startMs;
      }
      if (input.range.endMs !== null) {
        (filter[options.dateField] as Record<string, unknown>).$lte = input.range.endMs;
      }
    }

    const search = normalizeSearch(input.search);
    if (search) {
      filter.$or = options.searchFields.map((field) => ({
        [field]: { $regex: search, $options: 'i' },
      }));
    }

    const sortField = pickSortField(input.sortBy, options.allowedSortFields, options.defaultSortField);
    const sortOrder = parseSortOrder(input.sortOrder);

    const [items, total] = await Promise.all([
      model
        .find(filter)
        .sort({ [sortField]: sortOrder, createdAt: -1 })
        .skip(input.pagination.skip)
        .limit(input.pagination.limit)
        .lean<Record<string, unknown>[]>(),
      model.countDocuments(filter),
    ]);

    if (total === 0 && targetNetwork === 'testnet') {
      this.logger.warn(
        `No ${modelName} rows for wallet=${input.walletAddress} network=${targetNetwork}; falling back to RPC sync.`,
      );
      return this.buildRpcFallbackResult(modelName, { ...input, network: targetNetwork }, options);
    }

    return buildPaginationResult(items, total, input.pagination);
  }

  private async buildRpcFallbackResult(
    modelName: string,
    input: BaseWalletQueryInput,
    options: {
      defaultSortField: string;
      allowedSortFields: string[];
      searchFields: string[];
      dateField?: string;
    },
  ): Promise<PaginationResult<Record<string, unknown>>> {
    if (!input.network) {
      return buildPaginationResult([], 0, input.pagination);
    }

    const snapshot = await this.suiIngestionService.syncWallet(input.walletAddress, input.network, {
      limit: Math.max(input.pagination.limit, backendEnv.sui.pageSize),
    });

    const sourceItems = this.selectRpcSource(modelName, snapshot, input.walletAddress, input.network);
    const filtered = sourceItems.filter((item) => this.matchesFallbackFilter(item, input, options));
    const sortField = pickSortField(input.sortBy, options.allowedSortFields, options.defaultSortField);
    const sortOrder = parseSortOrder(input.sortOrder);
    const sorted = [...filtered].sort((left, right) => this.compareFallbackItems(left, right, sortField, sortOrder));
    const paged = sorted.slice(input.pagination.skip, input.pagination.skip + input.pagination.limit);

    return buildPaginationResult(paged, sorted.length, input.pagination);
  }

  private selectRpcSource(
    modelName: string,
    snapshot: SuiWalletSyncSnapshot,
    walletAddress: string,
    network: SuiNetwork,
  ) {
    switch (modelName) {
      case 'RawTransactionBlock':
        return snapshot.transactions as unknown as Array<Record<string, unknown>>;
      case 'CoinBalance':
        return snapshot.coins as unknown as Array<Record<string, unknown>>;
      case 'ObjectPosition':
        return snapshot.objects as unknown as Array<Record<string, unknown>>;
      case 'NormalizedEvent':
        return this.suiNormalizationService.normalizeTransactions(snapshot.transactions, walletAddress, network) as unknown as Array<Record<string, unknown>>;
      default:
        return [];
    }
  }

  private matchesFallbackFilter(
    item: Record<string, unknown>,
    input: BaseWalletQueryInput,
    options: {
      defaultSortField: string;
      allowedSortFields: string[];
      searchFields: string[];
      dateField?: string;
    },
  ) {
    const search = normalizeSearch(input.search);
    if (search) {
      const normalizedSearch = search.toLowerCase();
      const found = options.searchFields.some((field) => String(item[field] ?? '').toLowerCase().includes(normalizedSearch));
      if (!found) {
        return false;
      }
    }

    if (options.dateField && (input.range.startMs !== null || input.range.endMs !== null)) {
      const rawValue = item[options.dateField];
      const timestamp = typeof rawValue === 'number' ? rawValue : typeof rawValue === 'string' ? Number(rawValue) : Number.NaN;
      if (input.range.startMs !== null && (!Number.isFinite(timestamp) || timestamp < input.range.startMs)) {
        return false;
      }
      if (input.range.endMs !== null && (!Number.isFinite(timestamp) || timestamp > input.range.endMs)) {
        return false;
      }
    }

    return true;
  }

  private compareFallbackItems(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
    sortField: string,
    sortOrder: 1 | -1,
  ) {
    const leftValue = left[sortField];
    const rightValue = right[sortField];
    const compareResult = compareMixedValues(leftValue, rightValue);
    if (compareResult !== 0) {
      return compareResult * sortOrder;
    }

    return compareMixedValues(left.createdAt, right.createdAt) * -1;
  }
}

export interface BaseWalletQueryInput {
  walletAddress: string;
  network?: SuiNetwork;
  range: DateRangeParams;
  pagination: PaginationParams;
  search?: string | null;
  sortBy?: string;
  sortOrder?: string;
}

function compareMixedValues(left: unknown, right: unknown) {
  const leftNumber = toFiniteNumber(left);
  const rightNumber = toFiniteNumber(right);
  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber === rightNumber ? 0 : leftNumber > rightNumber ? 1 : -1;
  }

  const leftString = String(left ?? '');
  const rightString = String(right ?? '');
  return leftString.localeCompare(rightString);
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return null;
}
