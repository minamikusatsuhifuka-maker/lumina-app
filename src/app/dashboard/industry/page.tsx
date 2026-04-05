'use client';
import { useState } from 'react';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { getSavedModel } from '@/lib/model-preference';
import { ModelBadge } from '@/components/ModelBadge';

const POPULAR = ['医療・ヘルスケア', 'AI・SaaS', '不動産', '飲食・フードテック', '教育・EdTech', '金融・FinTech', 'EC・小売', '製造・IoT', '広告・マーケ', '人材・HR'];

export default function IndustryPage() {
  const [industry, setIndustry] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [usedModel, setUsedModel] = useState<'claude' | 'gemini' | null>(null);

  const [error, setError] = useState('');

  const generate = async () => {
    if (!industry.trim()) return;
    const currentModel = getSavedModel();
    setUsedModel(currentModel);
    setLoading(true);
    setResult('');
    setError('');
    try {
      const res = await fetch('/api/industry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry, model: getSavedModel() }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `APIエラー: ${res.status}`);
      }
      const data = await res.json();
      setResult(data.result || '');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'エラーが発生しました';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const formatResult = (text: string) => {
    if (!text) return '';
    return text.split('\n').map(line => {
      const t = line.trim();
      if (t.startsWith('## ')) return `<div style="font-size:16px;font-weight:700;color:var(--text-primary);margin:24px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--border-accent);">${t.slice(3)}</div>`;
      if (t.startsWith('- ') || t.startsWith('・')) return `<div style="display:flex;gap:8px;padding:4px 0;font-size:13px;color:var(--text-secondary);"><span style="color:var(--accent);">•</span><span>${t.replace(/^[-・]\s*/, '')}</span></div>`;
      if (t.match(/https?:\/\//)) return `<div style="font-size:12px;color:var(--text-muted);padding:2px 0;">${t.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:var(--accent);text-decoration:underline;">$1 ↗</a>')}</div>`;
      if (t === '') return '<div style="height:8px"></div>';
      return `<div style="font-size:13px;color:var(--text-secondary);line-height:1.8;margin:2px 0;">${t}</div>`;
    }).join('');
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📊 業界レポート自動生成</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>業界名を入力するだけで、市場規模・トレンド・競合・参入機会を含む完全レポートを生成します</p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input type="text" value={industry} onChange={e => setIndustry(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); generate(); } }} placeholder="業界名を入力（例：医療・ヘルスケア、AI・SaaS）" style={{ flex: 1, padding: '13px 16px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }} />
        <button onClick={generate} disabled={loading || !industry.trim()} style={{ padding: '13px 24px', borderRadius: 10, border: 'none', cursor: loading || !industry.trim() ? 'not-allowed' : 'pointer', background: loading || !industry.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>
          {loading ? '生成中...' : '📊 レポート生成'}
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {POPULAR.map(i => <button key={i} onClick={() => setIndustry(i)} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>{i}</button>)}
      </div>

      {error && (
        <div style={{ padding: 16, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ padding: 24, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          🔍 Web検索中・レポート生成中...（1〜2分かかります）
        </div>
      )}

      {result && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>📊 {industry} 業界レポート</span>
              {usedModel && <ModelBadge model={usedModel} />}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => navigator.clipboard.writeText(result)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>コピー</button>
              <SaveToLibraryButton title={`業界レポート: ${industry}`} content={result} type="web" tags="業界レポート" groupName="業界レポート" />
            </div>
          </div>
          <div style={{ padding: '20px 24px' }} dangerouslySetInnerHTML={{ __html: formatResult(result) }} />
        </div>
      )}
    </div>
  );
}
