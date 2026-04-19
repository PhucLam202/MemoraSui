import { Injectable } from '@nestjs/common';

import { type AiRoutePlan, type AiToolContext, type AiToolExecutionResult } from './ai-harness.types';
import { AiToolRegistry } from './tool-registry';

@Injectable()
export class ToolCallLoop {
  constructor(private readonly toolRegistry: AiToolRegistry) {}

  async run(input: AiToolContext & { route: AiRoutePlan }): Promise<AiToolExecutionResult | null> {
    const execution = await this.toolRegistry.runIntent(input.route.intent, {
      walletAddress: input.walletAddress,
      network: input.network,
      recalledMemories: input.recalledMemories,
    });

    if (!execution) {
      return null;
    }

    return {
      text: execution.text,
      answerContext: execution.answerContext,
      chainUsed: execution.chainUsed,
      toolCalls: execution.toolCalls,
      memoryCandidates: execution.memoryCandidates,
    };
  }
}
