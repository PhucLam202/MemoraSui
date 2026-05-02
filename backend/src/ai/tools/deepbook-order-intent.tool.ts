import { Injectable, Logger } from '@nestjs/common';
import { validateDeepBookIntent } from './defi-security-guard';

export type DeepBookOrderIntentRequest = {
  baseToken: string;
  quoteToken: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  quantity: number;
  price?: number;
  network: string;
};

function parseLimitOrder(question: string) {
  const match = question.match(
    /(?:đặt|dat|place)\s+limit\s+(buy|sell|mua|ban)\s+(\d+(?:[.,]\d+)?)\s+([a-z0-9:_]+)\s+(?:giá|gia|at|@)\s+(\d+(?:[.,]\d+)?)\s+([a-z0-9:_]+)/i,
  );
  if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5]) {
    return null;
  }

  const quantity = parseFloat(match[2].replace(',', '.'));
  const price = parseFloat(match[4].replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    orderType: 'limit' as const,
    side: /buy|mua/i.test(match[1]) ? 'buy' as const : 'sell' as const,
    quantity,
    baseToken: match[3].trim(),
    quoteToken: match[5].trim(),
    price,
  };
}

function parseMarketOrder(question: string) {
  const match = question.match(
    /(?:đặt|dat|place)?\s*(market)\s+(buy|sell|mua|ban)\s+(\d+(?:[.,]\d+)?)\s+([a-z0-9:_]+)(?:\s+(?:for|bằng|bang|with)\s+([a-z0-9:_]+))?/i,
  );
  if (!match?.[2] || !match[3] || !match[4]) {
    return null;
  }

  const quantity = parseFloat(match[3].replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return {
    orderType: 'market' as const,
    side: /buy|mua/i.test(match[2]) ? 'buy' as const : 'sell' as const,
    quantity,
    baseToken: match[4].trim(),
    quoteToken: match[5]?.trim(),
  };
}

@Injectable()
export class DeepBookOrderIntentTool {
  private readonly logger = new Logger(DeepBookOrderIntentTool.name);

  parseOrder(question: string, network: string): DeepBookOrderIntentRequest | null {
    const limit = parseLimitOrder(question);
    if (limit) {
      const validated = validateDeepBookIntent(limit);
      if (!validated.ok) {
        this.logger.warn(`DeepBook intent rejected by security guard (code=${validated.rejectCode}).`);
        return null;
      }
      return {
        ...validated.value,
        network,
      };
    }

    const market = parseMarketOrder(question);
    if (market?.quoteToken) {
      const validated = validateDeepBookIntent({
        ...market,
        quoteToken: market.quoteToken,
      });
      if (!validated.ok) {
        this.logger.warn(`DeepBook intent rejected by security guard (code=${validated.rejectCode}).`);
        return null;
      }
      return {
        baseToken: validated.value.baseToken,
        quoteToken: validated.value.quoteToken,
        side: validated.value.side,
        orderType: validated.value.orderType,
        quantity: validated.value.quantity,
        network,
      };
    }

    this.logger.warn(`Could not parse DeepBook order (chars=${question.length}).`);
    return null;
  }
}
