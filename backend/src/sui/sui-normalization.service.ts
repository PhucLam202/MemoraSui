import { Injectable } from '@nestjs/common';
import type { NormalizedWalletEvent, WalletActionType, WalletInvolvement } from '../analytics/analytics.types';
import type { SuiNetwork, SuiTransactionChange, SuiTransactionSummary } from './sui.types';

@Injectable()
export class SuiNormalizationService {
  normalizeTransaction(transaction: SuiTransactionSummary, walletAddress: string, network: SuiNetwork): NormalizedWalletEvent {
    const balanceChanges = transaction.balanceChanges ?? [];
    const objectChanges = transaction.objectChanges ?? [];
    const positiveChanges = balanceChanges.filter((change) => toBigInt(change.amount) > 0n);
    const negativeChanges = balanceChanges.filter((change) => toBigInt(change.amount) < 0n);
    const dominantPositive = pickDominantChange(positiveChanges);
    const dominantNegative = pickDominantChange(negativeChanges);
    const protocol = extractProtocolName(transaction.raw);
    const actionType = inferActionType(transaction, protocol, positiveChanges, negativeChanges, objectChanges);
    const walletInvolvement = inferWalletInvolvement(transaction, walletAddress);
    const counterparty = inferCounterparty(transaction, walletAddress, walletInvolvement);
    const amount = inferAmount(positiveChanges, negativeChanges, transaction.balanceChanges);

    return {
      walletAddress,
      network,
      referenceDigest: transaction.digest,
      actionType,
      protocol,
      assetIn: dominantPositive?.coinType ?? dominantPositive?.type ?? '',
      assetOut: dominantNegative?.coinType ?? dominantNegative?.type ?? '',
      amount,
      walletInvolvement,
      counterparty,
      timestampMs: transaction.timestampMs ?? null,
      raw: transaction.raw,
    };
  }

  normalizeTransactions(transactions: SuiTransactionSummary[], walletAddress: string, network: SuiNetwork): NormalizedWalletEvent[] {
    return transactions.map((transaction) => this.normalizeTransaction(transaction, walletAddress, network));
  }
}

function inferActionType(
  transaction: SuiTransactionSummary,
  protocol: string,
  positiveChanges: SuiTransactionChange[],
  negativeChanges: SuiTransactionChange[],
  objectChanges: SuiTransactionChange[],
): WalletActionType {
  const protocolHint = protocol.toLowerCase();
  if (protocolHint.includes('stake')) {
    return protocolHint.includes('unstake') ? 'unstake' : 'stake';
  }

  if (protocolHint.includes('unstake')) {
    return 'unstake';
  }

  if (protocolHint.includes('mint')) {
    return 'mint';
  }

  if (protocolHint.includes('burn')) {
    return 'burn';
  }

  const hasObjectMovement = objectChanges.some((change) => Boolean(change.objectId));
  const hasCoinIn = positiveChanges.length > 0;
  const hasCoinOut = negativeChanges.length > 0;
  const hasSwapSignal = hasCoinIn && hasCoinOut;

  if (hasSwapSignal) {
    return 'swap';
  }

  if (hasObjectMovement && hasCoinIn) {
    return 'nft_buy';
  }

  if (hasObjectMovement && hasCoinOut) {
    return 'nft_sell';
  }

  if (transaction.sender && !transaction.recipient && hasCoinOut) {
    return 'transfer';
  }

  if (transaction.recipient && !transaction.sender && hasCoinIn) {
    return 'receive';
  }

  if (hasObjectMovement) {
    return 'contract_call';
  }

  if (hasCoinIn) {
    return 'receive';
  }

  if (hasCoinOut) {
    return 'transfer';
  }

  return 'contract_call';
}

function inferWalletInvolvement(
  transaction: SuiTransactionSummary,
  walletAddress: string,
): WalletInvolvement {
  const sender = normalizeAddress(transaction.sender);
  const recipient = normalizeAddress(transaction.recipient);
  const wallet = normalizeAddress(walletAddress);

  if (sender && recipient && sender === wallet && recipient === wallet) {
    return 'both';
  }

  if (sender === wallet) {
    return recipient === wallet ? 'both' : 'sender';
  }

  if (recipient === wallet) {
    return 'recipient';
  }

  return 'observer';
}

function inferCounterparty(
  transaction: SuiTransactionSummary,
  walletAddress: string,
  walletInvolvement: WalletInvolvement,
) {
  const sender = normalizeAddress(transaction.sender);
  const recipient = normalizeAddress(transaction.recipient);
  const wallet = normalizeAddress(walletAddress);

  if (walletInvolvement === 'sender') {
    return recipient && recipient !== wallet ? recipient : null;
  }

  if (walletInvolvement === 'recipient') {
    return sender && sender !== wallet ? sender : null;
  }

  if (walletInvolvement === 'both') {
    return sender && sender !== wallet ? sender : recipient && recipient !== wallet ? recipient : null;
  }

  return null;
}

function inferAmount(
  positiveChanges: SuiTransactionChange[],
  negativeChanges: SuiTransactionChange[],
  allChanges: SuiTransactionChange[],
) {
  const dominant = pickDominantChange([...positiveChanges, ...negativeChanges]) ?? pickDominantChange(allChanges);
  if (dominant) {
    return dominant.amount ?? '0';
  }

  return '0';
}

function pickDominantChange(changes: SuiTransactionChange[]) {
  let best: SuiTransactionChange | null = null;
  let bestMagnitude = 0n;

  for (const change of changes) {
    const magnitude = absBigInt(change.amount);
    if (!best || magnitude > bestMagnitude) {
      best = change;
      bestMagnitude = magnitude;
    }
  }

  return best;
}

function extractProtocolName(raw: Record<string, unknown>) {
  const candidates: string[] = [];
  collectProtocolCandidates(raw, candidates, 0);
  const first = candidates.find((value) => value.trim().length > 0);
  return first ?? 'unknown';
}

function collectProtocolCandidates(value: unknown, candidates: string[], depth: number) {
  if (!value || depth > 4 || candidates.length > 20) {
    return;
  }

  if (typeof value === 'string') {
    if (value.includes('::') || value.includes('0x') || value.toLowerCase().includes('protocol') || value.toLowerCase().includes('app')) {
      candidates.push(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectProtocolCandidates(item, candidates, depth + 1);
    }
    return;
  }

  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/protocol|app|package|module|dapp|target/i.test(key) && typeof entry === 'string') {
        candidates.push(entry);
      }
      collectProtocolCandidates(entry, candidates, depth + 1);
    }
  }
}

function normalizeAddress(value: string | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function toBigInt(value: string | number | null | undefined) {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value.trim());
    } catch {
      return 0n;
    }
  }

  return 0n;
}

function absBigInt(value: string | number | null | undefined) {
  const bigIntValue = toBigInt(value);
  return bigIntValue < 0n ? -bigIntValue : bigIntValue;
}
