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

export type TransactionRequest = {
  amount: number;
  amountMist: string;
  recipient: string;
  network: string;
};

export type ExecutionRequestKind = 'swap' | 'rebalance' | 'deepbook_order';

export type ExecutionPreviewAllocation = {
  symbol: string;
  currentPct?: number;
  targetPct: number;
};

export type ExecutionPreview = {
  actionLabel: string;
  fromToken?: string;
  toToken?: string;
  amountIn?: string;
  expectedAmountOut?: string;
  market?: string;
  side?: 'buy' | 'sell';
  orderType?: 'limit' | 'market';
  price?: string;
  quantity?: string;
  slippagePct: number;
  route?: string[];
  protocols?: string[];
  allocations?: ExecutionPreviewAllocation[];
};

export type ExecutionRisk = {
  warnings: string[];
  touchedProtocols: string[];
  gasEstimateMist?: string;
  expectedBalanceChanges?: Array<{
    symbol: string;
    amount: string;
  }>;
  requiresElevatedConfirmation?: boolean;
  elevatedReason?: string;
  rejectCode?: string;
  securityChecks?: {
    slippagePct?: number;
    priceImpactPct?: number;
    complexityScore?: number;
    gasReserve?: {
      availableMist?: string;
      requiredMist: string;
      keepGasMist?: string;
      minGasBufferMist: string;
    };
  };
};

export type ExecutionRequest = {
  kind: ExecutionRequestKind;
  network: 'mainnet';
  transactionKindBytesBase64: string;
  transactionJson: string;
  quoteExpiresAt: string;
  summary: {
    title: string;
    detail: string;
  };
  preview: ExecutionPreview;
  risk: ExecutionRisk;
};

export type BatchTransferRecipient = {
  address: string;
  amountMist: string;
  amount: number;
};

export type BatchTransferRequest = {
  recipients: BatchTransferRecipient[];
  network: string;
  totalAmount: number;
  totalAmountMist: string;
};

export type NFTTransferRequest = {
  objectId: string;
  recipient: string;
  network: string;
  objectType?: string;
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
  transactionRequest?: TransactionRequest;
  batchTransferRequest?: BatchTransferRequest;
  nftTransferRequest?: NFTTransferRequest;
  executionRequest?: ExecutionRequest;
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
