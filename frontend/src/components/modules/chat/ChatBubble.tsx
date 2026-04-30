import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface ChatBubbleProps {
  message: string;
  isAi?: boolean;
  timestamp?: string;
}

function renderInline(text: string) {
  // Pattern includes: Links, Bold, and Inline Code
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\))|(\*\*[^*]+\*\*)|(`[^`]+`)/g;
  const parts: React.ReactNode[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const index = match.index;
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    const fullMatch = match[0];
    if (fullMatch.startsWith('[')) {
      const linkMatch = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(fullMatch);
      if (linkMatch) {
        parts.push(
          <a
            key={`link-${index}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            style={{
              color: 'var(--matcha-accent)',
              textDecoration: 'none',
              fontWeight: 700,
              borderBottom: '1.5px solid rgba(107, 143, 113, 0.28)',
              transition: 'all 0.2s ease',
            }}
            className="chat-link"
          >
            {linkMatch[1]}
          </a>,
        );
      }
    } else if (fullMatch.startsWith('**')) {
      parts.push(
        <strong key={`strong-${index}`} style={{ fontWeight: 800, color: 'var(--matcha-accent)' }}>
          {fullMatch.slice(2, -2)}
        </strong>,
      );
    } else if (fullMatch.startsWith('`')) {
      parts.push(
        <code
          key={`code-${index}`}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            background: 'rgba(107, 143, 113, 0.1)',
            padding: '2px 6px',
            borderRadius: '6px',
            color: 'var(--matcha-accent)',
            fontWeight: 600,
          }}
        >
          {fullMatch.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function isOrderedListItem(line: string) {
  return /^\d+\.\s+/.test(line);
}

function isBulletListItem(line: string) {
  return /^-\s+/.test(line);
}

function isSectionHeading(line: string) {
  // Support standard markdown headings and the custom title-case headings
  const trimmed = line.trim();
  return (
    /^#+\s+/.test(trimmed) ||
    (/^[A-Z][A-Za-z0-9/&()' -]{1,60}$/.test(trimmed) &&
      !isOrderedListItem(line) &&
      !isBulletListItem(line) &&
      trimmed.length > 3)
  );
}

function isBlockquote(line: string) {
  return /^>\s+/.test(line.trim());
}

function renderStructuredMessage(message: string, isAi: boolean = false) {
  const lines = message.split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    // Special handling for patterns like "Title\nURL: https://..."
    // Group consecutive source cards
    if (index + 1 < lines.length && lines[index + 1]?.trim().startsWith('URL: ')) {
      const sourceCards: React.ReactNode[] = [];
      while (index + 1 < lines.length && lines[index + 1]?.trim().startsWith('URL: ')) {
        const title = (lines[index] ?? '').trim();
        const url = lines[index + 1]?.trim().replace('URL: ', '') ?? '';
        sourceCards.push(
          <a
            key={`source-card-${index}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: '14px 18px',
              background: 'rgba(255, 255, 255, 0.5)',
              border: '1px solid rgba(107, 143, 113, 0.15)',
              borderRadius: '16px',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              textDecoration: 'none',
              backdropFilter: 'blur(8px)',
              minWidth: '240px',
              flex: '1 1 240px',
              boxShadow: '0 4px 12px rgba(107, 143, 113, 0.04)',
            }}
            className="source-card"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <span
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 750,
                  color: 'var(--matcha-accent)',
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {title}
              </span>
              <ExternalLink size={12} color="var(--matcha-accent)" style={{ flexShrink: 0, marginTop: '2px', opacity: 0.6 }} />
            </div>
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                opacity: 0.7,
                fontFamily: 'var(--font-mono)',
                marginTop: 'auto',
              }}
            >
              {url.replace(/^https?:\/\/(www\.)?/, '')}
            </span>
          </a>,
        );
        index += 2;
        // Skip empty lines between cards if any
        while (index < lines.length && !lines[index]?.trim()) {
          index += 1;
        }
      }

      blocks.push(
        <div
          key={`sources-grid-${index}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '12px',
            margin: '12px 0 20px 0',
            width: '100%',
          }}
          className="block-animate"
        >
          {sourceCards}
        </div>,
      );
      continue;
    }

    if (isSectionHeading(line)) {
      const cleanHeading = line.replace(/^#+\s+/, '');
      const isLevel1 = line.startsWith('# ') || cleanHeading === cleanHeading.toUpperCase();
      blocks.push(
        <div
          key={`heading-${index}`}
          style={{
            fontSize: isLevel1 ? '1.15rem' : '0.88rem',
            fontWeight: 850,
            letterSpacing: isLevel1 ? '-0.02em' : '0.06em',
            textTransform: isLevel1 ? 'none' : 'uppercase',
            color: isAi ? 'var(--matcha-accent)' : 'var(--white)',
            marginTop: blocks.length > 0 ? '32px' : '0',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontFamily: 'var(--font-heading)',
          }}
          className="block-animate"
        >
          <span
            style={{
              width: isLevel1 ? '6px' : '4px',
              height: isLevel1 ? '20px' : '16px',
              background: 'linear-gradient(180deg, var(--matcha-primary), var(--matcha-accent))',
              borderRadius: '4px',
              boxShadow: '0 2px 6px rgba(107, 143, 113, 0.25)',
            }}
          />
          {cleanHeading}
        </div>,
      );
      index += 1;
      continue;
    }

    if (isBlockquote(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const candidate = (lines[index] ?? '').trim();
        if (!candidate || !isBlockquote(candidate)) {
          break;
        }
        quoteLines.push(candidate.replace(/^>\s+/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={`quote-${index}`}
          style={{
            margin: '16px 0',
            padding: '12px 20px',
            borderLeft: '4px solid var(--matcha-primary)',
            background: 'rgba(123, 174, 127, 0.08)',
            borderRadius: '0 16px 16px 0',
            fontSize: '0.94rem',
            lineHeight: 1.6,
            color: isAi ? 'var(--text-secondary)' : 'rgba(255,255,255,0.85)',
            fontStyle: 'italic',
          }}
          className="block-animate"
        >
          {quoteLines.join(' ')}
        </blockquote>,
      );
      continue;
    }

    if (isOrderedListItem(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = (lines[index] ?? '').trim();
        if (!candidate) {
          index += 1;
          break;
        }
        if (!isOrderedListItem(candidate)) {
          break;
        }
        items.push(candidate.replace(/^\d+\.\s+/, ''));
        index += 1;
      }

      blocks.push(
        <ol
          key={`ordered-${index}`}
          style={{
            margin: '8px 0',
            paddingLeft: '1.6rem',
            display: 'grid',
            gap: '0.8rem',
          }}
          className="block-animate"
        >
          {items.map((item, itemIndex) => (
            <li key={`ordered-item-${itemIndex}`} style={{ paddingLeft: '0.3rem', color: isAi ? 'inherit' : 'var(--white)' }}>
              {renderInline(item)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    if (isBulletListItem(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = (lines[index] ?? '').trim();
        if (!candidate) {
          index += 1;
          break;
        }
        if (!isBulletListItem(candidate)) {
          break;
        }
        items.push(candidate.replace(/^-\s+/, ''));
        index += 1;
      }

      blocks.push(
        <ul
          key={`bullet-${index}`}
          style={{
            margin: '8px 0',
            paddingLeft: '1.2rem',
            display: 'grid',
            gap: '0.6rem',
            listStyleType: 'none',
          }}
          className="block-animate"
        >
          {items.map((item, itemIndex) => (
            <li
              key={`bullet-item-${itemIndex}`}
              style={{ position: 'relative', paddingLeft: '1.4rem', lineHeight: 1.65, color: isAi ? 'inherit' : 'var(--white)' }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '0.65rem',
                  width: '6px',
                  height: '6px',
                  background: isAi ? 'var(--matcha-primary)' : 'var(--white)',
                  borderRadius: '50%',
                  opacity: 0.8,
                  boxShadow: isAi ? '0 0 4px var(--matcha-primary)' : '0 0 4px var(--white)',
                }}
              />
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length) {
      const candidate = (lines[index] ?? '').trim();
      if (
        !candidate ||
        isSectionHeading(candidate) ||
        isOrderedListItem(candidate) ||
        isBulletListItem(candidate) ||
        isBlockquote(candidate) ||
        (index < lines.length - 1 && lines[index + 1]?.trim().startsWith('URL: '))
      ) {
        break;
      }
      paragraphLines.push(candidate);
      index += 1;
    }

    blocks.push(
      <p
        key={`paragraph-${index}`}
        style={{
          margin: '10px 0',
          lineHeight: 1.8,
          color: isAi ? 'var(--text-primary)' : 'inherit',
          opacity: isAi ? 0.95 : 1,
          fontSize: '1rem',
          letterSpacing: '0.01em',
        }}
        className="block-animate"
      >
        {renderInline(paragraphLines.join(' '))}
      </p>,
    );
  }

  return blocks;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isAi, timestamp }) => {
  const [copied, setCopied] = useState(false);
  const isExpandedContent =
    isAi && (message.length > 220 || message.split('\n').length > 6 || message.includes('Sources for Further Reading'));

  const handleCopy = () => {
    void navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isAi ? 'flex-start' : 'flex-end',
        gap: '8px',
        width: '100%',
        animation: 'bubbleIn 420ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        style={{
          width: isExpandedContent ? '100%' : 'auto',
          maxWidth: isExpandedContent ? '100%' : '85%',
          padding: isExpandedContent ? '24px 28px' : '16px 20px',
          borderRadius: '24px',
          borderBottomRightRadius: isAi ? '24px' : '8px',
          borderBottomLeftRadius: isAi ? '8px' : '24px',
          background: isAi
            ? 'linear-gradient(145deg, rgba(255,255,255,0.95), rgba(246,249,242,0.98))'
            : 'linear-gradient(145deg, var(--matcha-accent), #4a6d4d)',
          color: isAi ? 'var(--text-primary)' : '#f8f7f2',
          boxShadow: isAi ? '0 12px 32px rgba(38, 48, 41, 0.08), 0 2px 4px rgba(0,0,0,0.02)' : '0 14px 28px rgba(85, 118, 91, 0.22)',
          fontSize: '0.98rem',
          lineHeight: 1.65,
          wordBreak: 'break-word',
          position: 'relative',
          border: isAi ? '1px solid rgba(255,255,255,1)' : '1px solid rgba(255,255,255,0.08)',
          boxSizing: 'border-box',
        }}
        className="chat-bubble-content group"
      >
        {isAi && (
          <button
            onClick={handleCopy}
            className="copy-button"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              padding: '6px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(107, 143, 113, 0.15)',
              cursor: 'pointer',
              opacity: 0,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--matcha-accent)',
            }}
            title="Copy message"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
        <div style={{ display: 'grid', gap: '0.2rem' }}>{renderStructuredMessage(message, isAi)}</div>
      </div>
      {timestamp && (
        <span
          style={{
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
            padding: '0 12px',
            opacity: 0.8,
            fontWeight: 600,
          }}
        >
          {timestamp}
        </span>
      )}
      <style jsx>{`
        @keyframes bubbleIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes blockIn {
          from {
            opacity: 0;
            transform: translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .block-animate {
          animation: blockIn 0.4s ease-out forwards;
        }
        .chat-bubble-content:hover .copy-button {
          opacity: 1;
        }
        .copy-button:hover {
          background: var(--white) !important;
          transform: scale(1.05);
          box-shadow: 0 4px 10px rgba(0,0,0,0.05);
        }
        .chat-link:hover {
          color: var(--matcha-accent) !important;
          border-bottom-color: var(--matcha-accent) !important;
          background: rgba(107, 143, 113, 0.08);
          border-radius: 4px;
        }
        .source-card:hover {
          background: var(--white) !important;
          border-color: var(--matcha-primary) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(107, 143, 113, 0.12) !important;
        }
      `}</style>
    </div>
  );
};
