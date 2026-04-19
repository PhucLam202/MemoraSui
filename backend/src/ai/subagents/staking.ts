import { type LangGraphAgentState } from '../graph/state';
import { createLLM } from '../llm/llmFactory';
import { loadAgentsConfig } from '../config';
import { STAKING_PROMPT } from '../prompts/staking.prompt';

export async function runStakingSubagent(state: LangGraphAgentState) {
  const config = loadAgentsConfig();
  const llm = createLLM(config, 'staking');

  // If no staking data in context, we assume it's missing or need tool access
  // In our current graph flow, subagents process the results of tool execution
  const stakingData = state.subResults?.staking || {};

  const response = await llm.complete(
    [
      {
        role: 'system',
        content: STAKING_PROMPT,
      },
      {
        role: 'user',
        content: `User Question: ${state.question}\n\nStaking Data: ${JSON.stringify(stakingData, null, 2)}`,
      },
    ],
    {
      temperature: 0.1,
      maxTokens: 500,
    },
  );

  return {
    subResults: {
      staking: {
        text: response?.trim() || 'No active staking positions found.',
        data: stakingData,
      },
    },
  };
}
