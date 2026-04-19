import { type LangGraphAgentState } from '../graph/state';
import { type LangGraphToolRegistry } from '../tools/langgraph-tool-registry';

export async function runGasSubagent(
  state: LangGraphAgentState,
  toolRegistry: LangGraphToolRegistry,
) {
  const result = await toolRegistry.runAgent('gas', {
    walletAddress: state.walletAddress,
    network: state.network,
    recalledMemories: state.recalledMemories,
  });

  if (!result) {
    return {
      subResults: {
        gas: {
          text: 'Gas agent could not gather data for this request.',
        },
      },
    };
  }

  return {
    subResults: { gas: result },
    toolCalls: result.toolCalls,
    memoryCandidates: result.memoryCandidates,
  };
}
