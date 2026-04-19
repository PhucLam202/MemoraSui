import { Injectable } from '@nestjs/common';

import { type WalletQuestionIntent, ClassifyQuestionChain } from './classify-question.chain';
import { type AiRoutePlan } from '../orchestrator/ai-harness.types';
import { OpenAiClient } from '../llm/openai.client';
import { AiToolRegistry } from '../orchestrator/tool-registry';

function stripJsonEnvelope(value: string) {
  return value.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
}

function normalizeIntent(value: unknown): WalletQuestionIntent {
  if (
    value === 'wallet_summary' ||
    value === 'portfolio' ||
    value === 'fee' ||
    value === 'activity' ||
    value === 'object' ||
    value === 'protocol_usage'
  ) {
    return value;
  }

  return 'unknown';
}

function shouldPreferClassifier(fallbackIntent: WalletQuestionIntent, openAiIntent: WalletQuestionIntent) {
  if (fallbackIntent === 'unknown') {
    return false;
  }

  if (openAiIntent === 'unknown') {
    return true;
  }

  if (fallbackIntent === 'portfolio' && openAiIntent === 'wallet_summary') {
    return true;
  }

  return false;
}

@Injectable()
export class RouteToolsChain {
  constructor(
    private readonly classifyQuestionChain: ClassifyQuestionChain,
    private readonly openAiClient: OpenAiClient,
    private readonly toolRegistry: AiToolRegistry,
  ) {}

  async run(input: { question: string; recalledMemories: string[] }) {
    const fallbackIntent = this.classifyQuestionChain.run(input.question);
    const fallbackRoute: AiRoutePlan = {
      intent: fallbackIntent,
      toolNames: this.toolRegistry.buildPlannedToolCalls(fallbackIntent, {
        walletAddress: 'wallet',
        recalledMemories: input.recalledMemories,
      }).map((item) => item.name),
      source: 'classifier',
    };

    const response = await this.openAiClient.complete(
      [
        {
          role: 'system',
          content: [
            'You route wallet questions into a single intent for an analytics harness.',
            'Return JSON only with this shape:',
            '{"intent":"wallet_summary|portfolio|fee|activity|object|protocol_usage|unknown","toolNames":["..."],"rationale":"short"}',
            'Use only these tools:',
            this.toolRegistry.describeTools(),
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `Question: ${input.question}`,
            input.recalledMemories.length > 0 ? `Recall: ${input.recalledMemories.join(' | ')}` : 'Recall: none',
          ].join('\n'),
        },
      ],
      { temperature: 0, maxTokens: 250 },
    );

    if (!response) {
      return fallbackRoute;
    }

    try {
      const parsed = JSON.parse(stripJsonEnvelope(response)) as {
        intent?: unknown;
        toolNames?: unknown;
        rationale?: unknown;
      };
      const intent = normalizeIntent(parsed.intent);
      const toolNames = Array.isArray(parsed.toolNames)
        ? parsed.toolNames.filter((item): item is string => typeof item === 'string')
        : [];
      if (shouldPreferClassifier(fallbackIntent, intent)) {
        return fallbackRoute;
      }

      return {
        intent,
        toolNames: toolNames.length > 0 ? toolNames : fallbackRoute.toolNames,
        rationale: typeof parsed.rationale === 'string' ? parsed.rationale : undefined,
        source: 'openai',
      } satisfies AiRoutePlan;
    } catch {
      return fallbackRoute;
    }
  }
}
