'use client';

import { useState, useEffect, createContext, useContext, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

const ToastContext = createContext<{
  showToast: (message: string, type?: ToastType) => void;
}>({ showToast: () => {} });

const ICONS: Record<ToastType, string> = { success: '✅', error: '❌', info: '💬', warning: '⚠️' };
const BG_COLORS: Record<ToastType, string> = {
  success: 'rgba(29,158,117,0.15)',
  error: 'rgba(239,68,68,0.15)',
  info: 'rgba(55,138,221,0.15)',
  warning: 'rgba(239,159,39,0.15)',
};
const TEXT_COLORS: Record<ToastType, string> = {
  success: '#1D9E75',
  error: '#ef4444',
  info: '#378ADD',
  warning: '#EF9F27',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="animate-slideIn"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 12,
              background: BG_COLORS[toast.type],
              color: TEXT_COLORS[toast.type],
              border: `1px solid ${TEXT_COLORS[toast.type]}30`,
              fontSize: 13, fontWeight: 500,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              pointerEvents: 'auto',
            }}
          >
            <span>{ICONS[toast.type]}</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
