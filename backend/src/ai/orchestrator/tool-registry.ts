import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { AnswerActivityChain } from '../chains/answer-activity.chain';
import { AnswerFeeChain } from '../chains/answer-fee.chain';
import { AnswerObjectChain } from '../chains/answer-object.chain';
import { AnswerPortfolioChain } from '../chains/answer-portfolio.chain';
import { AnswerWalletSummaryChain } from '../chains/answer-wallet-summary.chain';
import { type WalletQuestionIntent } from '../chains/classify-question.chain';
import { type AiPlannedToolCall, type AiToolContext, type AiToolExecutionResult } from './ai-harness.types';

const availableNetworks = z.enum(['devnet', 'testnet', 'mainnet']);

const toolDefinitions = [
  {
    name: 'getWalletSummary',
    description: 'Load a wallet snapshot with portfolio, activity, and risk context.',
    intent: 'wallet_summary',
    inputSchema: z.object({
      walletAddress: z.string().min(1),
      network: availableNetworks.optional(),
    }),
  },
  {
    name: 'getRiskFlags',
    description: 'Derive risk flags from the wallet snapshot.',
    intent: 'wallet_summary',
    inputSchema: z.object({
      walletAddress: z.string().min(1),
      network: availableNetworks.optional(),
    }),
  },
  {
    name: 'getFeeSummary',
    description: 'Summarize gas and fee usage for the wallet.',
    intent: 'fee',
    inputSchema: z.object({
      walletAddress: z.string().min(1),
      network: availableNetworks.optional(),
    }),
  },
  {
    name: 'getActivitySummary',
    description: 'Summarize wallet activity over time.',
    intent: 'activity',
    inputSchema: z.object({
      walletAddress: z.string().min(1),
      network: availableNetworks.optional(),
    }),
  },
  {
    name: 'getProtocolUsage',
    description: 'Summarize protocol usage and repeated interactions.',
    intent: 'activity',
    inputSchema: z.object({
      walletAddress: z.string().min(1),
      network: availableNetworks.optional(),
    }),
  },
  {
    name: 'getObjectSummary',
    description: 'Summarize NFT and on-chain object inventory.',
    intent: 'object',
    inputSchema: z.object({
      walletAddress: z.string().min(1),
      network: availableNetworks.optional(),
    }),
  },
  {
    name: 'getPortfolio',
    description: 'Summarize wallet holdings and asset distribution.',
    intent: 'portfolio',
    inputSchema: z.object({
      walletAddress: z.string().min(1),
      network: availableNetworks.optional(),
    }),
  },
] as const;

const intentToToolNames: Record<WalletQuestionIntent, string[]> = {
  wallet_summary: ['getWalletSummary', 'getRiskFlags'],
  portfolio: ['getPortfolio'],
  fee: ['getFeeSummary'],
  activity: ['getActivitySummary', 'getProtocolUsage'],
  object: ['getObjectSummary'],
  protocol_usage: ['getProtocolUsage', 'getActivitySummary'],
  research: [],
  staking: [],
  transfer: [],
  unknown: [],
};

@Injectable()
export class AiToolRegistry {
  constructor(
    private readonly answerWalletSummaryChain: AnswerWalletSummaryChain,
    private readonly answerPortfolioChain: AnswerPortfolioChain,
    private readonly answerFeeChain: AnswerFeeChain,
    private readonly answerActivityChain: AnswerActivityChain,
    private readonly answerObjectChain: AnswerObjectChain,
  ) {}

  listDefinitions() {
    return toolDefinitions.map((tool) => ({
      name: tool.name,
      description: tool.description,
      intent: tool.intent,
      inputSchema: tool.inputSchema.description,
    }));
  }

  buildPlannedToolCalls(intent: WalletQuestionIntent, context: AiToolContext): AiPlannedToolCall[] {
    return intentToToolNames[intent].map((name) => ({
      name,
      arguments: {
        walletAddress: context.walletAddress,
        network: context.network,
      },
    }));
  }

  describeTools() {
    return toolDefinitions
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join('\n');
  }

  async runIntent(intent: WalletQuestionIntent, context: AiToolContext): Promise<AiToolExecutionResult | null> {
    if (intent === 'fee') {
      return this.answerFeeChain.run({
        walletAddress: context.walletAddress,
        network: context.network,
        recalledMemories: context.recalledMemories,
      });
    }

    if (intent === 'activity' || intent === 'protocol_usage') {
      return this.answerActivityChain.run({
        walletAddress: context.walletAddress,
        network: context.network,
        recalledMemories: context.recalledMemories,
      });
    }

    if (intent === 'object') {
      return this.answerObjectChain.run({
        walletAddress: context.walletAddress,
        network: context.network,
        recalledMemories: context.recalledMemories,
      });
    }

    if (intent === 'wallet_summary') {
      return this.answerWalletSummaryChain.run({
        walletAddress: context.walletAddress,
        network: context.network,
        recalledMemories: context.recalledMemories,
      });
    }

    if (intent === 'portfolio') {
      return this.answerPortfolioChain.run({
        walletAddress: context.walletAddress,
        network: context.network,
        recalledMemories: context.recalledMemories,
      });
    }

    return null;
  }
}
