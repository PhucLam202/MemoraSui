'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { FilterBar } from '@/components/modules/activity/FilterBar';
import { ActivityList } from '@/components/modules/activity/ActivityList';
import { type ActivityData } from '@/components/modules/activity/ActivityItem';
import { Search, Info } from 'lucide-react';
import { fetchApi } from '@/lib/api-client';
import { loadWalletSessionFromStorage } from '@/lib/wallet-session';

type TxItem = {
  id?: string;
  digest?: string;
  status?: string;
  sender?: string;
  recipient?: string;
  gasFee?: string;
  timestampMs?: number;
};

type PaginationResult<T> = {
  items: T[];
};

function mapTxToActivity(tx: TxItem): ActivityData {
  const status = tx.status === 'success' ? 'Success' : tx.status === 'failure' ? 'Failed' : 'Pending';
  const type: ActivityData['type'] = tx.sender && tx.recipient ? 'Swap' : tx.sender ? 'Send' : 'Receive';
  return {
    id: tx.id ?? tx.digest ?? crypto.randomUUID(),
    txHash: tx.digest,
    date: tx.timestampMs ? new Date(tx.timestampMs).toLocaleString() : 'Unknown',
    type,
    protocol: 'Sui',
    amount: tx.digest ? `${tx.digest.slice(0, 10)}...` : 'N/A',
    fee: tx.gasFee ? `${tx.gasFee} MIST` : 'N/A',
    status,
  };
}

export default function ActivityPage() {

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('Last 30 Days');
  const [protocol, setProtocol] = useState('All Protocols');
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<ActivityData[]>([]);

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
        const response = await fetchApi<PaginationResult<TxItem>>(`/data/wallets/${walletAddress}/transactions`, {
          network: networkName,
          limit: 100,
          page: 1,
        });
        setItems((response.items ?? []).map(mapTxToActivity));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load activity.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [walletAddress, networkName]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesProtocol = protocol === 'All Protocols' || item.protocol === protocol;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || item.type.toLowerCase().includes(q) || item.protocol.toLowerCase().includes(q) || item.txHash?.toLowerCase().includes(q);
      return matchesProtocol && matchesSearch;
    });
  }, [items, protocol, searchQuery]);

  return (
    <MainLayout activePath="/activity">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', letterSpacing: '-0.02em' }}>Activity</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>Transaction blocks with status and filters.</p>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>{dateRange}</div>
        </header>

        {error && (
          <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: '#fff4f4', border: '1px solid #ffd0d0' }}>
            {error}
          </div>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <FilterBar activeDateRange={dateRange} activeProtocol={protocol} onDateChange={setDateRange} onProtocolChange={setProtocol} />
            <div className="search-container">
              <Search size={18} style={{ color: 'var(--text-secondary)' }} />
              <input type="text" placeholder="Search tx, protocol..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>

          <div className="list-container">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.875rem', paddingLeft: '12px' }}>
              <Info size={16} />
              <span>Showing {filteredItems.length} transaction blocks</span>
            </div>
            <ActivityList items={filteredItems} loading={loading} />
          </div>
        </section>
      </div>

      <style jsx>{`
        .search-container {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 20px;
          background-color: var(--white);
          border-radius: 18px;
          box-shadow: var(--shadow-outer);
          flex: 1;
          min-width: 280px;
          transition: var(--transition-fast);
        }

        .search-container input {
          border: none;
          background: none;
          outline: none;
          width: 100%;
          font-family: inherit;
          font-size: 0.9375rem;
          color: var(--text-primary);
        }
      `}</style>
    </MainLayout>
  );
}
