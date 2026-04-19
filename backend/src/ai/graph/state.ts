import { Annotation } from '@langchain/langgraph';
import { type WalletQuestionIntent } from '../chains/classify-question.chain';
import { type SuiNetwork } from '../../sui/sui.types';

export const LangGraphState = Annotation.Root({
  walletId: Annotation<string>({
    reducer: (_current, incoming) => incoming ?? '',
    default: () => '',
  }),
  question: Annotation<string>({
    reducer: (_current, incoming) => incoming ?? '',
    default: () => '',
  }),
  walletAddress: Annotation<string>({
    reducer: (_current, incoming) => incoming ?? '',
    default: () => '',
  }),
  network: Annotation<SuiNetwork | undefined>({
    reducer: (_current, incoming) => incoming,
    default: () => undefined,
  }),
  recalledMemories: Annotation<string[]>({
    reducer: (_current, incoming) => incoming ?? [],
    default: () => [],
  }),
  plan: Annotation<string>({
    reducer: (_current, incoming) => incoming ?? '',
    default: () => '',
  }),
  nextAgents: Annotation<string[]>({
    reducer: (_current, incoming) => incoming ?? [],
    default: () => [],
  }),
  primaryIntent: Annotation<WalletQuestionIntent>({
    reducer: (_current, incoming) => incoming ?? 'unknown',
    default: () => 'unknown',
  }),
  routeSource: Annotation<'classifier' | 'openai'>({
    reducer: (_current, incoming) => incoming ?? 'classifier',
    default: () => 'classifier',
  }),
  subResults: Annotation<Record<string, unknown>>({
    reducer: (current, incoming) => ({ ...current, ...(incoming ?? {}) }),
    default: () => ({}),
  }),
  toolCalls: Annotation<Array<Record<string, unknown>>>({
    reducer: (current, incoming) => current.concat(incoming ?? []),
    default: () => [],
  }),
  memoryCandidates: Annotation<string[]>({
    reducer: (current, incoming) => current.concat(incoming ?? []),
    default: () => [],
  }),
  finalAnswer: Annotation<string>({
    reducer: (_current, incoming) => incoming ?? '',
    default: () => '',
  }),
});

export type LangGraphAgentState = typeof LangGraphState.State;
