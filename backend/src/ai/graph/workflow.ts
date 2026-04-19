import { Injectable } from '@nestjs/common';
import { END, Send, START, StateGraph } from '@langchain/langgraph';
import { type LangGraphAgentsConfig } from '../config';
import { type AiStreamEmitter } from '../orchestrator/ai-harness.types';
import { runGasSubagent, runPortfolioSubagent, runResearchSubagent, runStakingSubagent, runTaxSubagent } from '../subagents';
import { LangGraphToolRegistry } from '../tools/langgraph-tool-registry';
import { LangGraphState, type LangGraphAgentState } from './state';
import { LangGraphSupervisor } from './supervisor';

@Injectable()
export class LangGraphWorkflow {
  constructor(
    private readonly supervisor: LangGraphSupervisor,
    private readonly toolRegistry: LangGraphToolRegistry,
  ) {}

  compile(config: LangGraphAgentsConfig, options?: { emit?: AiStreamEmitter }) {
    this.toolRegistry.setConfig(config);
    const emit = options?.emit;
    const workflow = new StateGraph(LangGraphState)
      .addNode('supervisor', async (state: LangGraphAgentState) => {
        emit?.({
          type: 'step_start',
          id: 'langgraph.supervisor',
          label: 'Update to-do list',
          detail: 'Planning which agent should handle the request.',
          timestamp: Date.now(),
        });
        const plan = await this.supervisor.createPlan(state, config);
        emit?.({
          type: 'step_end',
          id: 'langgraph.supervisor',
          label: 'Update to-do list',
          detail: `Selected agents: ${plan.agents.length > 0 ? plan.agents.join(', ') : 'none'}.`,
          status: 'completed',
          timestamp: Date.now(),
        });
        return {
          plan: plan.plan,
          nextAgents: plan.agents,
          primaryIntent: plan.primaryIntent,
          routeSource: plan.routeSource,
        };
      })
      .addNode('portfolio', async (state: LangGraphAgentState) => {
        emit?.({
          type: 'step_start',
          id: 'langgraph.portfolio',
          label: 'Review wallet portfolio',
          detail: 'Collecting portfolio-specific context.',
          timestamp: Date.now(),
        });
        const result = await runPortfolioSubagent(state, this.toolRegistry);
        emit?.({
          type: 'step_end',
          id: 'langgraph.portfolio',
          label: 'Review wallet portfolio',
          detail: 'Portfolio analysis completed.',
          status: 'completed',
          timestamp: Date.now(),
        });
        return result;
      })
      .addNode('gas', async (state: LangGraphAgentState) => {
        emit?.({
          type: 'step_start',
          id: 'langgraph.gas',
          label: 'Inspect gas usage',
          detail: 'Checking fee and gas context.',
          timestamp: Date.now(),
        });
        const result = await runGasSubagent(state, this.toolRegistry);
        emit?.({
          type: 'step_end',
          id: 'langgraph.gas',
          label: 'Inspect gas usage',
          detail: 'Gas analysis completed.',
          status: 'completed',
          timestamp: Date.now(),
        });
        return result;
      })
      .addNode('staking', async (state: LangGraphAgentState) => {
        emit?.({
          type: 'step_start',
          id: 'langgraph.staking',
          label: 'Check staking',
          detail: 'Reviewing staking context.',
          timestamp: Date.now(),
        });
        const result = await runStakingSubagent(state);
        emit?.({
          type: 'step_end',
          id: 'langgraph.staking',
          label: 'Check staking',
          detail: 'Staking analysis completed.',
          status: 'completed',
          timestamp: Date.now(),
        });
        return result;
      })
      .addNode('tax', async (state: LangGraphAgentState) => {
        emit?.({
          type: 'step_start',
          id: 'langgraph.tax',
          label: 'Review tax context',
          detail: 'Reviewing tax-related history.',
          timestamp: Date.now(),
        });
        const result = await runTaxSubagent(state);
        emit?.({
          type: 'step_end',
          id: 'langgraph.tax',
          label: 'Review tax context',
          detail: 'Tax analysis completed.',
          status: 'completed',
          timestamp: Date.now(),
        });
        return result;
      })
      .addNode('research', async (state: LangGraphAgentState) => {
        emit?.({
          type: 'step_start',
          id: 'langgraph.research',
          label: 'Search on the web',
          detail: 'Launching the research sub-agent.',
          timestamp: Date.now(),
        });
        const result = await runResearchSubagent(state, { emit });
        emit?.({
          type: 'step_end',
          id: 'langgraph.research',
          label: 'Search on the web',
          detail: 'Research sub-agent completed.',
          status: 'completed',
          timestamp: Date.now(),
        });
        return result;
      })
      .addNode('finalize', async (state: LangGraphAgentState) => {
        emit?.({
          type: 'step_start',
          id: 'langgraph.finalize',
          label: 'Compose answer',
          detail: 'Merging sub-agent results into a single reply.',
          timestamp: Date.now(),
        });
        const summaries = state.nextAgents
          .map((agent) => {
            const result = state.subResults[agent] as { text?: unknown } | undefined;
            return typeof result?.text === 'string' ? `${agent}: ${result.text}` : null;
          })
          .filter((item): item is string => Boolean(item));

        const finalAnswer =
          summaries.length > 0
            ? summaries.join('\n\n')
            : 'No LangGraph agent returned usable output for this request.';

        emit?.({
          type: 'step_end',
          id: 'langgraph.finalize',
          label: 'Compose answer',
          detail: 'Final answer is ready.',
          status: 'completed',
          timestamp: Date.now(),
        });

        return {
          finalAnswer,
        };
      })
      .addEdge(START, 'supervisor')
      .addConditionalEdges('supervisor', (state: LangGraphAgentState) => {
        if (state.nextAgents.length === 0) {
          return 'finalize';
        }
        if (!config.general.parallelSubagents || state.nextAgents.length === 1) {
          return state.nextAgents[0] ?? 'finalize';
        }
        return state.nextAgents.map((agent) => new Send(agent, state));
      })
      .addEdge('portfolio', 'finalize')
      .addEdge('gas', 'finalize')
      .addEdge('staking', 'finalize')
      .addEdge('tax', 'finalize')
      .addEdge('research', 'finalize')
      .addEdge('finalize', END);

    return workflow.compile();
  }
}
