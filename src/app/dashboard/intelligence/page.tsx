'use client';
import { useState } from 'react';

const SEARCH_MODES = [
  { id: 'news', label: '📰 最新ニュース', desc: 'リアルタイムニュース・時事情報' },
  { id: 'sns', label: '📱 SNSトレンド', desc: 'Twitter・Reddit・バズり情報' },
  { id: 'market', label: '📊 市場・競合', desc: 'ビジネス・市場動向分析' },
  { id: 'academic', label: '🔬 学術・研究', desc: '論文・エビデンス・医療情報' },
  { id: 'web', label: '🌐 Web総合', desc: 'Claude AI による総合Web調査' },
  { id: 'management', label: '👥 組織・人材', desc: '最新マネジメント・育成手法' },
  { id: 'marketing', label: '📣 マーケ・ブランド', desc: '最新マーケ施策・SNS戦略' },
  { id: 'hr', label: '🤝 採用・HR', desc: '採用トレンド・エンゲージメント' },
];

const QUICK_TOPICS: Record<string, string[]> = {
  news: ['AI最新ニュース2026', 'テクノロジートレンド', '日本経済ニュース', 'スタートアップ注目動向'],
  sns: ['ChatGPT話題', 'note人気記事テーマ', 'Xトレンドビジネス', 'バイラルコンテンツ分析'],
  market: ['生成AI市場規模', 'SaaS競合比較', 'デジタルマーケ最新手法', 'EC市場動向'],
  academic: ['うつ病 最新治療', 'AI 倫理 研究', '長寿 食事 研究', 'コロナ後遺症 論文'],
  web: ['副業 AI活用 最新', 'note収益化 方法', '電子書籍 出版 手順', 'Kindle セルフ出版'],
  management: ['心理的安全性 実践方法', 'OKR 導入 成功事例', '1on1 効果的な進め方', 'ティール組織 日本企業事例', '従業員エンゲージメント向上'],
  marketing: ['コンテンツマーケ 2026年最新', 'SNS運用 企業事例', 'BtoBマーケ戦略', 'インフルエンサーマーケ 費用対効果'],
  hr: ['エンジニア採用 最新手法', 'リファラル採用 成功事例', '離職防止 施策', 'ダイバーシティ採用 取り組み'],
};

async function retryFetch(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const waitMs = (i + 1) * 3000;
    console.log(`[retry] 429 received, waiting ${waitMs}ms... (attempt ${i + 1}/${maxRetries})`);
    await new Promise(r => setTimeout(r, waitMs));
  }
  return fetch(url, options);
}

const formatResult = (text: string) => {
  if (!text) return '';

  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();

    if (trimmed.startsWith('# ')) {
      return `<div style="font-size:1.3em;font-weight:700;color:#f0f0ff;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid rgba(130,140,255,0.2);">${processInline(trimmed.slice(2))}</div>`;
    }
    if (trimmed.startsWith('## ')) {
      return `<div style="font-size:1.1em;font-weight:600;color:#a89fff;margin:12px 0 6px;">${processInline(trimmed.slice(3))}</div>`;
    }
    if (trimmed.startsWith('### ')) {
      return `<div style="font-size:1em;font-weight:600;color:#7878a0;margin:8px 0 4px;">${processInline(trimmed.slice(4))}</div>`;
    }
    if (trimmed.startsWith('- ')) {
      return `<div style="padding:2px 0 2px 16px;position:relative;line-height:1.8;"><span style="position:absolute;left:4px;color:#6c63ff;">•</span>${processInline(trimmed.slice(2))}</div>`;
    }
    if (trimmed.match(/^---+$/)) {
      return '<hr style="border:none;border-top:1px solid rgba(130,140,255,0.15);margin:12px 0;">';
    }
    if (trimmed === '') {
      return '<div style="height:6px"></div>';
    }
    return `<div style="margin:4px 0;line-height:1.8;">${processInline(trimmed)}</div>`;
  });

  return processedLines.join('');
};

const processInline = (text: string): string => {
  // 太字
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e0e0f0;">$1</strong>');

  // [出典: サイト名](URL) 形式 → クリッカブルリンク
  text = text.replace(
    /\[出典[:：]\s*([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_, name, url) => {
      // URLからHTML属性らしき部分を除去
      const cleanUrl = url.split('"')[0].split("'")[0].replace(/↗$/, '').trim();
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:none;border-bottom:1px solid #00d4b8;">${name} ↗</a>`;
    }
  );

  // " target="_blank"... のような残骸テキストを除去
  text = text.replace(/" target="_blank"[^<]*/g, '');
  text = text.replace(/" rel="noopener[^<]*/g, '');
  text = text.replace(/style="color:#[0-9a-fA-F]+;[^"]*">/g, '');

  // 裸のURL → クリッカブルリンク（HTMLタグ属性の中のURLは除外）
  text = text.replace(
    /(?<!href=")(https?:\/\/[^\s<>"'）\]、。！？↗]+?)(?=[）\]、。！？\s↗]|$)/g,
    (_, url) => {
      const cleanUrl = url.replace(/↗$/, '').trim();
      return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:none;border-bottom:1px solid #00d4b8;">${cleanUrl} ↗</a>`;
    }
  );

  return text;
};

export default function IntelligencePage() {
  const [mode, setMode] = useState('web');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(14);

  const search = async (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
    setLoading(true);
    setResult('');

    try {
      if (mode === 'academic') {
        const res = await retryFetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        });
        const data = await res.json();
        const papers = data.data || [];
        const text = papers.map((p: any) =>
          `## ${p.title}\n**著者:** ${p.authors?.slice(0,3).map((a:any)=>a.name).join(', ')}\n**年:** ${p.year || '不明'} | **被引用:** ${p.citationCount || 0}\n\n${p.abstract || '要旨なし'}\n`
        ).join('\n---\n');
        setResult(text || '結果が見つかりませんでした');
        setLoading(false);
        return;
      }

      const res = await retryFetch('/api/websearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, mode }),
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
    } catch (e: any) {
      setResult(`エラー: ${e.message}`);
    }
    setLoading(false);
  };

  const sendToWriter = () => {
    localStorage.setItem('lumina_research_context', result);
    window.location.href = '/dashboard/write';
  };

  const sendToAnalysis = () => {
    localStorage.setItem('lumina_analysis_source', result);
    window.location.href = '/dashboard/analysis';
  };

  const topics = QUICK_TOPICS[mode] || [];

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>🧠 Intelligence Hub</h1>
      <p style={{ color: '#7878a0', marginBottom: 20 }}>複数ソースから情報を収集・統合するインテリジェンスセンター</p>

      {/* モード選択 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {SEARCH_MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              padding: '12px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center' as const,
              border: mode === m.id ? '2px solid #6c63ff' : '1px solid rgba(130,140,255,0.15)',
              background: mode === m.id ? 'rgba(108,99,255,0.15)' : '#12142a',
              color: mode === m.id ? '#a89fff' : '#7878a0', transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 16, marginBottom: 4 }}>{m.label.split(' ')[0]}</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{m.label.split(' ').slice(1).join(' ')}</div>
            <div style={{ fontSize: 10, marginTop: 2, color: '#5a5a7a' }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {/* 検索バー */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder={`${SEARCH_MODES.find(m2=>m2.id===mode)?.desc || ''}のキーワードを入力`}
          style={{ flex: 1, padding: '12px 16px', background: '#12142a', border: '1px solid rgba(108,99,255,0.3)', borderRadius: 10, color: '#f0f0ff', fontSize: 14, outline: 'none' }}
        />
        <button
          onClick={() => search()}
          disabled={loading}
          style={{ padding: '12px 28px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: loading ? 0.7 : 1, whiteSpace: 'nowrap' as const }}
        >
          {loading ? '調査中...' : '🔍 調査開始'}
        </button>
      </div>

      {/* クイックトピック */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 20 }}>
        {topics.map(t => (
          <button key={t} onClick={() => { setQuery(t); search(t); }}
            style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid rgba(108,99,255,0.2)', background: 'rgba(108,99,255,0.05)', color: '#a89fff', cursor: 'pointer', fontSize: 12 }}>
            {t}
          </button>
        ))}
      </div>

      {/* 結果エリア */}
      {(result || loading) && (
        <div style={{ background: '#12142a', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' as const, gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#a89fff' }}>
              {SEARCH_MODES.find(m2=>m2.id===mode)?.label} 結果
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 11, color: '#5a5a7a' }}>文字サイズ</span>
              <button onClick={() => setFontSize(f => Math.max(11, f-1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 14 }}>−</button>
              <span style={{ fontSize: 11, color: '#7878a0', fontFamily: 'monospace' }}>{fontSize}</span>
              <button onClick={() => setFontSize(f => Math.min(20, f+1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid rgba(130,140,255,0.2)', background: '#1a1d36', color: '#a89fff', cursor: 'pointer', fontSize: 14 }}>＋</button>
              <button onClick={sendToAnalysis} style={{ padding: '5px 12px', background: 'rgba(245,166,35,0.15)', border: '1px solid rgba(245,166,35,0.3)', color: '#f5a623', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🧩 分析する</button>
              <button
                onClick={async () => {
                  const group = prompt('グループ名（例：AI調査、市場分析）') || '未分類';
                  const tags = prompt('タグ（カンマ区切り、例：AI,マーケ）') || '';
                  await fetch('/api/library', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'research', title: query || '調査結果', content: result, tags, group_name: group }),
                  });
                  alert('✅ ライブラリに保存しました！');
                }}
                style={{ padding: '5px 12px', background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                📚 保存
              </button>
              <button onClick={sendToWriter} style={{ padding: '5px 12px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✍️ 文章作成</button>
              <button onClick={() => navigator.clipboard.writeText(result)} style={{ padding: '5px 12px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#a89fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>📋 コピー</button>
            </div>
          </div>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#7878a0', padding: '8px 0' }}>
              <div style={{ width: 16, height: 16, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              AIが調査中...（混雑時は自動でリトライします）
            </div>
          )}
          <div
            style={{ fontSize: fontSize, color: '#c0c0e0', lineHeight: 1.8, wordBreak: 'break-word' as const }}
            dangerouslySetInnerHTML={{ __html: formatResult(result) }}
          />
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
