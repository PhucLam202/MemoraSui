import { Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_KEEP_GAS_MIST,
  DEFAULT_SLIPPAGE,
  normalizeTokenQuery,
  parseOptionalKeepGas,
  parseOptionalSlippage,
} from './defi-utils';
import { validateSwapIntent } from './defi-security-guard';

export type SwapIntentRequest = {
  legs: SwapIntentLeg[];
  fromToken: string;
  toToken: string;
  amount: number;
  slippage: number;
  keepGasMist: string;
  network: string;
};

export type SwapIntentLeg = {
  fromToken: string;
  toToken: string;
  amount: number;
};

type ParsedSwap = {
  fromToken: string;
  toToken: string;
  amount: number;
};

const TOKEN_PATTERN = '((?:token\\s+)?[a-z][a-z0-9:_-]*(?:\\s+token)?)';

function toParsedSwap(amountText: string, fromTokenText: string, toTokenText: string): ParsedSwap | null {
  const amount = parseFloat(amountText.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const fromToken = normalizeTokenQuery(fromTokenText);
  const toToken = normalizeTokenQuery(toTokenText);
  if (!fromToken || !toToken || fromToken === toToken) return null;
  return { amount, fromToken, toToken };
}

function parseAmountAndPairFromText(text: string) {
  const amountFirst = new RegExp(
    `(?:swap|đổi|doi|hoán đổi|hoan doi)?\\s*(\\d+(?:[.,]\\d+)?)\\s+${TOKEN_PATTERN}\\s+(?:sang|qua|to|for|->|→)\\s+${TOKEN_PATTERN}`,
    'i',
  );
  const amountFirstMatch = text.match(amountFirst);
  if (amountFirstMatch?.[1] && amountFirstMatch[2] && amountFirstMatch[3]) {
    return toParsedSwap(amountFirstMatch[1], amountFirstMatch[2], amountFirstMatch[3]);
  }

  const tokenFirst = new RegExp(
    `(?:swap|đổi|doi|hoán đổi|hoan doi)(?:\\s+giúp\\s+tôi|\\s+giup\\s+toi)?\\s+${TOKEN_PATTERN}\\s+(\\d+(?:[.,]\\d+)?)(?:\\s+${TOKEN_PATTERN})?\\s+(?:sang|qua|to|for|->|→)\\s+${TOKEN_PATTERN}`,
    'i',
  );
  const tokenFirstMatch = text.match(tokenFirst);
  if (tokenFirstMatch?.[1] && tokenFirstMatch[2] && tokenFirstMatch[4]) {
    return toParsedSwap(tokenFirstMatch[2], tokenFirstMatch[1], tokenFirstMatch[4]);
  }

  const buyWithDefaultSui = text.match(
    /(?:swap|đổi|doi|hoán đổi|hoan doi)?\s*(\d+(?:[.,]\d+)?)\s+(?:mua|buy)\s+((?:token\s+)?[a-z][a-z0-9:_-]*(?:\s+token)?)/i,
  );
  if (buyWithDefaultSui?.[1] && buyWithDefaultSui[2]) {
    return toParsedSwap(buyWithDefaultSui[1], 'SUI', buyWithDefaultSui[2]);
  }

  return null;
}

// Regex fallback parser — only used when NLU is unavailable
function parseAmountAndPairs(question: string) {
  const normalized = question.replace(/\u00a0/g, ' ').trim();
  const clauses = normalized
    .split(/\s*(?:,|;|&|\+|\band\b|\bva\b|và)\s*/iu)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const parsedLegs: ParsedSwap[] = [];

  for (const clause of clauses) {
    const parsed = parseAmountAndPairFromText(clause);
    if (parsed) {
      parsedLegs.push(parsed);
    }
  }

  if (parsedLegs.length === 0) {
    const parsed = parseAmountAndPairFromText(normalized);
    if (parsed) {
      parsedLegs.push(parsed);
    }
  }

  if (parsedLegs.length <= 1) {
    return parsedLegs;
  }

  // Preserve order but remove exact duplicate legs to avoid accidental repeated commands.
  const seen = new Set<string>();
  const uniqueLegs: ParsedSwap[] = [];
  for (const leg of parsedLegs) {
    const key = `${leg.amount}:${leg.fromToken}:${leg.toToken}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueLegs.push(leg);
  }

  return uniqueLegs;
}

@Injectable()
export class SwapIntentTool {
  private readonly logger = new Logger(SwapIntentTool.name);

  parseSwap(question: string, network: string): SwapIntentRequest | null {
    const parsedLegs = parseAmountAndPairs(question);
    if (parsedLegs.length === 0) {
      this.logger.warn(`Could not parse swap params (chars=${question.length}).`);
      return null;
    }
    const slippage = parseOptionalSlippage(question) ?? DEFAULT_SLIPPAGE;
    const keepGasMist = parseOptionalKeepGas(question) ?? DEFAULT_KEEP_GAS_MIST;
    const validated = validateSwapIntent({
      fromToken: parsedLegs[0]?.fromToken ?? '',
      toToken: parsedLegs[0]?.toToken ?? '',
      amount: parsedLegs[0]?.amount ?? 0,
      legs: parsedLegs,
      slippage,
      keepGasMist,
    });
    if (!validated.ok) {
      this.logger.warn(`Swap intent rejected by security guard (code=${validated.rejectCode}).`);
      return null;
    }
    const firstLeg = validated.value.legs[0];
    if (!firstLeg) return null;
    return {
      legs: validated.value.legs.map((leg) => ({
        fromToken: leg.fromToken,
        toToken: leg.toToken,
        amount: leg.amount,
      })),
      fromToken: firstLeg.fromToken,
      toToken: firstLeg.toToken,
      amount: firstLeg.amount,
      slippage: validated.value.slippage,
      keepGasMist: validated.value.keepGasMist.toString(),
      network,
    };
  }
}
