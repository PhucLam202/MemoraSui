export type WalletNetwork = 'devnet' | 'testnet' | 'mainnet';

export type WalletActionType =
  | 'transfer'
  | 'receive'
  | 'swap'
  | 'mint'
  | 'burn'
  | 'stake'
  | 'unstake'
  | 'nft_buy'
  | 'nft_sell'
  | 'contract_call'
  | 'unknown';

export type WalletInvolvement = 'sender' | 'recipient' | 'both' | 'observer';

export interface WalletAnalyticsRange {
  startMs: number | null;
  endMs: number | null;
}

export interface NormalizedWalletEvent {
  walletAddress: string;
  network: WalletNetwork;
  referenceDigest: string;
  actionType: WalletActionType;
  protocol: string;
  assetIn: string;
  assetOut: string;
  amount: string;
  walletInvolvement: WalletInvolvement;
  counterparty: string | null;
  timestampMs: number | null;
  raw: Record<string, unknown>;
}

export interface WalletPortfolioAssetSummary {
  coinType: string;
  balance: string;
  valueUsd: number | null;
  isNative: boolean;
}

export interface WalletObjectSummaryItem {
  type: string;
  count: number;
}

export interface WalletPortfolioSummary {
  totalWalletValueUsd: number | null;
  topAssets: WalletPortfolioAssetSummary[];
  coinDistribution: Array<WalletPortfolioAssetSummary & { share: number | null }>;
  objectSummary: {
    totalObjects: number;
    byState: Record<string, number>;
    byType: WalletObjectSummaryItem[];
  };
}

export interface WalletActivitySummary {
  txCountByDay: Array<{ date: string; count: number }>;
  txCountByWeek: Array<{ date: string; count: number }>;
  txCountByMonth: Array<{ month: string; count: number }>;
  incomingCount: number;
  outgoingCount: number;
  activeDays: number;
  protocolUsage: Array<{ protocol: string; count: number; actions: Record<string, number> }>;
}

export interface WalletFeeTransactionSummary {
  digest: string;
  gasFee: string;
  timestampMs: number | null;
  status: string;
  sender?: string | null;
  recipient?: string | null;
}

export interface WalletFeeSummary {
  totalFee: string;
  averageFee: number;
  feeByDay: Array<{ date: string; totalFee: string; transactionCount: number }>;
  topTransactions: WalletFeeTransactionSummary[];
}

export interface WalletProtocolSummary {
  interactionCount: number;
  topProtocols: Array<{ protocol: string; count: number; actionBreakdown: Record<string, number> }>;
  actionBreakdown: Record<string, number>;
}

export interface WalletAnalyticsSnapshot {
  walletAddress: string;
  network: WalletNetwork;
  generatedAt: string;
  source: {
    transactions: number;
    normalizedEvents: number;
    balances: number;
    objects: number;
  };
  portfolio: WalletPortfolioSummary;
  activity: WalletActivitySummary;
  fees: WalletFeeSummary;
  protocols: WalletProtocolSummary;
}
