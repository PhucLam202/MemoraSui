import { Injectable, Logger } from '@nestjs/common';
import { type TransactionRequest } from '../orchestrator/ai-harness.types';

const MIST_PER_SUI = 1_000_000_000n;

function parseSuiAmount(text: string): bigint | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:sui)/i);
  if (!match || !match[1]) return null;
  const amount = parseFloat(match[1].replace(',', '.'));
  if (isNaN(amount) || amount <= 0) return null;
  return BigInt(Math.round(amount * Number(MIST_PER_SUI)));
}

function parseRecipient(text: string): string | null {
  const match = text.match(/0x[0-9a-fA-F]{40,64}/);
  return match ? match[0] : null;
}

@Injectable()
export class TransferTool {
  private readonly logger = new Logger(TransferTool.name);

  parseTransfer(question: string, network: string): TransactionRequest | null {
    const amountMist = parseSuiAmount(question);
    const recipient = parseRecipient(question);

    if (!amountMist || !recipient) {
      this.logger.warn(`Could not parse transfer params (chars=${question.length}).`);
      return null;
    }

    return {
      amount: Number(amountMist) / Number(MIST_PER_SUI),
      amountMist: amountMist.toString(),
      recipient,
      network,
    };
  }
}
