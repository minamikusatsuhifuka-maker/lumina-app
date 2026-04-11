'use client';

import { useState, useEffect } from 'react';

const DEFAULT_WIDGETS = ['briefing', 'quickactions', 'stats', 'quickstart', 'recentdrafts', 'workflow', 'tips'];
const WIDGET_LABELS: Record<string, string> = {
  briefing: '☀️ AIブリーフィング',
  quickactions: '⚡ クイックアクション',
  stats: '📊 統計カード',
  quickstart: '🚀 クイックスタート',
  recentdrafts: '📝 最近の下書き',
  workflow: '⚡ 推奨ワークフロー',
  tips: '💡 AI活用Tips',
};

export function DashboardCustomize({ children }: { children: (hidden: string[]) => React.ReactNode }) {
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('xlumina_hidden_widgets');
      if (saved) setHidden(JSON.parse(saved));
    } catch {}
  }, []);

  const toggle = (id: string) => {
    const updated = hidden.includes(id) ? hidden.filter(w => w !== id) : [...hidden, id];
    setHidden(updated);
    localStorage.setItem('xlumina_hidden_widgets', JSON.stringify(updated));
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={() => setIsCustomizing(!isCustomizing)} style={{
          fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)',
        }}>
          {isCustomizing ? '✅ 完了' : '🔧 カスタマイズ'}
        </button>
      </div>
      {isCustomizing && (
        <div className="animate-fadeIn" style={{
          marginBottom: 20, padding: 16, borderRadius: 12,
          border: '1px dashed var(--border)', background: 'var(--bg-card)',
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>表示するウィジェットを選択：</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DEFAULT_WIDGETS.map(id => (
              <button key={id} onClick={() => toggle(id)} style={{
                fontSize: 11, padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                border: hidden.includes(id) ? '1px dashed var(--border)' : '1px solid var(--accent)',
                background: hidden.includes(id) ? 'transparent' : 'var(--accent-soft)',
                color: hidden.includes(id) ? 'var(--text-muted)' : 'var(--accent)',
              }}>
                {hidden.includes(id) ? '○ ' : '● '}{WIDGET_LABELS[id]}
              </button>
            ))}
          </div>
          <button onClick={() => { setHidden([]); localStorage.removeItem('xlumina_hidden_widgets'); }} style={{
            fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8,
          }}>リセット</button>
        </div>
      )}
      {children(hidden)}
    </>
  );
}
