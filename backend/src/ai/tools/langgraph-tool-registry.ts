import { Injectable } from '@nestjs/common';
import { type WalletQuestionIntent } from '../chains/classify-question.chain';
import {
  type LangGraphAgentsConfig,
  type LangGraphAgentName,
  type LangGraphSubagentConfig,
  getSubagentConfig,
} from '../config';
import { type AiToolContext, type AiToolExecutionResult, type AiPlannedToolCall } from '../orchestrator/ai-harness.types';
import { AiToolRegistry } from '../orchestrator/tool-registry';
import { createLLM } from '../llm/llmFactory';

export type LangGraphSubagentResult = {
  agent: LangGraphAgentName;
  intent: WalletQuestionIntent;
  text: string;
  answerContext?: Record<string, unknown>;
  chainUsed?: string;
  toolCalls: Array<Record<string, unknown>>;
  memoryCandidates: string[];
};

@Injectable()
export class LangGraphToolRegistry {
  constructor(private readonly aiToolRegistry: AiToolRegistry) {}

  getAgentDescriptions(config: LangGraphAgentsConfig) {
    return (Object.entries(config.subagents) as Array<[LangGraphAgentName, LangGraphAgentsConfig['subagents'][LangGraphAgentName]]>)
      .filter(([, subagent]) => subagent.enabled)
      .map(([name, subagent]) => `- ${name}: ${subagent.description}`)
      .join('\n');
  }

  buildPlannedToolCallsForAgents(
    agents: LangGraphAgentName[],
    context: AiToolContext,
  ): AiPlannedToolCall[] {
    return agents.flatMap((agent) => this.aiToolRegistry.buildPlannedToolCalls(this.mapAgentToIntent(agent), context));
  }

  async runAgent(agent: LangGraphAgentName, context: AiToolContext): Promise<LangGraphSubagentResult | null> {
    const intent = this.mapAgentToIntent(agent);
    if (intent === 'unknown') {
      return {
        agent,
        intent,
        text: `${agent} analysis is not implemented in the current MVP.`,
        toolCalls: [],
        memoryCandidates: [],
      };
    }

    const result = await this.aiToolRegistry.runIntent(intent, context);
    if (!result) {
      return null;
    }

    const subagentConfig = this.currentConfig ? getSubagentConfig(this.currentConfig, agent) : null;
    const rewritten = subagentConfig
      ? await this.rewriteWithSubagentModel(agent, subagentConfig, context, result)
      : null;

    return {
      agent,
      intent,
      text: rewritten?.text ?? result.text,
      answerContext: result.answerContext,
      chainUsed: rewritten?.chainUsed ?? result.chainUsed,
      toolCalls: result.toolCalls,
      memoryCandidates: rewritten?.memoryCandidates ?? result.memoryCandidates,
    };
  }

  private currentConfig: LangGraphAgentsConfig | null = null;

  setConfig(config: LangGraphAgentsConfig) {
    this.currentConfig = config;
  }

  private async rewriteWithSubagentModel(
    agent: LangGraphAgentName,
    config: LangGraphSubagentConfig,
    context: AiToolContext,
    result: AiToolExecutionResult,
  ) {
    if (!this.currentConfig || !config.systemPrompt.trim()) {
      return null;
    }

    const responseLength = this.currentConfig.general.responseLength;
    const maxTokens = responseLength === 'long' ? 900 : responseLength === 'medium' ? 650 : 500;
    const llm = createLLM(
      this.currentConfig,
      agent as keyof LangGraphAgentsConfig['subagents'],
    );
    const response = await llm.complete(
      [
        {
          role: 'system',
          content: [
            config.systemPrompt,
            'Use the following tool output as ground truth.',
            responseLength === 'long'
              ? 'Rewrite it into a fuller user-facing answer.'
              : responseLength === 'medium'
                ? 'Rewrite it into a balanced user-facing answer with useful detail.'
                : 'Rewrite it into a short user-facing answer.',
            'Do not invent new facts.',
            'Do not mention internal routing.',
            responseLength === 'long'
              ? 'Keep the output clear, markdown-friendly, and informative.'
              : 'Keep the output concise and markdown-friendly.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `Agent: ${agent}`,
            `Wallet: ${context.walletAddress}`,
            `Network: ${String(context.network ?? 'unknown')}`,
            `Tool result:\n${JSON.stringify(result.answerContext ?? {}, null, 2)}`,
            `Baseline text: ${result.text}`,
          ].join('\n\n'),
        },
      ],
      {
        temperature: config.temperature,
        maxTokens,
      },
    );

    if (!response) {
      return null;
    }

    return {
      text: response.trim(),
      chainUsed: result.chainUsed,
      memoryCandidates: result.memoryCandidates,
    };
  }

  mapAgentToIntent(agent: LangGraphAgentName): WalletQuestionIntent {
    if (agent === 'portfolio') {
      return 'portfolio';
    }
    if (agent === 'gas') {
      return 'fee';
    }
    if (agent === 'research') {
      return 'research';
    }
    if (agent === 'staking') {
      return 'staking';
    }
    return 'unknown';
  }

  mapIntentToAgents(intent: WalletQuestionIntent, question: string, enabledAgents: LangGraphAgentName[]) {
    const nextAgents = new Set<LangGraphAgentName>();
    const normalizedQuestion = question.toLowerCase();

    if (intent === 'portfolio' || intent === 'wallet_summary') {
      nextAgents.add('portfolio');
    }
    if (intent === 'fee') {
      nextAgents.add('gas');
    }
    if (/(balance|holding|portfolio|allocation|value|asset|token|pnl)/i.test(normalizedQuestion)) {
      nextAgents.add('portfolio');
    }
    if (/(gas|fee|cost|cheap|expensive)/i.test(normalizedQuestion)) {
      nextAgents.add('gas');
    }
    if (/(research|project|tokenomics|news|sentiment|tvl|whale|competitor|compare|comparison|outlook|roadmap|whitepaper|fundamentals|supply|total supply|circulating supply|max supply|walrus)/i.test(normalizedQuestion)) {
      nextAgents.add('research');
    }
    if (intent === 'staking' || /(stake|staking|reward|apy|unstake)/i.test(normalizedQuestion)) {
      nextAgents.add('staking');
    }

    return Array.from(nextAgents).filter((agent) => enabledAgents.includes(agent));
  }

  coerceExecution(result: AiToolExecutionResult | null, agent: LangGraphAgentName): LangGraphSubagentResult | null {
    if (!result) {
      return null;
    }
    return {
      agent,
      intent: this.mapAgentToIntent(agent),
      text: result.text,
      answerContext: result.answerContext,
      chainUsed: result.chainUsed,
      toolCalls: result.toolCalls,
      memoryCandidates: result.memoryCandidates,
    };
  }
}
