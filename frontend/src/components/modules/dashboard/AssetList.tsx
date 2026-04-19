import React from 'react';
import { ClayBadge } from '../../shared/ClayBadge';

interface Asset {
  name: string;
  amount: string;
  valueUsd: string;
}

export const AssetList: React.FC<{ assets: Asset[] }> = ({ assets }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {assets.map((asset, i) => (
        <div key={i} style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: 'var(--white)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-outer)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              backgroundColor: 'var(--matcha-highlight)', 
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              color: 'var(--matcha-accent)'
            }}>
              {asset.name[0]}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{asset.name}</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{asset.amount}</div>
            </div>
          </div>
          <ClayBadge variant="mono">{asset.valueUsd}</ClayBadge>
        </div>
      ))}
    </div>
  );
};
