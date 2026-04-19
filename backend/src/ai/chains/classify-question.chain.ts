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

    if (/(bao nhiêu tiền|bao nhieu tien|có bao nhiêu tiền|co bao nhieu tien|tổng bao nhiêu|tong bao nhieu|wallet value|worth|giá trị|gia tri)/.test(normalized)) {
      return 'portfolio';
    }
    if (/(lần cuối|hoat dong|hoạt động|recent|last active|last activity|activity|lịch sử|giao dịch|transaction|transactions)/.test(normalized)) {
      return 'activity';
    }
    if (/(phí|gas|chi phí|spent|cost|fee)/.test(normalized)) {
      return 'fee';
    }
    if (/(nft|object|objects|collectible|vật phẩm|tài sản số|sưu tập)/.test(normalized)) {
      return 'object';
    }
    if (/(protocol|dex|cetus|bluefin|interaction|tương tác giao thức|giao thức)/.test(normalized)) {
      return 'protocol_usage';
    }
    if (/(portfolio|balance|balances|asset|assets|holding|holdings|token|tokens|coin|coins|holdings count|wallet value|danh mục|số dư|tài sản|số tiền|so tien|bao nhiêu token|bao nhieu token)/.test(normalized)) {
      return 'portfolio';
    }
    if (/(summary|overview|wallet|tổng quan|ví|tài khoản)/.test(normalized)) {
      return 'wallet_summary';
    }

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
    if (/\b(portfolio|balance|balances|asset|assets|holding|holdings|token|tokens|coin|coins|money|worth|value)\b/.test(normalized)) {
      return 'portfolio';
    }
    if (/\b(summary|overview|wallet)\b/.test(normalized)) {
      return 'wallet_summary';
    }

    return 'unknown';
  }
}
