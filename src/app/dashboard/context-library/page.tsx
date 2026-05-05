'use client';

import { useEffect, useState, useMemo } from 'react';

type ContextSave = {
  id: number;
  topic: string;
  context_text: string;
  research_text: string | null;
  tags: string[] | null;
  created_at: string;
};

export default function ContextLibraryPage() {
  const [items, setItems] = useState<ContextSave[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // URLパラメータから batchId を取得
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const batch = params.get('batch');
      if (batch) {
        setTagFilter(`batch:${batch}`);
        setBatchFilter(batch);
      }
    } catch {}
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/context-saves?limit=100');
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      }
    } catch {
      // 取得失敗時は空配列のまま
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  // タグ一覧を集計
  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach(it => (it.tags || []).forEach(t => set.add(t)));
    return Array.from(set);
  }, [items]);

  // フィルター適用
  const filtered = useMemo(() => {
    return items.filter(it => {
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!it.topic.toLowerCase().includes(q) && !it.context_text.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (tagFilter && !(it.tags || []).includes(tagFilter)) return false;
      return true;
    });
  }, [items, search, tagFilter]);

  const handleCopy = async (item: ContextSave) => {
    try {
      await navigator.clipboard.writeText(item.context_text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleDelete = async (id: number) => {
    if (!confirm('このコンテキストを削除しますか？')) return;
    try {
      const res = await fetch(`/api/context-saves?id=${id}`, { method: 'DELETE' });
      if (res.ok) setItems(prev => prev.filter(it => it.id !== id));
    } catch {}
  };

  const goToTool = (item: ContextSave, tool: 'write' | 'sns-post' | 'lp' | 'materials') => {
    try {
      sessionStorage.setItem('lumina_context_text', item.context_text);
      sessionStorage.setItem('lumina_context_topic', item.topic);
    } catch {}
    const toolPath: Record<typeof tool, string> = {
      'write': '/dashboard/write',
      'sns-post': '/dashboard/sns-post',
      'lp': '/dashboard/lp-generator',
      'materials': '/dashboard/materials',
    };
    window.location.href = `${toolPath[tool]}?contextId=${item.id}`;
  };

  const fmtDate = (s: string) => {
    try {
      const d = new Date(s);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return s;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🧠 コンテキストライブラリ</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>AIに読み込ませる背景情報を管理します。文章作成・SNS投稿・LP作成・資料作成にワンクリックで活用できます。</p>
      </div>

      {batchFilter && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(108,99,255,0.12), rgba(0,212,184,0.12))',
          border: '1px solid var(--border-accent)',
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap' as const,
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            🏷️ バッチジョブ #{batchFilter} の結果のみ表示中
          </div>
          <button
            onClick={() => { setBatchFilter(null); setTagFilter(''); }}
            style={{ padding: '4px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
          >
            ✕ フィルター解除
          </button>
        </div>
      )}

      {/* 検索・フィルターバー */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap' as const,
        alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="🔍 トピック名・内容で検索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: '8px 12px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
          }}
        />
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none',
            }}
          >
            <option value="">🏷️ すべてのタグ</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} / {items.length} 件
        </span>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          読み込み中...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          border: '1px dashed var(--border)',
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6 }}>
            {items.length === 0 ? 'まだ保存されたコンテキストはありません' : '条件に一致するコンテキストがありません'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            ディープリサーチ実行後、「🧠 AI背景情報として最適化」→「💾 保存」でこちらに追加されます。
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {filtered.map(item => {
          const expanded = expandedId === item.id;
          const preview = item.context_text.replace(/\n/g, ' ').slice(0, 120);
          return (
            <div
              key={item.id}
              style={{
                background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: 18,
                boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 8, flexWrap: 'wrap' as const }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {item.topic}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    📅 {fmtDate(item.created_at)}
                    {item.tags && item.tags.length > 0 && (
                      <span style={{ marginLeft: 12 }}>
                        {item.tags.map(t => (
                          <span key={t} style={{ background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 10, marginRight: 4, color: 'var(--text-secondary)' }}>
                            #{t}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div
                onClick={() => setExpandedId(expanded ? null : item.id)}
                style={{
                  cursor: 'pointer',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.7,
                  maxHeight: expanded ? 600 : 'auto',
                  overflowY: expanded ? 'auto' : 'hidden',
                }}
              >
                {expanded ? (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const, fontFamily: 'inherit' }}>
                    {item.context_text}
                  </pre>
                ) : (
                  <>
                    {preview}{item.context_text.length > 120 ? '...' : ''}
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                      クリックで全文表示
                    </span>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                <button
                  onClick={() => handleCopy(item)}
                  style={{ padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                >
                  {copiedId === item.id ? '✅ コピー済' : '📋 コピー'}
                </button>
                <button
                  onClick={() => goToTool(item, 'write')}
                  style={{ padding: '6px 12px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                >
                  ✍️ 文章作成へ
                </button>
                <button
                  onClick={() => goToTool(item, 'sns-post')}
                  style={{ padding: '6px 12px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                >
                  📱 SNS投稿へ
                </button>
                <button
                  onClick={() => goToTool(item, 'lp')}
                  style={{ padding: '6px 12px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                >
                  📄 LP作成へ
                </button>
                <button
                  onClick={() => goToTool(item, 'materials')}
                  style={{ padding: '6px 12px', background: 'var(--accent-soft)', border: '1px solid var(--border-accent)', color: 'var(--text-primary)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                >
                  📊 資料作成へ
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, marginLeft: 'auto' }}
                >
                  🗑️ 削除
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
