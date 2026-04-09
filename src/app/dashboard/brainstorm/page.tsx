'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { VoiceInputButton } from '@/components/VoiceInputButton';

const PHASES = [
  { id: 'expand', label: '🌊 発散', desc: 'アイデアを20個以上出す', color: '#6c63ff' },
  { id: 'converge', label: '🎯 収束', desc: '上位10案に絞り込む', color: '#1d9e75' },
  { id: 'evaluate', label: '📊 評価', desc: 'マトリクスで採点', color: '#f5a623' },
];

const THEMES = ['新規事業アイデア', 'SNSバズりコンテンツ', '採用施策', 'コスト削減策', '顧客体験改善', '新商品開発'];

export default function BrainstormPage() {
  const router = useRouter();
  const [theme, setTheme] = useState('');
  const [phase, setPhase] = useState('expand');
  const [results, setResults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!theme.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, phase }),
      });
      const data = await res.json();
      setResults(prev => ({ ...prev, [phase]: data.result || '' }));
    } finally {
      setLoading(false);
    }
  };

  const formatResult = (text: string) => {
    if (!text) return '';
    return text.split('\n').map(line => {
      const t = line.trim();
      if (t.startsWith('## ')) return `<div style="font-size:15px;font-weight:700;color:var(--text-primary);margin:18px 0 10px;">${t.slice(3)}</div>`;
      if (t.match(/^\d+\.\s/)) return `<div style="display:flex;gap:8px;padding:5px 0;font-size:13px;color:var(--text-secondary);"><span style="color:var(--accent);font-weight:700;min-width:20px;">${t.match(/^\d+/)?.[0]}.</span><span>${t.replace(/^\d+\.\s/, '')}</span></div>`;
      if (t.startsWith('・') || t.startsWith('- ')) return `<div style="padding:3px 0 3px 16px;font-size:13px;color:var(--text-secondary);">• ${t.replace(/^[・-]\s*/, '')}</div>`;
      if (t.startsWith('| ')) {
        const cells = t.split('|').filter(c => c.trim() && c.trim() !== '---' && c.trim() !== '-----');
        if (cells.length === 0) return '';
        return `<div style="display:grid;grid-template-columns:repeat(${cells.length},1fr);gap:1px;margin:2px 0;">${cells.map((c, i) => `<div style="padding:7px 10px;background:${i === 0 ? 'var(--accent-soft)' : 'var(--bg-card)'};border:1px solid var(--border);font-size:12px;color:var(--text-secondary);">${c.trim()}</div>`).join('')}</div>`;
      }
      if (t === '') return '<div style="height:6px"></div>';
      return `<div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin:2px 0;">${t}</div>`;
    }).join('');
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🧠 AIブレインストーミング</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>発散→収束→評価の3フェーズでAIがアイデアを体系的に整理します</p>
      </div>

      {/* テーマ入力 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input type="text" value={theme} onChange={e => setTheme(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} placeholder="ブレインストーミングのテーマを入力..." style={{ flex: 1, padding: '12px 16px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }} />
        <VoiceInputButton size="sm" onResult={(text) => setTheme(prev => prev + text)} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {THEMES.map(t => <button key={t} onClick={() => setTheme(t)} style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>{t}</button>)}
      </div>

      {/* フェーズ選択 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {PHASES.map(p => (
          <div key={p.id} onClick={() => setPhase(p.id)} style={{ padding: '14px 16px', borderRadius: 12, border: `2px solid ${phase === p.id ? p.color : 'var(--border)'}`, background: phase === p.id ? `${p.color}15` : 'var(--bg-card)', cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{p.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.desc}</div>
            {results[p.id] && <div style={{ fontSize: 10, color: p.color, marginTop: 4 }}>✓ 完了</div>}
          </div>
        ))}
      </div>

      <button onClick={run} disabled={loading || !theme.trim()} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', cursor: loading || !theme.trim() ? 'not-allowed' : 'pointer', background: loading || !theme.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 20 }}>
        {loading ? '生成中...' : `${PHASES.find(p => p.id === phase)?.label} フェーズを実行`}
      </button>

      {/* 結果 */}
      {PHASES.map(p => results[p.id] && (
        <div key={p.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: p.color }}>{p.label} 結果</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <SaveToLibraryButton title={`ブレスト ${p.label}: ${theme}`} content={results[p.id]} type="web" tags="ブレインストーミング" groupName="ブレスト" />
              <button
                onClick={() => {
                  sessionStorage.setItem('brainstorm_to_write', JSON.stringify({
                    prompt: `以下のブレインストーミング結果をもとに、読みやすい文章を作成してください：\n\n${results[p.id]}`,
                    mode: 'blog',
                  }));
                  router.push('/dashboard/write');
                }}
                style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
              >
                ✍️ 文章作成に送る
              </button>
              <button
                onClick={() => {
                  sessionStorage.setItem('brainstorm_to_workflow', results[p.id].slice(0, 200));
                  router.push('/dashboard/workflow');
                }}
                style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
              >
                ⚡ ワークフローに送る
              </button>
            </div>
          </div>
          <div style={{ padding: '20px 24px' }} dangerouslySetInnerHTML={{ __html: formatResult(results[p.id]) }} />
        </div>
      ))}
    </div>
  );
}
