import React from 'react';

interface ClayInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const ClayInput: React.FC<ClayInputProps> = ({
  label,
  error,
  icon,
  className = '',
  ...props
}) => {
  return (
    <div className={`clay-input-wrapper ${className}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {label && (
        <label style={{ 
          fontFamily: 'var(--font-heading)', 
          fontSize: '0.875rem', 
          fontWeight: 600, 
          color: 'var(--text-secondary)',
          marginLeft: '4px'
        }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', width: '100%' }}>
        {icon && (
          <div style={{ 
            position: 'absolute', 
            left: '16px', 
            top: '50%', 
            transform: 'translateY(-50%)',
            color: 'var(--text-secondary)'
          }}>
            {icon}
          </div>
        )}
        <input 
          className="clay-input" 
          style={{ 
            paddingLeft: icon ? '44px' : '20px'
          }}
          {...props} 
        />
      </div>
      {error && (
        <span style={{ 
          fontSize: '0.75rem', 
          color: '#E57373', 
          marginLeft: '4px' 
        }}>
          {error}
        </span>
      )}
    </div>
  );
};
