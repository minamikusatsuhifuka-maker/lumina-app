'use client';

import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark' || theme === 'midnight';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'ライトモードに切替' : 'ダークモードに切替'}
      style={{
        width: 36, height: 36, borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
