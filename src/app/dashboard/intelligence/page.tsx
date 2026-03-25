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

const processInline = (text: string): string => {
  // 太字
  text = text.replace(/\*\*(.+?)\*\*/g,
    '<strong style="color:var(--text-primary);font-weight:600;">$1</strong>');

  // 「出典: サイト名 https://URL」形式
  text = text.replace(
    /出典[:：]\s*([^\s]+)\s+(https?:\/\/[^\s）\]。、！？\n]+)/g,
    '出典: <a href="$2" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:underline;">$1 ↗</a>'
  );

  // 裸のURL（前後に余分なものがないもの）
  text = text.replace(
    /(?<![="'(])(https?:\/\/[^\s）\]。、！？\n"'<>]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:underline;font-size:0.9em;">$1 ↗</a>'
  );

  return text;
};

const formatResult = (text: string): string => {
  if (!text) return '';

  const lines = text.split('\n');
  const html = lines.map(line => {
    const t = line.trim();

    // 見出し
    if (t.startsWith('# ')) return `<div style="font-size:1.25em;font-weight:700;color:var(--text-primary);margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--border-accent);">${processInline(t.slice(2))}</div>`;
    if (t.startsWith('## ')) return `<div style="font-size:1.1em;font-weight:600;color:var(--text-secondary);margin:16px 0 8px;padding-left:8px;border-left:3px solid var(--accent);">${processInline(t.slice(3))}</div>`;
    if (t.startsWith('### ')) return `<div style="font-size:1em;font-weight:600;color:var(--text-muted);margin:10px 0 4px;">${processInline(t.slice(4))}</div>`;

    // 番号付きリスト
    if (t.match(/^\d+\.\s/)) {
      const match = t.match(/^(\d+)\.\s(.+)/);
      if (match) return `<div style="display:flex;gap:8px;padding:4px 0;line-height:1.7;"><span style="color:var(--accent);font-weight:700;min-width:20px;">${match[1]}.</span><span>${processInline(match[2])}</span></div>`;
    }

    // 箇条書き
    if (t.startsWith('- ') || t.startsWith('• ')) {
      return `<div style="display:flex;gap:8px;padding:3px 0;line-height:1.7;"><span style="color:var(--accent);margin-top:2px;">•</span><span>${processInline(t.slice(2))}</span></div>`;
    }

    // 出典行（「出典:」で始まる行）
    if (t.startsWith('出典') || t.startsWith('【出典】') || t.startsWith('参考')) {
      return `<div style="font-size:0.85em;color:var(--text-muted);padding:4px 0 4px 12px;border-left:2px solid rgba(0,212,184,0.3);margin:4px 0;">${processInline(t)}</div>`;
    }

    // 区切り線
    if (t.match(/^---+$/)) return '<hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">';

    // 空行
    if (t === '') return '<div style="height:8px"></div>';

    // 通常のテキスト
    return `<div style="line-height:1.85;margin:3px 0;">${processInline(t)}</div>`;
  });

  return html.join('');
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
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🧠 Intelligence Hub</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>複数ソースから情報を収集・統合するインテリジェンスセンター</p>

      {/* モード選択 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {SEARCH_MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            style={{
              padding: '12px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center' as const,
              border: mode === m.id ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: mode === m.id ? 'var(--accent-soft)' : 'var(--bg-secondary)',
              color: mode === m.id ? 'var(--text-secondary)' : 'var(--text-muted)', transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 16, marginBottom: 4 }}>{m.label.split(' ')[0]}</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{m.label.split(' ').slice(1).join(' ')}</div>
            <div style={{ fontSize: 10, marginTop: 2, color: 'var(--text-muted)' }}>{m.desc}</div>
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
          style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-accent)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, outline: 'none' }}
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
            style={{ padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--accent-soft)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>
            {t}
          </button>
        ))}
      </div>

      {/* 結果エリア */}
      {(result || loading) && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' as const, gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {SEARCH_MODES.find(m2=>m2.id===mode)?.label} 結果
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>文字サイズ</span>
              <button onClick={() => setFontSize(f => Math.max(11, f-1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>−</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fontSize}</span>
              <button onClick={() => setFontSize(f => Math.min(20, f+1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14 }}>＋</button>
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
              <button onClick={() => navigator.clipboard.writeText(result)} style={{ padding: '5px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>📋 コピー</button>
            </div>
          </div>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', padding: '8px 0' }}>
              <div style={{ width: 16, height: 16, border: '2px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              AIが調査中...（混雑時は自動でリトライします）
            </div>
          )}
          <div
            style={{ fontSize: fontSize, color: 'var(--text-secondary)', lineHeight: 1.8, wordBreak: 'break-word' as const }}
            dangerouslySetInnerHTML={{ __html: formatResult(result) }}
          />
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
