import { type LangGraphAgentState } from '../graph/state';
import { type LangGraphToolRegistry } from '../tools/langgraph-tool-registry';

export async function runPortfolioSubagent(
  state: LangGraphAgentState,
  toolRegistry: LangGraphToolRegistry,
) {
  const result = await toolRegistry.runAgent('portfolio', {
    walletAddress: state.walletAddress,
    network: state.network,
    recalledMemories: state.recalledMemories,
  });

  if (!result) {
    return {
      subResults: {
        portfolio: {
          text: 'Portfolio agent could not gather data for this request.',
        },
      },
    };
  }

  return {
    subResults: { portfolio: result },
    toolCalls: result.toolCalls,
    memoryCandidates: result.memoryCandidates,
  };
}
