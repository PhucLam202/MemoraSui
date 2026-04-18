'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ClayCard } from '@/components/shared/ClayCard';
import { fetchApi, formatUsd } from '@/lib/api-client';
import { loadWalletSessionFromStorage } from '@/lib/wallet-session';
import { Search, Info, Box, Coins, ArrowUpRight } from 'lucide-react';

type PaginationResult<T> = { items: T[] };

type BalanceItem = {
  coinType?: string;
  balance?: string;
  valueUsd?: number | null;
};

type ObjectItem = {
  objectId?: string;
  type?: string;
  state?: string;
  owner?: string;
  latestVersion?: string | number;
  display?: {
    name?: string;
    description?: string;
    image_url?: string;
  };
};

export default function AssetsPage() {
  const session = loadWalletSessionFromStorage();
  const walletAddress = session?.address ?? null;
  const networkName = 'testnet';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<BalanceItem[]>([]);
  const [objects, setObjects] = useState<ObjectItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function load() {
      if (!walletAddress) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [balanceResult, objectResult] = await Promise.all([
          fetchApi<PaginationResult<BalanceItem>>(`/data/wallets/${walletAddress}/balances`, { network: networkName, page: 1, limit: 50 }),
          fetchApi<PaginationResult<ObjectItem>>(`/data/wallets/${walletAddress}/objects`, { network: networkName, page: 1, limit: 50 }),
        ]);
        setBalances(balanceResult.items ?? []);
        setObjects(objectResult.items ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load assets/objects.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [walletAddress, networkName]);

  const filteredObjects = useMemo(() => {
    return objects.filter(obj => 
      (obj.display?.name || obj.type || obj.objectId || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [objects, searchQuery]);

  const totalValue = useMemo(() => {
    return balances.reduce((sum, b) => sum + (b.valueUsd ?? 0), 0);
  }, [balances]);

  return (
    <MainLayout activePath="/assets">
      <div className="assets-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '4px', letterSpacing: '-0.02em' }}>Assets & Objects</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Manage your tokens and SUI objects in one place.</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
            <div className="search-wrapper" style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input 
                type="text" 
                placeholder="Search assets..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="clay-input"
                style={{ paddingLeft: '48px', width: '300px' }}
              />
            </div>
          </div>
        </header>

        {error && (
          <ClayCard variant="flat" style={{ backgroundColor: '#fff5f5', borderColor: '#feb2b2', color: '#c53030' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Info size={20} />
              <span>{error}</span>
            </div>
          </ClayCard>
        )}

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-md)' }}>
          <ClayCard variant="raised" padding="md" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '12px', backgroundColor: 'var(--matcha-highlight)', borderRadius: '16px', color: 'var(--matcha-accent)' }}>
              <Coins size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Balance</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{formatUsd(totalValue)}</div>
            </div>
          </ClayCard>
          <ClayCard variant="raised" padding="md" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '12px', backgroundColor: 'var(--matcha-highlight)', borderRadius: '16px', color: 'var(--matcha-accent)' }}>
              <Box size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Objects</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{loading ? '...' : objects.length}</div>
            </div>
          </ClayCard>
        </div>

        <section className="grid-layout">
          {/* Left Column: Balances */}
          <div className="balances-section">
            <ClayCard title="Coin Balances" padding="lg">
              <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Coins size={20} className="matcha-accent" /> 
                Coin Balances
              </h3>
              {loading ? (
                <div className="skeleton-list">
                  {[1, 2, 3].map(i => <div key={i} className="skeleton-item" />)}
                </div>
              ) : balances.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                  <p>No balances found.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {balances.map((item, index) => (
                    <div key={`${item.coinType ?? 'coin'}-${index}`} className="balance-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div className="coin-icon">
                          {item.coinType?.split('::').pop()?.charAt(0) || 'S'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{item.coinType?.split('::').pop() ?? 'Unknown'}</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.coinType?.split('::')[1] || 'Sui'}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600 }}>{item.balance || '0'}</div>
                        <div style={{ color: 'var(--matcha-accent)', fontSize: '0.85rem', fontWeight: 600 }}>{formatUsd(item.valueUsd ?? null)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ClayCard>
          </div>

          {/* Right Column: Objects Grid */}
          <div className="objects-section">
            <header style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Box size={20} /> 
                Objects & NFTs
              </h3>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{filteredObjects.length} Results</span>
            </header>

            {loading ? (
              <div className="objects-grid">
                {[1, 2, 4, 5, 6].map(i => <div key={i} className="skeleton-card" />)}
              </div>
            ) : filteredObjects.length === 0 ? (
              <ClayCard variant="flat" style={{ textAlign: 'center', padding: '60px' }}>
                <Box size={48} style={{ color: 'var(--border-color)', marginBottom: '16px' }} />
                <p style={{ color: 'var(--text-secondary)' }}>No objects matching your search found.</p>
              </ClayCard>
            ) : (
              <div className="objects-grid">
                {filteredObjects.map((item, index) => (
                  <div key={`${item.objectId ?? 'object'}-${index}`} className="object-card-wrapper">
                    <ClayCard padding="none" className="object-card">
                      <div className="object-media">
                        {item.display?.image_url ? (
                          <img src={item.display.image_url} alt={item.display.name} />
                        ) : (
                          <div className="object-placeholder">
                            <Box size={32} />
                          </div>
                        )}
                        <div className="object-badge">{item.type?.split('::').pop()}</div>
                      </div>
                      <div className="object-content" style={{ padding: '16px' }}>
                        <h4 style={{ fontSize: '1rem', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.display?.name || item.type?.split('::').pop() || 'Untitled Object'}
                        </h4>
                        <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                          {item.objectId?.slice(0, 10)}...{item.objectId?.slice(-6)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="version-pill">v{item.latestVersion || '1'}</span>
                          <button className="view-btn"><ArrowUpRight size={14} /></button>
                        </div>
                      </div>
                    </ClayCard>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <style jsx>{`
        .grid-layout {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: var(--spacing-lg);
        }

        .balance-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background-color: var(--white);
          border-radius: 18px;
          transition: var(--transition-fast);
          border: 1px solid transparent;
        }
        .balance-row:hover {
          transform: translateX(4px);
          border-color: var(--matcha-primary);
          box-shadow: var(--shadow-outer);
        }

        .coin-icon {
          width: 42px;
          height: 42px;
          background: linear-gradient(135deg, var(--matcha-primary), var(--matcha-accent));
          color: white;
          border-radius: 12px;
          display: flex;
          alignItems: center;
          justify-content: center;
          font-weight: 700;
          font-size: 1.2rem;
        }

        .objects-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: var(--spacing-md);
        }

        .object-card {
           overflow: hidden;
           cursor: pointer;
           transition: var(--transition-slow);
        }
        .object-card:hover {
          transform: translateY(-8px);
          box-shadow: var(--shadow-hover);
        }

        .object-media {
          height: 160px;
          background-color: var(--matcha-bg);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .object-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .object-placeholder {
          color: var(--matcha-secondary);
        }
        .object-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(4px);
          padding: 4px 10px;
          border-radius: 10px;
          font-size: 0.7rem;
          font-weight: 700;
          color: var(--matcha-accent);
          text-transform: uppercase;
        }

        .version-pill {
          background-color: var(--matcha-highlight);
          color: var(--matcha-accent);
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .view-btn {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background-color: var(--white);
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          transition: var(--transition-fast);
        }
        .view-btn:hover {
          background-color: var(--matcha-primary);
          color: white;
          border-color: var(--matcha-primary);
        }

        .skeleton-list { display: flex; flexDirection: column; gap: 12px; }
        .skeleton-item { height: 66px; background: var(--matcha-bg); border-radius: 18px; animation: pulse 1.5s infinite; }
        .skeleton-card { height: 260px; background: var(--matcha-bg); border-radius: var(--radius-card); animation: pulse 1.5s infinite; }

        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }

        @media (max-width: 1200px) {
          .grid-layout { grid-template-columns: 1fr; }
        }
      `}</style>
    </MainLayout>
  );
}
