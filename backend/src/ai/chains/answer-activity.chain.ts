import { Injectable } from '@nestjs/common';
import { activityPrompt } from '../prompts/activity.prompt';
import { GetActivityTool } from '../tools/get-activity.tool';
import { GetProtocolUsageTool } from '../tools/get-protocol-usage.tool';
import type { SuiNetwork } from '../../sui/sui.types';

@Injectable()
export class AnswerActivityChain {
  constructor(
    private readonly getActivityTool: GetActivityTool,
    private readonly getProtocolUsageTool: GetProtocolUsageTool,
  ) {}

  async run(input: { walletAddress: string; network?: SuiNetwork; recalledMemories: string[] }) {
    const activity = await this.getActivityTool.run(input.walletAddress, input.network);
    const protocols = await this.getProtocolUsageTool.run(input.walletAddress, input.network);
    const topProtocol = protocols.topProtocols[0];

    return {
      chainUsed: 'AnswerActivityChain',
      text: [
        activityPrompt(),
        `The wallet has ${activity.activeDays} active days, ${activity.incomingCount} incoming actions, and ${activity.outgoingCount} outgoing actions in the indexed range.`,
        topProtocol ? `Top protocol is ${topProtocol.protocol} with ${topProtocol.count} interactions.` : 'No protocol concentration is visible yet.',
        input.recalledMemories[0] ? `Prior context: ${input.recalledMemories[0]}` : null,
      ]
        .filter(Boolean)
        .join(' '),
      toolCalls: [
        {
          tool: 'getActivitySummary',
          status: 'success',
          summary: `Loaded ${activity.txCountByDay.length} daily activity buckets.`,
        },
        {
          tool: 'getProtocolUsage',
          status: 'success',
          summary: `Loaded ${protocols.topProtocols.length} protocol entries.`,
          links: topProtocol
            ? [
                {
                  label: 'Search protocol on SuiVision',
                  url: `https://suivision.xyz/search?q=${encodeURIComponent(topProtocol.protocol)}`,
                },
              ]
            : undefined,
        },
      ],
      memoryCandidates: topProtocol ? [`Wallet often interacts with ${topProtocol.protocol}.`] : [],
    };
  }
}
