import { Injectable } from '@nestjs/common';

import { OpenAiClient } from '../llm/openai.client';

function formatToolCalls(toolCalls: Array<Record<string, unknown>>) {
  return toolCalls.map((item) => JSON.stringify(item)).join('\n');
}

function formatAnswerContext(answerContext: Record<string, unknown>) {
  return JSON.stringify(answerContext, null, 2);
}

@Injectable()
export class ComposeAnswerChain {
  constructor(private readonly openAiClient: OpenAiClient) {}

  async run(input: {
    question: string;
    baselineAnswer: string;
    answerContext?: Record<string, unknown>;
    recalledMemories: string[];
    toolCalls: Array<Record<string, unknown>>;
  }) {
    const response = await this.openAiClient.complete(
      [
        {
          role: 'system',
          content: [
            'You are the final answer composer for a wallet analytics harness.',
            'Keep the answer concise, accurate, and grounded only in the provided tool results.',
            'Match the language of the user question.',
            'If answer context is present, treat it as the source of truth.',
            'Do not ask for wallet, address, network, balances, or holdings again if they are already present in answer context.',
            'If the user asks about balance, money, wallet value, or how much they have: answer directly from portfolio.totalValueUsd when available.',
            'If USD value is unavailable, explicitly say USD pricing is unavailable and answer from token balances instead.',
            'If the user asks about tokens, coins, assets, or holdings: answer with portfolio.holdingCount first, then list each holding with its balanceFormatted value.',
            'Use balanceFormatted, symbol, and amountHuman before using any raw balance field.',
            'Only mention balanceRaw when balanceFormatted is unavailable or explicitly marked as raw units.',
            'If a holding is only available in raw units, explicitly say decimals metadata is unavailable for that token.',
            'If a field is missing, name the missing field explicitly instead of giving a generic answer.',
            'If baseline answer is just a placeholder, ignore it and rely on the answer context.',
            'Do not copy internal field names or tool output formatting.',
            'Do not invent explorer URLs, transaction hashes, or protocol links. Only include a URL if it is present in the provided answer context or tool calls.',
            'Do not mention hidden chain-of-thought or internal routing.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `Question: ${input.question}`,
            input.recalledMemories.length > 0 ? `Recall: ${input.recalledMemories.join(' | ')}` : 'Recall: none',
            `Baseline answer: ${input.baselineAnswer}`,
            input.answerContext ? `Answer context:\n${formatAnswerContext(input.answerContext)}` : 'Answer context: none',
            input.toolCalls.length > 0 ? `Tool calls:\n${formatToolCalls(input.toolCalls)}` : 'Tool calls: none',
          ].join('\n\n'),
        },
      ],
      { temperature: 0.2, maxTokens: 700 },
    );

    return {
      text: response?.trim() || input.baselineAnswer,
      source: response ? 'openai' : 'fallback',
    };
  }
}
