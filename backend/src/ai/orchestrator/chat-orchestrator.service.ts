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
  ) {}

  async answer(input: AiHarnessInput, options?: { emit?: AiStreamEmitter }): Promise<AiHarnessOutput> {
    const wallet = await this.walletService.resolveWallet(input.walletId);

    // Check for NFT transfer first (more specific)
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

    // Check for batch transfer
    const batchTransferIntent = this.detectBatchTransferIntent(input.question);
    if (batchTransferIntent) {
      const batchRequest = this.batchTransferTool.parseBatchTransfer(input.question, wallet.network);
      if (batchRequest) {
        const recipientList = batchRequest.recipients
          .map((r) => `- ${r.amount} SUI → \`${r.address}\``)
          .join('\n');
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
        answer: 'Không thể phân tích lệnh chuyển tiền hàng loạt. Vui lòng nói rõ số lượng SUI và các địa chỉ ví nhận (ví dụ: "chuyển 0.1 SUI cho 0xABC... và 0.2 SUI cho 0xDEF...").',
        toolCalls: [],
        memoryReads: [],
        memoryWrites: [],
        analyzedFacts: '',
        routeSource: 'classifier',
        plannedToolCalls: [],
      };
    }

    // Regular single transfer
    const transferIntent = this.detectTransferIntent(input.question);
    if (transferIntent) {
      const txRequest = this.transferTool.parseTransfer(input.question, wallet.network);
      if (txRequest) {
        return {
          intent: 'transfer',
          answer: `Xác nhận chuyển **${txRequest.amount} SUI** đến \`${txRequest.recipient}\`. Vui lòng xác nhận giao dịch trong ví của bạn.`,
          toolCalls: [],
          memoryReads: [],
          memoryWrites: [],
          analyzedFacts: '',
          routeSource: 'classifier',
          plannedToolCalls: [],
          transactionRequest: txRequest,
        };
      }
      return {
        intent: 'transfer',
        answer: 'Không thể phân tích lệnh chuyển tiền. Vui lòng nói rõ số lượng SUI và địa chỉ ví nhận (ví dụ: "chuyển 0.1 SUI cho 0xABC...").',
        toolCalls: [],
        memoryReads: [],
        memoryWrites: [],
        analyzedFacts: '',
        routeSource: 'classifier',
        plannedToolCalls: [],
      };
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
}
