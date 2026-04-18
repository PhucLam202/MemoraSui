import { Injectable } from '@nestjs/common';
import { walletSummaryPrompt } from '../prompts/wallet-summary.prompt';
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
    const topAsset = snapshot.portfolio.topAssets[0];
    const masked = maskWalletAddress(input.walletAddress);
    const memoryNote = input.recalledMemories[0] ? `Prior context: ${input.recalledMemories[0]}` : null;

    const parts = [
      `${walletSummaryPrompt()} Wallet ${masked} has ${snapshot.source.transactions} indexed transactions and ${snapshot.portfolio.objectSummary.totalObjects} tracked objects.`,
      topAsset
        ? `Top asset is ${topAsset.coinType} with balance ${topAsset.balance}${topAsset.valueUsd !== null ? ` (~$${topAsset.valueUsd.toFixed(2)})` : ''}.`
        : 'No asset distribution is available yet.',
      riskFlags[0] ? `Risk flag: ${riskFlags[0].message}` : null,
      memoryNote,
    ].filter(Boolean);

    return {
      text: parts.join(' '),
      toolCalls: [
        { tool: 'getWalletSummary', status: 'success', summary: `Loaded wallet snapshot with ${snapshot.source.transactions} tx.` },
        { tool: 'getRiskFlags', status: 'success', summary: `Generated ${riskFlags.length} risk flags.` },
      ],
      memoryCandidates: riskFlags.map((flag) => flag.message),
    };
  }
}
