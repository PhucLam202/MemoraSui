import { Injectable } from '@nestjs/common';
import { type ExecutionRequest } from '../orchestrator/ai-harness.types';
import { SuiClientService } from '../../sui/sui-client.service';
import { type SuiNetwork } from '../../sui/sui.types';
import { DefiTokenResolverTool } from './defi-token-resolver.tool';
import { DefiWalletAccessTool } from './defi-wallet-access.tool';
import { TransactionRiskTool } from './transaction-risk.tool';
import {
  DEFAULT_QUOTE_TTL_MS,
  formatPercent,
  formatTokenAmount,
  normalizeTokenSymbol,
  SUI_COIN_TYPE,
  toHumanAmount,
  toRawAmount,
  uniqueStrings,
} from './defi-utils';
import {
  ELEVATED_COMPLEXITY_SOFT,
  ELEVATED_LEGS_SOFT,
  ELEVATED_NOTIONAL_SUI_THRESHOLD,
  MAX_COMPLEXITY_SCORE,
  MIN_GAS_BUFFER_MIST,
  WARN_PRICE_IMPACT_RATIO,
  computeComplexityScore,
  extractPriceImpactRatioFromRoute,
  validatePriceImpact,
  validateSwapIntent,
} from './defi-security-guard';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AggregatorClient, Env } = require('@cetusprotocol/aggregator-sdk/dist/index.cjs') as {
  AggregatorClient: new (params: Record<string, unknown>) => {
    findRouters(params: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    routerSwap(params: Record<string, unknown>): Promise<unknown>;
    fastRouterSwap(params: Record<string, unknown> & { recipient?: string }): Promise<void>;
  };
  Env: {
    Mainnet: number;
  };
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Transaction, coinWithBalance } = require('@mysten/sui/transactions') as {
  Transaction: new () => any;
  coinWithBalance: (params: Record<string, unknown>) => unknown;
};

type SwapExecutionInput = {
  walletAddress: string;
  network: SuiNetwork;
  fromToken: string;
  toToken: string;
  amount: number;
  legs?: Array<{
    fromToken: string;
    toToken: string;
    amount: number;
  }>;
  slippage: number;
  keepGasMist: bigint;
};

type BuiltSwapLeg = {
  index: number;
  fromTokenSymbol: string;
  toTokenSymbol: string;
  fromTokenCoinType: string;
  toTokenCoinType: string;
  inputAmountHuman: number;
  inputRawAmount: bigint;
  expectedOutputHuman: number;
  paths: Array<{ from: string; target: string; provider?: string | null }>;
  deviationRatio: number;
  router: Record<string, unknown>;
};

@Injectable()
export class SwapExecutionTool {
  constructor(
    private readonly suiClientService: SuiClientService,
    private readonly tokenResolver: DefiTokenResolverTool,
    private readonly walletAccess: DefiWalletAccessTool,
    private readonly transactionRiskTool: TransactionRiskTool,
  ) {}

  async buildSwapExecution(input: SwapExecutionInput): Promise<{ answer: string; executionRequest?: ExecutionRequest }> {
    const guardedIntent = validateSwapIntent({
      fromToken: input.fromToken,
      toToken: input.toToken,
      amount: input.amount,
      slippage: input.slippage,
      keepGasMist: input.keepGasMist,
      legs: input.legs,
    });
    if (!guardedIntent.ok) {
      return {
        answer: guardedIntent.reason,
      };
    }
    const normalizedInput = guardedIntent.value;
    const requestedLegs = normalizedInput.legs;
    await this.walletAccess.ensureSuiGasBalance(input.walletAddress, input.network);

    const aggregator = new AggregatorClient({
      client: this.suiClientService.getClient(input.network),
      env: Env.Mainnet,
    });

    const builtLegs: BuiltSwapLeg[] = [];
    for (let index = 0; index < requestedLegs.length; index += 1) {
      const leg = requestedLegs[index];
      if (!leg) {
        continue;
      }
      const fromToken = await this.tokenResolver.resolveToken(leg.fromToken, input.walletAddress, input.network);
      const toToken = await this.tokenResolver.resolveToken(leg.toToken, input.walletAddress, input.network);
      if (!fromToken || !toToken) {
        const fromSuggestions = await this.tokenResolver.suggestTokenSymbols(leg.fromToken, input.walletAddress, input.network, 2);
        const toSuggestions = await this.tokenResolver.suggestTokenSymbols(leg.toToken, input.walletAddress, input.network, 2);
        const suggestions = uniqueStrings([...fromSuggestions, ...toSuggestions]).slice(0, 3);
        return {
          answer:
            suggestions.length > 0
              ? `Không thể resolve token cho leg #${index + 1}: \`${leg.fromToken} -> ${leg.toToken}\`. Gợi ý: ${suggestions.join(', ')}.`
              : `Không thể resolve token cho leg #${index + 1}: \`${leg.fromToken} -> ${leg.toToken}\`.`,
        };
      }

      const inputRawAmount = toRawAmount(leg.amount, fromToken.decimals);
      if (!inputRawAmount || inputRawAmount <= 0n) {
        return {
          answer: `Số lượng swap không hợp lệ ở leg #${index + 1}.`,
        };
      }

      const router = await aggregator.findRouters({
        from: fromToken.coinType,
        target: toToken.coinType,
        amount: inputRawAmount,
        byAmountIn: true,
      });

      const paths = Array.isArray(router?.paths) ? (router.paths as Array<{ from: string; target: string; provider?: string | null }>) : [];
      const amountOutRaw = router?.amountOut ? BigInt(String(router.amountOut)) : 0n;
      const deviationRatio = typeof router?.deviationRatio === 'number' ? router.deviationRatio : 0;
      if (!router || paths.length === 0 || amountOutRaw <= 0n) {
        return {
          answer: `Không tìm thấy route khả dụng cho leg #${index + 1}: ${normalizeTokenSymbol(fromToken.symbol)} -> ${normalizeTokenSymbol(toToken.symbol)}.`,
        };
      }

      if (deviationRatio > normalizedInput.slippage) {
        return {
          answer: `Slippage leg #${index + 1} khoảng ${formatPercent(deviationRatio * 100)} vượt ngưỡng ${formatPercent(
            normalizedInput.slippage * 100,
          )}.`,
        };
      }
      const priceImpactRatio = extractPriceImpactRatioFromRoute(router);
      const priceImpactCheck = validatePriceImpact(priceImpactRatio);
      if (!priceImpactCheck.ok) {
        return {
          answer: `Leg #${index + 1} bị chặn: ${priceImpactCheck.reason}`,
        };
      }

      const expectedAmountOut = toHumanAmount(amountOutRaw, toToken.decimals) ?? 0;
      builtLegs.push({
        index,
        fromTokenSymbol: fromToken.symbol,
        toTokenSymbol: toToken.symbol,
        fromTokenCoinType: fromToken.coinType,
        toTokenCoinType: toToken.coinType,
        inputAmountHuman: leg.amount,
        inputRawAmount,
        expectedOutputHuman: expectedAmountOut,
        paths,
        deviationRatio,
        router,
      });
    }

    if (builtLegs.length === 0) {
      return {
        answer: 'Không có leg swap hợp lệ để build PTB.',
      };
    }

    const totalSuiInputRaw = builtLegs.reduce((sum, leg) => {
      if (leg.fromTokenCoinType !== SUI_COIN_TYPE) {
        return sum;
      }
      return sum + leg.inputRawAmount;
    }, 0n);
    const requiredSuiReserve = totalSuiInputRaw + normalizedInput.keepGasMist + MIN_GAS_BUFFER_MIST;
    const availableSuiBalance = await this.walletAccess.getTotalBalanceByCoinType(
      input.walletAddress,
      SUI_COIN_TYPE,
      input.network,
    );
    if (availableSuiBalance < requiredSuiReserve) {
      return {
        answer: `SUI không đủ để giữ reserve an toàn. Cần ${(Number(requiredSuiReserve) / 1_000_000_000).toFixed(
          4,
        )} SUI (bao gồm input + reserve + gas buffer), hiện có ${(Number(availableSuiBalance) / 1_000_000_000).toFixed(4)} SUI.`,
      };
    }

    const tx = new Transaction();
    tx.setSender(input.walletAddress);

    const orderedLegs = builtLegs.sort((left, right) => left.index - right.index);
    for (const leg of orderedLegs) {
      const inputCoin = coinWithBalance({
        balance: leg.inputRawAmount,
        useGasCoin: true,
        type: leg.fromTokenCoinType,
      });
      await aggregator.fastRouterSwap({
        router: leg.router,
        inputCoin,
        slippage: normalizedInput.slippage,
        txb: tx,
        recipient: input.walletAddress,
      });
    }

    const protocols = uniqueStrings(
      builtLegs.flatMap((leg) =>
        leg.paths.map((path) => (typeof path?.provider === 'string' ? path.provider.toLowerCase() : null)),
      ),
    );
    const routeStepCount = builtLegs.reduce((sum, leg) => sum + leg.paths.length, 0);
    const complexityScore = computeComplexityScore({
      legs: builtLegs.length,
      routeSteps: routeStepCount,
      protocols: protocols.length,
    });
    if (complexityScore > MAX_COMPLEXITY_SCORE) {
      return {
        answer: `Swap bị chặn vì route quá phức tạp (complexity=${complexityScore}, max=${MAX_COMPLEXITY_SCORE}).`,
      };
    }
    const maxPriceImpactRatio = builtLegs.reduce(
      (maxValue, leg) => Math.max(maxValue, extractPriceImpactRatioFromRoute(leg.router)),
      0,
    );
    const warnings = [];
    if (builtLegs.some((leg) => leg.deviationRatio > normalizedInput.slippage * 0.8)) {
      warnings.push('Một hoặc nhiều leg có slippage sát ngưỡng cho phép.');
    }
    if (maxPriceImpactRatio > WARN_PRICE_IMPACT_RATIO) {
      warnings.push(
        `Price impact ước lượng ${(maxPriceImpactRatio * 100).toFixed(2)}% đang cao, hãy cân nhắc quote mới hoặc giảm amount.`,
      );
    }
    const artifacts = await this.transactionRiskTool.buildExecutionArtifacts({
      tx,
      sender: input.walletAddress,
      network: input.network,
      warnings,
      touchedProtocols: protocols,
    });

    const legSummaries = orderedLegs
      .map(
        (leg) =>
          `${formatTokenAmount(leg.inputAmountHuman, leg.fromTokenSymbol)} -> khoảng ${formatTokenAmount(
            leg.expectedOutputHuman,
            leg.toTokenSymbol,
          )}`,
      );
    const isMultiLeg = builtLegs.length > 1;
    const previewRoute = orderedLegs.flatMap((leg) =>
      leg.paths.map(
        (path) =>
          `[Leg ${leg.index + 1}] ${normalizeTokenSymbol(path.from)} -> ${normalizeTokenSymbol(path.target)} (${normalizeTokenSymbol(
            leg.fromTokenSymbol,
          )}→${normalizeTokenSymbol(leg.toTokenSymbol)})`,
      ),
    );
    const requiresElevatedConfirmation =
      builtLegs.length >= ELEVATED_LEGS_SOFT ||
      complexityScore >= ELEVATED_COMPLEXITY_SOFT ||
      totalSuiInputRaw >= BigInt(ELEVATED_NOTIONAL_SUI_THRESHOLD * 1_000_000_000);
    const elevatedReason = requiresElevatedConfirmation
      ? `Yêu cầu xác nhận nâng cao: notional > ${ELEVATED_NOTIONAL_SUI_THRESHOLD} SUI hoặc complexity cao.`
      : undefined;

    return {
      answer: isMultiLeg
        ? `Đã chuẩn bị ${builtLegs.length} leg swap trong 1 PTB: ${legSummaries.join('; ')}. Vui lòng kiểm tra route và rủi ro trước khi ký.`
        : `Đã chuẩn bị swap ${legSummaries[0]}. Vui lòng kiểm tra route và rủi ro trước khi ký.`,
      executionRequest: {
        kind: 'swap',
        network: 'mainnet',
        transactionKindBytesBase64: artifacts.transactionKindBytesBase64,
        transactionJson: artifacts.transactionJson,
        quoteExpiresAt: new Date(Date.now() + DEFAULT_QUOTE_TTL_MS).toISOString(),
        summary: {
          title: isMultiLeg ? `Smart swap PTB ready (${builtLegs.length} legs)` : 'Smart swap ready',
          detail: legSummaries.join(' | '),
        },
        preview: {
          actionLabel: isMultiLeg ? `Smart Swap (${builtLegs.length} legs)` : 'Smart Swap',
          fromToken: builtLegs[0]?.fromTokenSymbol,
          toToken: builtLegs[0]?.toTokenSymbol,
          amountIn: isMultiLeg
            ? `${builtLegs.length} legs`
            : builtLegs[0]
              ? formatTokenAmount(builtLegs[0].inputAmountHuman, builtLegs[0].fromTokenSymbol)
              : undefined,
          expectedAmountOut: isMultiLeg
            ? undefined
            : builtLegs[0]
              ? formatTokenAmount(builtLegs[0].expectedOutputHuman, builtLegs[0].toTokenSymbol)
              : undefined,
          slippagePct: normalizedInput.slippage * 100,
          route: previewRoute,
          protocols,
        },
        risk: {
          ...artifacts.risk,
          requiresElevatedConfirmation,
          elevatedReason,
          securityChecks: {
          slippagePct: normalizedInput.slippage * 100,
            priceImpactPct: maxPriceImpactRatio * 100,
            complexityScore,
            gasReserve: {
              availableMist: availableSuiBalance.toString(),
              requiredMist: requiredSuiReserve.toString(),
              keepGasMist: normalizedInput.keepGasMist.toString(),
              minGasBufferMist: MIN_GAS_BUFFER_MIST.toString(),
            },
          },
        },
      },
    };
  }
}
