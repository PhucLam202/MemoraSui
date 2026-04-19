import { Injectable } from '@nestjs/common';
import { maskWalletAddress } from '../parsers/structured-output.parser';
import { GetActivityTool } from '../tools/get-activity.tool';
import { GetPortfolioTool } from '../tools/get-portfolio.tool';
import { GetRiskFlagsTool } from '../tools/get-risk-flags.tool';
import type { SuiNetwork } from '../../sui/sui.types';

@Injectable()
export class AnswerPortfolioChain {
  constructor(
    private readonly getPortfolioTool: GetPortfolioTool,
    private readonly getActivityTool: GetActivityTool,
    private readonly getRiskFlagsTool: GetRiskFlagsTool,
  ) {}

  async run(input: { walletAddress: string; network?: SuiNetwork; recalledMemories: string[] }) {
    const portfolio = await this.getPortfolioTool.run(input.walletAddress, input.network);
    const activity = await this.getActivityTool.run(input.walletAddress, input.network);
    const riskFlags = await this.getRiskFlagsTool.run(input.walletAddress, input.network);
    const maskedAddress = maskWalletAddress(input.walletAddress);

    return {
      text: `Portfolio analytics loaded for ${maskedAddress}.`,
      chainUsed: 'AnswerPortfolioChain',
      answerContext: {
        wallet: {
          address: input.walletAddress,
          maskedAddress,
          network: input.network ?? 'testnet',
        },
        portfolio: {
          totalValueUsd: portfolio.totalWalletValueUsd,
          hasUsdValues: portfolio.hasUsdValues,
          holdingCount: portfolio.holdingCount,
          holdings: portfolio.holdings,
          topAssets: portfolio.topAssets,
          nativeBalance: portfolio.nativeBalance,
        },
        activity: {
          recentTxCount: activity.recentTxCount,
          lastActiveAt: activity.lastActiveAt,
          activeDays: activity.activeDays,
        },
        riskFlags,
        nfts: {
          totalCount: portfolio.objectSummary.totalObjects,
        },
        recalledMemories: input.recalledMemories.slice(0, 3),
      },
      toolCalls: [
        { tool: 'getPortfolio', status: 'success', summary: `Loaded ${portfolio.holdingCount} holdings.` },
        { tool: 'getActivitySummary', status: 'success', summary: `Loaded ${activity.recentTxCount} tracked activity events.` },
        { tool: 'getRiskFlags', status: 'success', summary: `Generated ${riskFlags.length} risk flags.` },
      ],
      memoryCandidates: [
        `Portfolio has ${portfolio.holdingCount} holdings on ${input.network ?? 'testnet'}.`,
        ...riskFlags.map((flag) => flag.message),
      ],
    };
  }
}
