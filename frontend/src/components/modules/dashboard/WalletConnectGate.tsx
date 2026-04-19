'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useDAppKit, useWalletConnection, useWallets } from '@mysten/dapp-kit-react';
import { ClayButton } from '@/components/shared/ClayButton';
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
  error,
  isConnecting,
  onConnect,
  walletCount,
  mounted,
}: {
  error: string | null;
  isConnecting: boolean;
  onConnect: () => void;
  walletCount: number;
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
              Dashboard access is locked until a verified wallet session exists in localStorage and
              matches the current authenticated wallet flow.
            </p>
          </div>

          <div
            style={{
              padding: '14px 16px',
              borderRadius: '20px',
              backgroundColor: 'var(--matcha-highlight)',
              color: 'var(--matcha-accent)',
              fontSize: '0.95rem',
              lineHeight: 1.5,
            }}
          >
            {!mounted
              ? 'Checking for Sui wallet extension...'
              : walletCount > 0
              ? 'A compatible Sui wallet extension was detected. Connect it to continue.'
              : 'No Sui wallet extension is detected in this browser. Install one, then refresh.'}
          </div>

          {error ? (
            <div
              role="alert"
              style={{
                padding: '12px 14px',
                borderRadius: '16px',
                backgroundColor: '#FDE8E4',
                color: '#8C2F1F',
                fontSize: '0.95rem',
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <ClayButton
              variant="primary"
              size="md"
              onClick={onConnect}
              disabled={!mounted || isConnecting || walletCount === 0}
            >
              {isConnecting ? 'Connecting...' : 'Connect Sui Wallet'}
            </ClayButton>
          </div>
        </div>
      </ClayCard>
    </div>
  );
}

export function WalletConnectGate({ children }: WalletConnectGateProps) {
  const [walletState, setWalletState] = useState<WalletSessionState>({ status: 'loading' });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const walletConnection = useWalletConnection();
  const wallets = useWallets();

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

  const shouldBlockDashboard = !hasConnectedWallet && walletState.status !== 'valid';

  const blockedContentStyle = useMemo<React.CSSProperties>(
    () => ({
      filter: shouldBlockDashboard ? 'blur(3px)' : 'none',
      pointerEvents: shouldBlockDashboard ? 'none' : 'auto',
      userSelect: shouldBlockDashboard ? 'none' : 'auto',
    }),
    [shouldBlockDashboard],
  );

  async function handleConnectWallet() {
    setError(null);

    if (wallets.length === 0) {
      setError('No Sui wallet extension is available in this browser.');
      return;
    }

    setIsConnecting(true);
    try {
      const firstWallet = wallets[0];
      if (!firstWallet) {
        setError('No Sui wallet extension is available in this browser.');
        return;
      }

      if (wallets.length === 1) {
        await dAppKit.connectWallet({ wallet: firstWallet });
        return;
      }

      const preferredWallet = wallets.find((wallet) => wallet.accounts.length > 0) ?? firstWallet;
      await dAppKit.connectWallet({ wallet: preferredWallet });
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Failed to connect Sui wallet.');
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <>
      <div aria-hidden={shouldBlockDashboard} style={blockedContentStyle}>
        {children}
      </div>

      {shouldBlockDashboard ? (
        <ConnectWalletModal
          error={error}
          isConnecting={isConnecting}
          onConnect={() => {
            void handleConnectWallet();
          }}
          walletCount={wallets.length}
          mounted={mounted}
        />
      ) : null}
    </>
  );
}
