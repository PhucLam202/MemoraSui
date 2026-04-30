import React from 'react';

interface ClayCardProps {
  children: React.ReactNode;
  title?: string | React.ReactNode;
  variant?: 'raised' | 'flat' | 'pressed';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
}

export const ClayCard: React.FC<ClayCardProps> = ({
  children,
  variant = 'raised',
  padding = 'md',
  className = '',
  style,
}) => {
  const paddingMap = {
    none: '0',
    sm: 'var(--spacing-sm)',
    md: 'var(--spacing-md)',
    lg: 'var(--spacing-lg)',
  };

  const variantClass = variant === 'pressed' ? 'clay-input' : variant === 'flat' ? 'clay-card-flat' : 'clay-card';
  
  const combinedStyle: React.CSSProperties = {
    padding: paddingMap[padding],
    position: 'relative',
    overflow: 'hidden',
    ...style,
  };

  return (
    <div className={`${variantClass} ${className}`} style={combinedStyle}>
      {children}
    </div>
  );
};
