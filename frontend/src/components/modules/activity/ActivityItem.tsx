import React from 'react';
import { StatusBadge, ActivityStatus } from '@/components/shared/StatusBadge';
import { ClayBadge } from '@/components/shared/ClayBadge';
import { ArrowUpRight, ArrowDownLeft, RefreshCcw, Landmark, ChevronRight } from 'lucide-react';

export type ActivityType = 'Swap' | 'Send' | 'Stake' | 'Receive';

export interface ActivityData {
  id: string;
  date: string;
  timestampMs?: number | null;
  type: ActivityType;
  protocol: string;
  amount: string;
  fee: string;
  status: ActivityStatus;
  txHash?: string;
}

interface ActivityItemProps {
  data: ActivityData;
  onClick?: (data: ActivityData) => void;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({ data, onClick }) => {
  const typeIcon = {
    Swap: <RefreshCcw size={18} />,
    Send: <ArrowUpRight size={18} />,
    Receive: <ArrowDownLeft size={18} />,
    Stake: <Landmark size={18} />,
  };

  return (
    <div 
      className="activity-item-card"
      onClick={() => onClick?.(data)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '20px',
        backgroundColor: 'var(--white)',
        borderRadius: '24px',
        boxShadow: 'var(--shadow-outer)',
        cursor: 'pointer',
        transition: 'var(--transition-slow)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Icon Section */}
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--matcha-highlight)',
        color: 'var(--matcha-accent)',
        marginRight: '16px',
        flexShrink: 0,
      }}>
        {typeIcon[data.type]}
      </div>

      {/* Main Info */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{data.type}</span>
          <ClayBadge variant="secondary" size="sm">{data.protocol}</ClayBadge>
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {data.date}
        </div>
      </div>

      {/* Amount Section */}
      <div style={{ textAlign: 'right', marginRight: '24px' }}>
        <div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-primary)' }}>
          {data.amount}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          Fee: {data.fee}
        </div>
      </div>

      {/* Status & Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <StatusBadge status={data.status} />
        <ChevronRight size={20} style={{ color: 'var(--border-color)' }} />
      </div>

      <style jsx>{`
        .activity-item-card:hover {
          transform: translateY(-4px) scale(1.005);
          box-shadow: var(--shadow-hover);
          background-color: var(--matcha-bg);
        }
        .activity-item-card:active {
          transform: translateY(0) scale(1);
          box-shadow: var(--shadow-inner);
        }
        
        @media (max-width: 640px) {
          .activity-item-card {
            flex-direction: column;
            align-items: flex-start;
          }
          .activity-item-card > div {
            width: 100%;
            margin-right: 0;
            margin-bottom: 12px;
          }
          .activity-item-card > div:last-child {
            margin-bottom: 0;
            justify-content: space-between;
          }
          .activity-item-card > div:nth-child(3) {
            text-align: left;
          }
        }
      `}</style>
    </div>
  );
};
