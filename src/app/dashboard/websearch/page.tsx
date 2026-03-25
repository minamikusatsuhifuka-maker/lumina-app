'use client';
import { useState } from 'react';

const QUICK_SEARCHES = [
  'AIの最新トレンド2026年', 'ChatGPT活用事例ビジネス', 'note ブログ収益化のコツ',
  '小説執筆プロ作家のテクニック', '電子書籍出版方法', 'SEO対策2026年最新',
];

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

const processInline = (text: string, hitUrls?: Set<string>): string => {
  // すでに<a href=...>タグが含まれている場合はそのまま返す
  if (text.includes('<a href=')) return text;

  // 太字
  text = text.replace(/\*\*(.+?)\*\*/g,
    '<strong style="color:var(--text-primary);font-weight:600;">$1</strong>');

  // 「出典: サイト名 https://URL」形式
  text = text.replace(
    /出典[:：]\s*([^\s]+)\s+(https?:\/\/[^\s）\]。、！？\n]+)/g,
    '出典: <a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--link-color, #00d4b8);text-decoration:underline;">$1 ↗</a>'
  );

  // 裸のURL
  text = text.replace(
    /(?<![="'(])(https?:\/\/[^\s）\]。、！？\n"'<>]+)/g,
    (match) => {
      const isHit = hitUrls?.has(match);
      const badge = isHit
        ? ' <span style="font-size:10px;background:#6c63ff33;color:var(--text-secondary);border:1px solid #6c63ff55;border-radius:10px;padding:1px 6px;margin-left:4px;">📌 過去に登場</span>'
        : '';
      return `<a href="${match}" target="_blank" rel="noopener noreferrer" style="color:var(--link-color, #00d4b8);text-decoration:underline;font-size:0.9em;">${match} ↗</a>${badge}`;
    }
  );

  return text;
};

const formatResult = (text: string, hitUrls?: Set<string>): string => {
  if (!text) return '';

  const lines = text.split('\n');
  const html = lines.map(line => {
    const t = line.trim();

    // 見出し
    if (t.startsWith('# ')) return `<div style="font-size:1.25em;font-weight:700;color:var(--text-primary);margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--border-accent);">${processInline(t.slice(2), hitUrls)}</div>`;
    if (t.startsWith('## ')) return `<div style="font-size:1.1em;font-weight:600;color:var(--text-secondary);margin:16px 0 8px;padding-left:8px;border-left:3px solid var(--accent);">${processInline(t.slice(3), hitUrls)}</div>`;
    if (t.startsWith('### ')) return `<div style="font-size:1em;font-weight:600;color:var(--text-muted);margin:10px 0 4px;">${processInline(t.slice(4), hitUrls)}</div>`;

    // 番号付きリスト
    if (t.match(/^\d+\.\s/)) {
      const match = t.match(/^(\d+)\.\s(.+)/);
      if (match) return `<div style="display:flex;gap:8px;padding:4px 0;line-height:1.7;"><span style="color:var(--accent);font-weight:700;min-width:20px;">${match[1]}.</span><span>${processInline(match[2], hitUrls)}</span></div>`;
    }

    // 箇条書き
    if (t.startsWith('- ') || t.startsWith('• ')) {
      return `<div style="display:flex;gap:8px;padding:3px 0;line-height:1.7;"><span style="color:var(--accent);margin-top:2px;">•</span><span>${processInline(t.slice(2), hitUrls)}</span></div>`;
    }

    // 出典行（「出典:」で始まる行）
    if (t.startsWith('出典') || t.startsWith('【出典】') || t.startsWith('参考')) {
      return `<div style="font-size:0.85em;color:var(--text-muted);padding:4px 0 4px 12px;border-left:2px solid rgba(0,212,184,0.3);margin:4px 0;">${processInline(t, hitUrls)}</div>`;
    }

    // 区切り線
    if (t.match(/^---+$/)) return '<hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">';

    // 空行
    if (t === '') return '<div style="height:8px"></div>';

    // 通常のテキスト
    return `<div style="line-height:1.85;margin:3px 0;">${processInline(t, hitUrls)}</div>`;
  });

  return html.join('');
};

export default function WebSearchPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState('');
  const [hitUrls, setHitUrls] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('lumina_hit_urls');
      return new Set(JSON.parse(stored || '[]'));
    } catch { return new Set(); }
  });
  const [history, setHistory] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem('lumina_search_history') || '[]'); } catch { return []; }
  });

  const saveHitUrls = (text: string) => {
    const urlMatches = text.match(/https?:\/\/[^\s）\]。、！？\n"'<>&]+/g) || [];
    if (urlMatches.length === 0) return;

    setHitUrls(prev => {
      const next = new Set(prev);
      urlMatches.forEach(url => next.add(url));
      const arr = Array.from(next).slice(-200);
      try { localStorage.setItem('lumina_hit_urls', JSON.stringify(arr)); } catch {}
      return new Set(arr);
    });
  };

  const search = async (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
    const newHistory = [searchQuery, ...history.filter(h => h !== searchQuery)].slice(0, 5);
    setHistory(newHistory);
    localStorage.setItem('lumina_search_history', JSON.stringify(newHistory));
    setLoading(true);
    setResult('');

    try {
      const res = await retryFetch('/api/websearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, maxTokens, period }),
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
      saveHitUrls(accumulated);
    } catch (error: any) {
      setResult(`通信エラー: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveToLibrary = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'web',
          title: `Web調査: ${query}`,
          content: result,
          metadata: { query, searchedAt: new Date().toISOString() },
          tags: 'Web情報収集',
          group_name: 'Web調査',
        }),
      });
      if (res.ok) {
        setToast('✅ ライブラリに保存しました！');
        setTimeout(() => setToast(''), 2000);
      } else {
        setToast('❌ 保存に失敗しました');
        setTimeout(() => setToast(''), 2000);
      }
    } catch {
      setToast('❌ 保存に失敗しました');
      setTimeout(() => setToast(''), 2000);
    } finally {
      setSaving(false);
    }
  };

  const sendToWrite = () => {
    localStorage.setItem('lumina_research_context', result);
    window.location.href = '/dashboard/write';
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🌐 Web情報収集</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Claude AIがWebを検索し、引用付きで最新情報をまとめます</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="調べたいテーマを入力（例：2026年のAI最新動向）"
          style={{ flex: 1, padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid rgba(0,212,184,0.3)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 15, outline: 'none' }}
        />
        <button onClick={() => search()} disabled={loading} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #00d4b8, #00b4d8)', color: '#0a0e12', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
          {loading ? '調査中...' : '🔍 調査'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>回答の長さ:</span>
        {([
          { label: '簡潔', value: 1000 },
          { label: '標準', value: 2000 },
          { label: '詳細', value: 4000 },
        ] as const).map(opt => (
          <button
            key={opt.value}
            onClick={() => setMaxTokens(opt.value)}
            style={{
              padding: '4px 14px',
              borderRadius: 20,
              border: `1px solid ${maxTokens === opt.value ? 'rgba(0,212,184,0.6)' : 'var(--border)'}`,
              background: maxTokens === opt.value ? 'rgba(0,212,184,0.15)' : 'transparent',
              color: maxTokens === opt.value ? '#00d4b8' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: maxTokens === opt.value ? 600 : 400,
              transition: 'all 0.2s',
            }}
          >
            {opt.label}（{opt.value}トークン）
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>検索期間：</span>
        {[
          { label: '指定なし', value: '' },
          { label: '最近1週間', value: '1week' },
          { label: '最近1ヶ月', value: '1month' },
          { label: '最近3ヶ月', value: '3months' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            style={{
              padding: '6px 14px',
              background: period === opt.value ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'rgba(255,255,255,0.05)',
              color: period === opt.value ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${period === opt.value ? '#6c63ff' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
        {QUICK_SEARCHES.map(q => (
          <button key={q} onClick={() => setQuery(q)} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(0,212,184,0.2)', background: 'rgba(0,212,184,0.05)', color: '#00d4b8', cursor: 'pointer', fontSize: 12 }}>
            {q}
          </button>
        ))}
      </div>

      {history.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>最近の検索</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {history.map(h => (
              <button
                key={h}
                onClick={() => setQuery(h)}
                style={{ padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--accent-soft)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
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
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(0,212,184,0.2)', borderRadius: 12, padding: 24, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
          <div style={{ width: 20, height: 20, border: '2px solid rgba(0,212,184,0.3)', borderTopColor: '#00d4b8', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          AIがWebを調査中...（混雑時は自動でリトライします）
        </div>
      )}

      {result && !loading && (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(0,212,184,0.2)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#00d4b8' }}>🌐 Web調査結果</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>文字サイズ</span>
                <button onClick={() => setFontSize(f => Math.max(11, f - 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
                <button onClick={() => setFontSize(f => Math.min(20, f + 1))} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
              </div>
              <button onClick={sendToWrite} style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                ✍️ 文章作成に使う
              </button>
              <button onClick={() => { navigator.clipboard.writeText(result); setToast('✅ コピーしました！'); setTimeout(() => setToast(''), 2000); }} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                📋 コピー
              </button>
              <button
                onClick={saveToLibrary}
                disabled={saving}
                style={{
                  padding: '8px 16px',
                  background: saving ? '#333' : 'linear-gradient(135deg, #1a5c4a, #0d9973)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontWeight: 600
                }}
              >
                {saving ? '保存中...' : '📚 ライブラリに保存'}
              </button>
            </div>
          </div>
          <div
            style={{ fontSize: fontSize, color: 'var(--text-primary)', lineHeight: 1.8, wordBreak: 'break-word' as const }}
            dangerouslySetInnerHTML={{ __html: formatResult(result, hitUrls) }}
          />
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, right: 32, zIndex: 9999,
          background: 'var(--bg-secondary)', border: '1px solid var(--accent)',
          color: 'var(--text-primary)', padding: '12px 24px', borderRadius: 12,
          fontSize: 14, fontWeight: 600, boxShadow: '0 4px 24px var(--border-accent)',
          transition: 'opacity 0.3s'
        }}>
          {toast}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
