'use client';
import { useState, useEffect } from 'react';

const ANALYSIS_TYPES = [
  { id: 'swot', label: '📊 SWOT分析', desc: '強み・弱み・機会・脅威を体系化' },
  { id: 'hypothesis', label: '💡 仮説生成', desc: '根拠ある仮説を3〜5個生成' },
  { id: 'trends', label: '📈 トレンド分析', desc: '短中長期トレンドを予測' },
  { id: 'action', label: '🎯 アクションプラン', desc: '今日から実行できる施策' },
  { id: 'content', label: '✍️ コンテンツ戦略', desc: '記事・SNSアイデアを量産' },
  { id: 'competitor', label: '🏆 競合分析', desc: '差別化戦略を立案' },
];

export default function AnalysisPage() {
  const [analysisType, setAnalysisType] = useState('hypothesis');
  const [content, setContent] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(14);

  useEffect(() => {
    const ctx = localStorage.getItem('lumina_analysis_source');
    if (ctx) { setContent(ctx); localStorage.removeItem('lumina_analysis_source'); }
  }, []);

  const analyze = async () => {
    if (!content.trim()) return;
    setLoading(true); setResult('');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, analysisType }),
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

  const sendToWriter = () => {
    localStorage.setItem('lumina_research_context', `【分析結果】\n${result}\n\n【元データ】\n${content}`);
    window.location.href = '/dashboard/write';
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>🧩 AI分析エンジン</h1>
      <p style={{ color: '#7878a0', marginBottom: 20 }}>収集した情報をAIが深く分析し、仮説・戦略・アクションプランを生成します</p>

      {/* 分析タイプ選択 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
        {ANALYSIS_TYPES.map(t => (
          <button key={t.id} onClick={() => setAnalysisType(t.id)} style={{
            padding: '12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left' as const,
            border: analysisType === t.id ? '2px solid #f5a623' : '1px solid rgba(130,140,255,0.15)',
            background: analysisType === t.id ? 'rgba(245,166,35,0.1)' : '#12142a',
            color: analysisType === t.id ? '#f5a623' : '#7878a0',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{t.label}</div>
            <div style={{ fontSize: 11, color: '#5a5a7a' }}>{t.desc}</div>
          </button>
        ))}
      </div>

      {/* 入力エリア */}
      <div style={{ background: '#12142a', border: '1px solid rgba(130,140,255,0.15)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#7878a0', marginBottom: 8 }}>
          分析する情報を入力（Web情報収集・ディープリサーチの結果をそのまま貼り付けも可）
        </div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="分析したい情報、調査結果、データ、状況説明などを入力してください..."
          style={{ width: '100%', minHeight: 160, background: '#07080f', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 8, color: '#f0f0ff', fontSize: 14, padding: 14, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' as const }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#5a5a7a' }}>{content.length.toLocaleString()}文字</div>
          <button onClick={analyze} disabled={loading || !content.trim()} style={{
            padding: '10px 28px',
            background: 'linear-gradient(135deg, #f5a623, #ef8b2c)',
            color: '#0a0e12', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            opacity: (loading || !content.trim()) ? 0.6 : 1,
          }}>
            {loading ? '⏳ 分析中...' : '🧩 AI分析を実行'}
          </button>
        </div>
      </div>

      {/* 結果エリア */}
      {(result || loading) && (
        <div style={{ background: '#12142a', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' as const, gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f5a623' }}>
              {ANALYSIS_TYPES.find(t => t.id === analysisType)?.label} 結果
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setFontSize(f => Math.max(11, f-1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 14 }}>−</button>
              <span style={{ fontSize: 11, color: '#7878a0', fontFamily: 'monospace' }}>{fontSize}</span>
              <button onClick={() => setFontSize(f => Math.min(20, f+1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 14 }}>＋</button>
              <button onClick={sendToWriter} style={{ padding: '5px 14px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✍️ 文章作成</button>
              <button onClick={() => navigator.clipboard.writeText(result)} style={{ padding: '5px 12px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#a89fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>📋 コピー</button>
              <button onClick={() => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([result], { type: 'text/plain' }));
                a.download = `lumina_analysis_${Date.now()}.md`; a.click();
              }} style={{ padding: '5px 12px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#a89fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>💾 保存</button>
              <button
                onClick={async () => {
                  const { exportToPdf } = await import('@/lib/exportPdf');
                  const t = `${ANALYSIS_TYPES.find(t2 => t2.id === analysisType)?.label}_${new Date().toLocaleDateString('ja-JP')}`;
                  await exportToPdf(t, result);
                }}
                style={{ padding: '5px 12px', background: '#1a1d36', border: '1px solid rgba(255,107,107,0.3)', color: '#ff6b6b', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                📄 PDF
              </button>
            </div>
          </div>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#7878a0', padding: '8px 0' }}>
              <div style={{ width: 16, height: 16, border: '2px solid rgba(245,166,35,0.3)', borderTopColor: '#f5a623', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              分析中...
            </div>
          )}
          <div style={{ fontSize: fontSize, color: '#c0c0e0', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const }}>
            {result}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
