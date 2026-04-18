import React from 'react';

interface ChatBubbleProps {
  message: string;
  isAi?: boolean;
  timestamp?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isAi, timestamp }) => {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: isAi ? 'flex-start' : 'flex-end',
      gap: '4px',
      width: '100%'
    }}>
      <div style={{ 
        maxWidth: '80%',
        padding: '14px 20px',
        borderRadius: '24px',
        borderBottomRightRadius: isAi ? '24px' : '4px',
        borderBottomLeftRadius: isAi ? '4px' : '24px',
        backgroundColor: isAi ? 'var(--matcha-highlight)' : 'var(--matcha-primary)',
        color: isAi ? 'var(--text-primary)' : 'white',
        boxShadow: 'var(--shadow-outer)',
        fontSize: '1rem',
        lineHeight: 1.5
      }}>
        {message}
      </div>
      {timestamp && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0 8px' }}>
          {timestamp}
        </span>
      )}
    </div>
  );
};
