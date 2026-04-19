import { Injectable } from '@nestjs/common';
import { type WalletQuestionIntent } from '../chains/classify-question.chain';
import { RouteToolsChain } from '../chains/route-tools.chain';
import { type LangGraphAgentsConfig, type LangGraphAgentName, getEnabledSubagents } from '../config';
import { createLLM } from '../llm/llmFactory';
import { LangGraphToolRegistry } from '../tools/langgraph-tool-registry';
import { type LangGraphAgentState } from './state';

type SupervisorPlan = {
  plan: string;
  agents: LangGraphAgentName[];
  primaryIntent: WalletQuestionIntent;
  routeSource: 'classifier' | 'openai';
};

@Injectable()
export class LangGraphSupervisor {
  constructor(
    private readonly routeToolsChain: RouteToolsChain,
    private readonly langGraphToolRegistry: LangGraphToolRegistry,
  ) {}

  async createPlan(state: LangGraphAgentState, config: LangGraphAgentsConfig): Promise<SupervisorPlan> {
    const enabledAgents = getEnabledSubagents(config);
    const fallbackRoute = await this.routeToolsChain.run({
      question: state.question,
      recalledMemories: state.recalledMemories,
    });
    const fallbackAgents = this.langGraphToolRegistry.mapIntentToAgents(
      fallbackRoute.intent,
      state.question,
      enabledAgents,
    );

    const response = await createLLM(config, 'supervisor', true).complete(
      [
        {
          role: 'system',
          content: [
            config.supervisor.systemPrompt,
            'Select only from the enabled agents below.',
            this.langGraphToolRegistry.getAgentDescriptions(config),
            'Use research when the question is about another project, tokenomics, news, sentiment, competitor comparison, or recent protocol context.',
            'Return JSON only with this shape:',
            '{"plan":"short plan","agents":["portfolio","gas"],"primaryIntent":"portfolio|fee|unknown"}',
            'If no enabled agent can help, return an empty agents array and primaryIntent "unknown".',
          ].join('\n\n'),
        },
        {
          role: 'user',
          content: [
            `Question: ${state.question}`,
            state.recalledMemories.length > 0 ? `Recall: ${state.recalledMemories.join(' | ')}` : 'Recall: none',
            `Enabled agents: ${enabledAgents.join(', ') || 'none'}`,
          ].join('\n'),
        },
      ],
      { temperature: config.supervisor.temperature, maxTokens: 500 },
    );

    if (!response) {
      return {
        plan: this.buildFallbackPlan(fallbackAgents),
        agents: fallbackAgents,
        primaryIntent: fallbackAgents[0] ? this.langGraphToolRegistry.mapAgentToIntent(fallbackAgents[0]) : fallbackRoute.intent,
        routeSource: fallbackRoute.source,
      };
    }

    try {
      const parsed = JSON.parse(this.stripJsonEnvelope(response)) as {
        plan?: unknown;
        agents?: unknown;
        primaryIntent?: unknown;
      };
      const agents = Array.isArray(parsed.agents)
        ? parsed.agents.filter((item): item is LangGraphAgentName => this.isAgentName(item) && enabledAgents.includes(item))
        : [];
      return {
        plan: typeof parsed.plan === 'string' && parsed.plan.trim() ? parsed.plan.trim() : this.buildFallbackPlan(agents),
        agents: agents.length > 0 ? agents : fallbackAgents,
        primaryIntent: this.normalizeIntent(parsed.primaryIntent, agents, fallbackRoute.intent),
        routeSource: 'openai',
      };
    } catch {
      return {
        plan: this.buildFallbackPlan(fallbackAgents),
        agents: fallbackAgents,
        primaryIntent: fallbackAgents[0] ? this.langGraphToolRegistry.mapAgentToIntent(fallbackAgents[0]) : fallbackRoute.intent,
        routeSource: fallbackRoute.source,
      };
    }
  }

  private buildFallbackPlan(agents: LangGraphAgentName[]) {
    if (agents.length === 0) {
      return 'No LangGraph sub-agent matches this request. Fall back to the existing orchestrator.';
    }
    return `Run ${agents.join(', ')} analysis and merge the grounded tool outputs into a single answer.`;
  }

  private isAgentName(value: unknown): value is LangGraphAgentName {
    return value === 'portfolio' || value === 'gas' || value === 'staking' || value === 'tax' || value === 'research';
  }

  private normalizeIntent(
    value: unknown,
    agents: LangGraphAgentName[],
    fallbackIntent: WalletQuestionIntent,
  ): WalletQuestionIntent {
    if (
      value === 'wallet_summary' ||
      value === 'portfolio' ||
      value === 'fee' ||
      value === 'activity' ||
      value === 'object' ||
      value === 'protocol_usage' ||
      value === 'research' ||
      value === 'unknown'
    ) {
      return value;
    }
    if (agents[0]) {
      return this.langGraphToolRegistry.mapAgentToIntent(agents[0]);
    }
    return fallbackIntent;
  }

  private stripJsonEnvelope(value: string) {
    return value.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  }
}
