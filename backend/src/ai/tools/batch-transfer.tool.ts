import { Injectable, Logger } from '@nestjs/common';

const MIST_PER_SUI = 1_000_000_000n;

export type BatchTransferRecipient = {
  address: string;
  amountMist: string;
  amount: number;
};

export type BatchTransferRequest = {
  recipients: BatchTransferRecipient[];
  network: string;
  totalAmount: number;
  totalAmountMist: string;
};

function parseSuiAmount(text: string): bigint | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:sui)/i);
  if (!match || !match[1]) return null;
  const amount = parseFloat(match[1].replace(',', '.'));
  if (isNaN(amount) || amount <= 0) return null;
  return BigInt(Math.round(amount * Number(MIST_PER_SUI)));
}

function parseMultipleRecipients(question: string): Array<{ address: string; amount: bigint }> | null {
  const recipients: Array<{ address: string; amount: bigint }> = [];

  // Pattern 1: "send 1 SUI to 0xabc, 2 SUI to 0xdef, 3 SUI to 0xghi"
  const pattern1 = /(\d+(?:[.,]\d+)?)\s*sui\s+to\s+(0x[0-9a-fA-F]{40,64})/gi;
  let match;
  while ((match = pattern1.exec(question)) !== null) {
    const amount = parseSuiAmount(match[1] + ' sui');
    const address = match[2];
    if (amount && address) {
      recipients.push({ address, amount });
    }
  }

  if (recipients.length > 0) {
    return recipients;
  }

  // Pattern 2: "send 1 SUI to [0xabc, 0xdef, 0xghi]" (same amount to multiple addresses)
  const amountMatch = question.match(/(\d+(?:[.,]\d+)?)\s*sui/i);
  const addressMatches = question.match(/0x[0-9a-fA-F]{40,64}/g);

  if (amountMatch && addressMatches && addressMatches.length > 1) {
    const amount = parseSuiAmount(amountMatch[0]);
    if (amount) {
      for (const address of addressMatches) {
        recipients.push({ address, amount });
      }
      return recipients;
    }
  }

  return null;
}

@Injectable()
export class BatchTransferTool {
  private readonly logger = new Logger(BatchTransferTool.name);

  parseBatchTransfer(question: string, network: string): BatchTransferRequest | null {
    const recipientsData = parseMultipleRecipients(question);

    if (!recipientsData || recipientsData.length === 0) {
      this.logger.warn(`Could not parse batch transfer params from: "${question}"`);
      return null;
    }

    let totalAmountMist = 0n;
    const recipients: BatchTransferRecipient[] = recipientsData.map((r) => {
      totalAmountMist += r.amount;
      return {
        address: r.address,
        amountMist: r.amount.toString(),
        amount: Number(r.amount) / Number(MIST_PER_SUI),
      };
    });

    return {
      recipients,
      network,
      totalAmount: Number(totalAmountMist) / Number(MIST_PER_SUI),
      totalAmountMist: totalAmountMist.toString(),
    };
  }
}
