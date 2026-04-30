'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useCurrentAccount, useCurrentWallet, useDAppKit, useWalletConnection, useWallets } from '@mysten/dapp-kit-react';
import { Sidebar } from './Sidebar';
import { Menu, Wallet } from 'lucide-react';
import { HeaderWalletInfo } from './HeaderWalletInfo';
import { ClayCard } from '@/components/shared/ClayCard';
import {
  isWalletSessionValid,
  loadWalletSessionFromStorage,
  type WalletSession,
} from '@/lib/wallet-session';

interface MainLayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, activePath }) => {
  const [sidebarWidth, setSidebarWidth] = useState('280px');
  const [session, setSession] = useState<WalletSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dAppKit = useDAppKit();
  const account = useCurrentAccount();
  const currentWallet = useCurrentWallet();
  const walletConnection = useWalletConnection();
  const wallets = useWallets();

  useEffect(() => {
    const isCollapsed = localStorage.getItem('sui-portfolio:sidebar-collapsed') === 'true';
    setSidebarWidth(isCollapsed ? '88px' : '280px');

    const handleToggle = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSidebarWidth(detail.collapsed ? '88px' : '280px');
    };

    window.addEventListener('sidebar-toggle', handleToggle);
    return () => window.removeEventListener('sidebar-toggle', handleToggle);
  }, []);

  useEffect(() => {
    const syncSession = () => {
      setSession(loadWalletSessionFromStorage());
    };

    syncSession();
    window.addEventListener('storage', syncSession);
    window.addEventListener('wallet-session-updated', syncSession as EventListener);
    return () => {
      window.removeEventListener('storage', syncSession);
      window.removeEventListener('wallet-session-updated', syncSession as EventListener);
    };
  }, []);

  const hasConnectedWallet =
    walletConnection.status === 'connected' &&
    Boolean(account?.address) &&
    Boolean(currentWallet);

  const hasValidSession = useMemo(() => {
    if (!session) return false;
    return isWalletSessionValid(session);
  }, [session]);

  const sessionWalletMismatch = useMemo(() => {
    if (!hasValidSession || !hasConnectedWallet) return false;
    return session?.address !== account?.address;
  }, [hasValidSession, hasConnectedWallet, session?.address, account?.address]);

  const shouldBlockApp = !hasValidSession || sessionWalletMismatch;

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

      const preferredWallet = wallets.find((wallet) => wallet.accounts.length > 0) ?? firstWallet;
      await dAppKit.connectWallet({ wallet: preferredWallet });
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Failed to connect Sui wallet.');
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div
      className="layout-shell"
      style={{
        '--header-height': '72px',
        '--sidebar-width': sidebarWidth,
      } as React.CSSProperties}
    >
      <div className="layout-orb layout-orb-top" />
      <div className="layout-orb layout-orb-bottom" />

      <div
        className="desktop-only layout-sidebar-rail"
        style={{
          width: 'var(--sidebar-width)',
          flexShrink: 0,
          transition: 'width var(--transition-slow)',
        }}
      >
        <Sidebar activePath={activePath} />
      </div>

      <div className="layout-column">
        <header className="layout-header">
          <div className="layout-brand">
            <div className="mobile-only layout-brand-mark">
              <Wallet size={20} />
            </div>
            <div className="desktop-only layout-brand-copy" />
            <div className="mobile-only layout-brand-copy">
              <h2>memoraSui</h2>
              <span>PORTFOLIO</span>
            </div>
          </div>

          <div className="layout-actions">
            <HeaderWalletInfo />
            <button type="button" className="layout-menu-btn" aria-label="Open menu">
              <Menu size={20} />
            </button>
          </div>
        </header>

        <main
          className="layout-main"
          style={{
            filter: shouldBlockApp ? 'blur(2px)' : 'none',
            pointerEvents: shouldBlockApp ? 'none' : 'auto',
            userSelect: shouldBlockApp ? 'none' : 'auto',
          }}
        >
          <div className="desktop-only layout-breadcrumb">
            SUI PORTFOLIO / {activePath?.replace('/', '').toUpperCase() || 'DASHBOARD'}
          </div>
          <div className="layout-content">{children}</div>
        </main>

        {shouldBlockApp ? (
          <div className="layout-blocker">
            <ClayCard className="layout-blocker-card" padding="lg">
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
                    Dashboard access is locked until a verified wallet session exists and matches the current wallet flow.
                  </p>
                </div>

                {error ? (
                  <div style={{ padding: '12px 14px', borderRadius: '16px', backgroundColor: '#fff4f4', color: '#b42318' }}>
                    {error}
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    void handleConnectWallet();
                  }}
                  disabled={isConnecting}
                  style={{
                    border: 'none',
                    borderRadius: '18px',
                    padding: '14px 18px',
                    backgroundColor: 'var(--matcha-primary)',
                    color: 'white',
                    fontWeight: 700,
                    cursor: isConnecting ? 'wait' : 'pointer',
                    boxShadow: 'var(--shadow-outer)',
                  }}
                >
                  {isConnecting ? 'Connecting...' : 'Connect Sui Wallet'}
                </button>
              </div>
            </ClayCard>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .layout-shell {
          position: relative;
          display: flex;
          min-height: 100vh;
          overflow: hidden;
          background:
            radial-gradient(circle at top left, rgba(123, 174, 127, 0.12), transparent 32%),
            radial-gradient(circle at bottom right, rgba(94, 140, 97, 0.1), transparent 28%),
            linear-gradient(180deg, rgba(248, 251, 246, 0.96), rgba(244, 248, 242, 0.98));
          isolation: isolate;
        }

        .layout-orb {
          position: fixed;
          border-radius: 999px;
          pointer-events: none;
          z-index: 0;
          filter: blur(80px);
          opacity: 0.6;
        }

        .layout-orb-top {
          top: -6rem;
          right: -5rem;
          width: 18rem;
          height: 18rem;
          background: rgba(168, 195, 160, 0.22);
        }

        .layout-orb-bottom {
          left: -7rem;
          bottom: -5rem;
          width: 22rem;
          height: 22rem;
          background: rgba(123, 174, 127, 0.14);
        }

        .layout-column {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 1;
        }

        .layout-header {
          position: sticky;
          top: 0;
          height: var(--header-height);
          padding: 0 clamp(1rem, 2vw, 1.75rem);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          background: rgba(244, 248, 242, 0.76);
          backdrop-filter: blur(18px);
          border-bottom: 1px solid rgba(223, 231, 221, 0.82);
          box-shadow: 0 12px 30px rgba(63, 80, 63, 0.05);
          z-index: 100;
        }

        .layout-brand,
        .layout-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .layout-brand-mark {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--matcha-primary), var(--matcha-accent));
          color: white;
          box-shadow: var(--shadow-outer);
        }

        .layout-brand-copy h2 {
          font-size: 1.05rem;
          margin: 0;
          color: var(--matcha-accent);
          line-height: 1.1;
        }

        .layout-brand-copy span {
          display: block;
          margin-top: 2px;
          font-size: 0.72rem;
          color: var(--text-secondary);
          font-weight: 700;
          letter-spacing: 0.12em;
        }

        .layout-menu-btn {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.88);
          box-shadow: var(--shadow-outer);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--matcha-accent);
          transition:
            transform var(--transition-fast),
            box-shadow var(--transition-fast),
            background-color var(--transition-fast);
        }

        .layout-menu-btn:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-hover);
          background: white;
        }

        .layout-main {
          flex: 1;
          width: 100%;
          max-width: 1480px;
          margin: 0 auto;
          padding: clamp(1.25rem, 2.5vw, 2rem) clamp(1rem, 3vw, 2.75rem) clamp(2rem, 3vw, 3rem);
          position: relative;
          z-index: 1;
        }

        .layout-content {
          animation: main-enter 220ms ease-out both;
        }

        .layout-breadcrumb {
          margin-bottom: var(--spacing-md);
          color: var(--text-secondary);
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          opacity: 0.75;
        }

        .layout-blocker {
          position: fixed;
          inset: 0;
          z-index: 6000;
          display: grid;
          place-items: center;
          padding: 24px;
          background: rgba(29, 41, 25, 0.36);
          backdrop-filter: blur(10px);
          animation: blocker-appear 280ms ease-out both;
        }

        .layout-blocker-card {
          width: min(560px, 100%);
          border-radius: 32px;
          background: linear-gradient(180deg, rgba(246, 239, 224, 0.98) 0%, rgba(236, 226, 205, 0.96) 100%);
          box-shadow: 0 28px 60px rgba(55, 72, 46, 0.28);
        }

        @keyframes main-enter {
          from {
            opacity: 0;
            transform: translate3d(0, 0, 0);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes blocker-appear {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        @media (max-width: 768px) {
          .layout-header {
            height: 68px;
            padding: 0 1rem;
          }

          .layout-main {
            padding: 1rem 1rem 1.5rem;
          }
        }
      `}</style>
    </div>
  );
};
