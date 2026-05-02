'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ClayCard } from '@/components/shared/ClayCard';
import { fetchApi, formatTokenAmount, formatUsd } from '@/lib/api-client';
import { loadWalletSessionFromStorage } from '@/lib/wallet-session';
import { Search, Info, Box, Coins, ArrowUpRight } from 'lucide-react';

type PaginationResult<T> = { items: T[] };

type WalletPortfolioAssetSummary = {
  coinType: string;
  balance: string;
  amountHuman: number | null;
  symbol: string;
  name: string;
  decimals: number | null;
  valueUsd: number | null;
  priceUsd: number | null;
  isNative: boolean;
};

type WalletPortfolioSummary = {
  totalWalletValueUsd: number | null;
  holdingCount: number;
  holdings: WalletPortfolioAssetSummary[];
  objectSummary: {
    totalObjects: number;
  };
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
    imageUrl?: string;
    url?: string;
  };
};

function compareAssetValue(left: WalletPortfolioAssetSummary, right: WalletPortfolioAssetSummary) {
  const leftValue = Number(left.valueUsd ?? -1);
  const rightValue = Number(right.valueUsd ?? -1);
  if (rightValue !== leftValue) {
    return rightValue - leftValue;
  }

  const leftAmount = Number(left.amountHuman ?? 0);
  const rightAmount = Number(right.amountHuman ?? 0);
  return rightAmount - leftAmount;
}

function getObjectImageUrl(item: ObjectItem) {
  const display = item.display as Record<string, unknown> | undefined;
  const imageUrl =
    item.display?.image_url ??
    item.display?.imageUrl ??
    item.display?.url ??
    (display ? String(display.image_url ?? display.imageUrl ?? display.url ?? '') : '');
  return imageUrl.trim() || null;
}

export default function AssetsPage() {
  const currentAccount = useCurrentAccount();
  const walletAddress = currentAccount?.address ?? loadWalletSessionFromStorage()?.address ?? null;
  const networkName = (process.env.NEXT_PUBLIC_SUI_NETWORK as string) || 'mainnet';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<WalletPortfolioSummary | null>(null);
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
        const [portfolioResult, objectResult] = await Promise.all([
          fetchApi<WalletPortfolioSummary>(`/analytics/wallets/${walletAddress}/portfolio`, { network: networkName }),
          fetchApi<PaginationResult<ObjectItem>>(`/data/wallets/${walletAddress}/objects`, { network: networkName, page: 1, limit: 50 }),
        ]);
        setPortfolio(portfolioResult);
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

  const filteredHoldings = useMemo(() => {
    if (!portfolio?.holdings) return [];
    return portfolio.holdings
      .filter(h => {
      // Hide spam/dust tokens: must have a positive human-readable balance
      const hasBalance = h.amountHuman !== null && h.amountHuman !== undefined && (h.amountHuman as number) > 0;
      const matchesSearch = (h.symbol || h.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      return hasBalance && matchesSearch;
      })
      .sort(compareAssetValue)
      .slice(0, 20);
  }, [portfolio, searchQuery]);

  return (
    <MainLayout activePath="/assets">
      <div className="assets-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', width: '100%' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
          <div>
            <h1 style={{ fontSize: '3.5rem', marginBottom: '8px', letterSpacing: '-0.03em', lineHeight: 1.05, fontWeight: 800 }}>Assets & Objects</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', fontWeight: 500 }}>Manage your tokens and SUI objects in one place.</p>
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
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Balance</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{formatUsd(portfolio?.totalWalletValueUsd ?? 0)}</div>
            </div>
          </ClayCard>
          <ClayCard variant="raised" padding="md" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '12px', backgroundColor: 'var(--matcha-highlight)', borderRadius: '16px', color: 'var(--matcha-accent)' }}>
              <Box size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Objects</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800 }}>{loading ? '...' : (portfolio?.objectSummary?.totalObjects ?? objects.length)}</div>
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
                  {[...Array(20)].map((_, i) => <div key={i} className="skeleton-item" />)}
                </div>
              ) : filteredHoldings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                  <p>No balances found.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredHoldings.map((item, index) => {
                    const explorerUrl = `https://suiscan.xyz/${networkName}/coin/${item.coinType}`;
                    return (
                    <a
                      key={`${item.coinType}-${index}`}
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="balance-row"
                      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="coin-icon" style={{
                          width: '38px', height: '38px', fontSize: '1rem',
                          background: item.isNative ? 'linear-gradient(135deg, #6FBEE5, #3898EC)' : undefined
                        }}>
                          {item.symbol.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{item.symbol}</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                            {item.name}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                            {formatTokenAmount(item.amountHuman, item.decimals ?? 0, item.symbol)}
                          </div>
                          <div style={{ color: 'var(--matcha-accent)', fontSize: '0.8rem', fontWeight: 700 }}>
                            {formatUsd(item.valueUsd)}
                          </div>
                        </div>
                        <ArrowUpRight size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      </div>
                    </a>
                    );
                  })}
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
                {filteredObjects.map((item, index) => {
                  const imageUrl = getObjectImageUrl(item);
                  const objectName = item.display?.name || item.type?.split('::').pop() || 'Untitled Object';
                  const objectExplorerUrl = item.objectId
                    ? `https://suiscan.xyz/${networkName}/object/${item.objectId}`
                    : null;
                  return (
                    <div key={`${item.objectId ?? 'object'}-${index}`} className="object-card-wrapper">
                      <ClayCard padding="none" className="object-card">
                        <div className="object-media">
                          {imageUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={imageUrl} alt={item.display?.name ?? item.type ?? 'NFT'} />
                          ) : (
                            <div className="object-placeholder">
                              <Box size={32} />
                            </div>
                          )}
                          <div className="object-badge">{item.type?.split('::').pop()}</div>
                        </div>
                        <div className="object-content" style={{ padding: '16px' }}>
                          <h4 style={{ fontSize: '1rem', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {objectName}
                          </h4>
                          <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            {item.objectId?.slice(0, 10)}...{item.objectId?.slice(-6)}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span className="version-pill">v{item.latestVersion || '1'}</span>
                            {objectExplorerUrl ? (
                              <a
                                href={objectExplorerUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="view-btn"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ArrowUpRight size={14} />
                              </a>
                            ) : (
                              <span className="view-btn"><ArrowUpRight size={14} /></span>
                            )}
                          </div>
                        </div>
                      </ClayCard>
                    </div>
                  );
                })}
              </div>
            )} 
          </div>
        </section>
      </div>

      <style jsx>{`
        .grid-layout {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: var(--spacing-lg);
        }

        .balance-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background-color: var(--white);
          border-radius: 16px;
          transition: var(--transition-fast);
          border: 1px solid rgba(0,0,0,0.03);
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
