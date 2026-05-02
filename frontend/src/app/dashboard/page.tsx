'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatCard } from '@/components/modules/dashboard/StatCard';
import { AssetList } from '@/components/modules/dashboard/AssetList';
import { WalletConnectGate } from '@/components/modules/dashboard/WalletConnectGate';
import { ClayCard } from '@/components/shared/ClayCard';
import { fetchApi, postApi, formatTokenAmount, formatUsd } from '@/lib/api-client';
import { loadWalletSessionFromStorage } from '@/lib/wallet-session';
import { 
  History, 
  Boxes, 
  BarChart3, 
  MessageSquare, 
  Zap, 
  Wallet, 
  ShieldCheck, 
  ChevronRight,
  Clock,
  RefreshCw
} from 'lucide-react';

type PortfolioSummary = {
  totalWalletValueUsd: number | null;
  topAssets: Array<{ 
    coinType: string; 
    balance: string; 
    amountHuman: number | null;
    symbol: string;
    decimals: number | null;
    valueUsd: number | null 
  }>;
  objectSummary: { totalObjects: number };
};

type ActivitySummary = {
  activeDays: number;
  incomingCount: number;
  outgoingCount: number;
};

type Snapshot = {
  generatedAt: string;
};

export default function DashboardPage() {
  const currentAccount = useCurrentAccount();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const walletAddress = currentAccount?.address ?? loadWalletSessionFromStorage()?.address ?? null;
  const networkName = (process.env.NEXT_PUBLIC_SUI_NETWORK as string) || 'mainnet';

  useEffect(() => {
    async function load() {
      if (!walletAddress) {
        setPortfolio(null);
        setActivity(null);
        setSnapshot(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const [portfolioData, activityData, snapshotData] = await Promise.all([
          fetchApi<PortfolioSummary>(`/analytics/wallets/${walletAddress}/portfolio`, { network: networkName }),
          fetchApi<ActivitySummary>(`/analytics/wallets/${walletAddress}/activity`, { network: networkName }),
          fetchApi<Snapshot>(`/analytics/wallets/${walletAddress}/snapshot`, { network: networkName }),
        ]);
        setPortfolio(portfolioData);
        setActivity(activityData);
        setSnapshot(snapshotData);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [walletAddress, networkName]);

  async function handleSync() {
    if (!walletAddress || syncing) return;
    setSyncing(true);
    setError(null);
    try {
      await postApi(`/sync/wallet-addresses/${walletAddress}`, {});
      // Reload dashboard data after sync
      const [portfolioData, activityData, snapshotData] = await Promise.all([
        fetchApi<PortfolioSummary>(`/analytics/wallets/${walletAddress}/portfolio`, { network: networkName }),
        fetchApi<ActivitySummary>(`/analytics/wallets/${walletAddress}/activity`, { network: networkName }),
        fetchApi<Snapshot>(`/analytics/wallets/${walletAddress}/snapshot`, { network: networkName }),
      ]);
      setPortfolio(portfolioData);
      setActivity(activityData);
      setSnapshot(snapshotData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  const topAssets = useMemo(
    () =>
      (portfolio?.topAssets ?? []).slice(0, 8).map((asset) => ({
        name: asset.symbol || asset.coinType.split('::').pop() || asset.coinType,
        amount: formatTokenAmount(asset.amountHuman, asset.decimals ?? 0, asset.symbol),
        valueUsd: formatUsd(asset.valueUsd),
      })),
    [portfolio],
  );

  return (
    <MainLayout activePath="/dashboard">
      <WalletConnectGate>
        <div className="dashboard-container page-shell fade-in-up" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', width: '100%' }}>
          <header className="dashboard-hero page-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-md)' }}>
            <div style={{ display: 'grid', gap: '12px' }}>
              <span className="page-kicker">Portfolio overview</span>
              <h1 style={{ fontSize: 'clamp(2.5rem, 4.2vw, 3.6rem)', marginBottom: 0, lineHeight: 1.02 }}>Good Morning!</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '52ch' }}>
                Your portfolio is looking healthy on <span style={{ color: 'var(--matcha-accent)', fontWeight: 700 }}>{networkName}</span>.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {snapshot?.generatedAt && (
                <div className="sync-badge">
                  <Clock size={14} />
                  <span>Synced {new Date(snapshot.generatedAt).toLocaleTimeString()}</span>
                </div>
              )}
              {walletAddress && (
                <button
                  onClick={() => void handleSync()}
                  disabled={syncing}
                  title="Re-sync wallet data from chain"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 16px', borderRadius: '12px', border: 'none', cursor: syncing ? 'not-allowed' : 'pointer',
                    background: 'var(--white)', boxShadow: 'var(--shadow-outer)',
                    color: 'var(--matcha-accent)', fontWeight: 600, fontSize: '0.82rem',
                    opacity: syncing ? 0.6 : 1, transition: 'var(--transition-fast)',
                  }}
                >
                  <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                  {syncing ? 'Syncing…' : 'Refresh'}
                </button>
              )}
            </div>
          </header>

          {error && (
            <ClayCard variant="flat" style={{ borderLeft: '4px solid #f56565', background: 'linear-gradient(180deg, #fff7f7 0%, #fff1f1 100%)' }}>
              <strong>Load Error:</strong> {error}
            </ClayCard>
          )}

          {/* Key Stats Section */}
          <section className="highlights-grid">
            <div className="highlight-card main-balance float-in">
              <ClayCard
                padding="md"
                style={{
                  height: '100%',
                  background: 'linear-gradient(135deg, var(--matcha-primary), var(--matcha-accent))',
                  color: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  boxShadow: '0 22px 60px rgba(66, 102, 66, 0.24)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div className="icon-circle mini" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}><Wallet size={20} /></div>
                  <ShieldCheck size={20} style={{ opacity: 0.68 }} />
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total Wallet Value</div>
                <div style={{ fontSize: 'clamp(2rem, 3vw, 2.75rem)', fontWeight: 800, margin: '8px 0 6px', lineHeight: 1 }}>{loading ? '...' : formatUsd(portfolio?.totalWalletValueUsd)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <span style={{ padding: '4px 8px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '999px' }}>+2.4%</span>
                  <span style={{ opacity: 0.82 }}>Past 24h</span>
                </div>
              </ClayCard>
            </div>

            <div className="stats-subgrid">
              <StatCard 
                 label="Transactions" 
                 value={loading ? '...' : String((activity?.incomingCount ?? 0) + (activity?.outgoingCount ?? 0))} 
                 trend={activity?.activeDays ? `${activity.activeDays} Days` : undefined}
              />
              <StatCard 
                 label="Assets" 
                 value={loading ? '...' : String(portfolio?.topAssets?.length ?? 0)} 
                 trend="Found"
              />
            </div>
          </section>

          <section className="main-content-grid">
            {/* Left Content: Assets List */}
            <div className="assets-overview">
              <ClayCard padding="lg" className="section-surface">
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <span className="page-kicker">Portfolio detail</span>
                    <h3 style={{ fontSize: '1.4rem', margin: 0 }}>Your Top Assets</h3>
                  </div>
                  <Link href="/assets" className="view-all-link">
                    View All <ChevronRight size={16} />
                  </Link>
                </header>
                {loading ? (
                  <div className="loading-shimmer" style={{ height: '300px' }} />
                ) : (
                  <AssetList assets={topAssets} />
                )}
              </ClayCard>
            </div>

            {/* Right Content: Quick Actions & Snapshot */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
              <ClayCard padding="lg" className="section-surface">
                <div style={{ display: 'grid', gap: '4px', marginBottom: '20px' }}>
                  <span className="page-kicker">Quick actions</span>
                  <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Quick Navigation</h3>
                </div>
                  <div className="action-grid">
                    <Link href="/activity" className="action-tile">
                      <div className="tile-icon"><History size={20} /></div>
                      <span>Activity</span>
                    </Link>
                    <Link href="/assets" className="action-tile">
                      <div className="tile-icon"><Boxes size={20} /></div>
                      <span>Assets</span>
                    </Link>
                    <Link href="/analytics" className="action-tile">
                      <div className="tile-icon"><BarChart3 size={20} /></div>
                      <span>Analytics</span>
                    </Link>
                    <Link href="/chat" className="action-tile">
                      <div className="tile-icon pulse"><MessageSquare size={20} /></div>
                      <span>AI Chat</span>
                    </Link>
                  </div>
              </ClayCard>

              <ClayCard variant="flat" padding="md" style={{ border: '1px dashed rgba(223, 231, 221, 0.95)', display: 'flex', alignItems: 'center', gap: '16px', background: 'linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(238,243,236,0.9) 100%)' }}>
                <div className="icon-circle small"><Zap size={18} /></div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Smart Summary</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>You had {activity?.incomingCount} deposits this week!</div>
                </div>
              </ClayCard>
            </div>
          </section>
        </div>
      </WalletConnectGate>

      <style jsx>{`
        .highlights-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-sm);
          align-items: stretch;
        }

        .stats-subgrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--spacing-md);
        }

        .main-content-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);
          gap: var(--spacing-md);
          align-items: start;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .sync-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.86);
          padding: 8px 16px;
          border-radius: 99px;
          box-shadow: var(--shadow-soft);
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
          border: 1px solid rgba(223, 231, 221, 0.9);
        }

        .icon-circle {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .icon-circle.mini {
          width: 36px;
          height: 36px;
          border-radius: 10px;
        }
        .icon-circle.small {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background-color: var(--matcha-highlight);
          color: var(--matcha-accent);
        }

        .view-all-link {
          display: flex;
          align-items: center;
          gap: 4px;
          color: var(--matcha-accent);
          font-weight: 700;
          font-size: 0.9rem;
        }
        .view-all-link:hover {
          text-decoration: underline;
        }

        .section-surface {
          backdrop-filter: blur(10px);
        }

        .action-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .action-tile {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 20px;
          background: rgba(244, 248, 242, 0.85);
          border-radius: 20px;
          border: 1px solid rgba(223, 231, 221, 0.85);
          transition:
            transform var(--transition-fast),
            box-shadow var(--transition-fast),
            border-color var(--transition-fast),
            background-color var(--transition-fast);
          font-weight: 600;
          color: var(--text-primary);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.65);
        }
        .action-tile:hover {
          background-color: rgba(255,255,255,0.95);
          border-color: var(--matcha-primary);
          box-shadow: var(--shadow-outer);
          transform: translateY(-3px);
        }
        .tile-icon {
          color: var(--matcha-accent);
        }

        .pulse {
          animation: pulse-ring 2s infinite;
        }

        @keyframes pulse-ring {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }

        .loading-shimmer {
          background: linear-gradient(90deg, var(--matcha-bg) 25%, var(--matcha-highlight) 50%, var(--matcha-bg) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
          border-radius: 16px;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        @media (max-width: 1024px) {
          .highlights-grid, .main-content-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 768px) {
          .dashboard-container {
            gap: var(--spacing-md) !important;
          }

          .action-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </MainLayout>
  );
}
