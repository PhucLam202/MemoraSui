import { Injectable, Logger } from '@nestjs/common';
import { OpenAiClient } from '../llm/openai.client';
import { DEFAULT_KEEP_GAS_MIST } from '../tools/defi-utils';
import { DEFAULT_SLIPPAGE, validateDeepBookIntent, validateRebalanceIntent, validateSwapIntent } from '../tools/defi-security-guard';

export type NluSwapResult = {
  intent: 'swap';
  fromToken: string;
  toToken: string;
  amount: number;
  slippage?: number;
  keepGasMist?: number;
};

export type NluTransferResult = {
  intent: 'transfer';
  recipient: string;
  amount: number;
  token: string;
};

export type NluBatchTransferResult = {
  intent: 'batch_transfer';
  recipients: Array<{ address: string; amount: number; token: string }>;
};

export type NluNftTransferResult = {
  intent: 'transfer_nft';
  objectId: string;
  recipient: string;
};

export type NluRebalanceResult = {
  intent: 'rebalance';
  targets: Array<{ token: string; targetPct: number }>;
  sellTokens?: string[]; // if set: only sell these specific tokens; if absent: sell all non-target tokens
  keepGasMist?: number;
};

export type NluDeepBookResult = {
  intent: 'deepbook_order' | 'deepbook_market';
  baseToken: string;
  quoteToken: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  quantity: number;
  price?: number;
};

export type NluNoneResult = { intent: 'none' };

export type NluResult =
  | NluSwapResult
  | NluTransferResult
  | NluBatchTransferResult
  | NluNftTransferResult
  | NluRebalanceResult
  | NluDeepBookResult
  | NluNoneResult;

const SYSTEM_PROMPT = `You are a Sui blockchain wallet assistant. Extract the user's intent and return ONLY valid JSON. No explanation, no markdown fences.

## INTENT DECISION TREE

Ask yourself in order:
1. Does the user name a specific 0x object + recipient address? → "transfer_nft"
2. Does the user mention multiple recipient addresses? → "batch_transfer"
3. Does the user mention DeepBook / limit order / market order? → "deepbook_order" or "deepbook_market"
4. Does the user swap/exchange ONE specific amount of ONE token into another? → "swap"
5. Does the user want to sell SPECIFIC NAMED tokens (without a fixed amount) into one target token? → "rebalance" + sellTokens
6. Does the user want to convert EVERYTHING / all holdings into one token? → "rebalance" (no sellTokens)
7. Does the user set portfolio allocation targets in %? → "rebalance"
8. Does the user send tokens to ONE address? → "transfer"
9. Anything else (view portfolio, questions, analytics) → "none"

## CRITICAL DISAMBIGUATION

SWAP (has explicit amount):
  "đổi 20 SUI sang USDC" → swap 20 SUI
  "swap 5 DEEP to SUI" → swap 5 DEEP
  "bán 100 CETUS lấy SUI" → swap 100 CETUS

REBALANCE + sellTokens (named tokens, NO amount):
  "đổi NAVX, SEND, CETUS về SUI" → rebalance 100% SUI, sellTokens: [NAVX, SEND, CETUS]
  "swap NAVX and CETUS to SUI" → rebalance 100% SUI, sellTokens: [NAVX, CETUS]
  "bán hết DEEP và WAL lấy SUI" → rebalance 100% SUI, sellTokens: [DEEP, WAL]

REBALANCE all (no specific tokens listed):
  "chuyển hết toàn bộ token về SUI" → rebalance 100% SUI (no sellTokens)
  "convert everything to USDC" → rebalance 100% USDC (no sellTokens)
  "đổi hết về SUI" → rebalance 100% SUI (no sellTokens)

REBALANCE with targets:
  "đưa portfolio về 60% SUI 40% USDC" → rebalance targets

## TOKEN NORMALIZATION
Uppercase all symbols. Strip: "token", "coin", "asset".
navx / navi / navix → NAVX | cetus → CETUS | send → SEND
walrus / wal → WAL | deep → DEEP | sol / wsol → SOL
sui → SUI | usdc → USDC | usdt → USDT

## NUMERIC RULES
- amount: positive float, human units (NOT mist/raw)
- slippage: decimal (1% → 0.01); omit if unspecified
- keepGasMist: MIST integer (1 SUI = 1_000_000_000); omit if unspecified
  "giữ 2 SUI làm gas" → keepGasMist: 2000000000

## JSON SCHEMAS
swap:           {"intent":"swap","fromToken":"SUI","toToken":"USDC","amount":20,"slippage":0.01,"keepGasMist":2000000000}
transfer:       {"intent":"transfer","recipient":"0x...","amount":1.5,"token":"SUI"}
batch_transfer: {"intent":"batch_transfer","recipients":[{"address":"0x...","amount":1,"token":"SUI"}]}
transfer_nft:   {"intent":"transfer_nft","objectId":"0x...","recipient":"0x..."}
rebalance:      {"intent":"rebalance","targets":[{"token":"SUI","targetPct":100}],"sellTokens":["NAVX","SEND"],"keepGasMist":2000000000}
deepbook_order: {"intent":"deepbook_order","baseToken":"DEEP","quoteToken":"SUI","side":"buy","orderType":"limit","quantity":1000,"price":0.008}
deepbook_market:{"intent":"deepbook_market","baseToken":"DEEP","quoteToken":"SUI","side":"sell","orderType":"market","quantity":500}
none:           {"intent":"none"}

## EXAMPLES

User: "đổi 0.2 SUI qua NAVX"
Output: {"intent":"swap","fromToken":"SUI","toToken":"NAVX","amount":0.2}

User: "swap 20 SUI to USDC with 1% slippage, keep 2 SUI for gas"
Output: {"intent":"swap","fromToken":"SUI","toToken":"USDC","amount":20,"slippage":0.01,"keepGasMist":2000000000}

User: "đổi 50 DEEP sang SUI giữ lại 1.5 SUI làm gas"
Output: {"intent":"swap","fromToken":"DEEP","toToken":"SUI","amount":50,"keepGasMist":1500000000}

User: "đổi NAVX, SEND, Cetus về SUI"
Output: {"intent":"rebalance","targets":[{"token":"SUI","targetPct":100}],"sellTokens":["NAVX","SEND","CETUS"]}

User: "swap NAVX and CETUS to SUI"
Output: {"intent":"rebalance","targets":[{"token":"SUI","targetPct":100}],"sellTokens":["NAVX","CETUS"]}

User: "bán hết DEEP và WAL lấy SUI, giữ 2 SUI làm gas"
Output: {"intent":"rebalance","targets":[{"token":"SUI","targetPct":100}],"sellTokens":["DEEP","WAL"],"keepGasMist":2000000000}

User: "chuyển hết toàn bộ token đang có trong ví về sui"
Output: {"intent":"rebalance","targets":[{"token":"SUI","targetPct":100}]}

User: "convert all my tokens to USDC"
Output: {"intent":"rebalance","targets":[{"token":"USDC","targetPct":100}]}

User: "đổi hết về SUI, giữ lại 2 SUI làm gas"
Output: {"intent":"rebalance","targets":[{"token":"SUI","targetPct":100}],"keepGasMist":2000000000}

User: "rebalance portfolio về 60% SUI 40% USDC"
Output: {"intent":"rebalance","targets":[{"token":"SUI","targetPct":60},{"token":"USDC","targetPct":40}]}

User: "chuyển 1 SUI cho 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
Output: {"intent":"transfer","recipient":"0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890","amount":1,"token":"SUI"}

User: "show me my portfolio"
Output: {"intent":"none"}

User: "balance của tôi là bao nhiêu?"
Output: {"intent":"none"}`;

const VALID_INTENTS = new Set<string>([
  'swap',
  'transfer',
  'batch_transfer',
  'transfer_nft',
  'rebalance',
  'deepbook_order',
  'deepbook_market',
  'none',
]);

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isHexAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40,}$/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateNluResult(raw: unknown): NluResult | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const intent = obj['intent'];
  if (typeof intent !== 'string' || !VALID_INTENTS.has(intent)) return null;

  if (intent === 'none') {
    return { intent: 'none' };
  }

  if (intent === 'swap') {
    const { fromToken, toToken, amount, slippage, keepGasMist } = obj;
    if (!isNonEmptyString(fromToken) || !isNonEmptyString(toToken) || !isPositiveFinite(amount)) return null;
    const normalizedKeepGasMist =
      typeof keepGasMist === 'number' && isNonNegativeFinite(keepGasMist)
        ? BigInt(Math.round(keepGasMist))
        : DEFAULT_KEEP_GAS_MIST;
    const normalizedSlippage = typeof slippage === 'number' && isPositiveFinite(slippage) ? slippage : undefined;
    const guarded = validateSwapIntent({
      fromToken,
      toToken,
      amount,
      slippage: normalizedSlippage ?? DEFAULT_SLIPPAGE,
      keepGasMist: normalizedKeepGasMist,
    });
    if (!guarded.ok) {
      return null;
    }
    const result: NluSwapResult = {
      intent: 'swap',
      fromToken: guarded.value.fromToken,
      toToken: guarded.value.toToken,
      amount: guarded.value.amount,
      slippage: guarded.value.slippage,
      keepGasMist: Number(guarded.value.keepGasMist),
    };
    return result;
  }

  if (intent === 'transfer') {
    const { recipient, amount, token } = obj;
    if (!isHexAddress(recipient) || !isPositiveFinite(amount)) return null;
    return { intent: 'transfer', recipient, amount, token: isNonEmptyString(token) ? token.trim().toUpperCase() : 'SUI' };
  }

  if (intent === 'batch_transfer') {
    const { recipients } = obj;
    if (!Array.isArray(recipients) || recipients.length === 0) return null;
    const parsed = recipients
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .map((r) => ({
        address: r['address'],
        amount: r['amount'],
        token: r['token'],
      }))
      .filter((r) => isHexAddress(r.address) && isPositiveFinite(r.amount));
    if (parsed.length === 0) return null;
    return {
      intent: 'batch_transfer',
      recipients: parsed.map((r) => ({
        address: r.address as string,
        amount: r.amount as number,
        token: isNonEmptyString(r.token) ? (r.token as string).trim().toUpperCase() : 'SUI',
      })),
    };
  }

  if (intent === 'transfer_nft') {
    const { objectId, recipient } = obj;
    if (!isHexAddress(objectId) || !isHexAddress(recipient)) return null;
    return { intent: 'transfer_nft', objectId, recipient };
  }

  if (intent === 'rebalance') {
    const { targets, keepGasMist, sellTokens } = obj;
    if (!Array.isArray(targets) || targets.length < 1) return null;
    const parsedTargets = targets
      .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
      .map((t) => ({ token: t['token'], targetPct: t['targetPct'] }))
      .filter((t) => isNonEmptyString(t.token) && isPositiveFinite(t.targetPct));
    if (parsedTargets.length < 1) return null;
    if (parsedTargets.length === 1 && parsedTargets[0].targetPct !== 100) return null;
    const guarded = validateRebalanceIntent({
      targets: parsedTargets.map((t) => ({
        token: (t.token as string).trim().toUpperCase(),
        targetPct: t.targetPct as number,
      })),
      keepGasMist:
        typeof keepGasMist === 'number' && isNonNegativeFinite(keepGasMist)
          ? BigInt(Math.round(keepGasMist))
          : DEFAULT_KEEP_GAS_MIST,
    });
    if (!guarded.ok) {
      return null;
    }
    const parsedSellTokens =
      Array.isArray(sellTokens)
        ? sellTokens
            .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s) => s.trim().toUpperCase())
        : undefined;
    return {
      intent: 'rebalance',
      targets: guarded.value.targets,
      sellTokens: parsedSellTokens && parsedSellTokens.length > 0 ? parsedSellTokens : undefined,
      keepGasMist: Number(guarded.value.keepGasMist),
    };
  }

  if (intent === 'deepbook_order' || intent === 'deepbook_market') {
    const { baseToken, quoteToken, side, orderType, quantity, price } = obj;
    if (
      !isNonEmptyString(baseToken) ||
      !isNonEmptyString(quoteToken) ||
      (side !== 'buy' && side !== 'sell') ||
      (orderType !== 'limit' && orderType !== 'market') ||
      !isPositiveFinite(quantity)
    ) return null;
    const guarded = validateDeepBookIntent({
      baseToken,
      quoteToken,
      side,
      orderType,
      quantity,
      price: typeof price === 'number' && isPositiveFinite(price) ? price : undefined,
    });
    if (!guarded.ok) {
      return null;
    }
    return {
      intent: guarded.value.orderType === 'market' ? 'deepbook_market' : 'deepbook_order',
      baseToken: guarded.value.baseToken,
      quoteToken: guarded.value.quoteToken,
      side: guarded.value.side,
      orderType: guarded.value.orderType,
      quantity: guarded.value.quantity,
      price: guarded.value.price,
    };
  }

  return null;
}

@Injectable()
export class NluIntentExtractorChain {
  private readonly logger = new Logger(NluIntentExtractorChain.name);

  constructor(private readonly openAiClient: OpenAiClient) {}

  async extract(question: string): Promise<NluResult | null> {
    if (!this.openAiClient.isEnabled()) {
      return null;
    }

    const raw = await this.openAiClient.complete(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
      { temperature: 0, maxTokens: 250 },
    );

    if (!raw) {
      this.logger.warn('NLU: LLM returned empty response');
      return null;
    }

    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned) as unknown;
      const validated = validateNluResult(parsed);
      if (!validated) {
        this.logger.warn('NLU: validation failed for parsed payload.');
        return null;
      }
      this.logger.log(`NLU: intent=${validated.intent}`);
      return validated;
    } catch {
      this.logger.warn('NLU: JSON parse failed.');
      return null;
    }
  }
}
