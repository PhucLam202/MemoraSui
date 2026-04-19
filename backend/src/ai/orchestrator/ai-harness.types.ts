import { type WalletQuestionIntent } from '../chains/classify-question.chain';
import { type SuiNetwork } from '../../sui/sui.types';

export type AiPlannedToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type AiRoutePlan = {
  intent: WalletQuestionIntent;
  toolNames: string[];
  rationale?: string;
  source: 'openai' | 'classifier';
};

export type AiToolExecutionResult = {
  text: string;
  answerContext?: Record<string, unknown>;
  chainUsed?: string;
  toolCalls: Array<Record<string, unknown>>;
  memoryCandidates: string[];
};

export type AiHarnessInput = {
  walletId: string;
  question: string;
};

export type AiHarnessOutput = {
  intent: WalletQuestionIntent;
  answer: string;
  toolCalls: Array<Record<string, unknown>>;
  memoryReads: Array<{ blobId: string; distance: number }>;
  memoryWrites: Array<Record<string, unknown>>;
  analyzedFacts: string;
  routeSource: AiRoutePlan['source'];
  plannedToolCalls: AiPlannedToolCall[];
};

export type AiToolContext = {
  walletAddress: string;
  network?: SuiNetwork;
  recalledMemories: string[];
};
