import { Injectable } from '@nestjs/common';
import { type ExecutionPreviewAllocation, type ExecutionRequest } from '../orchestrator/ai-harness.types';
import { AnalyticsService } from '../../analytics/analytics.service';
import { SuiClientService } from '../../sui/sui-client.service';
import { type SuiNetwork } from '../../sui/sui.types';
import { DefiTokenResolverTool, type ResolvedDefiToken } from './defi-token-resolver.tool';
import { DefiWalletAccessTool } from './defi-wallet-access.tool';
import { TransactionRiskTool } from './transaction-risk.tool';
import {
  DEFAULT_QUOTE_TTL_MS,
  formatPercent,
  formatTokenAmount,
  formatUsd,
  isStableSymbol,
  normalizeTokenSymbol,
  SUI_COIN_TYPE,
  toRawAmount,
  uniqueStrings,
} from './defi-utils';
import {
  DEFAULT_SLIPPAGE,
  ELEVATED_COMPLEXITY_SOFT,
  ELEVATED_LEGS_SOFT,
  MAX_COMPLEXITY_SCORE,
  MIN_GAS_BUFFER_MIST,
  WARN_PRICE_IMPACT_RATIO,
  computeComplexityScore,
  extractPriceImpactRatioFromRoute,
  validatePriceImpact,
  validateRebalanceIntent,
} from './defi-security-guard';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AggregatorClient, Env } = require('@cetusprotocol/aggregator-sdk/dist/index.cjs') as {
  AggregatorClient: new (params: Record<string, unknown>) => {
    findRouters(params: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    routerSwap(params: Record<string, unknown>): Promise<unknown>;
  };
  Env: {
    Mainnet: number;
  };
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Transaction } = require('@mysten/sui/transactions') as {
  Transaction: new () => any;
};

type RebalanceExecutionInput = {
  walletAddress: string;
  network: SuiNetwork;
  targets: Array<{ token: string; targetPct: number }>;
  sellTokens?: string[]; // if set: only sell these specific tokens; if absent: sell all non-target surpluses
  keepGasMist: bigint;
};

type TradeLeg = {
  from: ResolvedDefiToken;
  to: ResolvedDefiToken;
  inputAmountHuman: number;
  inputAmountRaw: bigint;
  usdValue: number;
};

const AGGREGATOR_V3_PACKAGE_KEY = 'aggregator_v3';
const TRANSFER_OR_DESTROY_COIN_FUNC = 'transfer_or_destroy_coin';

function consumeSwapOutputCoin(input: {
  tx: any;
  outputCoin: unknown;
  targetCoinType: string;
  router: Record<string, unknown>;
  walletAddress: string;
}) {
  if (input.targetCoinType === SUI_COIN_TYPE) {
    input.tx.mergeCoins(input.tx.gas, [input.outputCoin as never]);
    return;
  }

  const packages = input.router.packages;
  const aggregatorPublishedAt =
    packages instanceof Map ? (packages.get(AGGREGATOR_V3_PACKAGE_KEY) as string | undefined) : undefined;
  if (!aggregatorPublishedAt) {
    input.tx.transferObjects([input.outputCoin as never], input.walletAddress);
    return;
  }

  input.tx.moveCall({
    target: `${aggregatorPublishedAt}::router::${TRANSFER_OR_DESTROY_COIN_FUNC}`,
    typeArguments: [input.targetCoinType],
    arguments: [input.outputCoin as never],
  });
}

@Injectable()
export class RebalanceExecutionTool {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly suiClientService: SuiClientService,
    private readonly tokenResolver: DefiTokenResolverTool,
    private readonly walletAccess: DefiWalletAccessTool,
    private readonly transactionRiskTool: TransactionRiskTool,
  ) {}

  async buildRebalanceExecution(input: RebalanceExecutionInput): Promise<{ answer: string; executionRequest?: ExecutionRequest }> {
    const validatedIntent = validateRebalanceIntent({
      targets: input.targets,
      keepGasMist: input.keepGasMist,
    });
    if (!validatedIntent.ok) {
      return {
        answer: validatedIntent.reason,
      };
    }
    const normalizedTargets = validatedIntent.value.targets;
    const normalizedKeepGasMist = validatedIntent.value.keepGasMist + MIN_GAS_BUFFER_MIST;

    const targetTotal = normalizedTargets.reduce((sum, target) => sum + target.targetPct, 0);
    if (Math.abs(targetTotal - 100) > 0.5) {
      return {
        answer: `Tổng allocation mục tiêu hiện là ${formatPercent(targetTotal)}. Hãy chỉnh lại để gần 100% trước khi rebalance.`,
      };
    }
    await this.walletAccess.ensureSuiGasBalance(input.walletAddress, input.network);

    const portfolio = await this.analyticsService.getPortfolioSummary(input.walletAddress, input.network);
    const totalWalletValueUsd = Number(portfolio.totalWalletValueUsd ?? 0);
    if (!Number.isFinite(totalWalletValueUsd) || totalWalletValueUsd <= 0 || portfolio.hasUsdValues !== true) {
      return {
        answer: 'Không thể rebalance vì portfolio hiện chưa có định giá USD đủ tin cậy.',
      };
    }

    const resolvedTargets = await Promise.all(
      normalizedTargets.map(async (target) => ({
        request: target,
        token: await this.tokenResolver.resolveToken(target.token, input.walletAddress, input.network),
      })),
    );
    const missingTarget = resolvedTargets.find((item) => !item.token);
    if (missingTarget) {
      return {
        answer: `Không resolve được token mục tiêu \`${missingTarget.request.token}\`. Hãy dùng symbol phổ biến hoặc coin type đầy đủ.`,
      };
    }

    const aggregator = new AggregatorClient({
      client: this.suiClientService.getClient(input.network),
      env: Env.Mainnet,
    });
    const targetPriceMap = new Map<string, number>();
    for (const item of resolvedTargets) {
      const token = item.token!;
      const symbol = normalizeTokenSymbol(token.symbol);
      const currentHolding = portfolio.holdings.find((holding) => normalizeTokenSymbol(String(holding.symbol ?? '')) === symbol);
      const currentPrice = typeof currentHolding?.priceUsd === 'number' ? currentHolding.priceUsd : null;
      if (currentPrice && Number.isFinite(currentPrice) && currentPrice > 0) {
        targetPriceMap.set(symbol, currentPrice);
        continue;
      }
      if (isStableSymbol(symbol)) {
        targetPriceMap.set(symbol, 1);
        continue;
      }
      const estimatedPrice = await this.estimatePriceUsd(aggregator, token, input.walletAddress, input.network);
      if (!estimatedPrice || estimatedPrice <= 0) {
        return {
          answer: `Không thể định giá token ${symbol} để rebalance an toàn.`,
        };
      }
      targetPriceMap.set(symbol, estimatedPrice);
    }

    const currentValueMap = new Map<string, number>();
    for (const holding of portfolio.holdings) {
      if (typeof holding.symbol !== 'string') {
        continue;
      }
      const symbol = normalizeTokenSymbol(holding.symbol);
      const valueUsd = typeof holding.valueUsd === 'number' ? holding.valueUsd : 0;
      if (valueUsd > 0) {
        currentValueMap.set(symbol, (currentValueMap.get(symbol) ?? 0) + valueUsd);
      }
    }

    const surpluses: Array<{ token: ResolvedDefiToken; usdValue: number }> = [];
    const deficits: Array<{ token: ResolvedDefiToken; usdValue: number }> = [];

    for (const item of resolvedTargets) {
      const token = item.token!;
      const symbol = normalizeTokenSymbol(token.symbol);
      const currentValue = currentValueMap.get(symbol) ?? 0;
      const targetValue = (item.request.targetPct / 100) * totalWalletValueUsd;
      const delta = currentValue - targetValue;
      if (delta > 2) {
        surpluses.push({ token, usdValue: delta });
      } else if (delta < -2) {
        deficits.push({ token, usdValue: Math.abs(delta) });
      }
    }

    const targetSymbols = new Set(resolvedTargets.map((item) => normalizeTokenSymbol(item.token!.symbol)));
    const sellTokenSet = input.sellTokens && input.sellTokens.length > 0
      ? new Set(input.sellTokens.map(normalizeTokenSymbol))
      : null; // null = sell all non-target tokens
    const surplusPriceMap = new Map<string, number>();
    for (const holding of portfolio.holdings) {
      if (typeof holding.symbol !== 'string' || typeof holding.coinType !== 'string' || typeof holding.decimals !== 'number') {
        continue;
      }
      const symbol = normalizeTokenSymbol(holding.symbol);
      if (targetSymbols.has(symbol)) {
        continue;
      }
      // If user specified exact tokens to sell, skip anything not in the list
      if (sellTokenSet && !sellTokenSet.has(symbol)) {
        continue;
      }
      const valueUsd = typeof holding.valueUsd === 'number' ? holding.valueUsd : 0;
      if (valueUsd <= 0) {
        continue;
      }
      const amountHuman = typeof holding.amountHuman === 'number' && holding.amountHuman > 0 ? holding.amountHuman : null;
      const perTokenPriceUsd = amountHuman ? valueUsd / amountHuman : null;
      if (perTokenPriceUsd && Number.isFinite(perTokenPriceUsd) && perTokenPriceUsd > 0) {
        surplusPriceMap.set(symbol, perTokenPriceUsd);
      }
      surpluses.push({
        token: {
          symbol,
          coinType: holding.coinType,
          decimals: holding.decimals,
        },
        usdValue: valueUsd,
      });
    }

    if (surpluses.length === 0 || deficits.length === 0) {
      return {
        answer: 'Portfolio hiện đã khá gần allocation mục tiêu, không cần tạo PTB rebalance mới.',
      };
    }

    surpluses.sort((a, b) => b.usdValue - a.usdValue);
    deficits.sort((a, b) => b.usdValue - a.usdValue);

    const tradeLegs: TradeLeg[] = [];
    let surplusIndex = 0;
    let deficitIndex = 0;
    while (surplusIndex < surpluses.length && deficitIndex < deficits.length) {
      const sell = surpluses[surplusIndex];
      const buy = deficits[deficitIndex];
      if (!sell || !buy) {
        break;
      }
      const usdValue = Math.min(sell.usdValue, buy.usdValue);
      const sellSymbol = normalizeTokenSymbol(sell.token.symbol);
      const sellPrice = targetPriceMap.get(sellSymbol) ?? surplusPriceMap.get(sellSymbol) ?? null;
      if (!sellPrice || !Number.isFinite(sellPrice) || sellPrice <= 0) {
        surplusIndex += 1;
        continue;
      }
      const inputAmountHuman = usdValue / sellPrice;
      const inputAmountRaw = toRawAmount(inputAmountHuman, sell.token.decimals);
      if (!inputAmountRaw || inputAmountRaw <= 0n) {
        surplusIndex += 1;
        continue;
      }
      tradeLegs.push({
        from: sell.token,
        to: buy.token,
        inputAmountHuman,
        inputAmountRaw,
        usdValue,
      });
      sell.usdValue -= usdValue;
      buy.usdValue -= usdValue;
      if (sell.usdValue <= 2) {
        surplusIndex += 1;
      }
      if (buy.usdValue <= 2) {
        deficitIndex += 1;
      }
    }

    if (tradeLegs.length === 0) {
      return {
        answer: 'Không tìm được trade leg đủ lớn để rebalance mà không tạo dust quá nhỏ.',
      };
    }

    const tx = new Transaction();
    tx.setSender(input.walletAddress);
    const routes: string[] = [];
    const protocols = new Set<string>();
    const expectedOutputs = new Map<string, number>();
    const groupedSellAmounts = new Map<string, bigint>();

    for (const leg of tradeLegs) {
      groupedSellAmounts.set(leg.from.coinType, (groupedSellAmounts.get(leg.from.coinType) ?? 0n) + leg.inputAmountRaw);
    }

    const preparedSellCoins = new Map<string, unknown>();
    for (const [coinType, totalRawAmount] of groupedSellAmounts.entries()) {
      const prepared = await this.walletAccess.prepareInputCoin(
        tx,
        input.walletAddress,
        coinType,
        totalRawAmount,
        input.network,
        normalizedKeepGasMist,
      );
      preparedSellCoins.set(coinType, prepared.coin);
    }

    let maxPriceImpactRatio = 0;
    for (const leg of tradeLegs) {
      const route = await aggregator.findRouters({
        from: leg.from.coinType,
        target: leg.to.coinType,
        amount: leg.inputAmountRaw,
        byAmountIn: true,
      });
      const paths = Array.isArray(route?.paths) ? route.paths : [];
      const amountOutRaw = route?.amountOut ? BigInt(String(route.amountOut)) : 0n;
      const deviationRatio = typeof route?.deviationRatio === 'number' ? route.deviationRatio : 0;
      if (!route || paths.length === 0 || amountOutRaw <= 0n) {
        return {
          answer: `Không tìm thấy route rebalance cho ${leg.from.symbol} -> ${leg.to.symbol}.`,
        };
      }
      if (deviationRatio > DEFAULT_SLIPPAGE) {
        return {
          answer: `Một leg rebalance ${leg.from.symbol} -> ${leg.to.symbol} đang có slippage khoảng ${formatPercent(
            deviationRatio * 100,
          )}, vượt ngưỡng an toàn mặc định.`,
        };
      }
      const priceImpactRatio = extractPriceImpactRatioFromRoute(route);
      maxPriceImpactRatio = Math.max(maxPriceImpactRatio, priceImpactRatio);
      const priceImpactCheck = validatePriceImpact(priceImpactRatio);
      if (!priceImpactCheck.ok) {
        return {
          answer: `Leg rebalance ${leg.from.symbol} -> ${leg.to.symbol} bị chặn: ${priceImpactCheck.reason}`,
        };
      }

      const sourceCoin = preparedSellCoins.get(leg.from.coinType);
      const [legCoin] = tx.splitCoins(sourceCoin as never, [leg.inputAmountRaw]);
      const outputCoin = await aggregator.routerSwap({
        router: route,
        inputCoin: legCoin,
        slippage: DEFAULT_SLIPPAGE,
        txb: tx,
      });
      consumeSwapOutputCoin({
        tx,
        outputCoin,
        targetCoinType: leg.to.coinType,
        router: route,
        walletAddress: input.walletAddress,
      });

      routes.push(`${leg.from.symbol} -> ${leg.to.symbol}`);
      paths.forEach((path) => {
        if (typeof path?.provider === 'string') {
          protocols.add(path.provider.toLowerCase());
        }
      });
      const targetOutputHuman = Number(amountOutRaw) / 10 ** leg.to.decimals;
      expectedOutputs.set(leg.to.symbol, (expectedOutputs.get(leg.to.symbol) ?? 0) + targetOutputHuman);
    }

    const routeStepCount = routes.length;
    const complexityScore = computeComplexityScore({
      legs: tradeLegs.length,
      routeSteps: routeStepCount,
      protocols: protocols.size,
      targets: normalizedTargets.length,
    });
    if (complexityScore > MAX_COMPLEXITY_SCORE) {
      return {
        answer: `Rebalance bị chặn vì route quá phức tạp (complexity=${complexityScore}, max=${MAX_COMPLEXITY_SCORE}).`,
      };
    }
    const warnings = tradeLegs.length > 3 ? ['Rebalance này gồm nhiều leg swap, gas có thể cao hơn bình thường.'] : [];
    if (maxPriceImpactRatio > WARN_PRICE_IMPACT_RATIO) {
      warnings.push(
        `Price impact ước lượng ${(maxPriceImpactRatio * 100).toFixed(2)}% đang cao, cân nhắc giảm quy mô rebalance.`,
      );
    }
    const artifacts = await this.transactionRiskTool.buildExecutionArtifacts({
      tx,
      sender: input.walletAddress,
      network: input.network,
      warnings,
      touchedProtocols: Array.from(protocols),
    });

    const allocations: ExecutionPreviewAllocation[] = resolvedTargets.map((item) => ({
      symbol: item.token!.symbol,
      currentPct: ((currentValueMap.get(normalizeTokenSymbol(item.token!.symbol)) ?? 0) / totalWalletValueUsd) * 100,
      targetPct: item.request.targetPct,
    }));

    return {
      answer: `Đã chuẩn bị rebalance về ${resolvedTargets
        .map((item) => `${item.request.targetPct}% ${item.token!.symbol}`)
        .join(', ')}. Vui lòng kiểm tra các leg swap trước khi ký.`,
      executionRequest: {
        kind: 'rebalance',
        network: 'mainnet',
        transactionKindBytesBase64: artifacts.transactionKindBytesBase64,
        transactionJson: artifacts.transactionJson,
        quoteExpiresAt: new Date(Date.now() + DEFAULT_QUOTE_TTL_MS).toISOString(),
        summary: {
          title: 'Portfolio rebalance ready',
          detail: `${tradeLegs.length} leg swap để đưa ví về allocation mục tiêu.`,
        },
        preview: {
          actionLabel: 'Portfolio Rebalance',
          slippagePct: DEFAULT_SLIPPAGE * 100,
          route: routes,
          protocols: Array.from(protocols),
          allocations,
          expectedAmountOut: Array.from(expectedOutputs.entries())
            .map(([symbol, amount]) => formatTokenAmount(amount, symbol))
            .join(', '),
        },
        risk: {
          ...artifacts.risk,
          requiresElevatedConfirmation:
            tradeLegs.length >= ELEVATED_LEGS_SOFT || complexityScore >= ELEVATED_COMPLEXITY_SOFT,
          elevatedReason:
            tradeLegs.length >= ELEVATED_LEGS_SOFT || complexityScore >= ELEVATED_COMPLEXITY_SOFT
              ? 'Yêu cầu xác nhận nâng cao: số leg/độ phức tạp rebalance cao.'
              : undefined,
          securityChecks: {
            slippagePct: DEFAULT_SLIPPAGE * 100,
            priceImpactPct: maxPriceImpactRatio * 100,
            complexityScore,
            gasReserve: {
              requiredMist: normalizedKeepGasMist.toString(),
              keepGasMist: input.keepGasMist.toString(),
              minGasBufferMist: MIN_GAS_BUFFER_MIST.toString(),
            },
          },
          warnings: [
            ...artifacts.risk.warnings,
            `Tổng giá trị ví hiện tại khoảng ${formatUsd(totalWalletValueUsd)}.`,
          ],
        },
      },
    };
  }

  private async estimatePriceUsd(
    aggregator: InstanceType<typeof AggregatorClient>,
    token: ResolvedDefiToken,
    walletAddress: string,
    network: SuiNetwork,
  ) {
    const usdc = await this.tokenResolver.resolveToken('USDC', walletAddress, network);
    if (!usdc) {
      return null;
    }
    const probeAmountRaw = toRawAmount(1, token.decimals);
    if (!probeAmountRaw) {
      return null;
    }
    const route = await aggregator.findRouters({
      from: token.coinType,
      target: usdc.coinType,
      amount: probeAmountRaw,
      byAmountIn: true,
    });
    const amountOutRaw = route?.amountOut ? Number(String(route.amountOut)) : 0;
    if (!Number.isFinite(amountOutRaw) || amountOutRaw <= 0) {
      return null;
    }
    return amountOutRaw / 10 ** usdc.decimals;
  }
}
