'use client';

import { HTMLAttributes, forwardRef } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  delay?: number;
}

export const AnimatedCard = forwardRef<HTMLDivElement, Props>(
  ({ children, hover = true, delay = 0, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`animate-fadeIn ${hover ? 'card-hover' : ''}`}
        style={{ animationDelay: `${delay}ms`, ...style }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AnimatedCard.displayName = 'AnimatedCard';
