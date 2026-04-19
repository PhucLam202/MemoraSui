import { Injectable } from '@nestjs/common';
import { objectPrompt } from '../prompts/object.prompt';
import { GetObjectSummaryTool } from '../tools/get-object-summary.tool';
import type { SuiNetwork } from '../../sui/sui.types';

@Injectable()
export class AnswerObjectChain {
  constructor(private readonly getObjectSummaryTool: GetObjectSummaryTool) {}

  async run(input: { walletAddress: string; network?: SuiNetwork; recalledMemories: string[] }) {
    const objectSummary = await this.getObjectSummaryTool.run(input.walletAddress, input.network);
    const topType = objectSummary.byType[0];

    return {
      chainUsed: 'AnswerObjectChain',
      text: [
        objectPrompt(),
        `The wallet currently tracks ${objectSummary.totalObjects} objects.`,
        topType ? `Most common object type is ${topType.type} with ${topType.count} entries.` : 'There is no object type breakdown yet.',
        input.recalledMemories[0] ? `Prior context: ${input.recalledMemories[0]}` : null,
      ]
        .filter(Boolean)
        .join(' '),
      toolCalls: [{ tool: 'getObjectSummary', status: 'success', summary: `Loaded ${objectSummary.totalObjects} objects.` }],
      memoryCandidates: topType ? [`Wallet object inventory is concentrated in ${topType.type}.`] : [],
    };
  }
}
