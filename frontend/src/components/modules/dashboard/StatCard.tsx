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
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 'clamp(1.7rem, 2vw, 2.1rem)', lineHeight: 1 }}>{value}</h2>
        {trend && <span style={{ fontSize: '0.875rem', color: 'var(--matcha-accent)', fontWeight: 700 }}>{trend}</span>}
      </div>
      {chartPlaceholder && (
        <div style={{ 
          height: '60px', 
          width: '100%', 
          background: 'linear-gradient(180deg, rgba(255,255,255,0.45), rgba(221,232,216,0.65))',
          borderRadius: '12px',
          marginTop: '8px',
          boxShadow: 'var(--shadow-inner)'
        }} />
      )}
    </ClayCard>
  );
};
