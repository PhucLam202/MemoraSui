import { Injectable, Logger } from '@nestjs/common';
import { ComposeAnswerChain } from '../chains/compose-answer.chain';
import { type LangGraphAgentName, loadAgentsConfig } from '../config';
import { analyzeMemory } from '../memory/memwal.analyze';
import { recallMemories } from '../memory/memwal.recall';
import { rememberMemory } from '../memory/memwal.remember';
import { MemWalService } from '../memory/memwal.service';
import { buildChatNamespace, buildInsightsNamespace } from '../memory/namespace.util';
import { type AiHarnessInput, type AiHarnessOutput, type AiStreamEmitter } from '../orchestrator/ai-harness.types';
import { LangGraphToolRegistry } from '../tools/langgraph-tool-registry';
import { WalletService } from '../../wallet/wallet.service';
import { LangGraphWorkflow } from './workflow';

function joinFacts(facts: string[]) {
  return facts.filter(Boolean).join(' | ');
}

@Injectable()
export class LangGraphOrchestratorService {
  private readonly logger = new Logger(LangGraphOrchestratorService.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly memWalService: MemWalService,
    private readonly composeAnswerChain: ComposeAnswerChain,
    private readonly workflow: LangGraphWorkflow,
    private readonly toolRegistry: LangGraphToolRegistry,
  ) {}

  async answer(input: AiHarnessInput, options?: { emit?: AiStreamEmitter }): Promise<AiHarnessOutput | null> {
    const config = loadAgentsConfig();
    if (!config.supervisor.enabled) {
      return null;
    }

    const emit = options?.emit;
    const wallet = await this.walletService.resolveWallet(input.walletId);
    const chatNamespace = buildChatNamespace(wallet.id);
    const insightsNamespace = buildInsightsNamespace(wallet.id);

    emit?.({
      type: 'step_start',
      id: 'langgraph.memory_recall',
      label: 'Recall memory',
      detail: 'Searching for prior chat memories.',
      timestamp: Date.now(),
    });

    let recalled: { results: any[]; total: number } = { results: [], total: 0 };
    try {
      recalled = await recallMemories(this.memWalService, input.question, chatNamespace, 5);
    } catch (error) {
      this.logger.warn(`MemWal recall failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    emit?.({
      type: 'step_end',
      id: 'langgraph.memory_recall',
      label: 'Recall memory',
      detail: `Recovered ${recalled.results.length} memories.`,
      status: 'completed',
      timestamp: Date.now(),
    });

    const recalledTexts = recalled.results.map((item) => item.text);
    const graph = this.workflow.compile(config, { emit });

    emit?.({
      type: 'step_start',
      id: 'langgraph.run',
      label: 'Run LangGraph',
      detail: 'Executing the supervisor and sub-agents.',
      timestamp: Date.now(),
    });

    const graphState = await graph.invoke(
      {
        walletId: input.walletId,
        question: input.question,
        walletAddress: wallet.address,
        network: wallet.network,
        recalledMemories: recalledTexts,
      },
      {
        recursionLimit: config.general.recursionLimit,
      },
    );

    emit?.({
      type: 'step_end',
      id: 'langgraph.run',
      label: 'Run LangGraph',
      detail: 'Graph execution completed.',
      status: 'completed',
      timestamp: Date.now(),
    });

    const selectedAgents = graphState.nextAgents.filter(
      (agent): agent is LangGraphAgentName =>
        agent === 'portfolio' || agent === 'gas' || agent === 'staking' || agent === 'tax' || agent === 'research',
    );
    if (selectedAgents.length === 0 || Object.keys(graphState.subResults ?? {}).length === 0) {
      return null;
    }

    const baselineAnswer = graphState.finalAnswer?.trim() || 'Structured sub-agent results are available.';
    const researchResult = graphState.subResults.research as { text?: unknown } | undefined;
    const researchAnswer = typeof researchResult?.text === 'string' ? researchResult.text.trim() : '';
    const shouldPreserveRawResearch = selectedAgents.length === 1 && selectedAgents[0] === 'research';

    let composedText = researchAnswer || baselineAnswer;
    if (!shouldPreserveRawResearch) {
      emit?.({
        type: 'step_start',
        id: 'langgraph.compose',
        label: 'Compose answer',
        detail: 'Combining graph results into the final response.',
        timestamp: Date.now(),
      });

      const composed = await this.composeAnswerChain.run({
        question: input.question,
        baselineAnswer,
        answerContext: {
          plan: graphState.plan,
          subResults: graphState.subResults,
        },
        recalledMemories: recalledTexts,
        toolCalls: graphState.toolCalls,
        responseLength: config.general.responseLength,
      });

      composedText = composed.text || baselineAnswer;

      emit?.({
        type: 'step_end',
        id: 'langgraph.compose',
        label: 'Compose answer',
        detail: 'Final answer composed.',
        status: 'completed',
        timestamp: Date.now(),
      });
    } else {
      emit?.({
        type: 'step_start',
        id: 'langgraph.compose',
        label: 'Preserve raw research',
        detail: 'Returning the research sub-agent output without compression.',
        timestamp: Date.now(),
      });
      emit?.({
        type: 'step_end',
        id: 'langgraph.compose',
        label: 'Preserve raw research',
        detail: 'Raw research output preserved.',
        status: 'completed',
        timestamp: Date.now(),
      });
    }

    const memoryWrites: Array<Record<string, unknown>> = [];
    if (config.memory.enabled && config.memory.autoSave) {
      emit?.({
        type: 'step_start',
        id: 'langgraph.memory_write',
        label: 'Store memory',
        detail: 'Saving useful context for future chats.',
        timestamp: Date.now(),
      });

      const memoryCandidates = graphState.memoryCandidates.filter(Boolean).slice(0, 3);
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

      emit?.({
        type: 'step_end',
        id: 'langgraph.memory_write',
        label: 'Store memory',
        detail: `Stored ${memoryWrites.length} memory candidate${memoryWrites.length === 1 ? '' : 's'}.`,
        status: 'completed',
        timestamp: Date.now(),
      });
    }

    let analyzedFacts = '';
    if (config.memory.enabled) {
      emit?.({
        type: 'step_start',
        id: 'langgraph.memory_analyze',
        label: 'Update memory profile',
        detail: 'Analyzing the reply for future recall.',
        timestamp: Date.now(),
      });

      try {
        const analyzed = await analyzeMemory(
          this.memWalService,
          `User question: ${input.question}\nAssistant answer: ${composedText}`,
          chatNamespace,
        );
        analyzedFacts = joinFacts(analyzed.facts.map((fact) => fact.text));
      } catch (error) {
        this.logger.warn(`MemWal analyze failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      emit?.({
        type: 'step_end',
        id: 'langgraph.memory_analyze',
        label: 'Update memory profile',
        detail: 'Memory analysis completed.',
        status: 'completed',
        timestamp: Date.now(),
      });
    }

    this.logger.log(
      `LangGraph intent=${graphState.primaryIntent} route=${graphState.routeSource} agents=${selectedAgents.join(',')} toolCalls=${graphState.toolCalls.length}`,
    );

    return {
      intent: graphState.primaryIntent,
      answer: composedText || baselineAnswer,
      toolCalls: graphState.toolCalls,
      memoryReads: recalled.results.map((item) => ({ blobId: item.blob_id, distance: item.distance })),
      memoryWrites,
      analyzedFacts,
      routeSource: graphState.routeSource,
      plannedToolCalls: this.toolRegistry.buildPlannedToolCallsForAgents(selectedAgents, {
        walletAddress: wallet.address,
        network: wallet.network,
        recalledMemories: recalledTexts,
      }),
    };
  }
}
