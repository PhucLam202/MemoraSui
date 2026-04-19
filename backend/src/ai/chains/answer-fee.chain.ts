import { Injectable } from '@nestjs/common';
import { feePrompt } from '../prompts/fee.prompt';
import { GetFeeSummaryTool } from '../tools/get-fee-summary.tool';
import type { SuiNetwork } from '../../sui/sui.types';

function formatFeeValue(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^-?\d+$/.test(text)) {
    const parsed = BigInt(text);
    return parsed < 0n ? String(-parsed) : text;
  }

  const numeric = Number(text);
  if (!Number.isFinite(numeric)) {
    return text;
  }

  return numeric < 0 ? String(Math.abs(numeric)) : text;
}

@Injectable()
export class AnswerFeeChain {
  constructor(private readonly getFeeSummaryTool: GetFeeSummaryTool) {}

  async run(input: { walletAddress: string; network?: SuiNetwork; recalledMemories: string[] }) {
    const feeSummary = await this.getFeeSummaryTool.run(input.walletAddress, input.network);
    const topFee = feeSummary.topTransactions[0];
    const txUrl = topFee ? `https://suivision.xyz/txblock/${topFee.digest}` : undefined;
    const totalFee = formatFeeValue(feeSummary.totalFee) ?? '0';
    const averageFee = Number.isFinite(feeSummary.averageFee) ? Math.abs(feeSummary.averageFee).toFixed(4) : '0.0000';
    const topFeeValue = formatFeeValue(topFee?.gasFee);

    return {
      chainUsed: 'AnswerFeeChain',
      text: [
        feePrompt(),
        `Tracked fee outflow is ${totalFee} with average fee ${averageFee}.`,
        topFee && topFeeValue ? `Highest recent fee transaction is ${topFee.digest} costing ${topFeeValue}.` : 'No fee-heavy transactions are available yet.',
        input.recalledMemories[0] ? `Prior context: ${input.recalledMemories[0]}` : null,
      ]
        .filter(Boolean)
        .join(' '),
      toolCalls: [
        {
          tool: 'getFeeSummary',
          status: 'success',
          summary: `Loaded ${feeSummary.topTransactions.length} fee transactions.`,
          links: topFee
            ? [
                {
                  label: 'Open transaction on SuiVision',
                  url: txUrl,
                },
              ]
            : undefined,
        },
      ],
      memoryCandidates: [`User asked about wallet fee usage. Total fee ${feeSummary.totalFee}.`],
    };
  }
}
