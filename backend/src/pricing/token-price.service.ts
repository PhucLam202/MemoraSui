import { Injectable, Logger } from '@nestjs/common';
import ccxt from 'ccxt';

interface PriceCacheEntry {
  priceUsd: number | null;
  expiresAtMs: number;
}

const PRICE_TTL_MS = 5 * 60 * 1000;
const DEXSCREENER_TTL_MS = 2 * 60 * 1000;

// Map canonical coinType → CEX market pairs. Only exact coinType match uses CEX price.
const CEX_COIN_TYPES: Record<string, string[]> = {
  '0x2::sui::SUI': ['SUI/USDT', 'SUI/USDC'],
};

// Symbol-based fallback for WAL (match by symbol + contains 'wal' in coinType)
const WAL_MARKET_PAIRS = ['WAL/USDT', 'WAL/USDC'];

const EXCHANGE_FACTORIES = [
  () => new ccxt.binance({ enableRateLimit: true }),
  () => new ccxt.bybit({ enableRateLimit: true }),
];

@Injectable()
export class TokenPriceService {
  private readonly logger = new Logger(TokenPriceService.name);
  private readonly priceCache = new Map<string, PriceCacheEntry>();

  async getTokenPrice(
    symbol: string,
    amountHuman: number | null,
    coinType?: string,
  ): Promise<{ valueUsd: number | null; priceUsd: number | null }> {
    const cacheKey = coinType ?? symbol.trim().toUpperCase();
    const now = Date.now();
    const cached = this.priceCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      const priceUsd = cached.priceUsd;
      const valueUsd = priceUsd !== null && amountHuman !== null ? amountHuman * priceUsd : null;
      return { valueUsd, priceUsd };
    }

    const normalizedSymbol = symbol.trim().toUpperCase();
    let priceUsd: number | null = null;

    // Only use CEX when the coinType is the exact canonical address — prevents fake tokens
    // with the same symbol (e.g. 0xABC::fake::SUI) from being priced as real SUI.
    const cexPairs = coinType ? CEX_COIN_TYPES[coinType] : undefined;
    if (cexPairs) {
      priceUsd = await this.fetchCexPrice(cexPairs);
    } else if (normalizedSymbol === 'WAL' && coinType?.toLowerCase().includes('wal')) {
      priceUsd = await this.fetchCexPrice(WAL_MARKET_PAIRS);
    }

    if (priceUsd === null && coinType && coinType !== 'unknown') {
      priceUsd = await this.fetchDexScreenerPrice(coinType, normalizedSymbol);
    }

    const ttl = coinType && !CEX_COIN_TYPES[coinType] ? DEXSCREENER_TTL_MS : PRICE_TTL_MS;
    this.priceCache.set(cacheKey, { priceUsd, expiresAtMs: now + ttl });

    const valueUsd = priceUsd !== null && amountHuman !== null ? amountHuman * priceUsd : null;
    return { valueUsd, priceUsd };
  }

  private async fetchCexPrice(marketCandidates: string[]): Promise<number | null> {
    for (const exchangeFactory of EXCHANGE_FACTORIES) {
      const exchange = exchangeFactory();
      try {
        await exchange.loadMarkets();
        for (const marketSymbol of marketCandidates) {
          if (!exchange.markets?.[marketSymbol]) continue;
          const ticker = await exchange.fetchTicker(marketSymbol);
          const last = typeof ticker.last === 'number' ? ticker.last : null;
          if (last !== null && Number.isFinite(last) && last > 0) {
            this.logger.verbose(`Price fetched from ${exchange.id} for ${marketSymbol}: $${last}`);
            return last;
          }
        }
      } catch (error) {
        this.logger.debug(`CEX lookup failed on ${exchange.id}: ${(error as Error).message}`);
      } finally {
        if (typeof exchange.close === 'function') {
          try { await exchange.close(); } catch { /* ignore */ }
        }
      }
    }
    return null;
  }

  private async fetchDexScreenerPrice(coinType: string, symbol: string): Promise<number | null> {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(coinType)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;

      const json = await res.json() as { pairs?: Array<{ priceUsd?: string; chainId?: string }> };
      const suiPairs = (json.pairs ?? []).filter((p) => p.chainId === 'sui');
      const first = suiPairs.find((p) => p.priceUsd) ?? suiPairs[0];
      const price = first?.priceUsd ? parseFloat(first.priceUsd) : null;

      if (price !== null && Number.isFinite(price) && price > 0) {
        this.logger.verbose(`Price fetched from DexScreener for ${symbol} (${coinType.slice(0, 20)}...): $${price}`);
        return price;
      }
    } catch (error) {
      this.logger.debug(`DexScreener lookup failed for ${symbol}: ${(error as Error).message}`);
    }
    return null;
  }
}
