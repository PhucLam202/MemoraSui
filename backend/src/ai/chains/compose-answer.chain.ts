import { Injectable } from '@nestjs/common';

import { OpenAiClient } from '../llm/openai.client';

type AnswerLength = 'short' | 'medium' | 'long';

function formatToolCalls(toolCalls: Array<Record<string, unknown>>) {
  return toolCalls
    .map((item) => JSON.stringify(item))
    .join('\n');
}

function formatAnswerContext(answerContext: Record<string, unknown>) {
  return JSON.stringify(answerContext, null, 2);
}

function buildLengthGuide(answerLength: AnswerLength) {
  if (answerLength === 'long') {
    return 'Return a fuller answer with short sections or up to 10 bullets. Include the key numbers, context, and the main implication.';
  }

  if (answerLength === 'medium') {
    return 'Return 1-2 short paragraphs or up to 7 bullets. Include the key numbers and a brief interpretation.';
  }

  return 'Return at most 4 short lines. Keep the answer tight unless the question clearly needs more detail.';
}

function resolveMaxTokens(answerLength: AnswerLength) {
  if (answerLength === 'long') {
    return 2400;
  }

  if (answerLength === 'medium') {
    return 1400;
  }

  return 800;
}

function buildAnswerStyle(question: string, answerLength: AnswerLength) {
  const normalized = question.toLowerCase();
  if (/(portfolio|holdings|assets|tokens|coins|balance|value|worth|allocation|pnl)/.test(normalized)) {
    return [
      buildLengthGuide(answerLength),
      'Lead with total portfolio value if available.',
      answerLength === 'long'
        ? 'Then show the main holdings and call out concentration or notable changes.'
        : answerLength === 'medium'
          ? 'Then show up to 5 holdings and include one short note on concentration.'
          : 'Then show 2-5 holdings at most.',
      'Prefer formatted amounts over raw units.',
      'If a token has no formatted amount, mention raw units only once with a brief note about missing decimals metadata.',
      'Avoid filler and avoid repeating the question.',
    ].join(' ');
  }

  if (/(gas|fee|cost|transaction fee|network fee)/.test(normalized)) {
    return [
      buildLengthGuide(answerLength),
      'Use absolute fee values when the source data is signed.',
      'State the total tracked fee and average fee first.',
      'Only mention one notable transaction if it is non-zero and trustworthy.',
      'If fees look like deltas or signed values, describe them as tracked fee outflow instead of negative totals.',
    ].join(' ');
  }

  return [
    buildLengthGuide(answerLength),
    'Prefer structured facts over prose.',
    'Do not repeat raw tool payloads.',
  ].join(' ');
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
    responseLength?: AnswerLength;
  }) {
    const responseLength = input.responseLength ?? 'short';
    const response = await this.openAiClient.complete(
      [
        {
          role: 'system',
          content: [
            'You are the final answer composer for a wallet analytics harness.',
            'Adapt the amount of detail to the configured response length instead of forcing everything to be short.',
            'Keep the answer accurate and grounded only in the provided tool results.',
            'Match the language of the user question.',
            responseLength === 'long'
              ? 'Prefer short sections or compact paragraphs that still explain the result clearly.'
              : responseLength === 'medium'
                ? 'Prefer short paragraphs or compact bullets that include the main numbers and a brief explanation.'
                : 'Prefer short factual bullets or short paragraphs instead of long prose.',
            'Do not echo the entire tool output or the full JSON context.',
            'If answer context is present, treat it as the source of truth.',
            'Do not ask for wallet, address, network, balances, or holdings again if they are already present in answer context.',
            'If the user asks about balance, money, wallet value, or how much they have: answer directly from portfolio.totalValueUsd when available.',
            'If USD value is unavailable, explicitly say USD pricing is unavailable and answer from token balances instead.',
            'If the user asks about tokens, coins, assets, or holdings: answer with portfolio.holdingCount first, then list each holding with its formatted amount if available.',
            'Use balanceFormatted, amountHuman, symbol, and usdValue before using any raw balance field.',
            'Only mention balanceRaw when balanceFormatted is unavailable or explicitly marked as raw units.',
            'If a holding is only available in raw units, mention that decimals metadata is unavailable and keep it short.',
            'If a field is missing, name the missing field explicitly instead of giving a generic answer.',
            'If baseline answer is just a placeholder, ignore it and rely on the answer context.',
            'Do not copy internal field names or tool output formatting.',
            'Do not invent explorer URLs, transaction hashes, or protocol links. Only include a URL if it is present in the provided answer context or tool calls.',
            'Do not mention hidden chain-of-thought or internal routing.',
            'Style guide for this turn:',
            buildAnswerStyle(input.question, responseLength),
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
      { temperature: 0.1, maxTokens: resolveMaxTokens(responseLength) },
    );

    return {
      text: response?.trim() || input.baselineAnswer,
      source: response ? 'openai' : 'fallback',
    };
  }
}
