'use client';

// 240: アプリ全体の文字サイズ切替（現状=最小の100%＋3段階）。
// ヘッダーの🌙ダークモード・🔔通知と並べて置く。現在の段階が一目で分かるよう
// 4つのAを大きさ違いで並べ、選択中を強調する（セグメント方式）。
// 実際の拡大は ThemeProvider が documentElement の zoom で行う（px指定のインラインstyleにも効く）。

import { useTheme, TEXT_SCALES, type TextScale } from './ThemeProvider';

// ボタン内のAの見た目サイズ（段階が視覚的に伝わるように実際に大小を付ける）
const A_SIZE: Record<TextScale, number> = { 100: 10, 112: 12, 125: 14, 140: 16 };

export function TextSizeToggle() {
  const { textScale, setTextScale } = useTheme();

  return (
    <div
      role="group"
      aria-label="文字サイズ"
      title="アプリ全体の文字サイズを変えます（この設定はこの端末に保存されます）"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: 36,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        overflow: 'hidden',
      }}
    >
      {TEXT_SCALES.map((s) => {
        const active = textScale === s.value;
        return (
          <button
            key={s.value}
            onClick={() => setTextScale(s.value)}
            aria-pressed={active}
            title={`${s.label}（${s.hint}・${s.value}%）`}
            style={{
              minWidth: 30,
              padding: '0 6px',
              border: 'none',
              borderLeft: s.value === 100 ? 'none' : '1px solid var(--border)',
              background: active ? 'var(--accent-soft)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: active ? 700 : 400,
              fontSize: A_SIZE[s.value],
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            A
          </button>
        );
      })}
    </div>
  );
}
