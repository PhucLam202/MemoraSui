import { backendEnv } from '../../config/env';

export function buildChatNamespace(walletId: string) {
  return `env:${backendEnv.nodeEnv}:wallet-chat:${walletId}`;
}

export function buildInsightsNamespace(walletId: string) {
  return `env:${backendEnv.nodeEnv}:wallet-insights:${walletId}`;
}
