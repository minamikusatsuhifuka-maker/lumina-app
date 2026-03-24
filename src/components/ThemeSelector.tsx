'use client';
import { useTheme } from './ThemeProvider';

const THEMES = [
  { id: 'dark', label: '🌙 ダーク', desc: '濃紺（デフォルト）' },
  { id: 'midnight', label: '🔮 ミッドナイト', desc: '深い紫系' },
  { id: 'light', label: '☀️ ライト', desc: 'やさしい白' },
  { id: 'nature', label: '🌿 ネイチャー', desc: '深い緑系' },
] as const;

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', marginTop: 8 }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
        🎨 テーマ
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            style={{
              padding: '6px 8px',
              background: theme === t.id ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${theme === t.id ? 'var(--border-accent)' : 'var(--border)'}`,
              borderRadius: 8, cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 11, color: theme === t.id ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600 }}>
              {t.label}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
              {t.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
