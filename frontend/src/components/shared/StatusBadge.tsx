import React from 'react';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export type ActivityStatus = 'Success' | 'Pending' | 'Failed';

interface StatusBadgeProps {
  status: ActivityStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const statusConfig = {
    Success: {
      color: 'var(--matcha-primary)',
      bg: 'var(--matcha-highlight)',
      icon: <CheckCircle2 size={14} />,
    },
    Pending: {
      color: '#B8860B',
      bg: '#FFF8DC',
      icon: <Clock size={14} />,
    },
    Failed: {
      color: '#D32F2F',
      bg: '#FFEBEE',
      icon: <AlertCircle size={14} />,
    },
  };

  const config = statusConfig[status];

  return (
    <div 
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: 'var(--radius-pill)',
        backgroundColor: config.bg,
        color: config.color,
        fontSize: '0.8125rem',
        fontWeight: 600,
        transition: 'var(--transition-fast)',
      }}
    >
      {config.icon}
      <span>{status}</span>
    </div>
  );
};
