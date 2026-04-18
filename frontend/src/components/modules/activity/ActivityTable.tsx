import React from 'react';
import { ClayBadge } from '../../shared/ClayBadge';

interface ActivityItem {
  date: string;
  type: 'Swap' | 'Send' | 'Stake' | 'Receive';
  protocol: string;
  amount: string;
  fee: string;
  status: 'Success' | 'Pending' | 'Failed';
}

export const ActivityTable: React.FC<{ items: ActivityItem[] }> = ({ items }) => {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 12px' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            <th style={{ padding: '0 16px' }}>Date</th>
            <th style={{ padding: '0 16px' }}>Type</th>
            <th style={{ padding: '0 16px' }}>Protocol</th>
            <th style={{ padding: '0 16px' }}>Amount</th>
            <th style={{ padding: '0 16px' }}>Fee</th>
            <th style={{ padding: '0 16px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="activity-row" style={{ 
              backgroundColor: 'var(--white)',
              boxShadow: 'var(--shadow-outer)',
              borderRadius: '16px',
              transition: 'var(--transition-fast)',
            }}>
              <td style={{ padding: '16px', borderTopLeftRadius: '16px', borderBottomLeftRadius: '16px' }}>{item.date}</td>
              <td style={{ padding: '16px' }}>
                <ClayBadge variant={item.type === 'Swap' ? 'accent' : 'secondary'}>{item.type}</ClayBadge>
              </td>
              <td style={{ padding: '16px' }}>{item.protocol}</td>
              <td style={{ padding: '16px', fontWeight: 600 }}>{item.amount}</td>
              <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{item.fee}</td>
              <td style={{ padding: '16px', borderTopRightRadius: '16px', borderBottomRightRadius: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: item.status === 'Success' ? 'var(--matcha-primary)' : '#FFD54F' 
                  }} />
                  {item.status}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <style jsx>{`
        .activity-row:hover {
          transform: scale(1.01);
          background-color: var(--matcha-highlight);
        }
      `}</style>
    </div>
  );
};
