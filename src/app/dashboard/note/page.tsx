'use client';
import { useState, useEffect } from 'react';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';
import { DateRangePicker, DateRange, getDateCondition } from '@/components/DateRangePicker';

type SuggestedTitle = { title: string; reason: string; category: string; level: string };

const QUICK_SEARCHES = [
  'AI活用 ビジネス', 'ChatGPT 使い方', 'フリーランス 副業',
  'マーケティング SNS', '読書 要約', 'プログラミング 初心者',
  '投資 資産形成', 'ライティング 文章術',
];

const MAX_RESULTS_OPTIONS = [5, 10, 20];

export default function NotePage() {
  const [query, setQuery] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  const [maxResults, setMaxResults] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [fontSize, setFontSize] = useState(14);

  // 知識ツリー連携
  const [suggestedTitles, setSuggestedTitles] = useState<SuggestedTitle[]>([]);
  const [isLoadingTitles, setIsLoadingTitles] = useState(false);
  const [currentNodeId, setCurrentNodeId] = useState<number | null>(null);
  const [currentDepth, setCurrentDepth] = useState(0);
  const [pendingParentId, setPendingParentId] = useState<number | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  const saveNodeAndSuggestTitles = async (
    nodeTopic: string,
    researchText: string,
    parentId: number | null,
    depth: number
  ) => {
    setIsLoadingTitles(true);
    setSuggestedTitles([]);
    try {
      const sRes = await fetch('/api/knowledge/suggest-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: nodeTopic, researchText, depth }),
      });
      const sData = await sRes.json();
      const titles: SuggestedTitle[] = sData.titles || [];

      const nRes = await fetch('/api/knowledge/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId,
          topic: nodeTopic,
          sourceType: 'notesearch',
          summary: researchText.slice(0, 200),
          depth,
          suggestedTitles: titles,
        }),
      });
      const nData = await nRes.json();

      setSuggestedTitles(titles);
      setCurrentNodeId(nData?.node?.id || null);
      setCurrentDepth(depth);
    } catch (e) {
      console.error('saveNodeAndSuggestTitles エラー:', e);
    } finally {
      setIsLoadingTitles(false);
    }
  };

  const handleTitleClick = (title: string) => {
    setSelectedTitle(title);
    setShowSourcePicker(true);
  };

  const executeWithSource = (source: 'deepresearch' | 'notesearch') => {
    setShowSourcePicker(false);
    if (!selectedTitle) return;
    if (source === 'deepresearch') {
      const params = new URLSearchParams({
        q: selectedTitle,
        ...(currentNodeId ? { fromNode: String(currentNodeId), depth: String(currentDepth + 1) } : {}),
      });
      window.location.href = `/dashboard/deepresearch?${params.toString()}`;
    } else {
      // 同ページで再検索
      setQuery(selectedTitle);
      setPendingParentId(currentNodeId);
      setCurrentDepth(currentDepth + 1);
      setSelectedTitle(null);
      setTimeout(() => doSearch(selectedTitle, currentNodeId, currentDepth + 1), 0);
    }
  };

  // URLパラメータ自動実行
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      const fromNode = params.get('fromNode');
      const depthParam = params.get('depth');
      if (q) {
        const parentId = fromNode ? parseInt(fromNode, 10) : null;
        const startDepth = depthParam ? parseInt(depthParam, 10) : 0;
        setQuery(q);
        setCurrentDepth(startDepth);
        setPendingParentId(parentId);
        doSearch(q, parentId, startDepth);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const doSearch = async (
    q: string,
    parentId: number | null = null,
    startDepth: number = 0
  ) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setResult('');
    setSuggestedTitles([]);
    setCurrentNodeId(null);

    try {
      const res = await fetch('/api/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q + getDateCondition(dateRange), maxResults }),
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

      // 完了後：知識ツリー保存＋関連タイトル案
      if (accumulated.trim() && !accumulated.startsWith('エラー')) {
        saveNodeAndSuggestTitles(q, accumulated, parentId, startDepth).catch(e => console.error(e));
      }
    } catch (error: any) {
      setResult(`エラー: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => doSearch(query, pendingParentId, currentDepth);

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

        {/* 期間選択 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <DateRangePicker value={dateRange} onChange={setDateRange} placeholder="投稿期間を指定" />
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

      {/* 関連タイトル案 */}
      {!loading && (isLoadingTitles || suggestedTitles.length > 0) && (
        <div style={{
          marginTop: 20,
          padding: 18,
          borderRadius: 12,
          border: '1px solid var(--border-accent)',
          background: 'linear-gradient(135deg, rgba(108,99,255,0.06), rgba(0,212,184,0.06))',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' as const, gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              🔗 次に調べると理解が深まるトピック
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              探求深度: Lv.{currentDepth}
              {currentDepth >= 3 ? ' 🏆 専門家レベル' : currentDepth >= 2 ? ' 🎯 応用レベル' : currentDepth >= 1 ? ' 📚 学習中' : ' 🌱 入門'}
            </div>
          </div>
          {isLoadingTitles ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' as const, padding: 12 }}>
              🤖 AIが関連トピックを分析中...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
              {suggestedTitles.map((item, i) => {
                const lvColor =
                  item.level === 'プロ' ? { bg: 'rgba(239,68,68,0.18)', color: '#ef4444' } :
                  item.level === '専門' ? { bg: 'rgba(245,158,11,0.18)', color: '#f59e0b' } :
                  item.level === '応用' ? { bg: 'rgba(234,179,8,0.18)', color: '#ca8a04' } :
                  item.level === '基礎' ? { bg: 'rgba(29,158,117,0.18)', color: '#1D9E75' } :
                  { bg: 'rgba(59,130,246,0.18)', color: '#3b82f6' };
                return (
                  <button
                    key={i}
                    onClick={() => handleTitleClick(item.title)}
                    style={{
                      textAlign: 'left' as const,
                      padding: 12,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: lvColor.bg, color: lvColor.color, fontWeight: 700, flexShrink: 0 }}>
                        {item.level}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          {item.reason}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {currentNodeId && (
            <div style={{ marginTop: 10, textAlign: 'right' as const }}>
              <a href="/dashboard/knowledge-tree" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
                🌳 知識ツリーで探求マップを見る →
              </a>
            </div>
          )}
        </div>
      )}

      {/* 実行ソース選択モーダル */}
      {showSourcePicker && selectedTitle && (
        <div
          onClick={() => setShowSourcePicker(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 50, padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              padding: 20,
              maxWidth: 360,
              width: '100%',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              どちらで調べますか？
            </div>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
              「{selectedTitle}」
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              <button
                onClick={() => executeWithSource('deepresearch')}
                style={{
                  padding: '12px 16px',
                  background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                🔭 ディープリサーチで調べる
              </button>
              <button
                onClick={() => executeWithSource('notesearch')}
                style={{
                  padding: '12px 16px',
                  background: 'var(--accent-soft)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-accent)', borderRadius: 10,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                📓 noteサーチで調べる
              </button>
              <button
                onClick={() => setShowSourcePicker(false)}
                style={{
                  padding: '8px 16px', background: 'transparent',
                  color: 'var(--text-muted)', border: 'none', borderRadius: 8,
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
