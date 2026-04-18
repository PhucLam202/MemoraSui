import React from 'react';
import { ActivityItem, ActivityData } from './ActivityItem';

interface ActivityListProps {
  items: ActivityData[];
  loading?: boolean;
  onItemClick?: (data: ActivityData) => void;
}

export const ActivityList: React.FC<ActivityListProps> = ({ 
  items, 
  loading = false, 
  onItemClick 
}) => {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[1, 2, 3].map((n) => (
          <div key={n} style={{
            height: '88px',
            backgroundColor: 'var(--matcha-highlight)',
            borderRadius: '24px',
            animation: 'pulse 1.5s infinite ease-in-out',
            opacity: 0.6
          }} />
        ))}
        <style>{`
          @keyframes pulse {
            0% { opacity: 0.6; }
            50% { opacity: 0.3; }
            100% { opacity: 0.6; }
          }
        `}</style>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '60px 20px', 
        backgroundColor: 'var(--white)',
        borderRadius: '24px',
        boxShadow: 'var(--shadow-outer)',
        color: 'var(--text-secondary)'
      }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px' }}>No activities found</div>
        <p>Try adjusting your search or filters.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {items.map((item) => (
        <ActivityItem 
          key={item.id} 
          data={item} 
          onClick={onItemClick}
        />
      ))}
    </div>
  );
};
