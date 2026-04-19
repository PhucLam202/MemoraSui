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
  balanceRaw: string;
  balanceFormatted: string;
  amountHuman: number | null;
  symbol: string;
  name: string;
  decimals: number | null;
  valueUsd: number | null;
  priceUsd: number | null;
  isNative: boolean;
  totalCoinObjects: number | null;
  sharePct: number | null;
}

export interface WalletObjectSummaryItem {
  type: string;
  count: number;
}

export interface WalletPortfolioSummary {
  totalWalletValueUsd: number | null;
  holdingCount: number;
  hasUsdValues: boolean;
  topAssets: WalletPortfolioAssetSummary[];
  coinDistribution: Array<WalletPortfolioAssetSummary & { share: number | null }>;
  holdings: WalletPortfolioAssetSummary[];
  nativeBalance: WalletPortfolioAssetSummary | null;
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
  recentTxCount: number;
  lastActiveAt: number | null;
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

export interface WalletStakingSummary {
  totalStaked: string;
  totalRewards: string;
  positions: Array<{
    validator: string;
    amount: string;
    stakedAtMs: number | null;
    rewards: string;
    apy?: number;
  }>;
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
  staking: WalletStakingSummary;
}
