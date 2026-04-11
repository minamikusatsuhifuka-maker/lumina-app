'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  primary: { background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none' },
  secondary: { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  ghost: { background: 'transparent', color: 'var(--text-muted)', border: 'none' },
};

const SIZE_STYLES: Record<string, React.CSSProperties> = {
  sm: { fontSize: 12, padding: '5px 12px' },
  md: { fontSize: 13, padding: '8px 16px' },
  lg: { fontSize: 15, padding: '12px 24px' },
};

export const AnimatedButton = forwardRef<HTMLButtonElement, Props>(
  ({ children, variant = 'primary', size = 'md', isLoading, disabled, style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className="btn-ripple"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          borderRadius: 10, fontWeight: 600, cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
          opacity: disabled || isLoading ? 0.5 : 1,
          transition: 'transform 200ms ease, box-shadow 200ms ease',
          ...VARIANT_STYLES[variant],
          ...SIZE_STYLES[size],
          ...style,
        }}
        {...props}
      >
        {isLoading && <span style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
        {children}
      </button>
    );
  }
);
AnimatedButton.displayName = 'AnimatedButton';
