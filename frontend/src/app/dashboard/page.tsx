'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatCard } from '@/components/modules/dashboard/StatCard';
import { AssetList } from '@/components/modules/dashboard/AssetList';
import { WalletConnectGate } from '@/components/modules/dashboard/WalletConnectGate';
import { ClayCard } from '@/components/shared/ClayCard';
import { fetchApi, formatSui, formatTokenAmount, formatUsd } from '@/lib/api-client';
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
  TrendingUp,
  Clock
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [activity, setActivity] = useState<ActivitySummary | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const walletAddress = loadWalletSessionFromStorage()?.address ?? null;
  const networkName = 'testnet';

  useEffect(() => {
    async function load() {
      if (!walletAddress) {
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
        <div className="dashboard-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', width: '100%' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--spacing-md)' }}>
            <div>
              <h1 style={{ fontSize: '3rem', marginBottom: '12px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Good Morning!</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.15rem' }}>
                Your portfolio is looking healthy on <span style={{ color: 'var(--matcha-accent)', fontWeight: 700 }}>{networkName}</span>.
              </p>
            </div>
            {snapshot?.generatedAt && (
               <div className="sync-badge">
                 <Clock size={14} /> 
                 <span>Synced {new Date(snapshot.generatedAt).toLocaleTimeString()}</span>
               </div>
            )}
          </header>

          {error && (
            <ClayCard variant="flat" style={{ borderLeft: '4px solid #f56565', backgroundColor: '#fff5f5' }}>
              <strong>Load Error:</strong> {error}
            </ClayCard>
          )}

          {/* Key Stats Section */}
          <section className="highlights-grid">
            <div className="highlight-card main-balance">
               <ClayCard padding="md" style={{ height: '100%', background: 'linear-gradient(135deg, var(--matcha-primary), var(--matcha-accent))', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div className="icon-circle mini" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}><Wallet size={20} /></div>
                    <ShieldCheck size={20} style={{ opacity: 0.6 }} />
                  </div>
                  <div style={{ fontSize: '0.85rem', opacity: 0.9, fontWeight: 600 }}>Total Wallet Value</div>
                  <div style={{ fontSize: '2.4rem', fontWeight: 700, margin: '4px 0' }}>{loading ? '...' : formatUsd(portfolio?.totalWalletValueUsd)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <span style={{ padding: '2px 6px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '6px' }}>+2.4%</span>
                    <span style={{ opacity: 0.8 }}>Past 24h</span>
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
              <ClayCard padding="lg">
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.4rem' }}>Your Top Assets</h3>
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
               <ClayCard padding="lg">
                  <h3 style={{ marginBottom: '20px', fontSize: '1.2rem' }}>Quick Navigation</h3>
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

               <ClayCard variant="flat" padding="md" style={{ border: '2px dashed var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
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
        }

        .sync-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background-color: var(--white);
          padding: 8px 16px;
          border-radius: 99px;
          box-shadow: var(--shadow-outer);
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
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
          background-color: var(--matcha-bg);
          border-radius: 20px;
          border: 1px solid transparent;
          transition: all 0.3s ease;
          font-weight: 600;
          color: var(--text-primary);
        }
        .action-tile:hover {
          background-color: var(--white);
          border-color: var(--matcha-primary);
          box-shadow: var(--shadow-outer);
          transform: translateY(-4px);
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
          animation: shimmer 1.5s infinite;
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
      `}</style>
    </MainLayout>
  );
}
