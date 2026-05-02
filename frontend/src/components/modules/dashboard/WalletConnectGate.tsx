'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useWalletConnection } from '@mysten/dapp-kit-react';
import dynamic from 'next/dynamic';
const ConnectButton = dynamic(
  () => import('@mysten/dapp-kit-react/ui').then((m) => ({ default: m.ConnectButton })),
  { ssr: false },
);
import { ClayCard } from '@/components/shared/ClayCard';
import {
  isWalletSessionValid,
  loadWalletSessionFromStorage,
  type WalletSession,
  type WalletSessionState,
} from '@/lib/wallet-session';

interface WalletConnectGateProps {
  children: React.ReactNode;
}

function ConnectWalletModal({
  mounted,
}: {
  mounted: boolean;
}) {
  return (
    <div
      aria-modal="true"
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: 'rgba(29, 41, 25, 0.42)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <ClayCard
        style={{
          width: 'min(560px, 100%)',
          borderRadius: '28px',
          background:
            'linear-gradient(180deg, rgba(246, 239, 224, 0.98) 0%, rgba(236, 226, 205, 0.96) 100%)',
          boxShadow: '0 28px 60px rgba(55, 72, 46, 0.28)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '0.8rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--matcha-primary)',
                fontWeight: 700,
              }}
            >
              Wallet required
            </p>
            <h2 style={{ margin: '8px 0 0', fontFamily: 'var(--font-heading)', fontSize: '1.8rem' }}>
              Connect your Sui wallet
            </h2>
            <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Choose your wallet below to access the dashboard.
            </p>
          </div>

          {!mounted ? (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '20px',
                backgroundColor: 'var(--matcha-highlight)',
                color: 'var(--matcha-accent)',
                fontSize: '0.95rem',
              }}
            >
              Checking for Sui wallet extensions…
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <ConnectButton />
            </div>
          )}
        </div>
      </ClayCard>
    </div>
  );
}

export function WalletConnectGate({ children }: WalletConnectGateProps) {
  const [walletState, setWalletState] = useState<WalletSessionState>({ status: 'loading' });
  const [mounted, setMounted] = useState(false);

  const account = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const walletConnection = useWalletConnection();

  useEffect(() => {
    setMounted(true);
    const evaluateWallet = () => {
      const session = loadWalletSessionFromStorage();
      const hasConnectedWallet =
        walletConnection.status === 'connected' &&
        Boolean(account?.address) &&
        Boolean(currentWallet);

      if (hasConnectedWallet && session) {
        setWalletState({ status: 'valid', session });
        return;
      }

      if (!session) {
        setWalletState({ status: 'missing', reason: 'no-session' });
        return;
      }

      if (!isWalletSessionValid(session)) {
        const sessionStatus = (session as WalletSession | null)?.status;
        setWalletState({
          status: 'missing',
          reason: sessionStatus === 'verified' ? 'expired-session' : 'invalid-session',
        });
        return;
      }

      // Require wallet to actually be connected — a stale localStorage session alone is not enough.
      if (!hasConnectedWallet) {
        setWalletState({ status: 'missing', reason: 'no-session' });
        return;
      }

      setWalletState({ status: 'valid', session });
    };

    evaluateWallet();

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== 'sui-portfolio:wallet-session') {
        return;
      }

      evaluateWallet();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('wallet-session-updated', evaluateWallet as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('wallet-session-updated', evaluateWallet as EventListener);
    };
  }, [account?.address, currentWallet, walletConnection.status]);

  const hasConnectedWallet =
    walletConnection.status === 'connected' &&
    Boolean(account?.address) &&
    Boolean(currentWallet);

  const sessionWalletMismatch = useMemo(() => {
    if (walletState.status !== 'valid' || !hasConnectedWallet) return false;
    return walletState.session.address !== account?.address;
  }, [walletState, hasConnectedWallet, account?.address]);

  const shouldBlockDashboard = walletState.status !== 'valid' || sessionWalletMismatch;

  const blockedContentStyle = useMemo<React.CSSProperties>(
    () => ({
      filter: shouldBlockDashboard ? 'blur(3px)' : 'none',
      pointerEvents: shouldBlockDashboard ? 'none' : 'auto',
      userSelect: shouldBlockDashboard ? 'none' : 'auto',
    }),
    [shouldBlockDashboard],
  );

  return (
    <>
      <div aria-hidden={shouldBlockDashboard} style={blockedContentStyle}>
        {children}
      </div>

      {shouldBlockDashboard ? (
        <ConnectWalletModal mounted={mounted} />
      ) : null}
    </>
  );
}
