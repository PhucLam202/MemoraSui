import React from 'react';

interface ClayBadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'accent' | 'neutral' | 'mono';
  size?: 'sm' | 'md';
  className?: string;
}

export const ClayBadge: React.FC<ClayBadgeProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
}) => {
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: 'var(--matcha-highlight)', color: 'var(--matcha-accent)' },
    secondary: { backgroundColor: '#E1EBE0', color: 'var(--text-secondary)' },
    accent: { backgroundColor: 'var(--matcha-primary)', color: 'white' },
    neutral: { backgroundColor: 'var(--matcha-input-bg)', color: 'var(--text-secondary)' },
    mono: { 
      backgroundColor: 'var(--matcha-input-bg)', 
      color: 'var(--text-primary)', 
      fontFamily: 'var(--font-mono)',
      fontWeight: 600
    },
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '4px 10px', fontSize: '0.75rem' },
    md: { padding: '6px 14px', fontSize: '0.875rem' },
  };

  const combinedStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-pill)',
    fontWeight: 500,
    ...variantStyles[variant],
    ...sizeStyles[size],
  };

  return (
    <span className={className} style={combinedStyle}>
      {children}
    </span>
  );
};
