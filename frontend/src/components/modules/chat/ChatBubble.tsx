import React from 'react';

interface ChatBubbleProps {
  message: string;
  isAi?: boolean;
  timestamp?: string;
}

function renderMessage(message: string) {
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\))|(\*\*[^*]+\*\*)/g;
  const parts: React.ReactNode[] = [];
  
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(message)) !== null) {
    const index = match.index;
    if (index > lastIndex) {
      parts.push(renderText(message.slice(lastIndex, index)));
    }

    const fullMatch = match[0];
    if (fullMatch.startsWith('[')) {
      const linkMatch = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(fullMatch);
      if (linkMatch) {
        parts.push(
          <a
            key={index}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            style={{ 
              color: 'var(--matcha-accent)', 
              textDecoration: 'none', 
              fontWeight: 700,
              borderBottom: '1.5px solid var(--matcha-highlight)',
              transition: 'var(--transition-fast)'
            }}
            className="chat-link"
          >
            {linkMatch[1]}
          </a>
        );
      }
    } else if (fullMatch.startsWith('**')) {
      const boldText = fullMatch.slice(2, -2);
      parts.push(<strong key={index} style={{ fontWeight: 800 }}>{boldText}</strong>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < message.length) {
    parts.push(renderText(message.slice(lastIndex)));
  }
  return parts;
}

function renderText(text: string) {
  return text.split('\n').map((line, i, arr) => (
    <React.Fragment key={i}>
      {line}
      {i < arr.length - 1 && <br />}
    </React.Fragment>
  ));
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isAi, timestamp }) => {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: isAi ? 'flex-start' : 'flex-end',
      gap: '8px',
      width: '100%',
      animation: 'bubbleIn 0.3s ease-out'
    }}>
      <div style={{ 
        maxWidth: '85%',
        padding: '16px 24px',
        borderRadius: '24px',
        borderBottomRightRadius: isAi ? '24px' : '6px',
        borderBottomLeftRadius: isAi ? '6px' : '24px',
        backgroundColor: isAi ? 'var(--white)' : 'var(--matcha-primary)',
        color: isAi ? 'var(--text-primary)' : 'white',
        boxShadow: isAi ? '0 10px 25px rgba(0,0,0,0.05)' : 'var(--shadow-outer)',
        fontSize: '0.975rem',
        lineHeight: 1.6,
        wordBreak: 'break-word',
        position: 'relative',
        border: isAi ? '1px solid rgba(255,255,255,0.8)' : 'none'
      }} className="chat-bubble-content">
        {renderMessage(message)}
      </div>
      {timestamp && (
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '0 12px', opacity: 0.8, fontWeight: 600 }}>
          {timestamp}
        </span>
      )}
      <style jsx>{`
        @keyframes bubbleIn {
          from { opacity: 0; transform: translateY(10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .chat-link:hover {
          color: var(--matcha-secondary) !important;
          border-bottom-color: var(--matcha-accent) !important;
        }
      `}</style>
    </div>
  );
};
