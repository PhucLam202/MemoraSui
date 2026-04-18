import { Injectable, Logger } from '@nestjs/common';
import { SYSTEM_PROMPT } from '../prompts/system.prompt';
import { ClassifyQuestionChain } from '../chains/classify-question.chain';
import { AnswerWalletSummaryChain } from '../chains/answer-wallet-summary.chain';
import { AnswerFeeChain } from '../chains/answer-fee.chain';
import { AnswerActivityChain } from '../chains/answer-activity.chain';
import { AnswerObjectChain } from '../chains/answer-object.chain';
import { buildChatNamespace, buildInsightsNamespace } from '../memory/namespace.util';
import { analyzeMemory } from '../memory/memwal.analyze';
import { recallMemories } from '../memory/memwal.recall';
import { rememberMemory } from '../memory/memwal.remember';
import { MemWalService } from '../memory/memwal.service';
import { WalletService } from '../../wallet/wallet.service';
import { joinFacts } from '../parsers/structured-output.parser';
import { MetricsService } from '../../observability/metrics.service';
import { maskWalletAddress } from '../../common/redaction';
import { backendEnv } from '../../config/env';

@Injectable()
export class WalletAgent {
  private readonly logger = new Logger(WalletAgent.name);
  private readonly aiRequests: number[] = [];

  constructor(
    private readonly walletService: WalletService,
    private readonly classifyQuestionChain: ClassifyQuestionChain,
    private readonly answerWalletSummaryChain: AnswerWalletSummaryChain,
    private readonly answerFeeChain: AnswerFeeChain,
    private readonly answerActivityChain: AnswerActivityChain,
    private readonly answerObjectChain: AnswerObjectChain,
    private readonly memWalService: MemWalService,
    private readonly metricsService: MetricsService,
  ) {}

  async answer(input: { walletId: string; question: string }) {
    const startedAt = Date.now();
    if (!this.acquireAiRateLimitSlot()) {
      this.metricsService.recordAiCall(false, 0);
      return {
        intent: 'unknown',
        answer: `${SYSTEM_PROMPT} AI request rate limit reached. Please retry in a moment.`,
        toolCalls: [],
        memoryReads: [],
        memoryWrites: [],
        analyzedFacts: '',
      };
    }

    const wallet = await this.walletService.resolveWallet(input.walletId);
    const intent = this.classifyQuestionChain.run(input.question);
    const chatNamespace = buildChatNamespace(wallet.id);
    const insightsNamespace = buildInsightsNamespace(wallet.id);
    let recalled: { results: any[]; total: number } = { results: [], total: 0 };
    try {
      recalled = await recallMemories(this.memWalService, input.question, chatNamespace, 5);
    } catch (error) {
      this.logger.warn(`MemWal recall failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const recalledTexts = recalled.results.map((item) => item.text);

    let result:
      | {
          text: string;
          toolCalls: Array<Record<string, unknown>>;
          memoryCandidates: string[];
        }
      | null = null;

    if (intent === 'fee') {
      result = await this.answerFeeChain.run({ walletAddress: wallet.address, network: wallet.network, recalledMemories: recalledTexts });
    } else if (intent === 'activity' || intent === 'protocol_usage') {
      result = await this.answerActivityChain.run({
        walletAddress: wallet.address,
        network: wallet.network,
        recalledMemories: recalledTexts,
      });
    } else if (intent === 'object') {
      result = await this.answerObjectChain.run({ walletAddress: wallet.address, network: wallet.network, recalledMemories: recalledTexts });
    } else if (intent === 'wallet_summary' || intent === 'portfolio') {
      result = await this.answerWalletSummaryChain.run({
        walletAddress: wallet.address,
        network: wallet.network,
        recalledMemories: recalledTexts,
      });
    }

    if (!result) {
      this.metricsService.recordAiCall(true, Date.now() - startedAt);
      return {
        intent,
        answer: `${SYSTEM_PROMPT} I can help with portfolio, fee/gas, activity, protocol usage, and object/NFT questions. Please clarify which one you want.`,
        toolCalls: [],
        memoryReads: recalled.results.map((item) => ({ blobId: item.blob_id, distance: item.distance })),
        memoryWrites: [],
        analyzedFacts: '',
      };
    }

    const memoryWrites: Array<Record<string, unknown>> = [];
    const memoryCandidates = result.memoryCandidates.filter(Boolean).slice(0, 3);
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
        `User question: ${input.question}\nAssistant answer: ${result.text}`,
        chatNamespace,
      );
      analyzedFacts = joinFacts(analyzed.facts.map((fact) => fact.text));
    } catch (error) {
      this.logger.warn(`MemWal analyze failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const output = {
      intent,
      answer: result.text,
      toolCalls: result.toolCalls,
      memoryReads: recalled.results.map((item) => ({ blobId: item.blob_id, distance: item.distance })),
      memoryWrites,
      analyzedFacts,
    };
    this.logger.log(
      `AI answer intent=${intent} wallet=${maskWalletAddress(wallet.address)} tools=${result.toolCalls.map((item) => String(item.tool ?? 'unknown')).join(',')}`,
    );
    this.metricsService.recordAiCall(true, Date.now() - startedAt);
    return output;
  }

  private acquireAiRateLimitSlot() {
    const now = Date.now();
    const windowMs = 60_000;
    const recent = this.aiRequests.filter((timestamp) => now - timestamp <= windowMs);
    if (recent.length >= backendEnv.ai.rateLimitPerMinute) {
      this.aiRequests.length = 0;
      this.aiRequests.push(...recent);
      return false;
    }

    recent.push(now);
    this.aiRequests.length = 0;
    this.aiRequests.push(...recent);
    return true;
  }
}
