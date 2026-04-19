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

export type AiStreamEvent =
  | {
      type: 'step_start';
      id: string;
      label: string;
      detail?: string;
      timestamp: number;
    }
  | {
      type: 'step_update';
      id: string;
      label?: string;
      detail: string;
      timestamp: number;
    }
  | {
      type: 'step_end';
      id: string;
      label?: string;
      detail?: string;
      status: 'completed' | 'error';
      timestamp: number;
    }
  | {
      type: 'final';
      response: Record<string, unknown>;
      timestamp: number;
    }
  | {
      type: 'error';
      message: string;
      timestamp: number;
    };

export type AiStreamEmitter = (event: AiStreamEvent) => void;

export type AiToolContext = {
  walletAddress: string;
  network?: SuiNetwork;
  recalledMemories: string[];
};
