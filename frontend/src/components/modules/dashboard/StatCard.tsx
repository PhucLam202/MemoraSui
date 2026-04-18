import React from 'react';
import { ClayCard } from '../../shared/ClayCard';

interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  chartPlaceholder?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, trend, chartPlaceholder }) => {
  return (
    <ClayCard style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <h2 style={{ fontSize: '2rem' }}>{value}</h2>
        {trend && <span style={{ fontSize: '0.875rem', color: 'var(--matcha-accent)', fontWeight: 600 }}>{trend}</span>}
      </div>
      {chartPlaceholder && (
        <div style={{ 
          height: '60px', 
          width: '100%', 
          backgroundColor: 'var(--matcha-bg)', 
          borderRadius: '12px',
          marginTop: '8px',
          boxShadow: 'var(--shadow-inner)'
        }} />
      )}
    </ClayCard>
  );
};
