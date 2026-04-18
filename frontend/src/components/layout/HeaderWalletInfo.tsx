'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  useCurrentAccount,
  useCurrentClient,
  useWalletConnection,
  useWallets,
} from '@mysten/dapp-kit-react';
import { ClayButton } from '@/components/shared/ClayButton';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import {
  formatSuiBalanceFromMist,
  formatWalletAddress,
} from '@/lib/wallet-format';
import { LogOut } from 'lucide-react';

type HeaderBalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; value: string }
  | { status: 'error'; message: string };

function toStatusLabel(status: string | null | undefined, isVerified: boolean): string {
  if (!status || status === 'disconnected') {
    return 'Wallet not connected';
  }

  if (status === 'connected') {
    return isVerified ? 'Verified Session' : 'Wallet connected';
  }
  if (status === 'connecting') {
    return 'Connecting wallet';
  }

  return `Wallet ${status}`;
}

export function HeaderWalletInfo() {
  const currentClient = useCurrentClient();
  const currentAccount = useCurrentAccount();
  const walletConnection = useWalletConnection();
  const wallets = useWallets();

  const { session, handleConnect, handleDisconnect, isBusy } = useWalletAuth({
    appName: 'Matcha Portfolio',
    apiBaseUrl: '/api/backend',
  });

  const [balanceState, setBalanceState] = useState<HeaderBalanceState>({ status: 'idle' });

  const resolvedAddress = currentAccount?.address ?? session?.address;
  const isVerified = session?.status === 'verified';
  const statusLabel = toStatusLabel(walletConnection.status, isVerified);

  useEffect(() => {
    if (!currentClient || !currentAccount?.address) {
      setBalanceState({ status: 'idle' });
      return;
    }

    let isCancelled = false;
    setBalanceState({ status: 'loading' });

    currentClient
      .getBalance({ owner: currentAccount.address })
      .then((response) => {
        if (isCancelled) return;
        setBalanceState({
          status: 'loaded',
          value: formatSuiBalanceFromMist(response.balance?.balance),
        });
      })
      .catch(() => {
        if (isCancelled) return;
        setBalanceState({ status: 'error', message: 'Balance unavailable' });
      });

    return () => {
      isCancelled = true;
    };
  }, [currentClient, currentAccount?.address]);

  const balanceText = useMemo(() => {
    if (balanceState.status === 'loading') return 'Loading...';
    if (balanceState.status === 'loaded') return `${balanceState.value} SUI`;
    if (balanceState.status === 'error') return balanceState.message;
    return '--';
  }, [balanceState]);

  return (
    <div className="wallet-info-wrap">

      <div className="wallet-chip">
        <span className="wallet-chip-label">Network</span>
        <strong>Testnet</strong>
      </div>

      <div className="wallet-chip">
        <span className="wallet-chip-label">Address</span>
        <strong>{formatWalletAddress(resolvedAddress)}</strong>
      </div>

      <div className="wallet-chip">
        <span className="wallet-chip-label">Balance</span>
        <strong>{balanceText}</strong>
      </div>

      {walletConnection.status !== 'connected' ? (
        <ClayButton
          size="sm"
          onClick={() => {
            const primary = wallets.find(w => w.accounts.length > 0) || wallets[0];
            if (primary) handleConnect(primary.name);
          }}
          disabled={wallets.length === 0 || isBusy}
          style={{ whiteSpace: 'nowrap' }}
        >
          {isBusy ? 'Connecting...' : 'Connect Wallet'}
        </ClayButton>
      ) : (
        <button 
          onClick={() => handleDisconnect()}
          className="disconnect-btn"
          title="Disconnect Wallet"
        >
          <LogOut size={18} />
        </button>
      )}

      <style jsx>{`
        .wallet-info-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .disconnect-btn {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--white);
          box-shadow: var(--shadow-outer);
          color: #ff6b6b;
          transition: var(--transition-fast);
          margin-left: 4px;
          border: none;
          cursor: pointer;
        }
        .disconnect-btn:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-hover);
          background: #fff5f5;
        }
        .disconnect-btn:active {
          transform: translateY(0);
          box-shadow: var(--shadow-inner);
        }

        .wallet-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 38px;
          padding: 6px 14px;
          border-radius: 14px;
          background: var(--white);
          box-shadow: var(--shadow-outer);
          color: var(--matcha-accent);
          max-width: 220px;
        }


        .wallet-chip-label {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-secondary);
          font-weight: 700;
          flex-shrink: 0;
        }

        .wallet-chip strong {
          font-size: 0.84rem;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .network-select {
          border: none;
          background: transparent;
          color: var(--matcha-accent);
          font-weight: 700;
          font-size: 0.84rem;
          line-height: 1.2;
          outline: none;
          cursor: pointer;
          max-width: 120px;
        }

        .network-select:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 1200px) {
          .wallet-chip:nth-child(3) {
            display: none;
          }
        }

        @media (max-width: 960px) {
          .wallet-info-wrap {
            justify-content: flex-start;
          }

          .wallet-chip {
            max-width: none;
          }

          .wallet-chip:nth-child(2) {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .wallet-chip {
            min-height: 34px;
            padding: 5px 12px;
            border-radius: 12px;
          }

          .wallet-chip-label {
            font-size: 0.66rem;
          }

          .wallet-chip strong {
            font-size: 0.78rem;
          }
        }
      `}</style>
    </div>
  );
}
