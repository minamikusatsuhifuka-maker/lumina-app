'use client';
import { useState } from 'react';

const QUICK_SEARCHES = [
  'AIの最新トレンド2026年', 'ChatGPT活用事例ビジネス', 'note ブログ収益化のコツ',
  '小説執筆プロ作家のテクニック', '電子書籍出版方法', 'SEO対策2026年最新',
];

const formatResult = (text: string) => {
  return text
    .replace(/\[出典: ([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;text-decoration:underline;">[$1]</a>')
    .replace(/(https?:\/\/[^\s\)]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#00d4b8;font-size:12px;word-break:break-all;">$1</a>')
    .replace(/^# (.+)$/gm, '<div style="font-size:18px;font-weight:700;color:#f0f0ff;margin:16px 0 8px;">$1</div>')
    .replace(/^## (.+)$/gm, '<div style="font-size:15px;font-weight:600;color:#a89fff;margin:14px 0 6px;">$1</div>')
    .replace(/^### (.+)$/gm, '<div style="font-size:14px;font-weight:600;color:#7878a0;margin:10px 0 4px;">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e0e0f0;">$1</strong>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid rgba(130,140,255,0.15);margin:12px 0;">')
    .replace(/\n/g, '<br>');
};

export default function WebSearchPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const search = async (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={sendToWrite} style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                ✍️ 文章作成に使う
              </button>
              <button onClick={() => navigator.clipboard.writeText(result)} style={{ padding: '6px 14px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#a89fff', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                📋 コピー
              </button>
            </div>
          </div>
          <div
            style={{ fontSize: 14, color: '#c0c0e0', lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{ __html: formatResult(result) }}
          />
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
