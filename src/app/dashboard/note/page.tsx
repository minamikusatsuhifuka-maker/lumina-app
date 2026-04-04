'use client';
import { useState } from 'react';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

const QUICK_SEARCHES = [
  'AI活用 ビジネス', 'ChatGPT 使い方', 'フリーランス 副業',
  'マーケティング SNS', '読書 要約', 'プログラミング 初心者',
  '投資 資産形成', 'ライティング 文章術',
];

const MAX_RESULTS_OPTIONS = [5, 10, 20];

export default function NotePage() {
  const [query, setQuery] = useState('');
  const [maxResults, setMaxResults] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [fontSize, setFontSize] = useState(14);

  const processInline = (text: string): string => {
    // 太字
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:700;color:var(--text-primary);">$1</strong>');
    // URLリンク化
    text = text.replace(
      /(https?:\/\/[^\s）\]。、！？\n"'<>&]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;">$1 ↗</a>'
    );
    return text;
  };

  const formatResult = (text: string): string => {
    if (!text) return '';
    return text.split('\n').map(line => {
      const t = line.trim();
      if (t.startsWith('## ')) return `<div style="font-size:1.2em;font-weight:700;color:var(--text-primary);margin:24px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--border-accent);">${processInline(t.slice(3))}</div>`;
      if (t.startsWith('### ')) return `<div style="font-size:1.05em;font-weight:700;color:var(--accent);margin:18px 0 10px;">${processInline(t.slice(4))}</div>`;
      if (t.startsWith('---')) return '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">';
      if (t.startsWith('👤') || t.startsWith('📝') || t.startsWith('🔗') || t.startsWith('💡') || t.startsWith('💎') || t.startsWith('📊')) {
        return `<div style="padding:4px 0;line-height:1.8;">${processInline(t)}</div>`;
      }
      if (t === '') return '<div style="height:8px"></div>';
      return `<div style="line-height:1.85;margin:3px 0;">${processInline(t)}</div>`;
    }).join('');
  };

  const handleSearch = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setResult('');

    try {
      const res = await fetch('/api/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxResults }),
      });

      if (!res.body) throw new Error('ストリームなし');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'text') {
              accumulated += json.content;
              setResult(accumulated);
            }
          } catch {}
        }
      }
    } catch (error: any) {
      setResult(`エラー: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 60 }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 28 }}>📓</span> note記事検索
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          note.comからキーワードで記事を検索し、AIが有用な記事をピックアップします
        </p>
      </div>

      {/* 検索エリア */}
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 20, marginBottom: 20,
      }}>
        {/* 検索入力 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
            placeholder="検索キーワードを入力（例：AI活用 ビジネス）"
            style={{
              flex: 1, padding: '12px 16px', fontSize: 14,
              background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 10, color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            style={{
              padding: '12px 24px', borderRadius: 10, border: 'none',
              background: loading || !query.trim()
                ? 'rgba(108,99,255,0.3)'
                : 'linear-gradient(135deg, #41c9b4, #0d9e75)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '検索中...' : '📓 note検索'}
          </button>
        </div>

        {/* オプション */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>件数：</span>
            {MAX_RESULTS_OPTIONS.map(n => (
              <button
                key={n}
                onClick={() => setMaxResults(n)}
                style={{
                  padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: maxResults === n ? 'linear-gradient(135deg, #41c9b4, #0d9e75)' : 'var(--bg-card)',
                  color: maxResults === n ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${maxResults === n ? '#41c9b4' : 'var(--border)'}`,
                }}
              >
                {n}件
              </button>
            ))}
          </div>
        </div>

        {/* クイック検索 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {QUICK_SEARCHES.map(q => (
            <button
              key={q}
              onClick={() => setQuery(q)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* 結果エリア */}
      {(result || loading) && (
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 16, overflow: 'hidden',
        }}>
          {/* 結果ヘッダー */}
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
              📓 note検索結果
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 文字サイズ */}
              <button onClick={() => setFontSize(f => Math.max(10, f - 1))} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>−</button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
              <button onClick={() => setFontSize(f => Math.min(24, f + 1))} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>＋</button>

              {/* noteで開く */}
              <a
                href={`https://note.com/search?q=${encodeURIComponent(query)}&kind=note`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '6px 14px', borderRadius: 8,
                  background: 'rgba(65,201,180,0.1)', border: '1px solid rgba(65,201,180,0.3)',
                  color: '#41c9b4', fontSize: 12, fontWeight: 600, textDecoration: 'none',
                }}
              >
                noteで開く ↗
              </a>

              {/* ライブラリ保存 */}
              {result && (
                <SaveToLibraryButton
                  title={`note検索: ${query}`}
                  content={result}
                  type="web"
                  tags="note"
                  groupName="note検索"
                />
              )}
            </div>
          </div>

          {/* 結果本文 */}
          <div
            style={{ padding: '20px 24px', fontSize, color: 'var(--text-secondary)', lineHeight: 1.85 }}
            dangerouslySetInnerHTML={{ __html: formatResult(result) }}
          />

          {loading && (
            <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
              <div style={{ width: 16, height: 16, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              AIがnote記事を分析中...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
