'use client';

type Props = {
  model: 'claude' | 'gemini';
  size?: 'sm' | 'md';
};

const CONFIG = {
  claude: { icon: '🤖', label: 'Claude Sonnet 4.6', bg: 'rgba(245,166,35,0.15)', color: '#f5a623', border: 'rgba(245,166,35,0.3)' },
  gemini: { icon: '✨', label: 'Gemini 2.5 Pro', bg: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: 'rgba(96,165,250,0.3)' },
};

export function ModelBadge({ model, size = 'sm' }: Props) {
  const c = CONFIG[model];
  const pad = size === 'md' ? '4px 12px' : '2px 8px';
  const fontSize = size === 'md' ? 13 : 11;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: pad, borderRadius: 20, background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontSize, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <span>{c.icon}</span>
      <span>{c.label}で生成</span>
    </span>
  );
}
