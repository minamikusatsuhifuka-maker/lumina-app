'use client';
import { useTheme } from './ThemeProvider';

const THEMES = [
  { id: 'dark', label: '🌙 ダーク', desc: '濃紺' },
  { id: 'midnight', label: '🔮 ミッドナイト', desc: '深紫' },
  { id: 'light', label: '☀️ ライト', desc: '白' },
  { id: 'nature', label: '🌿 ネイチャー', desc: '深緑' },
] as const;

const FONTS = [
  { id: 'outfit', label: 'Outfit', desc: 'モダン・読みやすい' },
  { id: 'noto', label: 'Noto Sans', desc: '日本語最適化' },
  { id: 'inter', label: 'Inter', desc: 'シャープ・明瞭' },
  { id: 'zen', label: 'Zen Kaku', desc: '角ゴシック・端正' },
] as const;

export function ThemeSelector() {
  const { theme, setTheme, font, setFont } = useTheme();

  return (
    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', marginTop: 8 }}>
      {/* テーマ選択 */}
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
        🎨 テーマ
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 12 }}>
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            style={{
              padding: '6px 8px',
              background: theme === t.id ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${theme === t.id ? 'var(--border-accent)' : 'var(--border)'}`,
              borderRadius: 8, cursor: 'pointer', textAlign: 'left',
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

      {/* フォント選択 */}
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
        🔤 フォント
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {FONTS.map(f => (
          <button
            key={f.id}
            onClick={() => setFont(f.id)}
            style={{
              padding: '6px 8px',
              background: font === f.id ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${font === f.id ? 'var(--border-accent)' : 'var(--border)'}`,
              borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 11, color: font === f.id ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600 }}>
              {f.label}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
              {f.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
