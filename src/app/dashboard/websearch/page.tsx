'use client';
import { useState } from 'react';

const QUICK_SEARCHES = [
  'AIの最新トレンド2026年', 'ChatGPT活用事例ビジネス', 'note ブログ収益化のコツ',
  '小説執筆プロ作家のテクニック', '電子書籍出版方法', 'SEO対策2026年最新',
];

const formatResult = (text: string) => {
  // ステップ1: Markdownのリンク記法を先に抽出・変換
  let result = text.replace(
    /\[出典: ([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '___LINK_START___$1___LINK_MID___$2___LINK_END___'
  );

  // ステップ2: HTMLエスケープ
  result = result
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // ステップ3: リンクを復元
  result = result.replace(
    /___LINK_START___(.*?)___LINK_MID___(.*?)___LINK_END___/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:underline;">[$1]</a>'
  );

  // ステップ4: 裸のURLをリンク化
  result = result.replace(
    /(https?:\/\/[^\s<>&"')\]]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;font-size:11px;word-break:break-all;">$1</a>'
  );

  // ステップ5: Markdown変換
  result = result
    .replace(/^# (.+)$/gm,
      '<div style="font-size:1.3em;font-weight:700;color:#f0f0ff;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid rgba(130,140,255,0.2);">$1</div>')
    .replace(/^## (.+)$/gm,
      '<div style="font-size:1.1em;font-weight:600;color:#a89fff;margin:14px 0 6px;">$1</div>')
    .replace(/^### (.+)$/gm,
      '<div style="font-size:1em;font-weight:600;color:#7878a0;margin:10px 0 4px;">$1</div>')
    .replace(/\*\*(.+?)\*\*/g,
      '<strong style="color:#e0e0f0;font-weight:600;">$1</strong>')
    .replace(/^- (.+)$/gm,
      '<div style="padding:3px 0 3px 18px;position:relative;line-height:1.7;"><span style="position:absolute;left:4px;color:#6c63ff;">•</span>$1</div>')
    .replace(/^(\d+)\. (.+)$/gm,
      '<div style="padding:3px 0 3px 22px;position:relative;line-height:1.7;"><span style="position:absolute;left:0;color:#6c63ff;font-weight:600;">$1.</span>$2</div>')
    .replace(/^---+$/gm,
      '<hr style="border:none;border-top:1px solid rgba(130,140,255,0.12);margin:14px 0;">')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\n/g, '<div style="height:0.8em"></div>')
    .replace(/\n/g, '<br>');

  return result;
};

export default function WebSearchPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [history, setHistory] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('lumina_search_history') || '[]'); } catch { return []; }
  });

  const search = async (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
    const newHistory = [searchQuery, ...history.filter(h => h !== searchQuery)].slice(0, 5);
    setHistory(newHistory);
    localStorage.setItem('lumina_search_history', JSON.stringify(newHistory));
    setLoading(true);
    setResult('');

    try {
      const res = await fetch('/api/websearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });

      if (!res.ok || !res.body) {
        setResult('エラーが発生しました。');
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
              setResult(accumulated);
            } else if (json.type === 'error') {
              setResult(`エラー: ${json.message}`);
            }
          } catch {}
        }
      }
    } catch (error: any) {
      setResult(`通信エラー: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const sendToWrite = () => {
    localStorage.setItem('lumina_research_context', result);
    window.location.href = '/dashboard/write';
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 8 }}>🌐 Web情報収集</h1>
      <p style={{ color: '#7878a0', marginBottom: 24 }}>Claude AIがWebを検索し、引用付きで最新情報をまとめます</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="調べたいテーマを入力（例：2026年のAI最新動向）"
          style={{ flex: 1, padding: '12px 16px', background: '#12142a', border: '1px solid rgba(0,212,184,0.3)', borderRadius: 10, color: '#f0f0ff', fontSize: 15, outline: 'none' }}
        />
        <button onClick={() => search()} disabled={loading} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #00d4b8, #00b4d8)', color: '#0a0e12', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          {loading ? '調査中...' : '🔍 調査'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
        {QUICK_SEARCHES.map(q => (
          <button key={q} onClick={() => { setQuery(q); search(q); }} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(0,212,184,0.2)', background: 'rgba(0,212,184,0.05)', color: '#00d4b8', cursor: 'pointer', fontSize: 12 }}>
            {q}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#5a5a7a', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>最近の検索</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {history.map(h => (
              <button
                key={h}
                onClick={() => { setQuery(h); search(h); }}
                style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(130,140,255,0.15)', background: 'rgba(130,140,255,0.05)', color: '#7878a0', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                🕐 {h}
              </button>
            ))}
            <button
              onClick={() => { setHistory([]); localStorage.removeItem('lumina_search_history'); }}
              style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(255,107,107,0.2)', background: 'transparent', color: '#ff6b6b', cursor: 'pointer', fontSize: 11 }}
            >
              🗑 クリア
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ background: '#12142a', border: '1px solid rgba(0,212,184,0.2)', borderRadius: 12, padding: 24, display: 'flex', alignItems: 'center', gap: 12, color: '#7878a0' }}>
          <div style={{ width: 20, height: 20, border: '2px solid rgba(0,212,184,0.3)', borderTopColor: '#00d4b8', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          Claude がWebを調査中...
        </div>
      )}

      {result && !loading && (
        <div style={{ background: '#12142a', border: '1px solid rgba(0,212,184,0.2)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#00d4b8' }}>🌐 Web調査結果</span>
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
              <button onClick={() => navigator.clipboard.writeText(result)} style={{ padding: '6px 14px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#a89fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                📋 コピー
              </button>
            </div>
          </div>
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
