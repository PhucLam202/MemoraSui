import { Injectable } from '@nestjs/common';
import { maskWalletAddress } from '../parsers/structured-output.parser';
import { GetWalletSummaryTool } from '../tools/get-wallet-summary.tool';
import { GetRiskFlagsTool } from '../tools/get-risk-flags.tool';
import type { SuiNetwork } from '../../sui/sui.types';

@Injectable()
export class AnswerWalletSummaryChain {
  constructor(
    private readonly getWalletSummaryTool: GetWalletSummaryTool,
    private readonly getRiskFlagsTool: GetRiskFlagsTool,
  ) {}

  async run(input: { walletAddress: string; network?: SuiNetwork; recalledMemories: string[] }) {
    const snapshot = await this.getWalletSummaryTool.run(input.walletAddress, input.network);
    const riskFlags = await this.getRiskFlagsTool.run(input.walletAddress, input.network);
    const masked = maskWalletAddress(input.walletAddress);

    return {
      text: `Wallet summary loaded for ${masked}.`,
      chainUsed: 'AnswerWalletSummaryChain',
      answerContext: {
        wallet: {
          address: input.walletAddress,
          maskedAddress: masked,
          network: input.network ?? snapshot.network,
        },
        portfolio: {
          totalValueUsd: snapshot.portfolio.totalWalletValueUsd,
          holdingCount: snapshot.portfolio.holdingCount,
          holdings: snapshot.portfolio.holdings,
          topAssets: snapshot.portfolio.topAssets,
          nativeBalance: snapshot.portfolio.nativeBalance,
          hasUsdValues: snapshot.portfolio.hasUsdValues,
        },
        activity: {
          recentTxCount: snapshot.activity.recentTxCount,
          lastActiveAt: snapshot.activity.lastActiveAt,
          activeDays: snapshot.activity.activeDays,
        },
        riskFlags,
        nfts: {
          totalCount: snapshot.portfolio.objectSummary.totalObjects,
        },
        snapshotSource: snapshot.source,
        recalledMemories: input.recalledMemories.slice(0, 3),
      },
      toolCalls: [
        { tool: 'getWalletSummary', status: 'success', summary: `Loaded wallet snapshot with ${snapshot.source.transactions} tx.` },
        { tool: 'getRiskFlags', status: 'success', summary: `Generated ${riskFlags.length} risk flags.` },
      ],
      memoryCandidates: riskFlags.map((flag) => flag.message),
    };
  }
}
