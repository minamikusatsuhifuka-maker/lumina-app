'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/hooks/useNotifications';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  is_read: boolean;
  href?: string;
  created_at: string;
}

const TYPE_ICON: Record<string, string> = {
  info: '💬', success: '✅', warning: '⚠️', error: '❌',
};

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { notifications, unreadCount, refresh } = useNotifications();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'all' }),
    });
    refresh();
  };

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      });
      refresh();
    }
    if (n.href) router.push(n.href);
    setIsOpen(false);
  };

  return (
    <div style={{ position: 'relative' }} ref={panelRef}>
      {/* ベルボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16,
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#E24B4A', color: '#fff',
            fontSize: 10, fontWeight: 500, borderRadius: 999,
            minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* 通知パネル */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: 44, right: 0, zIndex: 100,
          width: 340, maxHeight: 480,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}>
          {/* ヘッダー */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>通知</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{
                fontSize: 12, color: 'var(--accent)',
                background: 'none', border: 'none', cursor: 'pointer',
              }}>
                すべて既読
              </button>
            )}
          </div>

          {/* 通知リスト */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                通知はありません
              </div>
            ) : (
              notifications.map((n: Notification) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    display: 'flex', gap: 10, padding: '10px 16px',
                    cursor: 'pointer', borderBottom: '1px solid var(--border)',
                    background: n.is_read ? 'transparent' : 'var(--accent-soft)',
                    transition: 'background 0.1s',
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{TYPE_ICON[n.type] ?? '💬'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 500, color: 'var(--text-primary)' }}>
                      {n.title}
                    </div>
                    {n.message && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {n.message}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {new Date(n.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {!n.is_read && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#378ADD', flexShrink: 0, marginTop: 4 }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
