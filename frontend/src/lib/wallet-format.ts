import type { SuiNetwork } from '@sui-portfolio/shared';

export function formatWalletAddress(address: string | null | undefined): string {
  if (!address) {
    return '--';
  }

  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatSuiNetworkName(network: SuiNetwork | string | null | undefined): string {
  if (!network) {
    return 'Unknown network';
  }

  const normalized = String(network).toLowerCase();
  if (normalized === 'mainnet') {
    return 'Sui Mainnet';
  }
  if (normalized === 'testnet') {
    return 'Sui Testnet';
  }
  if (normalized === 'devnet') {
    return 'Sui Devnet';
  }

  return normalized;
}

export function formatSuiBalanceFromMist(totalBalance: string | number | bigint | null | undefined): string {
  if (totalBalance === null || totalBalance === undefined) {
    return '--';
  }

  const numeric = Number(totalBalance);
  if (!Number.isFinite(numeric)) {
    return '--';
  }

  const suiAmount = numeric / 1_000_000_000;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(suiAmount);
}

