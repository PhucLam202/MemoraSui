// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeStructTag } = require('@mysten/sui/utils') as {
  normalizeStructTag: (value: string) => string;
};

export const SUI_COIN_TYPE = '0x2::sui::SUI';

const CANONICAL_SUI_COIN_TYPE_NORMALIZED = normalizeCoinType(SUI_COIN_TYPE);

export function isCanonicalSuiCoinType(value: string) {
  return normalizeCoinType(value) === CANONICAL_SUI_COIN_TYPE_NORMALIZED;
}
export const DEFAULT_KEEP_GAS_MIST = 100_000_000n; // 0.1 SUI — enough for ~20 txs at typical gas cost
export const MIN_EXECUTION_GAS_BUDGET_MIST = 50_000_000n; // 0.05 SUI floor for DeFi PTBs/wallet gas selection
export const DEFAULT_SLIPPAGE = 0.005;
export const DEFAULT_QUOTE_TTL_MS = 120_000;
export const FLOAT_SCALING_FACTOR = 1_000_000_000n;
export const MAINNET_ONLY_MESSAGE =
  'DeFi execution V1 hiện chỉ hỗ trợ mainnet. Hãy chuyển ví sang mainnet rồi thử lại.';

const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'FDUSD']);
const TOKEN_SYMBOL_ALIASES: Record<string, string> = {
  SUINS: 'NS',
  'SUI NS': 'NS',
};

export type KnownToken = {
  symbol: string;
  coinType: string;
  decimals: number;
};

export const KNOWN_MAINNET_TOKENS: KnownToken[] = [
  { symbol: 'SUI', coinType: SUI_COIN_TYPE, decimals: 9 },
];

export function normalizeTokenSymbol(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeTokenQuery(value: string) {
  const normalized = normalizeTokenSymbol(
    value
      .trim()
      .replace(/\b(token|coin|asset)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[^\w0-9:_]+|[^\w0-9:_]+$/g, ''),
  );
  return TOKEN_SYMBOL_ALIASES[normalized] ?? normalized;
}

export function normalizeCoinType(value: string) {
  return normalizeStructTag(value.trim());
}

export function inferSymbolFromCoinType(coinType: string) {
  const normalized = normalizeCoinType(coinType);
  const parts = normalized.split('::');
  return normalizeTokenSymbol(parts[parts.length - 1] ?? normalized);
}

export function isStableSymbol(symbol: string) {
  return STABLE_SYMBOLS.has(normalizeTokenSymbol(symbol));
}

export function parseDecimalNumber(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatTokenAmount(amount: number, symbol: string, maxFractionDigits = 6) {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits })} ${symbol}`;
}

export function formatPercent(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

export function formatUsd(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function toRawAmount(amountHuman: number, decimals: number) {
  const scaled = amountHuman * 10 ** decimals;
  if (!Number.isFinite(scaled) || scaled <= 0) {
    return null;
  }
  return BigInt(Math.round(scaled));
}

export function toHumanAmount(rawAmount: bigint | string | number, decimals: number) {
  const raw = typeof rawAmount === 'bigint' ? Number(rawAmount) : Number(rawAmount);
  if (!Number.isFinite(raw)) {
    return null;
  }
  return raw / 10 ** decimals;
}

export function parseOptionalSlippage(question: string) {
  const percentMatch = question.match(/slippage(?:\s*max)?\s*(?:<|<=|=|la|là|is|under|below)?\s*(\d+(?:[.,]\d+)?)\s*%/i);
  if (!percentMatch?.[1]) {
    return null;
  }
  const parsed = parseFloat(percentMatch[1].replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed / 100;
}

export function parseOptionalKeepGas(question: string) {
  const keepMatch = question.match(
    /(?:giữ lại|giu lai|keep|reserve|chừa|chua)\s*(\d+(?:[.,]\d+)?)\s*sui\s*(?:làm gas|lam gas|for gas|gas)?/i,
  );
  if (!keepMatch?.[1]) {
    return null;
  }
  const parsed = parseFloat(keepMatch[1].replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return BigInt(Math.round(parsed * 1_000_000_000));
}

export function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
