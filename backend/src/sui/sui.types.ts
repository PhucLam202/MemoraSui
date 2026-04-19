export type SuiNetwork = 'devnet' | 'testnet' | 'mainnet';

export type SuiSyncMode = 'backfill' | 'incremental';

export type SuiTransactionStatus = 'success' | 'failure' | 'unknown';

export interface SuiSyncWindow {
  mode: SuiSyncMode;
  startCursor?: string | null;
  endCursor?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  limit: number;
}

export interface SuiCacheKeyParts {
  chain: SuiNetwork;
  walletAddress?: string;
  cursor?: string | null;
  windowStart?: number | string | null;
  windowEnd?: number | string | null;
  coinType?: string | null;
  objectId?: string | null;
  relation?: string | null;
  digest?: string | null;
}

export interface SuiCachePolicy {
  ttlSeconds: number;
  staleWhileRevalidateSeconds?: number;
  cacheable?: boolean;
}

export interface SuiTransactionChange {
  owner?: string;
  coinType?: string;
  amount?: string;
  objectId?: string;
  type?: string;
  version?: string;
  state?: string;
  kind?: string;
}

export interface SuiTransactionSummary {
  digest: string;
  sender?: string;
  recipient?: string;
  gasFee?: string;
  timestampMs?: number | null;
  status: SuiTransactionStatus;
  checkpoint?: string | null;
  balanceChanges: SuiTransactionChange[];
  objectChanges: SuiTransactionChange[];
  eventCount: number;
  raw: Record<string, unknown>;
}

export interface SuiCoinSnapshot {
  coinType: string;
  balance: string;
  balanceRaw: string;
  balanceFormatted: string;
  amountHuman: number | null;
  symbol: string;
  name: string;
  decimals: number | null;
  valueUsd?: number | null;
  priceUsd?: number | null;
  change?: string;
  isNative: boolean;
  totalCoinObjects?: number;
  transactionDigest?: string | null;
  raw: Record<string, unknown>;
}

export interface SuiObjectSnapshot {
  objectId: string;
  owner?: string;
  ownerType?: string | null;
  type?: string;
  latestVersion?: string | null;
  version?: string;
  state: 'owned' | 'wrapped' | 'transferred' | 'mutated' | 'unknown';
  stateSnapshot?: string | null;
  raw: Record<string, unknown>;
}

export interface SuiRpcPage<T> {
  data: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
  source: 'cache' | 'rpc';
}

export interface SuiWalletSyncSnapshot {
  network: SuiNetwork;
  transactions: SuiTransactionSummary[];
  coins: SuiCoinSnapshot[];
  objects: SuiObjectSnapshot[];
  cursor: string | null;
  nextCursor: string | null;
  hasNextPage: boolean;
  mode: SuiSyncMode;
}
