import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsService } from '../../analytics/analytics.service';
import { SuiClientService } from '../../sui/sui-client.service';
import { type SuiNetwork } from '../../sui/sui.types';
import {
  KNOWN_MAINNET_TOKENS,
  SUI_COIN_TYPE,
  isCanonicalSuiCoinType,
  inferSymbolFromCoinType,
  normalizeCoinType,
  normalizeTokenQuery,
  normalizeTokenSymbol,
} from './defi-utils';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DeepBookClient } = require('@mysten/deepbook') as {
  DeepBookClient: new (client: unknown, accountCap?: string, currentAddress?: string) => {
    getAllPools(input: { limit?: number; cursor?: unknown; descending_order?: boolean }): Promise<{
      data: Array<{ poolId: string; baseAsset: string; quoteAsset: string }>;
      hasNextPage: boolean;
      nextCursor?: unknown;
    }>;
  };
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeStructTag } = require('@mysten/sui/utils') as {
  normalizeStructTag: (value: string) => string;
};

export type ResolvedDefiToken = {
  symbol: string;
  coinType: string;
  decimals: number;
};

export type DeepBookPoolMatch = {
  poolId: string;
  baseAsset: string;
  quoteAsset: string;
  baseSymbol: string;
  quoteSymbol: string;
};

type FuzzyMatchResult =
  | { kind: 'match'; token: ResolvedDefiToken }
  | { kind: 'ambiguous'; candidates: ResolvedDefiToken[] }
  | { kind: 'none' };

@Injectable()
export class DefiTokenResolverTool {
  private readonly logger = new Logger(DefiTokenResolverTool.name);
  private readonly tokenCache = new Map<string, ResolvedDefiToken>();
  private readonly poolCache = new Map<string, DeepBookPoolMatch>();
  private poolsLoaded = false;

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly suiClientService: SuiClientService,
  ) {}

  async resolveToken(value: string, walletAddress: string, network: SuiNetwork): Promise<ResolvedDefiToken | null> {
    if (network !== 'mainnet') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const normalizedSymbol = normalizeTokenSymbol(normalizeTokenQuery(trimmed));
    const cacheKey = `${network}:${normalizedSymbol}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (/^0x[a-f0-9]+::/i.test(trimmed)) {
      const metadata = await this.fetchTokenMetadata(normalizeCoinType(trimmed), network);
      if (!metadata) {
        return null;
      }
      this.tokenCache.set(cacheKey, metadata);
      return metadata;
    }

    const known = KNOWN_MAINNET_TOKENS.find((token) => token.symbol === normalizedSymbol);
    if (known) {
      const metadata = (await this.fetchTokenMetadata(known.coinType, network)) ?? known;
      this.tokenCache.set(cacheKey, metadata);
      return metadata;
    }

    const portfolio = await this.analyticsService.getPortfolioSummary(walletAddress, network);
    const matchedHolding = portfolio.holdings.find((holding) => {
      const holdingSymbol = typeof holding.symbol === 'string' ? normalizeTokenSymbol(holding.symbol) : '';
      const holdingCoinType = typeof holding.coinType === 'string' ? normalizeCoinType(holding.coinType) : '';
      if (holdingSymbol === 'SUI' && holdingCoinType !== SUI_COIN_TYPE) {
        return false;
      }
      return holdingSymbol === normalizedSymbol || holdingCoinType === trimmed;
    });
    if (matchedHolding?.coinType && typeof matchedHolding.decimals === 'number') {
      const resolved = {
        symbol: normalizeTokenSymbol(String(matchedHolding.symbol ?? inferSymbolFromCoinType(matchedHolding.coinType))),
        coinType: normalizeCoinType(matchedHolding.coinType),
        decimals: matchedHolding.decimals,
      } satisfies ResolvedDefiToken;
      this.tokenCache.set(cacheKey, resolved);
      return resolved;
    }

    await this.ensurePoolCache(network);
    const poolResolved = this.tokenCache.get(cacheKey);
    if (poolResolved) {
      return poolResolved;
    }

    const fuzzyResolved = this.findFuzzyTokenMatch(
      normalizedSymbol,
      portfolio.holdings as Array<{ symbol?: string; coinType?: string; decimals?: number | null }>,
    );
    if (fuzzyResolved.kind === 'match') {
      this.tokenCache.set(cacheKey, fuzzyResolved.token);
      return fuzzyResolved.token;
    }
    if (fuzzyResolved.kind === 'ambiguous') {
      this.logger.warn(
        `Token resolution ambiguous for ${normalizedSymbol}; candidates=${fuzzyResolved.candidates
          .map((candidate) => candidate.symbol)
          .join(',')}`,
      );
    }

    return null;
  }

  async suggestTokenSymbols(
    value: string,
    walletAddress: string,
    network: SuiNetwork,
    limit = 3,
  ): Promise<string[]> {
    if (network !== 'mainnet') return [];
    const symbol = normalizeTokenSymbol(normalizeTokenQuery(value));
    const portfolio = await this.analyticsService.getPortfolioSummary(walletAddress, network);
    const candidates = new Set<string>();
    for (const holding of portfolio.holdings) {
      if (typeof holding.symbol === 'string') {
        candidates.add(normalizeTokenSymbol(holding.symbol));
      }
    }
    for (const known of KNOWN_MAINNET_TOKENS) {
      candidates.add(normalizeTokenSymbol(known.symbol));
    }

    return Array.from(candidates)
      .map((candidateSymbol) => ({ candidateSymbol, distance: levenshtein(symbol, candidateSymbol) }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, Math.max(1, limit))
      .map((item) => item.candidateSymbol);
  }

  async findDeepBookPool(baseSymbolInput: string, quoteSymbolInput: string, network: SuiNetwork) {
    if (network !== 'mainnet') {
      return null;
    }

    await this.ensurePoolCache(network);
    const baseSymbol = normalizeTokenSymbol(baseSymbolInput);
    const quoteSymbol = normalizeTokenSymbol(quoteSymbolInput);
    const directKey = `${baseSymbol}/${quoteSymbol}`;
    const reverseKey = `${quoteSymbol}/${baseSymbol}`;
    return this.poolCache.get(directKey) ?? this.poolCache.get(reverseKey) ?? null;
  }

  private async fetchTokenMetadata(coinType: string, network: SuiNetwork): Promise<ResolvedDefiToken | null> {
    try {
      const normalizedCoinType = normalizeCoinType(coinType);
      if (normalizedCoinType === SUI_COIN_TYPE) {
        return {
          symbol: 'SUI',
          coinType: normalizedCoinType,
          decimals: 9,
        };
      }
      const metadata = (await this.suiClientService.getCoinMetadata(coinType, network)) as {
        decimals?: number;
        symbol?: string;
      } | null;
      const decimals = typeof metadata?.decimals === 'number' ? metadata.decimals : null;
      if (decimals === null) {
        return null;
      }
      const symbol = normalizeTokenSymbol(
        typeof metadata?.symbol === 'string' && metadata.symbol.trim()
          ? metadata.symbol
          : inferSymbolFromCoinType(coinType),
      );
      if (symbol === 'SUI' && !isCanonicalSuiCoinType(coinType)) {
        return null;
      }
      return {
        symbol,
        coinType: normalizeStructTag(normalizedCoinType),
        decimals,
      };
    } catch (error) {
      this.logger.debug(`Failed to load token metadata for ${coinType}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private findFuzzyTokenMatch(
    symbol: string,
    holdings: Array<{ symbol?: string; coinType?: string; decimals?: number | null }>,
  ): FuzzyMatchResult {
    if (symbol.length < 4) {
      return { kind: 'none' };
    }
    const candidates = new Map<string, ResolvedDefiToken>();
    for (const holding of holdings) {
      if (!holding.coinType || typeof holding.decimals !== 'number') {
        continue;
      }
      const resolvedSymbol = normalizeTokenSymbol(String(holding.symbol ?? inferSymbolFromCoinType(holding.coinType)));
      candidates.set(resolvedSymbol, {
        symbol: resolvedSymbol,
        coinType: normalizeCoinType(holding.coinType),
        decimals: holding.decimals,
      });
    }

    let best: ResolvedDefiToken | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const bestMatches: ResolvedDefiToken[] = [];
    for (const [candidateSymbol, candidate] of candidates.entries()) {
      const distance = levenshtein(symbol, candidateSymbol);
      if (typeof distance === 'number' && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
        bestMatches.length = 0;
        bestMatches.push(candidate);
      } else if (typeof distance === 'number' && distance === bestDistance) {
        bestMatches.push(candidate);
      }
    }

    if (bestDistance > 1 || !best) {
      return { kind: 'none' };
    }
    const uniqueBySymbol = new Map<string, ResolvedDefiToken>();
    bestMatches.forEach((item) => uniqueBySymbol.set(item.symbol, item));
    if (uniqueBySymbol.size > 1) {
      return { kind: 'ambiguous', candidates: Array.from(uniqueBySymbol.values()) };
    }
    return { kind: 'match', token: best };
  }

  private async ensurePoolCache(network: SuiNetwork) {
    if (this.poolsLoaded || network !== 'mainnet') {
      return;
    }

    const deepbook = new DeepBookClient(this.suiClientService.getClient(network), undefined, '0x1');
    let cursor: unknown = undefined;

    for (let page = 0; page < 5; page += 1) {
      const response = await deepbook.getAllPools({
        limit: 100,
        cursor,
        descending_order: true,
      });
      for (const pool of response.data) {
        const baseAsset = normalizeCoinType(pool.baseAsset);
        const quoteAsset = normalizeCoinType(pool.quoteAsset);
        const baseSymbol = inferSymbolFromCoinType(baseAsset);
        const quoteSymbol = inferSymbolFromCoinType(quoteAsset);

        const match = {
          poolId: pool.poolId,
          baseAsset,
          quoteAsset,
          baseSymbol,
          quoteSymbol,
        } satisfies DeepBookPoolMatch;

        this.poolCache.set(`${baseSymbol}/${quoteSymbol}`, match);

        if (!this.tokenCache.has(`mainnet:${baseSymbol}`)) {
          const baseMetadata = (await this.fetchTokenMetadata(baseAsset, network)) ?? {
            symbol: baseSymbol,
            coinType: baseAsset,
            decimals: 9,
          };
          this.tokenCache.set(`mainnet:${baseSymbol}`, baseMetadata);
        }
        if (!this.tokenCache.has(`mainnet:${quoteSymbol}`)) {
          const quoteMetadata = (await this.fetchTokenMetadata(quoteAsset, network)) ?? {
            symbol: quoteSymbol,
            coinType: quoteAsset,
            decimals: 9,
          };
          this.tokenCache.set(`mainnet:${quoteSymbol}`, quoteMetadata);
        }
      }

      if (!response.hasNextPage) {
        break;
      }
      cursor = response.nextCursor;
    }

    this.poolsLoaded = true;
  }
}

function levenshtein(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  if (!left.length) {
    return right.length;
  }
  if (!right.length) {
    return left.length;
  }

  const matrix: number[][] = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0),
  );
  for (let i = 0; i <= left.length; i += 1) {
    matrix[i]![0] = i;
  }
  for (let j = 0; j <= right.length; j += 1) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const above = matrix[i - 1]?.[j] ?? 0;
      const leftCell = matrix[i]?.[j - 1] ?? 0;
      const diagonal = matrix[i - 1]?.[j - 1] ?? 0;
      matrix[i]![j] = Math.min(above + 1, leftCell + 1, diagonal + cost);
    }
  }

  return matrix[left.length]?.[right.length] ?? Math.max(left.length, right.length);
}
