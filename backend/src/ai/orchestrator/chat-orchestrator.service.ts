import { Injectable, Logger } from '@nestjs/common';

import { maskWalletAddress } from '../../common/redaction';
import { WalletService } from '../../wallet/wallet.service';
import { MemWalService } from '../memory/memwal.service';
import { buildChatNamespace, buildInsightsNamespace } from '../memory/namespace.util';
import { recallMemories } from '../memory/memwal.recall';
import { rememberMemory } from '../memory/memwal.remember';
import { analyzeMemory } from '../memory/memwal.analyze';
import { joinFacts } from '../parsers/structured-output.parser';
import { RouteToolsChain } from '../chains/route-tools.chain';
import { ComposeAnswerChain } from '../chains/compose-answer.chain';
import { LangGraphOrchestratorService } from '../graph/langgraph-orchestrator.service';
import { ToolCallLoop } from './tool-call.loop';
import { type AiHarnessInput, type AiHarnessOutput, type AiStreamEmitter } from './ai-harness.types';
import { AiToolRegistry } from './tool-registry';
import { TransferTool } from '../tools/transfer.tool';
import { BatchTransferTool } from '../tools/batch-transfer.tool';
import { TransferNFTTool } from '../tools/transfer-nft.tool';
import { loadAgentsConfig } from '../config';
import { SwapIntentTool } from '../tools/swap-intent.tool';
import { RebalanceIntentTool } from '../tools/rebalance-intent.tool';
import { DeepBookOrderIntentTool } from '../tools/deepbook-order-intent.tool';
import { SwapExecutionTool } from '../tools/swap-execution.tool';
import { RebalanceExecutionTool } from '../tools/rebalance-execution.tool';
import { DeepBookExecutionTool } from '../tools/deepbook-execution.tool';
import { DEFAULT_KEEP_GAS_MIST, DEFAULT_SLIPPAGE, MAINNET_ONLY_MESSAGE } from '../tools/defi-utils';
import { NluIntentExtractorChain, type NluSwapResult, type NluTransferResult, type NluBatchTransferResult, type NluNftTransferResult, type NluRebalanceResult, type NluDeepBookResult } from '../chains/nlu-intent-extractor.chain';
import { DefiExecutionRateLimitService } from '../tools/defi-execution-rate-limit.service';
import { DefiExecutionAuditService } from '../tools/defi-execution-audit.service';

function buildAnswerContextDiagnostics(answerContext?: Record<string, unknown>) {
  if (!answerContext) {
    return {
      answerContextLength: 0,
      answerContextPreview: '',
      portfolioHoldingCount: 0,
      hasUsdValues: false,
      topAssetsCount: 0,
    };
  }

  const serialized = JSON.stringify(answerContext);
  const portfolio = (answerContext.portfolio ?? {}) as Record<string, unknown>;
  const holdings = Array.isArray(portfolio.holdings) ? portfolio.holdings : [];
  const topAssets = Array.isArray(portfolio.topAssets) ? portfolio.topAssets : [];

  return {
    answerContextLength: serialized.length,
    answerContextPreview: serialized.slice(0, 300),
    portfolioHoldingCount: holdings.length,
    hasUsdValues: portfolio.hasUsdValues === true,
    topAssetsCount: topAssets.length,
  };
}

@Injectable()
export class ChatOrchestratorService {
  private readonly logger = new Logger(ChatOrchestratorService.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly routeToolsChain: RouteToolsChain,
    private readonly toolCallLoop: ToolCallLoop,
    private readonly composeAnswerChain: ComposeAnswerChain,
    private readonly toolRegistry: AiToolRegistry,
    private readonly memWalService: MemWalService,
    private readonly langGraphOrchestrator: LangGraphOrchestratorService,
    private readonly transferTool: TransferTool,
    private readonly batchTransferTool: BatchTransferTool,
    private readonly transferNFTTool: TransferNFTTool,
    private readonly swapIntentTool: SwapIntentTool,
    private readonly rebalanceIntentTool: RebalanceIntentTool,
    private readonly deepBookOrderIntentTool: DeepBookOrderIntentTool,
    private readonly swapExecutionTool: SwapExecutionTool,
    private readonly rebalanceExecutionTool: RebalanceExecutionTool,
    private readonly deepBookExecutionTool: DeepBookExecutionTool,
    private readonly nluExtractor: NluIntentExtractorChain,
    private readonly defiExecutionRateLimitService: DefiExecutionRateLimitService,
    private readonly defiExecutionAuditService: DefiExecutionAuditService,
  ) {}

  async answer(input: AiHarnessInput, options?: { emit?: AiStreamEmitter }): Promise<AiHarnessOutput> {
    const wallet = await this.walletService.resolveWallet(input.walletId);

    // LLM-based NLU: single call extracts intent + params in any language
    const nlu = await this.nluExtractor.extract(input.question);
    if (nlu !== null) {
      switch (nlu.intent) {
        case 'transfer_nft':
          return this.handleNftTransfer(nlu, wallet.network);
        case 'batch_transfer':
          return this.handleBatchTransfer(nlu, wallet.network);
        case 'rebalance':
          return this.handleRebalance(nlu, wallet.address, wallet.network);
        case 'deepbook_order':
        case 'deepbook_market':
          return this.handleDeepBookOrder(nlu, wallet.address, wallet.network);
        case 'swap':
          return this.handleSwap(nlu, wallet.address, wallet.network, input.question);
        case 'transfer':
          return this.handleTransfer(nlu, wallet.network);
        case 'none':
          break; // fall through to LangGraph
      }
    } else {
      // Fallback: NLU unavailable — use original regex-based cascade
      const nftTransferIntent = this.detectNFTTransferIntent(input.question);
      if (nftTransferIntent) {
        const nftRequest = this.transferNFTTool.parseNFTTransfer(input.question, wallet.network);
        if (nftRequest) {
          return {
            intent: 'transfer_nft',
            answer: `Xác nhận chuyển NFT/Object \`${nftRequest.objectId}\` đến \`${nftRequest.recipient}\`. Vui lòng xác nhận giao dịch trong ví của bạn.`,
            toolCalls: [],
            memoryReads: [],
            memoryWrites: [],
            analyzedFacts: '',
            routeSource: 'classifier',
            plannedToolCalls: [],
            nftTransferRequest: nftRequest,
          };
        }
        return {
          intent: 'transfer_nft',
          answer: 'Không thể phân tích lệnh chuyển NFT. Vui lòng nói rõ Object ID và địa chỉ ví nhận (ví dụ: "chuyển NFT 0xABC... cho 0xDEF...").',
          toolCalls: [],
          memoryReads: [],
          memoryWrites: [],
          analyzedFacts: '',
          routeSource: 'classifier',
          plannedToolCalls: [],
        };
      }

      const batchTransferIntent = this.detectBatchTransferIntent(input.question);
      if (batchTransferIntent) {
        const batchRequest = this.batchTransferTool.parseBatchTransfer(input.question, wallet.network);
        if (batchRequest) {
          const recipientList = batchRequest.recipients.map((r) => `- ${r.amount} SUI → \`${r.address}\``).join('\n');
          return {
            intent: 'batch_transfer',
            answer: `Xác nhận chuyển **${batchRequest.totalAmount} SUI** đến ${batchRequest.recipients.length} địa chỉ:\n\n${recipientList}\n\nVui lòng xác nhận giao dịch trong ví của bạn.`,
            toolCalls: [],
            memoryReads: [],
            memoryWrites: [],
            analyzedFacts: '',
            routeSource: 'classifier',
            plannedToolCalls: [],
            batchTransferRequest: batchRequest,
          };
        }
        return {
          intent: 'batch_transfer',
          answer: 'Không thể phân tích lệnh chuyển tiền hàng loạt. Vui lòng nói rõ số lượng SUI và các địa chỉ ví nhận.',
          toolCalls: [],
          memoryReads: [],
          memoryWrites: [],
          analyzedFacts: '',
          routeSource: 'classifier',
          plannedToolCalls: [],
        };
      }

      if (this.detectRebalanceIntent(input.question)) {
        if (wallet.network !== 'mainnet') return this.buildSimpleAnswer('rebalance', MAINNET_ONLY_MESSAGE);
        const req = this.rebalanceIntentTool.parseRebalance(input.question, wallet.network);
        if (!req) return this.buildSimpleAnswer('rebalance', 'Không thể phân tích allocation rebalance. Ví dụ: "đưa portfolio về 50% SUI, 30% USDC, 20% DEEP".');
        const rateLimit = await this.ensureDefiExecutionRateLimit(wallet.address, 'rebalance');
        if (!rateLimit.allowed) {
          return this.buildSimpleAnswer(
            'rebalance',
            `Bạn đã tạo quote rebalance quá nhanh. Hãy thử lại sau ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
          );
        }
        this.defiExecutionAuditService.log({
          event: 'execution_quote_requested',
          walletAddress: wallet.address,
          intent: 'rebalance',
        });
        const result = await this.rebalanceExecutionTool.buildRebalanceExecution({
          walletAddress: wallet.address,
          network: wallet.network,
          targets: req.targets,
          keepGasMist: BigInt(req.keepGasMist),
        });
        this.logExecutionAuditResult('rebalance', wallet.address, result.answer, Boolean(result.executionRequest));
        return { ...this.buildSimpleAnswer('rebalance', result.answer), executionRequest: result.executionRequest };
      }

      if (this.detectDeepBookOrderIntent(input.question)) {
        if (wallet.network !== 'mainnet') return this.buildSimpleAnswer('deepbook_order', MAINNET_ONLY_MESSAGE);
        const req = this.deepBookOrderIntentTool.parseOrder(input.question, wallet.network);
        if (!req) return this.buildSimpleAnswer('deepbook_order', 'Không thể phân tích lệnh DeepBook. Ví dụ: "đặt limit buy 1000 DEEP giá 0.008 SUI".');
        const rateLimit = await this.ensureDefiExecutionRateLimit(wallet.address, 'deepbook_order');
        if (!rateLimit.allowed) {
          return this.buildSimpleAnswer(
            'deepbook_order',
            `Bạn đã tạo quote DeepBook quá nhanh. Hãy thử lại sau ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
          );
        }
        this.defiExecutionAuditService.log({
          event: 'execution_quote_requested',
          walletAddress: wallet.address,
          intent: 'deepbook_order',
        });
        const result = await this.deepBookExecutionTool.buildOrderExecution({ walletAddress: wallet.address, network: wallet.network, baseToken: req.baseToken, quoteToken: req.quoteToken, side: req.side, orderType: req.orderType, quantity: req.quantity, price: req.price });
        this.logExecutionAuditResult('deepbook_order', wallet.address, result.answer, Boolean(result.executionRequest));
        return { ...this.buildSimpleAnswer(req.orderType === 'market' ? 'deepbook_market' : 'deepbook_order', result.answer), executionRequest: result.executionRequest };
      }

        if (this.detectSwapIntent(input.question)) {
          if (wallet.network !== 'mainnet') return this.buildSimpleAnswer('swap', MAINNET_ONLY_MESSAGE);
          const req = this.swapIntentTool.parseSwap(input.question, wallet.network);
          if (!req) return this.buildSimpleAnswer('swap', 'Không thể phân tích lệnh swap. Ví dụ: "đổi 20 SUI sang USDC, giữ lại 2 SUI làm gas".');
          const rateLimit = await this.ensureDefiExecutionRateLimit(wallet.address, 'swap');
          if (!rateLimit.allowed) {
            return this.buildSimpleAnswer(
              'swap',
              `Bạn đã tạo quote swap quá nhanh. Hãy thử lại sau ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
            );
          }
          this.defiExecutionAuditService.log({
            event: 'execution_quote_requested',
            walletAddress: wallet.address,
            intent: 'swap',
          });
          const result = await this.swapExecutionTool.buildSwapExecution({ walletAddress: wallet.address, network: wallet.network, legs: req.legs, fromToken: req.fromToken, toToken: req.toToken, amount: req.amount, slippage: req.slippage, keepGasMist: BigInt(req.keepGasMist) });
          this.logExecutionAuditResult('swap', wallet.address, result.answer, Boolean(result.executionRequest));
          return { ...this.buildSimpleAnswer('swap', result.answer), executionRequest: result.executionRequest };
        }

      const transferIntent = this.detectTransferIntent(input.question);
      if (transferIntent) {
        const txRequest = this.transferTool.parseTransfer(input.question, wallet.network);
        if (txRequest) {
          return { intent: 'transfer', answer: `Xác nhận chuyển **${txRequest.amount} SUI** đến \`${txRequest.recipient}\`. Vui lòng xác nhận giao dịch trong ví của bạn.`, toolCalls: [], memoryReads: [], memoryWrites: [], analyzedFacts: '', routeSource: 'classifier', plannedToolCalls: [], transactionRequest: txRequest };
        }
        return { intent: 'transfer', answer: 'Không thể phân tích lệnh chuyển tiền. Vui lòng nói rõ số lượng SUI và địa chỉ ví nhận.', toolCalls: [], memoryReads: [], memoryWrites: [], analyzedFacts: '', routeSource: 'classifier', plannedToolCalls: [] };
      }
    }

    try {
      const graphOutput = await this.langGraphOrchestrator.answer(input, options);
      if (graphOutput) {
        return graphOutput;
      }
    } catch (error) {
      this.logger.warn(`LangGraph orchestrator failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const chatNamespace = buildChatNamespace(wallet.id);
    const insightsNamespace = buildInsightsNamespace(wallet.id);

    let recalled: { results: any[]; total: number } = { results: [], total: 0 };
    try {
      recalled = await recallMemories(this.memWalService, input.question, chatNamespace, 5);
    } catch (error) {
      this.logger.warn(`MemWal recall failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const recalledTexts = recalled.results.map((item) => item.text);
    const route = await this.routeToolsChain.run({
      question: input.question,
      recalledMemories: recalledTexts,
    });

    if (route.intent === 'unknown') {
      return {
        intent: 'unknown',
        answer:
          'I can help with portfolio, fee/gas, activity, protocol usage, and object/NFT questions. Please clarify which one you want.',
        toolCalls: [],
        memoryReads: recalled.results.map((item) => ({ blobId: item.blob_id, distance: item.distance })),
        memoryWrites: [],
        analyzedFacts: '',
        routeSource: route.source,
        plannedToolCalls: this.toolRegistry.buildPlannedToolCalls('unknown', {
          walletAddress: wallet.address,
          network: wallet.network,
          recalledMemories: recalledTexts,
        }),
      };
    }

    const execution = await this.toolCallLoop.run({
      walletAddress: wallet.address,
      network: wallet.network,
      recalledMemories: recalledTexts,
      route,
    });

    if (!execution) {
      return {
        intent: route.intent,
        answer:
          'I could not build a tool plan for this question. Please rephrase it around portfolio, fee/gas, activity, protocol usage, or object summaries.',
        toolCalls: [],
        memoryReads: recalled.results.map((item) => ({ blobId: item.blob_id, distance: item.distance })),
        memoryWrites: [],
        analyzedFacts: '',
        routeSource: route.source,
        plannedToolCalls: this.toolRegistry.buildPlannedToolCalls(route.intent, {
          walletAddress: wallet.address,
          network: wallet.network,
          recalledMemories: recalledTexts,
        }),
      };
    }

    const diagnostics = buildAnswerContextDiagnostics(execution.answerContext);
    this.logger.log(
      `AI context intent=${route.intent} chain=${execution.chainUsed ?? 'unknown'} toolCalls=${execution.toolCalls
        .map((item) => String(item.tool ?? 'unknown'))
        .join(',')} answerContextLength=${diagnostics.answerContextLength} portfolioHoldingCount=${diagnostics.portfolioHoldingCount} hasUsdValues=${diagnostics.hasUsdValues} topAssetsCount=${diagnostics.topAssetsCount} answerContextPreview=${diagnostics.answerContextPreview}`,
    );

    const agentsConfig = loadAgentsConfig();
    const composed = await this.composeAnswerChain.run({
      question: input.question,
      baselineAnswer: execution.text,
      answerContext: execution.answerContext,
      recalledMemories: recalledTexts,
      toolCalls: execution.toolCalls,
      responseLength: agentsConfig.general.responseLength,
    });

    const memoryWrites: Array<Record<string, unknown>> = [];
    const memoryCandidates = execution.memoryCandidates.filter(Boolean).slice(0, 3);
    for (const candidate of memoryCandidates) {
      try {
        const remembered = await rememberMemory(this.memWalService, candidate, insightsNamespace);
        if (remembered) {
          memoryWrites.push({ namespace: remembered.namespace, blobId: remembered.blob_id, id: remembered.id });
        }
      } catch (error) {
        this.logger.warn(`MemWal remember failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    let analyzedFacts = '';
    try {
      const analyzed = await analyzeMemory(
        this.memWalService,
        `User question: ${input.question}\nAssistant answer: ${composed.text}`,
        chatNamespace,
      );
      analyzedFacts = joinFacts(analyzed.facts.map((fact) => fact.text));
    } catch (error) {
      this.logger.warn(`MemWal analyze failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    this.logger.log(
      `AI harness intent=${route.intent} source=${route.source} chain=${execution.chainUsed ?? 'unknown'} wallet=${maskWalletAddress(wallet.address)} tools=${execution.toolCalls
        .map((item) => String(item.tool ?? 'unknown'))
        .join(',')}`,
    );

    return {
      intent: route.intent,
      answer: composed.text || execution.text,
      toolCalls: execution.toolCalls,
      memoryReads: recalled.results.map((item) => ({ blobId: item.blob_id, distance: item.distance })),
      memoryWrites,
      analyzedFacts,
      routeSource: route.source,
      plannedToolCalls: this.toolRegistry.buildPlannedToolCalls(route.intent, {
        walletAddress: wallet.address,
        network: wallet.network,
        recalledMemories: recalledTexts,
      }),
    };
  }

  private detectNFTTransferIntent(question: string): boolean {
    return /(transfer|send|gửi|gui|chuyển|chuyen)\s.*(nft|object|collectible)|(nft|object|collectible)\s.*(transfer|send|gửi|gui|chuyển|chuyen)/i.test(question);
  }

  private detectBatchTransferIntent(question: string): boolean {
    const normalized = question.toLowerCase();
    // Check for explicit batch/multiple keywords
    if (/(batch|nhiều|nhieu|multiple|many)\s.*(transfer|send|gửi|gui|chuyển|chuyen)|(send|transfer|gửi|gui|chuyển|chuyen)\s.*(nhiều|nhieu|multiple|many|batch)/i.test(normalized)) {
      return true;
    }
    // Check for multiple addresses
    const addressMatches = normalized.match(/0x[0-9a-f]{40,}/g);
    return addressMatches !== null && addressMatches.length > 1 && /(transfer|send|gửi|gui|chuyển|chuyen)/i.test(normalized);
  }

  private detectTransferIntent(question: string): boolean {
    return /(chuyển|chuyen|transfer|send|gửi|gui)\s.*(sui|token|coin|\d)|(send|transfer)\s.*\bto\b|0x[0-9a-f]{40,}/i.test(question);
  }

  private detectSwapIntent(question: string): boolean {
    return (
      /(swap|đổi|doi|hoán đổi|hoan doi).*(sang|qua|to|for|->|→|mua|buy)/i.test(question) ||
      /\d+(?:[.,]\d+)?\s+(mua|buy)\s+((?:token\s+)?[a-z][a-z0-9:_-]*(?:\s+token)?)/i.test(question)
    );
  }

  private detectRebalanceIntent(question: string): boolean {
    return /(rebalance|cân bằng|can bang|đưa portfolio về|dua portfolio ve|allocation)/i.test(question);
  }

  private detectDeepBookOrderIntent(question: string): boolean {
    return /(deepbook|limit order|market order|đặt lệnh|dat lenh).*(buy|sell|mua|ban|order|lệnh|lenh)/i.test(question);
  }

  private buildSimpleAnswer(intent: AiHarnessOutput['intent'], answer: string): AiHarnessOutput {
    return {
      intent,
      answer,
      toolCalls: [],
      memoryReads: [],
      memoryWrites: [],
      analyzedFacts: '',
      routeSource: 'classifier',
      plannedToolCalls: [],
    };
  }

  // ─── NLU-based handlers ────────────────────────────────────────────────────

  private handleNftTransfer(nlu: NluNftTransferResult, network: string): AiHarnessOutput {
    return {
      intent: 'transfer_nft',
      answer: `Xác nhận chuyển NFT/Object \`${nlu.objectId}\` đến \`${nlu.recipient}\`. Vui lòng xác nhận giao dịch trong ví của bạn.`,
      toolCalls: [],
      memoryReads: [],
      memoryWrites: [],
      analyzedFacts: '',
      routeSource: 'classifier',
      plannedToolCalls: [],
      nftTransferRequest: { objectId: nlu.objectId, recipient: nlu.recipient, network },
    };
  }

  private handleBatchTransfer(nlu: NluBatchTransferResult, network: string): AiHarnessOutput {
    const MIST_PER_SUI = 1_000_000_000;
    const recipients = nlu.recipients.map((r) => ({
      address: r.address,
      amount: r.amount,
      amountMist: BigInt(Math.round(r.amount * MIST_PER_SUI)).toString(),
    }));
    const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0);
    const totalAmountMist = BigInt(Math.round(totalAmount * MIST_PER_SUI)).toString();
    const batchRequest = { recipients, network, totalAmount, totalAmountMist };
    const recipientList = recipients.map((r) => `- ${r.amount} SUI → \`${r.address}\``).join('\n');
    return {
      intent: 'batch_transfer',
      answer: `Xác nhận chuyển **${totalAmount} SUI** đến ${recipients.length} địa chỉ:\n\n${recipientList}\n\nVui lòng xác nhận giao dịch trong ví của bạn.`,
      toolCalls: [],
      memoryReads: [],
      memoryWrites: [],
      analyzedFacts: '',
      routeSource: 'classifier',
      plannedToolCalls: [],
      batchTransferRequest: batchRequest,
    };
  }

  private async handleRebalance(nlu: NluRebalanceResult, walletAddress: string, network: string): Promise<AiHarnessOutput> {
    if (network !== 'mainnet') return this.buildSimpleAnswer('rebalance', MAINNET_ONLY_MESSAGE);
    const rateLimit = await this.ensureDefiExecutionRateLimit(walletAddress, 'rebalance');
    if (!rateLimit.allowed) {
      return this.buildSimpleAnswer(
        'rebalance',
        `Bạn đã tạo quote rebalance quá nhanh. Hãy thử lại sau ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
      );
    }
    this.defiExecutionAuditService.log({
      event: 'execution_quote_requested',
      walletAddress,
      intent: 'rebalance',
    });
    const result = await this.rebalanceExecutionTool.buildRebalanceExecution({
      walletAddress,
      network,
      targets: nlu.targets,
      sellTokens: nlu.sellTokens,
      keepGasMist: BigInt(nlu.keepGasMist ?? DEFAULT_KEEP_GAS_MIST),
    });
    this.logExecutionAuditResult('rebalance', walletAddress, result.answer, Boolean(result.executionRequest));
    return { ...this.buildSimpleAnswer('rebalance', result.answer), executionRequest: result.executionRequest };
  }

  private async handleDeepBookOrder(nlu: NluDeepBookResult, walletAddress: string, network: string): Promise<AiHarnessOutput> {
    if (network !== 'mainnet') return this.buildSimpleAnswer('deepbook_order', MAINNET_ONLY_MESSAGE);
    const rateLimit = await this.ensureDefiExecutionRateLimit(walletAddress, 'deepbook_order');
    if (!rateLimit.allowed) {
      return this.buildSimpleAnswer(
        'deepbook_order',
        `Bạn đã tạo quote DeepBook quá nhanh. Hãy thử lại sau ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
      );
    }
    this.defiExecutionAuditService.log({
      event: 'execution_quote_requested',
      walletAddress,
      intent: 'deepbook_order',
    });
    const result = await this.deepBookExecutionTool.buildOrderExecution({
      walletAddress,
      network,
      baseToken: nlu.baseToken,
      quoteToken: nlu.quoteToken,
      side: nlu.side,
      orderType: nlu.orderType,
      quantity: nlu.quantity,
      price: nlu.price,
    });
    this.logExecutionAuditResult('deepbook_order', walletAddress, result.answer, Boolean(result.executionRequest));
    return { ...this.buildSimpleAnswer(nlu.intent, result.answer), executionRequest: result.executionRequest };
  }

  private async handleSwap(
    nlu: NluSwapResult,
    walletAddress: string,
    network: string,
    originalQuestion: string,
  ): Promise<AiHarnessOutput> {
    if (network !== 'mainnet') return this.buildSimpleAnswer('swap', MAINNET_ONLY_MESSAGE);
    const rateLimit = await this.ensureDefiExecutionRateLimit(walletAddress, 'swap');
    if (!rateLimit.allowed) {
      return this.buildSimpleAnswer(
        'swap',
        `Bạn đã tạo quote swap quá nhanh. Hãy thử lại sau ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`,
      );
    }
    this.defiExecutionAuditService.log({
      event: 'execution_quote_requested',
      walletAddress,
      intent: 'swap',
    });
    const hasMultiLegHint =
      /(?:,|;|&|\+|\band\b|\bva\b|và)\s*(?:swap|đổi|doi|hoán đổi|hoan doi|\d+(?:[.,]\d+))/iu.test(
        originalQuestion,
      );
    const parsedRequest = hasMultiLegHint ? this.swapIntentTool.parseSwap(originalQuestion, network) : null;
    const parsedMultiLegs =
      parsedRequest && Array.isArray(parsedRequest.legs) && parsedRequest.legs.length > 1 ? parsedRequest.legs : undefined;
    const result = await this.swapExecutionTool.buildSwapExecution({
      walletAddress,
      network,
      legs: parsedMultiLegs,
      fromToken: nlu.fromToken,
      toToken: nlu.toToken,
      amount: nlu.amount,
      slippage: nlu.slippage ?? DEFAULT_SLIPPAGE,
      keepGasMist: BigInt(nlu.keepGasMist ?? DEFAULT_KEEP_GAS_MIST),
    });
    this.logExecutionAuditResult('swap', walletAddress, result.answer, Boolean(result.executionRequest));
    return { ...this.buildSimpleAnswer('swap', result.answer), executionRequest: result.executionRequest };
  }

  private handleTransfer(nlu: NluTransferResult, network: string): AiHarnessOutput {
    const MIST_PER_SUI = 1_000_000_000;
    const amountMist = BigInt(Math.round(nlu.amount * MIST_PER_SUI)).toString();
    return {
      intent: 'transfer',
      answer: `Xác nhận chuyển **${nlu.amount} ${nlu.token}** đến \`${nlu.recipient}\`. Vui lòng xác nhận giao dịch trong ví của bạn.`,
      toolCalls: [],
      memoryReads: [],
      memoryWrites: [],
      analyzedFacts: '',
      routeSource: 'classifier',
      plannedToolCalls: [],
      transactionRequest: { amount: nlu.amount, amountMist, recipient: nlu.recipient, network },
    };
  }

  private async ensureDefiExecutionRateLimit(
    walletAddress: string,
    intent: 'swap' | 'rebalance' | 'deepbook_order',
  ) {
    const result = await this.defiExecutionRateLimitService.consume({ walletAddress, intent });
    if (!result.allowed) {
      this.defiExecutionAuditService.log({
        event: 'execution_quote_rejected',
        walletAddress,
        intent,
        rejectCode: 'RATE_LIMITED',
        reason: `rate-limit hit (${result.count}/${result.limit})`,
      });
    }
    return result;
  }

  private logExecutionAuditResult(
    intent: 'swap' | 'rebalance' | 'deepbook_order',
    walletAddress: string,
    answer: string,
    hasExecutionRequest: boolean,
  ) {
    if (hasExecutionRequest) {
      this.defiExecutionAuditService.log({
        event: 'execution_quote_built',
        walletAddress,
        intent,
      });
      return;
    }
    this.defiExecutionAuditService.log({
      event: 'execution_quote_rejected',
      walletAddress,
      intent,
      reason: answer.slice(0, 140),
    });
  }
}
