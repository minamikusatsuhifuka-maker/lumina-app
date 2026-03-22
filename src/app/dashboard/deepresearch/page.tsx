'use client';
import { useState } from 'react';

const TEMPLATES = [
  { label: 'AI最新動向', topic: '2026年の生成AI・大規模言語モデルの最新動向と活用事例' },
  { label: 'ブログ収益化', topic: 'ブログ・noteで月10万円稼ぐための最新戦略と実践方法' },
  { label: '電子書籍出版', topic: 'Kindleダイレクト・パブリッシングで電子書籍を出版する方法と収益化' },
  { label: 'SEO対策', topic: '2026年最新のSEO対策・Google検索アルゴリズム変化への対応' },
  { label: '小説執筆', topic: 'プロ作家に学ぶ小説執筆テクニック・キャラクター作り・世界観構築' },
  { label: 'SNSマーケ', topic: 'X(Twitter)・Instagram・TikTokを活用したコンテンツマーケティング最新手法' },
];

const formatReport = (text: string) => {
  if (!text) return '';

  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    // 見出し
    if (line.startsWith('# ')) return `<h2 style="font-size:1.3em;font-weight:700;color:#f0f0ff;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid rgba(130,140,255,0.2);">${line.slice(2)}</h2>`;
    if (line.startsWith('## ')) return `<h3 style="font-size:1.1em;font-weight:600;color:#a89fff;margin:12px 0 6px;">${line.slice(3)}</h3>`;
    if (line.startsWith('### ')) return `<h4 style="font-size:1em;font-weight:600;color:#7878a0;margin:8px 0 4px;">${line.slice(4)}</h4>`;
    // 箇条書き
    if (line.startsWith('- ')) return `<div style="padding:2px 0 2px 16px;position:relative;"><span style="position:absolute;left:4px;color:#6c63ff;">•</span>${line.slice(2)}</div>`;
    // 区切り線
    if (line.match(/^---+$/)) return '<hr style="border:none;border-top:1px solid rgba(130,140,255,0.15);margin:12px 0;">';
    // 空行
    if (line.trim() === '') return '<div style="height:6px"></div>';
    // 通常行
    return `<p style="margin:4px 0;line-height:1.8;">${line}</p>`;
  });

  return processedLines
    .join('')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e0e0f0;">$1</strong>');
};

export default function DeepResearchPage() {
  const [topic, setTopic] = useState('');
  const [depth, setDepth] = useState('standard');
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [elapsed, setElapsed] = useState(0);

  const research = async (t?: string) => {
    const q = t || topic;
    if (!q.trim()) return;
    setLoading(true);
    setReport('');
    setElapsed(0);

    const timer = setInterval(() => setElapsed(e => e + 1), 1000);

    try {
      const res = await fetch('/api/deepresearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: q, depth }),
      });

      if (!res.ok || !res.body) {
        setReport('エラーが発生しました。');
        clearInterval(timer);
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'text') {
              accumulated += json.content;
              setReport(accumulated);
            } else if (json.type === 'error') {
              setReport(`エラー: ${json.message}`);
            }
          } catch {}
        }
      }
    } catch (error: any) {
      setReport(`通信エラー: ${error.message}`);
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  };

  const sendToWrite = () => {
    localStorage.setItem('lumina_research_context', report);
    window.location.href = '/dashboard/write';
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([report], { type: 'text/plain' }));
    a.download = `lumina_research_${Date.now()}.md`;
    a.click();
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 8 }}>🔭 ディープリサーチ</h1>
      <p style={{ color: '#7878a0', marginBottom: 24 }}>Claude AIが複数ソースを統合し、徹底的なリサーチレポートを生成します</p>

      <div style={{ background: '#12142a', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#7878a0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>リサーチトピック</div>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder={'調査したいテーマを詳しく入力してください\n例：AIを活用したブログ記事の自動生成と収益化の最新事例'}
            style={{ width: '100%', minHeight: 80, background: '#07080f', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 8, color: '#f0f0ff', fontSize: 14, padding: 12, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[
            { value: 'quick', label: '⚡ クイック', desc: '約500字' },
            { value: 'standard', label: '📊 スタンダード', desc: '約1500字' },
            { value: 'deep', label: '🔭 ディープ', desc: '約3000字+' },
          ].map(d => (
            <button
              key={d.value}
              onClick={() => setDepth(d.value)}
              style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: depth === d.value ? '2px solid #6c63ff' : '1px solid rgba(130,140,255,0.2)', cursor: 'pointer', background: depth === d.value ? 'rgba(108,99,255,0.15)' : '#07080f', color: depth === d.value ? '#a89fff' : '#7878a0', fontSize: 13, fontWeight: 600, textAlign: 'center' as const }}
            >
              <div>{d.label}</div>
              <div style={{ fontSize: 11, marginTop: 2, fontWeight: 400 }}>{d.desc}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => research()}
            disabled={loading}
            style={{ padding: '10px 28px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? `🔍 調査中... ${elapsed}秒` : '🔭 ディープリサーチ開始'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#7878a0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>クイックテンプレート</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => { setTopic(t.topic); research(t.topic); }}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(108,99,255,0.2)', background: 'rgba(108,99,255,0.05)', color: '#a89fff', cursor: 'pointer', fontSize: 12 }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ background: '#12142a', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: '#a89fff', fontWeight: 600, marginBottom: 6 }}>複数のWebソースを調査・統合中...</div>
          <div style={{ color: '#5a5a7a', fontSize: 13 }}>{elapsed}秒経過 / ディープリサーチは30〜60秒かかります</div>
        </div>
      )}

      {report && !loading && (
        <div style={{ background: '#12142a', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#a89fff' }}>🔭 リサーチレポート</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#5a5a7a' }}>文字サイズ</span>
                <button onClick={() => setFontSize(f => Math.max(11, f - 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontSize: 12, color: '#7878a0', fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
                <button onClick={() => setFontSize(f => Math.min(20, f + 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
              </div>
              <button onClick={sendToWrite} style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                ✍️ 文章作成に使う
              </button>
              <button onClick={download} style={{ padding: '6px 14px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#a89fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                💾 MD保存
              </button>
              <button onClick={() => navigator.clipboard.writeText(report)} style={{ padding: '6px 14px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#a89fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                📋 コピー
              </button>
            </div>
          </div>
          <div
            style={{ fontSize: fontSize, color: '#c0c0e0', lineHeight: 1.8, wordBreak: 'break-word' as const }}
            dangerouslySetInnerHTML={{ __html: formatReport(report) }}
          />
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
