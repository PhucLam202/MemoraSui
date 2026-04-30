import React from 'react';

interface ClayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const ClayButton: React.FC<ClayButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  style,
  ...props
}) => {
  const baseClass = 'clay-button';
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: 'var(--matcha-primary)', color: 'white' },
    secondary: { backgroundColor: 'var(--matcha-secondary)', color: 'white' },
    accent: { backgroundColor: 'var(--matcha-accent)', color: 'white' },
    ghost: { 
      backgroundColor: 'transparent', 
      color: 'var(--matcha-accent)', 
      boxShadow: 'none',
      border: '1px solid var(--border-color)'
    },
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: '8px 16px', fontSize: '0.875rem', borderRadius: '14px' },
    md: { padding: '12px 24px', fontSize: '1rem', borderRadius: '18px' },
    lg: { padding: '16px 32px', fontSize: '1.125rem', borderRadius: '22px' },
  };

  const combinedStyle: React.CSSProperties = {
    ...variantStyles[variant],
    ...sizeStyles[size],
    width: fullWidth ? '100%' : 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transform: 'translateY(0)',
    whiteSpace: 'nowrap',
    ...style,
  };

  return (
    <button
      className={`${baseClass} ${className}`}
      style={combinedStyle}
      disabled={props.disabled ? true : undefined}
      aria-busy={props.disabled || undefined}
      {...props}
    >
      {children}
    </button>
  );
};
