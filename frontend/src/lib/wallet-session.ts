import type { SuiNetwork } from '@sui-portfolio/shared';

export const WALLET_SESSION_STORAGE_KEY = 'sui-portfolio:wallet-session';

export type WalletAuthStatus =
  | 'idle'
  | 'challenge-ready'
  | 'signing'
  | 'signed'
  | 'verified'
  | 'stale'
  | 'error';

export type WalletBackendAuthStatus = 'pending' | 'verified' | 'offline';

export interface WalletSession {
  accessToken?: string;
  accessTokenExpiresAt?: string;
  address: string;
  challenge: string;
  network: SuiNetwork;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  sessionId?: string;
  signature: string;
  backendStatus: WalletBackendAuthStatus;
  issuedAt: string;
  status: WalletAuthStatus;
  userId?: string;
  walletId?: string;
  walletName: string;
  verifiedAt?: string;
}

export type WalletSessionState =
  | { status: 'loading' }
  | { status: 'missing'; reason: 'no-session' | 'invalid-session' | 'expired-session' }
  | { status: 'valid'; session: WalletSession };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isWalletSession(candidate: unknown): candidate is WalletSession {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const session = candidate as Partial<WalletSession>;
  return (
    isNonEmptyString(session.address) &&
    isNonEmptyString(session.challenge) &&
    isNonEmptyString(session.signature) &&
    isNonEmptyString(session.issuedAt) &&
    isNonEmptyString(session.walletName) &&
    isNonEmptyString(session.network) &&
    isNonEmptyString(session.status) &&
    isNonEmptyString(session.backendStatus)
  );
}

export function loadWalletSessionFromStorage(): WalletSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WALLET_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isWalletSession(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearWalletSessionFromStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(WALLET_SESSION_STORAGE_KEY);
}

export function saveWalletSessionToStorage(session: WalletSession): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(WALLET_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function isWalletSessionValid(session: WalletSession | null): session is WalletSession {
  if (!session) {
    return false;
  }

  // If it's only signed locally (offline mode), we consider it valid for now
  if (session.status === 'signed' || session.status === 'verified') {
    // Check expiration if available
    if (session.accessTokenExpiresAt) {
      const expiresAt = new Date(session.accessTokenExpiresAt).getTime();
      if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
        return false;
      }
    }
    
    // If issuedAt is too old (e.g., > 24h), we might want to consider it stale
    const issuedAt = new Date(session.issuedAt).getTime();
    if (!Number.isNaN(issuedAt) && Date.now() - issuedAt > 24 * 60 * 60 * 1000) {
      return false;
    }

    return true;
  }

  return false;
}
