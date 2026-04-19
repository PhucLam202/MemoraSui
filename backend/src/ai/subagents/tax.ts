import { type LangGraphAgentState } from '../graph/state';

export async function runTaxSubagent(_state: LangGraphAgentState) {
  return {
    subResults: {
      tax: {
        text: 'Tax agent is scaffolded but not enabled in the current MVP.',
      },
    },
  };
}
