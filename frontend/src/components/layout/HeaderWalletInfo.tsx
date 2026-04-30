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
import { fetchApi, formatUsd } from '@/lib/api-client';
import { LogOut, TrendingUp } from 'lucide-react';

type HeaderBalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; value: string }
  | { status: 'error'; message: string };


export function HeaderWalletInfo() {
  const currentClient = useCurrentClient();
  const currentAccount = useCurrentAccount();
  const walletConnection = useWalletConnection();
  const wallets = useWallets();

  const { session, handleConnect, handleDisconnect, isBusy } = useWalletAuth({
    appName: 'memoraSui Portfolio',
    apiBaseUrl: '/api/backend',
  });

  const [balanceState, setBalanceState] = useState<HeaderBalanceState>({ status: 'idle' });
  const [suiPrice, setSuiPrice] = useState<number | null>(null);

  const resolvedAddress = currentAccount?.address ?? session?.address;

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
  
  useEffect(() => {
    let isCancelled = false;
    
    const fetchPrice = async () => {
      try {
        const data = await fetchApi<{ priceUsd: number | null }>('/pricing/price', { symbol: 'SUI' });
        if (!isCancelled) {
          setSuiPrice(data.priceUsd);
        }
      } catch (err) {
        console.error('Failed to fetch SUI price:', err);
      }
    };
    
    void fetchPrice();
    const interval = setInterval(fetchPrice, 60000); // Update every minute
    
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  const balanceText = useMemo(() => {
    if (balanceState.status === 'loading') return 'Loading...';
    if (balanceState.status === 'loaded') return `${balanceState.value} SUI`;
    if (balanceState.status === 'error') return balanceState.message;
    return '--';
  }, [balanceState]);

  return (
    <div className="wallet-info-wrap">
      <div className="wallet-chip-row">
        <div className="wallet-chip">
          <span className="wallet-chip-label">Network</span>
          <strong>Testnet</strong>
        </div>

        <div className="wallet-chip wallet-chip--address">
          <span className="wallet-chip-label">Address</span>
          <strong>{formatWalletAddress(resolvedAddress)}</strong>
        </div>

        <div className="wallet-chip">
          <span className="wallet-chip-label">SUI Price</span>
          <strong style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingUp size={14} className="price-icon" />
            {formatUsd(suiPrice)}
          </strong>
        </div>

        <div className="wallet-chip">
          <span className="wallet-chip-label">Balance</span>
          <strong>{balanceText}</strong>
        </div>
      </div>

      <div className="wallet-action">
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
      </div>

      <style jsx>{`
        .wallet-info-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .wallet-chip-row {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex-wrap: wrap;
        }

        .wallet-action {
          display: flex;
          align-items: center;
        }

        .price-icon {
          color: #10b981;
        }

        .disconnect-btn {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.92);
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
          background: rgba(255, 255, 255, 0.84);
          border: 1px solid rgba(223, 231, 221, 0.84);
          box-shadow: var(--shadow-soft);
          backdrop-filter: blur(10px);
          color: var(--matcha-accent);
          max-width: 220px;
          transition: transform var(--transition-fast), box-shadow var(--transition-fast), background-color var(--transition-fast);
        }

        .wallet-chip:hover {
          transform: translateY(-1px);
          box-shadow: var(--shadow-outer);
          background: rgba(255, 255, 255, 0.94);
        }

        .wallet-chip--address {
          max-width: 260px;
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
          .wallet-chip-row .wallet-chip:nth-child(3) {
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

          .wallet-chip--address {
            display: none;
          }
        }

        @media (max-width: 768px) {
          .wallet-chip {
            min-height: 34px;
            padding: 5px 12px;
            border-radius: 12px;
            max-width: 100%;
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
