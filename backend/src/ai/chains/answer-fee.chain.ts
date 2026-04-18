import { Injectable } from '@nestjs/common';
import { feePrompt } from '../prompts/fee.prompt';
import { GetFeeSummaryTool } from '../tools/get-fee-summary.tool';
import type { SuiNetwork } from '../../sui/sui.types';

@Injectable()
export class AnswerFeeChain {
  constructor(private readonly getFeeSummaryTool: GetFeeSummaryTool) {}

  async run(input: { walletAddress: string; network?: SuiNetwork; recalledMemories: string[] }) {
    const feeSummary = await this.getFeeSummaryTool.run(input.walletAddress, input.network);
    const topFee = feeSummary.topTransactions[0];

    return {
      text: [
        feePrompt(),
        `Total tracked fee is ${feeSummary.totalFee} with average fee ${feeSummary.averageFee.toFixed(4)}.`,
        topFee ? `Highest recent fee transaction is ${topFee.digest} costing ${topFee.gasFee}.` : 'No fee-heavy transactions are available yet.',
        input.recalledMemories[0] ? `Prior context: ${input.recalledMemories[0]}` : null,
      ]
        .filter(Boolean)
        .join(' '),
      toolCalls: [{ tool: 'getFeeSummary', status: 'success', summary: `Loaded ${feeSummary.topTransactions.length} fee transactions.` }],
      memoryCandidates: [`User asked about wallet fee usage. Total fee ${feeSummary.totalFee}.`],
    };
  }
}
