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

  const shouldBlockApp = !hasConnectedWallet || !hasValidSession;

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
      <div style={{ 
        display: 'flex', 
        minHeight: '100vh', 
        backgroundColor: 'var(--matcha-bg)',
        '--header-height': '72px',
        '--sidebar-width': sidebarWidth
    } as React.CSSProperties}>
      {/* Desktop Sidebar Wrapper */}
      <div className="desktop-only" style={{ 
        width: 'var(--sidebar-width)', 
        flexShrink: 0,
        transition: 'width var(--transition-slow)'
      }}>
        <Sidebar activePath={activePath} />
      </div>
      
      {/* Main Container Column */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        minWidth: 0,
        position: 'relative',
        transition: 'margin var(--transition-slow)'
      }}>
        {/* Top Header - Sticky layout instead of fixed to prevent overlap */}
        <header style={{
          position: 'sticky',
          top: 0,
          height: 'var(--header-height)',
          backgroundColor: 'rgba(244, 248, 242, 0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--spacing-md)',
          zIndex: 100, /* Lower than sidebar but above content */
          width: '100%',
        }}>
          {/* Only show logo in header on mobile since it's already in the sidebar on desktop */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="mobile-only" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                width: '36px', 
                height: '36px', 
                backgroundColor: 'var(--matcha-primary)', 
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
              }}>
                <Wallet size={20} />
              </div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--matcha-accent)' }}>Matcha</h2>
            </div>
            
            {/* Context Title moved down to main content section */}
            <div className="desktop-only" /> 
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <HeaderWalletInfo />
            <button style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              backgroundColor: 'var(--white)',
              boxShadow: 'var(--shadow-outer)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--matcha-accent)'
            }}>
              <Menu size={20} />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="main-content" style={{
          flex: 1,
          padding: 'var(--spacing-lg) var(--spacing-xl)',
          maxWidth: '1440px', /* Increased slightly for better widescreen layout */
          width: '100%',
          margin: '0 auto',
          position: 'relative',
          filter: shouldBlockApp ? 'blur(2px)' : 'none',
          pointerEvents: shouldBlockApp ? 'none' : 'auto',
          userSelect: shouldBlockApp ? 'none' : 'auto',
        }}>
          {/* Context Breadcrumb moved from header */}
          <div className="desktop-only" style={{ 
            color: 'var(--text-secondary)', 
            fontSize: '0.875rem', 
            fontWeight: 600,
            marginBottom: 'var(--spacing-md)',
            opacity: 0.8
          }}>
            SUI PORTFOLIO / {activePath?.replace('/', '').toUpperCase() || 'DASHBOARD'}
          </div>
          {children}
        </main>

        {shouldBlockApp ? (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 6000,
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
                background: 'linear-gradient(180deg, rgba(246, 239, 224, 0.98) 0%, rgba(236, 226, 205, 0.96) 100%)',
                boxShadow: '0 28px 60px rgba(55, 72, 46, 0.28)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.8rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--matcha-primary)', fontWeight: 700 }}>
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
        .main-content {
          animation: fadeIn 0.4s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 768px) {
          .main-content {
            padding: var(--spacing-lg) var(--spacing-md) !important;
          }
        }
        
        :global(body) {
          overflow-x: hidden;
        }
      `}</style>
    </div>
  );
};
