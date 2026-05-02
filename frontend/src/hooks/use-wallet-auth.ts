'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useCurrentAccount,
  useCurrentWallet,
  useDAppKit,
  useWallets,
} from '@mysten/dapp-kit-react';
import type { SuiNetwork } from '@sui-portfolio/shared';
import {
  loadWalletSessionFromStorage,
  saveWalletSessionToStorage,
  clearWalletSessionFromStorage,
  isWalletSessionValid,
  type WalletSession,
  type WalletAuthStatus,
} from '@/lib/wallet-session';

const challengeEncoder = new TextEncoder();
const APP_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK as SuiNetwork | undefined) ?? 'mainnet';

interface UseWalletAuthOptions {
  appName: string;
  apiBaseUrl: string;
}

export function useWalletAuth({ appName, apiBaseUrl }: UseWalletAuthOptions) {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const wallets = useWallets();

  const autoAuthAttemptRef = useRef<string | null>(null);
  const autoSyncAttemptRef = useRef<string | null>(null);

  const handleDisconnect = useCallback(async () => {
    setError(null);
    autoAuthAttemptRef.current = null;
    autoSyncAttemptRef.current = null;
    try {
      await dAppKit.disconnectWallet();
      setSession(null);
      clearWalletSessionFromStorage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }, [dAppKit]);

  const handleSyncWallet = useCallback(async (targetSession: WalletSession) => {
    const syncTarget = targetSession.walletId || targetSession.address;
    if (!syncTarget) return;

    setSyncStatus('Syncing...');
    try {
      const isAddress = syncTarget.startsWith('0x');
      const response = await fetch(
        isAddress
          ? `${apiBaseUrl}/sync/wallet-addresses/${syncTarget}`
          : `${apiBaseUrl}/sync/wallets/${syncTarget}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(targetSession.userId ? { 'x-user-id': targetSession.userId } : {}),
          },
        }
      );

      if (response.ok) {
        setSyncStatus('Sync successful');
      } else {
        setSyncStatus('Sync failed');
      }
    } catch {
      setSyncStatus('Sync error');
    }
  }, [apiBaseUrl]);

  // Sync session with state
  useEffect(() => {
    setIsHydrated(true);
    const stored = loadWalletSessionFromStorage();
    if (stored && isWalletSessionValid(stored)) {
      setSession(stored);
    }
  }, []);

  // Persist session changes
  useEffect(() => {
    if (!isHydrated) return;
    if (session) {
      saveWalletSessionToStorage(session);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wallet-session-updated', { detail: { status: 'saved' } }));
      }
    } else {
      clearWalletSessionFromStorage();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wallet-session-updated', { detail: { status: 'cleared' } }));
      }
    }
  }, [isHydrated, session]);

  // Handle session expiration
  useEffect(() => {
    if (!isHydrated || !session?.accessTokenExpiresAt) return;

    const expiresAt = new Date(session.accessTokenExpiresAt).getTime();
    if (Number.isNaN(expiresAt)) return;

    const timeoutMs = Math.max(expiresAt - Date.now(), 0);
    const timeoutId = window.setTimeout(() => {
      handleDisconnect();
      setError('Auth session expired. Please sign again.');
    }, timeoutMs);

    return () => window.clearTimeout(timeoutId);
  }, [handleDisconnect, isHydrated, session?.accessTokenExpiresAt]);

  const handleAuthenticate = useCallback(async () => {
    if (!account || !currentWallet) {
      setError('Connect a wallet before starting auth.');
      return;
    }

    setError(null);
    setIsBusy(true);
    setSyncStatus(null);

    try {
      const network = APP_NETWORK;
      let challengeStr = `Local auth for ${account.address}`;
      let backendStatus: 'pending' | 'offline' = 'offline';
      
      interface VerifyData {
        accessToken?: string;
        accessTokenExpiresAt?: string;
        refreshToken?: string;
        refreshTokenExpiresAt?: string;
        sessionId?: string;
        status: string;
        userId?: string;
        user?: { id: string };
        walletId?: string;
        verifiedAt?: string;
      }
      
      let verifyData: VerifyData = { status: 'verified' };

      try {
        const challengeResponse = await fetch(`${apiBaseUrl}/auth/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: account.address,
            appName,
            network,
          }),
        });

        if (challengeResponse.ok) {
          const raw = await challengeResponse.json();
          const challengePayload = raw.data || raw;
          challengeStr = challengePayload.challenge || challengePayload.message || challengeStr;
          backendStatus = 'pending';
        }
      } catch {
        backendStatus = 'offline';
      }

      const signatureResult = await dAppKit.signPersonalMessage({
        message: challengeEncoder.encode(challengeStr),
      });

      if (backendStatus === 'pending') {
        try {
          const verifyResponse = await fetch(`${apiBaseUrl}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: account.address,
              challenge: challengeStr,
              network,
              signature: signatureResult.signature,
              walletName: currentWallet.name,
            }),
          });

          if (verifyResponse.ok) {
            const raw = await verifyResponse.json();
            verifyData = raw.data || raw;
          } else {
            backendStatus = 'offline';
          }
        } catch {
          backendStatus = 'offline';
        }
      }

      const newSession: WalletSession = {
        accessToken: verifyData.accessToken,
        accessTokenExpiresAt: verifyData.accessTokenExpiresAt,
        address: account.address,
        challenge: challengeStr,
        network,
        refreshToken: verifyData.refreshToken,
        refreshTokenExpiresAt: verifyData.refreshTokenExpiresAt,
        sessionId: verifyData.sessionId,
        signature: signatureResult.signature,
        backendStatus: backendStatus === 'offline' ? 'offline' : 'verified',
        issuedAt: new Date().toISOString(),
        status: 'verified',
        userId: verifyData.user?.id || verifyData.userId,
        walletId: verifyData.walletId,
        walletName: currentWallet.name,
        verifiedAt: verifyData.verifiedAt ?? new Date().toISOString(),
      };

      setSession(newSession);

      if (verifyData.status === 'verified') {
        void handleSyncWallet(newSession);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setSession(curr => curr ? { ...curr, status: 'error' as WalletAuthStatus } : null);
      autoAuthAttemptRef.current = null;
    } finally {
      setIsBusy(false);
    }
  }, [account, currentWallet, apiBaseUrl, appName, dAppKit, handleSyncWallet]);

  useEffect(() => {
    if (!isHydrated || session?.status !== 'verified') {
      return;
    }

    const intervalId = window.setInterval(() => {
      void handleSyncWallet(session);
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [handleSyncWallet, isHydrated, session]);

  // Auto-auth logic
  useEffect(() => {
    if (!isHydrated || isBusy || !account || !currentWallet) return;

    const attemptKey = `${APP_NETWORK}:${account.address}`;
    const hasMatchingVerifiedSession =
      session?.status === 'verified' &&
      session.address === account.address &&
      session.network === APP_NETWORK &&
      isWalletSessionValid(session);

    if (hasMatchingVerifiedSession) {
      autoAuthAttemptRef.current = attemptKey;
      return;
    }

    if (autoAuthAttemptRef.current === attemptKey) return;

    autoAuthAttemptRef.current = attemptKey;
    void handleAuthenticate();
  }, [account, currentWallet, isBusy, isHydrated, session, handleAuthenticate]);

  return {
    session,
    isBusy,
    error,
    syncStatus,
    handleConnect: async (walletName: string) => {
      const wallet = wallets.find(w => w.name === walletName);
      if (wallet) await dAppKit.connectWallet({ wallet });
    },
    handleDisconnect,
    handleAuthenticate,
    handleSyncWallet: () => session && handleSyncWallet(session),
  };
}
