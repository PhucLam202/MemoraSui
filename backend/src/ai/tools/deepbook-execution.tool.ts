import { Injectable } from '@nestjs/common';
import { type ExecutionRequest } from '../orchestrator/ai-harness.types';
import { SuiClientService } from '../../sui/sui-client.service';
import { type SuiNetwork } from '../../sui/sui.types';
import { DefiTokenResolverTool } from './defi-token-resolver.tool';
import { DefiWalletAccessTool } from './defi-wallet-access.tool';
import { TransactionRiskTool } from './transaction-risk.tool';
import {
  DEFAULT_QUOTE_TTL_MS,
  FLOAT_SCALING_FACTOR,
  SUI_COIN_TYPE,
  formatTokenAmount,
  formatUsd,
  toHumanAmount,
  toRawAmount,
} from './defi-utils';
import {
  DEFAULT_SLIPPAGE,
  ELEVATED_NOTIONAL_SUI_THRESHOLD,
  MAX_COMPLEXITY_SCORE,
  computeComplexityScore,
  validateDeepBookIntent,
  validatePriceImpact,
} from './defi-security-guard';

type Transaction = any;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DeepBookClient } = require('@mysten/deepbook') as {
  DeepBookClient: new (client: unknown, accountCap?: string, currentAddress?: string) => {
    createAccountCap(tx: Transaction): unknown;
    getUserPosition(poolId: string, accountCap?: string): Promise<{
      availableBaseAmount: bigint;
      lockedBaseAmount: bigint;
      availableQuoteAmount: bigint;
      lockedQuoteAmount: bigint;
    }>;
    getMarketPrice(poolId: string): Promise<{
      bestBidPrice?: bigint;
      bestAskPrice?: bigint;
    }>;
    placeLimitOrder(
      poolId: string,
      price: bigint,
      quantity: bigint,
      orderType: 'bid' | 'ask',
      expirationTimestamp?: number,
    ): Promise<Transaction>;
    placeMarketOrder(
      accountCap: string | unknown,
      poolId: string,
      quantity: bigint,
      orderType: 'bid' | 'ask',
      baseCoin?: unknown,
      quoteCoin?: unknown,
      clientOrderId?: string,
      recipientAddress?: string,
      tx?: Transaction,
    ): Promise<Transaction>;
  };
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Transaction } = require('@mysten/sui/transactions') as {
  Transaction: new () => any;
};

type DeepBookExecutionInput = {
  walletAddress: string;
  network: SuiNetwork;
  baseToken: string;
  quoteToken: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  quantity: number;
  price?: number;
};

@Injectable()
export class DeepBookExecutionTool {
  constructor(
    private readonly suiClientService: SuiClientService,
    private readonly tokenResolver: DefiTokenResolverTool,
    private readonly walletAccess: DefiWalletAccessTool,
    private readonly transactionRiskTool: TransactionRiskTool,
  ) {}

  async buildOrderExecution(input: DeepBookExecutionInput): Promise<{ answer: string; executionRequest?: ExecutionRequest }> {
    const guardedIntent = validateDeepBookIntent(input);
    if (!guardedIntent.ok) {
      return {
        answer: guardedIntent.reason,
      };
    }
    const normalizedInput = guardedIntent.value;
    const baseToken = await this.tokenResolver.resolveToken(normalizedInput.baseToken, input.walletAddress, input.network);
    const quoteToken = await this.tokenResolver.resolveToken(normalizedInput.quoteToken, input.walletAddress, input.network);
    if (!baseToken || !quoteToken) {
      const suggestions = await this.tokenResolver.suggestTokenSymbols(
        !baseToken ? normalizedInput.baseToken : normalizedInput.quoteToken,
        input.walletAddress,
        input.network,
        3,
      );
      return {
        answer:
          suggestions.length > 0
            ? `Không thể resolve market ${normalizedInput.baseToken}/${normalizedInput.quoteToken} trên DeepBook. Gợi ý token: ${suggestions.join(', ')}.`
            : `Không thể resolve market ${normalizedInput.baseToken}/${normalizedInput.quoteToken} trên DeepBook.`,
      };
    }

    const pool = await this.tokenResolver.findDeepBookPool(baseToken.symbol, quoteToken.symbol, input.network);
    if (!pool || pool.baseSymbol !== baseToken.symbol || pool.quoteSymbol !== quoteToken.symbol) {
      return {
        answer: `Không tìm thấy pool DeepBook chuẩn cho market ${baseToken.symbol}/${quoteToken.symbol}.`,
      };
    }

    const quantityRaw = toRawAmount(normalizedInput.quantity, baseToken.decimals);
    if (!quantityRaw || quantityRaw <= 0n) {
      return {
        answer: 'Quantity order không hợp lệ.',
      };
    }
    await this.walletAccess.ensureSuiGasBalance(input.walletAddress, input.network);

    const existingCap = await this.walletAccess.findDeepBookAccountCap(input.walletAddress, input.network);
    const deepbook = new DeepBookClient(
      this.suiClientService.getClient(input.network),
      existingCap ?? undefined,
      input.walletAddress,
    );
    const marketPrice = await deepbook.getMarketPrice(pool.poolId);

    if (normalizedInput.orderType === 'limit') {
      if (!existingCap) {
        return {
          answer: 'Ví hiện chưa có DeepBook AccountCap. Hãy tạo và nạp balance vào DeepBook trước khi đặt limit order.',
        };
      }
      if (!normalizedInput.price || normalizedInput.price <= 0) {
        return {
          answer: 'Limit order cần giá đặt lệnh hợp lệ.',
        };
      }

      const position = await deepbook.getUserPosition(pool.poolId, existingCap);
      const scaledPrice = BigInt(Math.round(normalizedInput.price * Number(FLOAT_SCALING_FACTOR)));
      const referencePrice =
        normalizedInput.side === 'buy' ? marketPrice.bestAskPrice : marketPrice.bestBidPrice;
      if (referencePrice && referencePrice > 0n) {
        const diff = scaledPrice > referencePrice ? scaledPrice - referencePrice : referencePrice - scaledPrice;
        const ratio = Number(diff) / Number(referencePrice);
        const impactCheck = validatePriceImpact(ratio);
        if (!impactCheck.ok) {
          return {
            answer: `Limit order bị chặn: ${impactCheck.reason}`,
          };
        }
      }
      const requiredQuoteAmount = (scaledPrice * quantityRaw) / FLOAT_SCALING_FACTOR;
      if (normalizedInput.side === 'buy' && position.availableQuoteAmount < requiredQuoteAmount) {
        return {
          answer: `Số dư quote trong DeepBook chưa đủ. Cần khoảng ${formatTokenAmount(
            Number(requiredQuoteAmount) / 10 ** quoteToken.decimals,
            quoteToken.symbol,
          )} để đặt limit buy.`,
        };
      }
      if (normalizedInput.side === 'sell' && position.availableBaseAmount < quantityRaw) {
        return {
          answer: `Số dư base trong DeepBook chưa đủ. Cần ${formatTokenAmount(normalizedInput.quantity, baseToken.symbol)} trong DeepBook custody.`,
        };
      }

      const tx = await deepbook.placeLimitOrder(
        pool.poolId,
        scaledPrice,
        quantityRaw,
        normalizedInput.side === 'buy' ? 'bid' : 'ask',
        Date.now() + 24 * 60 * 60 * 1000,
      );
      tx.setSender(input.walletAddress);
      const warnings =
        normalizedInput.side === 'buy' && marketPrice.bestAskPrice && scaledPrice < marketPrice.bestAskPrice
          ? ['Giá bid hiện thấp hơn best ask, lệnh có thể chưa khớp ngay.']
          : normalizedInput.side === 'sell' && marketPrice.bestBidPrice && scaledPrice > marketPrice.bestBidPrice
            ? ['Giá ask hiện cao hơn best bid, lệnh có thể chưa khớp ngay.']
            : [];
      const complexityScore = computeComplexityScore({
        legs: 1,
        routeSteps: 1,
        protocols: 1,
      });
      if (complexityScore > MAX_COMPLEXITY_SCORE) {
        return {
          answer: `DeepBook order bị chặn vì complexity quá cao (${complexityScore}).`,
        };
      }
      const artifacts = await this.transactionRiskTool.buildExecutionArtifacts({
        tx,
        sender: input.walletAddress,
        network: input.network,
        warnings,
        touchedProtocols: ['deepbook'],
      });

      return {
        answer: `Đã chuẩn bị limit ${normalizedInput.side} ${formatTokenAmount(normalizedInput.quantity, baseToken.symbol)} tại giá ${normalizedInput.price} ${quoteToken.symbol}.`,
        executionRequest: {
          kind: 'deepbook_order',
          network: 'mainnet',
          transactionKindBytesBase64: artifacts.transactionKindBytesBase64,
          transactionJson: artifacts.transactionJson,
          quoteExpiresAt: new Date(Date.now() + DEFAULT_QUOTE_TTL_MS).toISOString(),
          summary: {
            title: 'DeepBook limit order ready',
            detail: `${normalizedInput.side.toUpperCase()} ${formatTokenAmount(normalizedInput.quantity, baseToken.symbol)} @ ${normalizedInput.price} ${quoteToken.symbol}`,
          },
          preview: {
            actionLabel: 'DeepBook Order',
            market: `${baseToken.symbol}/${quoteToken.symbol}`,
            side: normalizedInput.side,
            orderType: normalizedInput.orderType,
            price: `${normalizedInput.price} ${quoteToken.symbol}`,
            quantity: formatTokenAmount(normalizedInput.quantity, baseToken.symbol),
            slippagePct: 0,
            protocols: ['deepbook'],
            route: [`${baseToken.symbol}/${quoteToken.symbol}`],
          },
          risk: {
            ...artifacts.risk,
            securityChecks: {
              slippagePct: 0,
              complexityScore,
            },
          },
        },
      };
    }

    const tx = new Transaction();
    tx.setSender(input.walletAddress);
    const accountCap = existingCap ?? deepbook.createAccountCap(tx);
    const warnings = ['Market order có thể khớp nhiều mức giá tùy theo độ sâu order book.'];

    if (normalizedInput.side === 'buy') {
      const bestAsk = marketPrice.bestAskPrice;
      if (!bestAsk) {
        return {
          answer: 'Không lấy được best ask hiện tại để ước lượng market buy an toàn.',
        };
      }
      const estimatedQuoteRaw = ((bestAsk * quantityRaw) / FLOAT_SCALING_FACTOR) * 102n / 100n;
      const quoteCoin = await this.walletAccess.prepareInputCoin(
        tx,
        input.walletAddress,
        quoteToken.coinType,
        estimatedQuoteRaw,
        input.network,
      );
      await deepbook.placeMarketOrder(
        accountCap,
        pool.poolId,
        quantityRaw,
        'bid',
        undefined,
        quoteCoin.coin,
        undefined,
        input.walletAddress,
        tx,
      );
      warnings.push(`Best ask hiện tại khoảng ${formatUsd(Number(bestAsk) / Number(FLOAT_SCALING_FACTOR))} theo tỷ giá raw của pool.`);
    } else {
      const baseCoin = await this.walletAccess.prepareInputCoin(
        tx,
        input.walletAddress,
        baseToken.coinType,
        quantityRaw,
        input.network,
      );
      await deepbook.placeMarketOrder(
        accountCap,
        pool.poolId,
        quantityRaw,
        'ask',
        baseCoin.coin,
        undefined,
        undefined,
        input.walletAddress,
        tx,
      );
    }

    if (!existingCap) {
      tx.transferObjects([accountCap as never], input.walletAddress);
      warnings.push('DeepBook AccountCap sẽ được tạo trong chính giao dịch này.');
    }

    const artifacts = await this.transactionRiskTool.buildExecutionArtifacts({
      tx,
      sender: input.walletAddress,
      network: input.network,
      warnings,
      touchedProtocols: ['deepbook'],
    });
    const complexityScore = computeComplexityScore({
      legs: 1,
      routeSteps: 1,
      protocols: 1,
    });
    if (complexityScore > MAX_COMPLEXITY_SCORE) {
      return {
        answer: `DeepBook market order bị chặn vì complexity quá cao (${complexityScore}).`,
      };
    }

    const referencePrice =
      normalizedInput.side === 'buy'
        ? marketPrice.bestAskPrice
        : marketPrice.bestBidPrice;
    const estimatedNotionalSui =
      baseToken.coinType === SUI_COIN_TYPE
        ? normalizedInput.quantity
        : normalizedInput.price
          ? normalizedInput.quantity * normalizedInput.price
          : 0;
    const requiresElevatedConfirmation = estimatedNotionalSui >= ELEVATED_NOTIONAL_SUI_THRESHOLD;

    return {
      answer: `Đã chuẩn bị market ${normalizedInput.side} ${formatTokenAmount(normalizedInput.quantity, baseToken.symbol)} trên ${baseToken.symbol}/${quoteToken.symbol}.`,
      executionRequest: {
        kind: 'deepbook_order',
        network: 'mainnet',
        transactionKindBytesBase64: artifacts.transactionKindBytesBase64,
        transactionJson: artifacts.transactionJson,
        quoteExpiresAt: new Date(Date.now() + DEFAULT_QUOTE_TTL_MS).toISOString(),
        summary: {
          title: 'DeepBook market order ready',
          detail: `${normalizedInput.side.toUpperCase()} ${formatTokenAmount(normalizedInput.quantity, baseToken.symbol)} trên ${baseToken.symbol}/${quoteToken.symbol}`,
        },
        preview: {
          actionLabel: 'DeepBook Order',
          market: `${baseToken.symbol}/${quoteToken.symbol}`,
          side: normalizedInput.side,
          orderType: normalizedInput.orderType,
          quantity: formatTokenAmount(normalizedInput.quantity, baseToken.symbol),
          price:
            referencePrice
              ? `${toHumanAmount(referencePrice, 9)?.toLocaleString(undefined, { maximumFractionDigits: 6 }) ?? String(referencePrice)} ${quoteToken.symbol}`
              : undefined,
          slippagePct: DEFAULT_SLIPPAGE * 100,
          protocols: ['deepbook'],
          route: [`${baseToken.symbol}/${quoteToken.symbol}`],
        },
        risk: {
          ...artifacts.risk,
          requiresElevatedConfirmation,
          elevatedReason: requiresElevatedConfirmation
            ? `Yêu cầu xác nhận nâng cao: notional ước lượng > ${ELEVATED_NOTIONAL_SUI_THRESHOLD} SUI.`
            : undefined,
          securityChecks: {
            slippagePct: DEFAULT_SLIPPAGE * 100,
            complexityScore,
          },
        },
      },
    };
  }
}
