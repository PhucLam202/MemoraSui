import { Injectable } from '@nestjs/common';

export type WalletQuestionIntent =
  | 'wallet_summary'
  | 'portfolio'
  | 'fee'
  | 'activity'
  | 'object'
  | 'protocol_usage'
  | 'research'
  | 'staking'
  | 'transfer'
  | 'batch_transfer'
  | 'transfer_nft'
  | 'swap'
  | 'rebalance'
  | 'deepbook_order'
  | 'deepbook_market'
  | 'unknown';

@Injectable()
export class ClassifyQuestionChain {
  run(question: string): WalletQuestionIntent {
    const normalized = question.toLowerCase();

    // Check for NFT transfer first (more specific)
    if (/(transfer|send|gửi|gui|chuyển|chuyen)\s.*(nft|object|collectible)|(nft|object|collectible)\s.*(transfer|send|gửi|gui|chuyển|chuyen)/i.test(normalized)) {
      return 'transfer_nft';
    }

    if (/(rebalance|cân bằng|can bang|đưa portfolio về|dua portfolio ve|allocation)/i.test(normalized)) {
      return 'rebalance';
    }

    if (/(deepbook|limit order|market order|đặt lệnh|dat lenh)/i.test(normalized) && /(buy|sell|mua|ban|order|lệnh|lenh)/i.test(normalized)) {
      return /market/i.test(normalized) ? 'deepbook_market' : 'deepbook_order';
    }

    if (/(swap|đổi|doi|hoán đổi|hoan doi)/i.test(normalized) && /(sang|qua|to|for|->|→)/i.test(normalized)) {
      return 'swap';
    }

    // Check for batch/multi transfer
    if (/(batch|nhiều|nhieu|multiple|many)\s.*(transfer|send|gửi|gui|chuyển|chuyen)|(send|transfer|gửi|gui|chuyển|chuyen)\s.*(nhiều|nhieu|multiple|many|batch)/i.test(normalized)) {
      const addressCount = (normalized.match(/0x[0-9a-f]{40,}/g) || []).length;
      if (addressCount > 1) {
        return 'batch_transfer';
      }
    }

    // Check for multiple addresses in the question
    const addressMatches = normalized.match(/0x[0-9a-f]{40,}/g);
    if (addressMatches && addressMatches.length > 1 && /(transfer|send|gửi|gui|chuyển|chuyen)/i.test(normalized)) {
      return 'batch_transfer';
    }

    // Regular single transfer
    if (/(chuyển|chuyen|transfer|send|gửi|gui)\s.*(sui|token|coin|\d)|(send|transfer)\s.*\bto\b|0x[0-9a-f]{40,}/i.test(normalized)) {
      return 'transfer';
    }

    const researchCue = /(research|project|tokenomics|news|sentiment|market cap|tvl|whale|competitor|comparison|compare|outlook|roadmap|whitepaper|fundamentals|supply|total supply|max supply|circulating supply|wallet supply|walrus)/.test(normalized);
    const aboutCue = /(information|info|tell me|what is|who is|details|overview|explain|about)/.test(normalized);
    const tokenNameCue = /\b(sui|wal)\b/.test(normalized);

    if (researchCue) {
      return 'research';
    }

    if (aboutCue && tokenNameCue) {
      return 'portfolio';
    }

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
    if (/(swap|slippage|route|routing|liquidity|orderbook|deepbook)/.test(normalized)) {
      return 'swap';
    }
    if (/(portfolio|balance|balances|asset|assets|holding|holdings|token|tokens|coin|coins|holdings count|wallet value|danh mục|số dư|tài sản|số tiền|so tien|bao nhiêu token|bao nhieu token)/.test(normalized)) {
      return 'portfolio';
    }
    if (/(summary|overview|wallet|tổng quan|ví|tài khoản)/.test(normalized)) {
      return 'wallet_summary';
    }
    if (/(stake|staking|reward|apy|unstake|đặt cược|đặc cược|phần thưởng)/.test(normalized)) {
      return 'staking';
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
