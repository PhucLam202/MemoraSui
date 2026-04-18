import { Injectable } from '@nestjs/common';
import { GetWalletSummaryTool } from './get-wallet-summary.tool';
import type { SuiNetwork } from '../../sui/sui.types';

@Injectable()
export class GetRiskFlagsTool {
  constructor(private readonly getWalletSummaryTool: GetWalletSummaryTool) {}

  async run(walletAddress: string, network?: SuiNetwork) {
    const snapshot = await this.getWalletSummaryTool.run(walletAddress, network);
    const flags: Array<{ severity: 'low' | 'medium'; message: string }> = [];

    const topAssetShare = snapshot.portfolio.coinDistribution[0]?.share ?? null;
    if (topAssetShare !== null && topAssetShare >= 0.8) {
      flags.push({
        severity: 'medium',
        message: 'Portfolio is highly concentrated in the top asset.',
      });
    }

    const failedTransactions = snapshot.fees.topTransactions.filter((item: { status: string }) => item.status !== 'success').length;
    if (failedTransactions > 0) {
      flags.push({
        severity: 'low',
        message: `${failedTransactions} recent high-fee transactions were not successful.`,
      });
    }

    if (snapshot.source.transactions === 0) {
      flags.push({
        severity: 'low',
        message: 'No transaction data is available yet, so analytics may be incomplete.',
      });
    }

    return flags;
  }
}
