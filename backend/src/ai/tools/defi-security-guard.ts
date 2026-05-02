import { z } from 'zod';
import { type ExecutionRequest } from '../orchestrator/ai-harness.types';
import { normalizeTokenQuery, normalizeTokenSymbol } from './defi-utils';

export const MIN_SLIPPAGE = 0.001;
export const MAX_SLIPPAGE = 0.05;
export const DEFAULT_SLIPPAGE = 0.005;
export const MAX_SWAP_LEGS = 4;
export const MAX_REBALANCE_TARGETS = 8;
export const MAX_KEEP_GAS_MIST = 20_000_000_000n;
export const MIN_GAS_BUFFER_MIST = 100_000_000n;
export const MAX_PRICE_IMPACT_RATIO = 0.15;
export const WARN_PRICE_IMPACT_RATIO = 0.1;
export const MAX_EXEC_REQUESTS_PER_5M = 10;
export const EXEC_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const ELEVATED_NOTIONAL_SUI_THRESHOLD = 100;
export const ELEVATED_COMPLEXITY_SOFT = 12;
export const ELEVATED_LEGS_SOFT = 5;
export const MAX_COMPLEXITY_SCORE = 20;

const MAINNET_TOKEN_WHITELIST = new Set<string>();
const MAINNET_TOKEN_BLACKLIST = new Set<string>();

const normalizedTokenSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => normalizeTokenSymbol(normalizeTokenQuery(value)));

export type ExecutionRejectCode =
  | 'INVALID_INPUT'
  | 'INVALID_SLIPPAGE'
  | 'SLIPPAGE_TOO_HIGH'
  | 'SLIPPAGE_TOO_LOW'
  | 'TOO_MANY_LEGS'
  | 'TOO_MANY_TARGETS'
  | 'KEEP_GAS_TOO_HIGH'
  | 'TOKEN_BLOCKED'
  | 'TOKEN_NOT_ALLOWED'
  | 'PRICE_IMPACT_TOO_HIGH'
  | 'COMPLEXITY_TOO_HIGH'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_GAS_RESERVE'
  | 'MALFORMED_EXECUTION_REQUEST';

export type GuardResult<T> =
  | {
      ok: true;
      value: T;
      warnings?: string[];
    }
  | {
      ok: false;
      rejectCode: ExecutionRejectCode;
      reason: string;
    };

export type SecurityChecksSnapshot = {
  slippagePct?: number;
  priceImpactPct?: number;
  complexityScore?: number;
  gasReserve?: {
    availableMist?: string;
    requiredMist: string;
    keepGasMist?: string;
    minGasBufferMist: string;
  };
};

function reject<T>(rejectCode: ExecutionRejectCode, reason: string): GuardResult<T> {
  return { ok: false, rejectCode, reason };
}

function validateTokenSymbol(
  rawValue: string,
  fieldName: string,
): GuardResult<{ raw: string; normalized: string }> {
  const parsed = normalizedTokenSchema.safeParse(rawValue);
  if (!parsed.success) {
    return reject('INVALID_INPUT', `${fieldName} không hợp lệ.`);
  }
  const normalized = parsed.data;
  if (MAINNET_TOKEN_BLACKLIST.has(normalized)) {
    return reject('TOKEN_BLOCKED', `Token ${normalized} đang bị chặn vì policy bảo mật.`);
  }
  if (MAINNET_TOKEN_WHITELIST.size > 0 && !MAINNET_TOKEN_WHITELIST.has(normalized)) {
    return reject('TOKEN_NOT_ALLOWED', `Token ${normalized} chưa có trong allowlist mainnet.`);
  }
  return {
    ok: true,
    value: { raw: rawValue.trim(), normalized },
  };
}

function validateSlippage(slippage: number): GuardResult<number> {
  if (!Number.isFinite(slippage)) {
    return reject('INVALID_SLIPPAGE', 'Slippage không phải số hợp lệ.');
  }
  if (slippage < MIN_SLIPPAGE) {
    return reject(
      'SLIPPAGE_TOO_LOW',
      `Slippage ${(slippage * 100).toFixed(3)}% thấp hơn ngưỡng tối thiểu ${(MIN_SLIPPAGE * 100).toFixed(2)}%.`,
    );
  }
  if (slippage > MAX_SLIPPAGE) {
    return reject(
      'SLIPPAGE_TOO_HIGH',
      `Slippage ${(slippage * 100).toFixed(2)}% vượt ngưỡng an toàn ${(MAX_SLIPPAGE * 100).toFixed(2)}%.`,
    );
  }
  return { ok: true, value: slippage };
}

function validateKeepGasMist(keepGasMist: bigint): GuardResult<bigint> {
  if (keepGasMist < 0n) {
    return reject('INVALID_INPUT', 'keepGasMist không được âm.');
  }
  if (keepGasMist > MAX_KEEP_GAS_MIST) {
    return reject(
      'KEEP_GAS_TOO_HIGH',
      `Gas reserve yêu cầu ${(Number(keepGasMist) / 1_000_000_000).toFixed(2)} SUI vượt ngưỡng policy ${Number(MAX_KEEP_GAS_MIST) / 1_000_000_000} SUI.`,
    );
  }
  return { ok: true, value: keepGasMist };
}

function validatePositiveAmount(amount: number, fieldName: string): GuardResult<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return reject('INVALID_INPUT', `${fieldName} phải là số dương hợp lệ.`);
  }
  return { ok: true, value: amount };
}

export function validateSwapIntent(input: {
  fromToken: string;
  toToken: string;
  amount: number;
  slippage: number;
  keepGasMist: bigint;
  legs?: Array<{
    fromToken: string;
    toToken: string;
    amount: number;
  }>;
}): GuardResult<{
  fromToken: string;
  toToken: string;
  amount: number;
  slippage: number;
  keepGasMist: bigint;
  legs: Array<{
    fromToken: string;
    toToken: string;
    amount: number;
  }>;
}> {
  const normalizedSlippage = validateSlippage(input.slippage);
  if (!normalizedSlippage.ok) return normalizedSlippage;
  const normalizedKeepGas = validateKeepGasMist(input.keepGasMist);
  if (!normalizedKeepGas.ok) return normalizedKeepGas;

  const normalizedLegs = (Array.isArray(input.legs) && input.legs.length > 0
    ? input.legs
    : [{ fromToken: input.fromToken, toToken: input.toToken, amount: input.amount }]).slice(0, MAX_SWAP_LEGS + 1);

  if (normalizedLegs.length === 0) {
    return reject('INVALID_INPUT', 'Không có leg swap hợp lệ.');
  }
  if (normalizedLegs.length > MAX_SWAP_LEGS) {
    return reject('TOO_MANY_LEGS', `Số leg swap (${normalizedLegs.length}) vượt ngưỡng tối đa ${MAX_SWAP_LEGS}.`);
  }

  const sanitized: Array<{ fromToken: string; toToken: string; amount: number }> = [];
  for (let index = 0; index < normalizedLegs.length; index += 1) {
    const leg = normalizedLegs[index];
    if (!leg) continue;
    const fromToken = validateTokenSymbol(leg.fromToken, `fromToken leg #${index + 1}`);
    if (!fromToken.ok) return fromToken;
    const toToken = validateTokenSymbol(leg.toToken, `toToken leg #${index + 1}`);
    if (!toToken.ok) return toToken;
    if (fromToken.value.normalized === toToken.value.normalized) {
      return reject('INVALID_INPUT', `Leg #${index + 1} có fromToken trùng toToken.`);
    }
    const amount = validatePositiveAmount(leg.amount, `amount leg #${index + 1}`);
    if (!amount.ok) return amount;
    sanitized.push({
      fromToken: fromToken.value.normalized,
      toToken: toToken.value.normalized,
      amount: amount.value,
    });
  }

  const firstLeg = sanitized[0];
  if (!firstLeg) {
    return reject('INVALID_INPUT', 'Không có leg swap hợp lệ sau khi chuẩn hóa.');
  }

  return {
    ok: true,
    value: {
      fromToken: firstLeg.fromToken,
      toToken: firstLeg.toToken,
      amount: firstLeg.amount,
      slippage: normalizedSlippage.value,
      keepGasMist: normalizedKeepGas.value,
      legs: sanitized,
    },
  };
}

export function validateRebalanceIntent(input: {
  targets: Array<{ token: string; targetPct: number }>;
  keepGasMist: bigint;
}): GuardResult<{
  targets: Array<{ token: string; targetPct: number }>;
  keepGasMist: bigint;
}> {
  if (!Array.isArray(input.targets) || input.targets.length < 1) {
    return reject('INVALID_INPUT', 'Rebalance cần tối thiểu 1 target.');
  }
  if (input.targets.length > MAX_REBALANCE_TARGETS) {
    return reject(
      'TOO_MANY_TARGETS',
      `Số target rebalance (${input.targets.length}) vượt ngưỡng tối đa ${MAX_REBALANCE_TARGETS}.`,
    );
  }
  const keepGas = validateKeepGasMist(input.keepGasMist);
  if (!keepGas.ok) return keepGas;

  const normalizedTargets: Array<{ token: string; targetPct: number }> = [];
  for (let index = 0; index < input.targets.length; index += 1) {
    const target = input.targets[index];
    if (!target) continue;
    const token = validateTokenSymbol(target.token, `token target #${index + 1}`);
    if (!token.ok) return token;
    if (!Number.isFinite(target.targetPct) || target.targetPct <= 0) {
      return reject('INVALID_INPUT', `targetPct #${index + 1} không hợp lệ.`);
    }
    normalizedTargets.push({
      token: token.value.normalized,
      targetPct: target.targetPct,
    });
  }

  // Allow single 100% target — means "convert everything to this token"
  if (normalizedTargets.length === 1 && normalizedTargets[0]!.targetPct !== 100) {
    return reject('INVALID_INPUT', 'Rebalance 1 target phải có targetPct = 100.');
  }
  if (normalizedTargets.length < 1) {
    return reject('INVALID_INPUT', 'Không đủ target rebalance hợp lệ sau khi chuẩn hóa.');
  }

  return {
    ok: true,
    value: {
      targets: normalizedTargets,
      keepGasMist: keepGas.value,
    },
  };
}

export function validateDeepBookIntent(input: {
  baseToken: string;
  quoteToken: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  quantity: number;
  price?: number;
}): GuardResult<{
  baseToken: string;
  quoteToken: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  quantity: number;
  price?: number;
}> {
  const baseToken = validateTokenSymbol(input.baseToken, 'baseToken');
  if (!baseToken.ok) return baseToken;
  const quoteToken = validateTokenSymbol(input.quoteToken, 'quoteToken');
  if (!quoteToken.ok) return quoteToken;
  if (baseToken.value.normalized === quoteToken.value.normalized) {
    return reject('INVALID_INPUT', 'baseToken và quoteToken không được trùng nhau.');
  }
  const quantity = validatePositiveAmount(input.quantity, 'quantity');
  if (!quantity.ok) return quantity;

  if (input.orderType === 'limit') {
    if (!Number.isFinite(input.price) || (input.price ?? 0) <= 0) {
      return reject('INVALID_INPUT', 'Limit order cần price hợp lệ.');
    }
  }

  return {
    ok: true,
    value: {
      baseToken: baseToken.value.normalized,
      quoteToken: quoteToken.value.normalized,
      side: input.side,
      orderType: input.orderType,
      quantity: quantity.value,
      price: input.price,
    },
  };
}

export function computeComplexityScore(input: {
  legs?: number;
  routeSteps?: number;
  protocols?: number;
  targets?: number;
}) {
  const legs = Math.max(0, input.legs ?? 0);
  const routeSteps = Math.max(0, input.routeSteps ?? 0);
  const protocols = Math.max(0, input.protocols ?? 0);
  const targets = Math.max(0, input.targets ?? 0);
  const score = legs * 2 + Math.ceil(routeSteps * 0.5) + protocols + Math.ceil(targets * 0.5);
  return score;
}

export function extractPriceImpactRatioFromRoute(route: Record<string, unknown> | null | undefined): number {
  if (!route || typeof route !== 'object') {
    return 0;
  }
  const deviationRatio = route['deviationRatio'];
  if (typeof deviationRatio === 'number' && Number.isFinite(deviationRatio) && deviationRatio >= 0) {
    return deviationRatio;
  }
  const ratio = route['priceImpactRatio'];
  if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= 0) {
    return ratio;
  }
  const pct = route['priceImpactPct'];
  if (typeof pct === 'number' && Number.isFinite(pct) && pct >= 0) {
    return pct > 1 ? pct / 100 : pct;
  }
  return 0;
}

export function validatePriceImpact(priceImpactRatio: number): GuardResult<number> {
  if (!Number.isFinite(priceImpactRatio) || priceImpactRatio < 0) {
    return reject('INVALID_INPUT', 'Price impact không hợp lệ.');
  }
  if (priceImpactRatio > MAX_PRICE_IMPACT_RATIO) {
    return reject(
      'PRICE_IMPACT_TOO_HIGH',
      `Price impact ${(priceImpactRatio * 100).toFixed(2)}% vượt ngưỡng an toàn ${(MAX_PRICE_IMPACT_RATIO * 100).toFixed(2)}%.`,
    );
  }
  return { ok: true, value: priceImpactRatio };
}

const executionRequestSchema = z.object({
  kind: z.enum(['swap', 'rebalance', 'deepbook_order']),
  network: z.literal('mainnet'),
  transactionKindBytesBase64: z.string().min(10),
  transactionJson: z.string().min(10),
  quoteExpiresAt: z.string().datetime(),
  summary: z.object({
    title: z.string().min(1),
    detail: z.string().min(1),
  }),
  preview: z.object({
    actionLabel: z.string().min(1),
    slippagePct: z.number().finite(),
  }).passthrough(),
  risk: z.object({
    warnings: z.array(z.string()),
    touchedProtocols: z.array(z.string()),
    gasEstimateMist: z.string().optional(),
    expectedBalanceChanges: z
      .array(
        z.object({
          symbol: z.string(),
          amount: z.string(),
        }),
      )
      .optional(),
    requiresElevatedConfirmation: z.boolean().optional(),
    elevatedReason: z.string().optional(),
    rejectCode: z.string().optional(),
    securityChecks: z.any().optional(),
  }).passthrough(),
});

export function validateExecutionRequestPayload(payload: unknown): GuardResult<ExecutionRequest> {
  const parsed = executionRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return reject('MALFORMED_EXECUTION_REQUEST', 'Execution request payload không đúng schema bảo mật.');
  }
  return { ok: true, value: parsed.data as ExecutionRequest };
}
