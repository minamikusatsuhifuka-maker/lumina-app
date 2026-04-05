'use client';
import { useState } from 'react';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

const TEMPLATES = [
  { label: '定例会議', text: '参加者：田中、鈴木、佐藤\n日時：毎週月曜10時\n\n・先週のタスク確認\n・今週の目標設定\n・課題の共有' },
  { label: '1on1', text: '参加者：マネージャー、メンバー\n\n・近況報告\n・課題・困っていること\n・目標進捗\n・次のアクション' },
  { label: '企画会議', text: '新プロジェクトの企画について議論\n\n・背景・目的\n・アイデア出し\n・実現可能性の検討\n・次のステップ' },
];

export default function MinutesPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/minutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setResult(data.result || '');
    } finally {
      setLoading(false);
    }
  };

  const formatResult = (text: string) => {
    if (!text) return '';
    return text.split('\n').map(line => {
      const t = line.trim();
      if (t.startsWith('## ')) return `<div style="font-size:15px;font-weight:700;color:var(--text-primary);margin:20px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--border-accent);">${t.slice(3)}</div>`;
      if (t.startsWith('| ') && t.endsWith(' |')) {
        const cells = t.split('|').filter(c => c.trim());
        const isHeader = cells.some(c => c.trim() === '---' || c.trim() === '-----');
        if (isHeader) return '';
        return `<div style="display:grid;grid-template-columns:repeat(${cells.length},1fr);gap:1px;margin:2px 0;">${cells.map(c => `<div style="padding:6px 10px;background:var(--bg-card);border:1px solid var(--border);font-size:13px;color:var(--text-secondary);">${c.trim()}</div>`).join('')}</div>`;
      }
      if (t.startsWith('- ') || t.startsWith('・')) return `<div style="display:flex;gap:8px;padding:3px 0;font-size:13px;color:var(--text-secondary);"><span style="color:var(--accent);">•</span><span>${t.replace(/^[-・]\s*/, '')}</span></div>`;
      if (t === '') return '<div style="height:6px"></div>';
      return `<div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin:2px 0;">${t}</div>`;
    }).join('');
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📝 AI議事録整理</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>会議メモを貼るだけで、決定事項・アクションアイテム・次のステップを自動整理します</p>
      </div>

      {/* テンプレート */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {TEMPLATES.map(t => (
          <button key={t.label} onClick={() => setText(t.text)} style={{ padding: '5px 14px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            {t.label}テンプレ
          </button>
        ))}
      </div>

      {/* 入力 */}
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="会議メモ・議事録のテキストをここに貼り付けてください..."
        rows={10}
        style={{ width: '100%', padding: '14px 16px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 12, color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.7, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{text.length}文字</span>
        <button onClick={analyze} disabled={loading || !text.trim()} style={{ padding: '11px 28px', borderRadius: 10, border: 'none', cursor: loading || !text.trim() ? 'not-allowed' : 'pointer', background: loading || !text.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 14 }}>
          {loading ? '整理中...' : '📝 AIで議事録を整理'}
        </button>
      </div>

      {result && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>📋 整理済み議事録</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => navigator.clipboard.writeText(result)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>コピー</button>
              <SaveToLibraryButton title={`議事録: ${new Date().toLocaleDateString('ja-JP')}`} content={result} type="web" tags="議事録" groupName="議事録" />
            </div>
          </div>
          <div style={{ padding: '20px 24px' }} dangerouslySetInnerHTML={{ __html: formatResult(result) }} />
        </div>
      )}
    </div>
  );
}
