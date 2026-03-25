'use client';
import { useState, useEffect } from 'react';

const PRESENTATION_TYPES = [
  { id: 'business', label: '💼 ビジネス提案', desc: '提案・報告・計画書', color: '#6c63ff' },
  { id: 'research', label: '🔬 リサーチ報告', desc: '調査・分析結果', color: '#00d4b8' },
  { id: 'strategy', label: '📊 経営戦略', desc: 'MVV・戦略・ロードマップ', color: '#f5a623' },
  { id: 'pitch', label: '🚀 ピッチデック', desc: '投資家・スタートアップ', color: '#4ade80' },
];

export default function GensparkPage() {
  const [presentationType, setPresentationType] = useState('business');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ctx = localStorage.getItem('lumina_research_context') || localStorage.getItem('lumina_analysis_source');
    if (ctx) { setContent(ctx); localStorage.removeItem('lumina_research_context'); localStorage.removeItem('lumina_analysis_source'); }
  }, []);

  const generate = async () => {
    if (!content.trim()) return;
    setLoading(true); setResult('');

    try {
      const res = await fetch('/api/genspark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title: title || 'プレゼンテーション', presentationType }),
      });

      if (!res.body) { setLoading(false); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'text') { accumulated += json.content; setResult(accumulated); }
          } catch {}
        }
      }
    } catch (e: any) { setResult(`エラー: ${e.message}`); }
    setLoading(false);
  };

  const copyAndOpenGenspark = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => {
      window.open('https://www.genspark.ai', '_blank');
      setCopied(false);
    }, 500);
  };

  const downloadMd = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([result], { type: 'text/plain' }));
    a.download = `genspark_${title || 'presentation'}_${Date.now()}.md`;
    a.click();
  };

  const selectedType = PRESENTATION_TYPES.find(t => t.id === presentationType);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🎯 Genspark プレゼン出力</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>調査・分析結果をGensparkで最高のプレゼン資料に変換します</p>

      {/* Gensparkとは */}
      <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
          💡 <strong>使い方：</strong> ①調査・分析結果を入力 → ②プレゼン形式を選択 → ③構成を生成 → ④コピーしてGensparkに貼り付け
        </div>
        <a href="https://www.genspark.ai" target="_blank" rel="noopener noreferrer"
          style={{ padding: '6px 14px', background: 'var(--accent-soft)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, fontSize: 12, textDecoration: 'none', fontWeight: 600 }}>
          🌐 Gensparkを開く
        </a>
      </div>

      {/* プレゼン形式選択 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {PRESENTATION_TYPES.map(t => (
          <button key={t.id} onClick={() => setPresentationType(t.id)} style={{
            padding: '14px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center' as const,
            border: presentationType === t.id ? `2px solid ${t.color}` : '1px solid var(--border)',
            background: presentationType === t.id ? `${t.color}15` : 'var(--bg-secondary)',
            color: presentationType === t.id ? t.color : 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{t.label.split(' ')[0]}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{t.label.split(' ').slice(1).join(' ')}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* 入力エリア */}
      <div style={{ background: 'var(--bg-secondary)', border: `1px solid ${selectedType?.color}30`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="プレゼンタイトル（例：2026年度マーケティング戦略）"
          style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' as const }}
        />
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="プレゼンにしたい内容を貼り付け&#10;（Intelligence Hub・AI分析・経営インテリジェンスの結果をそのまま貼り付けOK）"
          style={{ width: '100%', minHeight: 180, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, padding: 14, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' as const }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{content.length.toLocaleString()}文字</div>
          <button onClick={generate} disabled={loading || !content.trim()} style={{
            padding: '11px 32px',
            background: `linear-gradient(135deg, ${selectedType?.color}, ${selectedType?.color}cc)`,
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? '⏳ 生成中...' : '🎯 Genspark構成を生成'}
          </button>
        </div>
      </div>

      {/* 結果エリア */}
      {(result || loading) && (
        <div style={{ background: 'var(--bg-secondary)', border: `1px solid ${selectedType?.color}30`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' as const, gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: selectedType?.color }}>
              Genspark用 プレゼン構成
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <button onClick={() => setFontSize(f => Math.max(11, f-1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>−</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fontSize}</span>
              <button onClick={() => setFontSize(f => Math.min(20, f+1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>＋</button>
              <button onClick={downloadMd} style={{ padding: '5px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>💾 MD保存</button>
              <button
                onClick={copyAndOpenGenspark}
                style={{ padding: '5px 16px', background: copied ? 'rgba(74,222,128,0.2)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', border: copied ? '1px solid #4ade80' : 'none', color: copied ? '#4ade80' : '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >
                {copied ? '✅ コピー完了！' : '📋 コピー → Gensparkで開く'}
              </button>
            </div>
          </div>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', padding: '8px 0' }}>
              <div style={{ width: 16, height: 16, border: `2px solid ${selectedType?.color}40`, borderTopColor: selectedType?.color, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Genspark用構成を生成中...
            </div>
          )}

          {/* ステップガイド */}
          {result && !loading && (
            <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
              {['① 上の「コピー → Gensparkで開く」をクリック', '② Gensparkの入力欄に貼り付け', '③ AIが自動でプレゼン資料を生成'].map((step, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{step}</div>
              ))}
            </div>
          )}

          <div style={{ fontSize: fontSize, color: 'var(--text-secondary)', lineHeight: 1.9, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
            {result}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
