import { Injectable } from '@nestjs/common';

export type WalletQuestionIntent =
  | 'wallet_summary'
  | 'portfolio'
  | 'fee'
  | 'activity'
  | 'object'
  | 'protocol_usage'
  | 'unknown';

@Injectable()
export class ClassifyQuestionChain {
  run(question: string): WalletQuestionIntent {
    const normalized = question.toLowerCase();

    if (/\b(fee|gas|cost|spent)\b/.test(normalized)) {
      return 'fee';
    }
    if (/\b(nft|object|objects|collectible)\b/.test(normalized)) {
      return 'object';
    }
    if (/\b(protocol|dex|cetus|bluefin|interaction)\b/.test(normalized)) {
      return 'protocol_usage';
    }
    if (/\b(activity|transaction|transactions|history|recent)\b/.test(normalized)) {
      return 'activity';
    }
    if (/\b(portfolio|balance|balances|asset|assets|holding|holdings)\b/.test(normalized)) {
      return 'portfolio';
    }
    if (/\b(summary|overview|wallet)\b/.test(normalized)) {
      return 'wallet_summary';
    }

    return 'unknown';
  }
}
