import { Injectable, Logger } from '@nestjs/common';
import ccxt from 'ccxt';

type SupportedTokenSymbol = 'SUI' | 'WAL';

interface PriceCacheEntry {
  valueUsd: number | null;
  priceUsd: number | null;
  expiresAtMs: number;
}

const PRICE_TTL_MS = 5 * 60 * 1000;

const TOKEN_MARKET_CANDIDATES: Record<SupportedTokenSymbol, string[]> = {
  SUI: ['SUI/USDT', 'SUI/USDC'],
  WAL: ['WAL/USDT', 'WAL/USDC'],
};

const EXCHANGE_FACTORIES = [
  () => new ccxt.binance({ enableRateLimit: true }),
  () => new ccxt.okx({ enableRateLimit: true }),
  () => new ccxt.gateio({ enableRateLimit: true }),
  () => new ccxt.bybit({ enableRateLimit: true }),
];

@Injectable()
export class TokenPriceService {
  private readonly logger = new Logger(TokenPriceService.name);
  private readonly cache = new Map<string, PriceCacheEntry>();

  async getTokenPrice(symbol: string, amountHuman: number | null): Promise<{ valueUsd: number | null; priceUsd: number | null }> {
    const normalizedSymbol = symbol.trim().toUpperCase() as SupportedTokenSymbol;
    const cacheKey = `${normalizedSymbol}:${amountHuman ?? 'null'}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      return { valueUsd: cached.valueUsd, priceUsd: cached.priceUsd };
    }

    const priceUsd = await this.fetchSpotPrice(normalizedSymbol);
    const valueUsd = priceUsd !== null && amountHuman !== null ? amountHuman * priceUsd : null;
    this.cache.set(cacheKey, { valueUsd, priceUsd, expiresAtMs: now + PRICE_TTL_MS });
    return { valueUsd, priceUsd };
  }

  private async fetchSpotPrice(symbol: SupportedTokenSymbol): Promise<number | null> {
    const marketCandidates = TOKEN_MARKET_CANDIDATES[symbol] ?? [];

    for (const exchangeFactory of EXCHANGE_FACTORIES) {
      const exchange = exchangeFactory();
      try {
        await exchange.loadMarkets();
        for (const marketSymbol of marketCandidates) {
          if (!exchange.markets?.[marketSymbol]) {
            continue;
          }

          const ticker = await exchange.fetchTicker(marketSymbol);
          const last = typeof ticker.last === 'number' ? ticker.last : null;
          if (last !== null && Number.isFinite(last) && last > 0) {
            this.logger.verbose(`Price fetched successfully from ${exchange.id} for ${symbol}: $${last}`);
            return last;
          }
        }
      } catch (error) {
        this.logger.debug(`Price lookup failed on ${exchange.id} for ${symbol}: ${(error as Error).message}`);
      } finally {
        if (typeof exchange.close === 'function') {
          try {
            await exchange.close();
          } catch {
            // Ignore close errors.
          }
        }
      }
    }

    this.logger.error(`Failed to fetch real-time price for ${symbol} from all candidates.`);
    return null;
  }
}
