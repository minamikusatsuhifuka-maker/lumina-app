'use client';
import { useState, useEffect } from 'react';

interface MemoryItem {
  id: string;
  summary: string;
  category: string;
  source_type: string;
  source_title: string | null;
  keywords: string;
  created_at: string;
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [manualText, setManualText] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const loadMemories = async (keyword = '') => {
    setLoading(true);
    const url = keyword ? `/api/memory?keyword=${encodeURIComponent(keyword)}` : '/api/memory';
    const res = await fetch(url);
    const data = await res.json();
    if (Array.isArray(data)) setMemories(data);
    setLoading(false);
  };

  useEffect(() => { loadMemories(); }, []);

  const handleSearch = () => loadMemories(search);

  const handleDelete = async (id: string) => {
    if (!confirm('このメモリを削除しますか？')) return;
    await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    setMemories(prev => prev.filter(m => m.id !== id));
  };

  const handleDeleteAll = async () => {
    if (!confirm('すべてのメモリを削除しますか？この操作は元に戻せません。')) return;
    await fetch('/api/memory', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleteAll: true }) });
    setMemories([]);
  };

  const handleManualAdd = async () => {
    if (!manualText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/memory/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: manualText, title: manualTitle || '手動メモリ', sourceType: 'manual', category: 'manual' }),
      });
      if (res.ok) {
        const newMem = await res.json();
        setMemories(prev => [newMem, ...prev]);
        setManualText('');
        setManualTitle('');
      }
    } finally { setSaving(false); }
  };

  const CATEGORY_COLORS: Record<string, string> = {
    'Web情報収集': '#22c55e', 'Web調査': '#22c55e', 'WEB調査': '#22c55e',
    'ディープリサーチ': '#8b5cf6', '文献検索': '#14b8a6', '分析': '#f97316',
    'AI分析エンジン': '#f97316', '経営': '#f59e0b', '経営インテリジェンス': '#f59e0b',
    '文章作成': '#6366f1', 'Intelligence Hub': '#6c63ff', 'manual': '#00d4b8',
    general: '#9ca3af',
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 60 }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>🧠 AIメモリ</h1>
        {memories.length > 0 && (
          <button onClick={handleDeleteAll}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.08)', color: '#ff6b6b', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            🗑 全件削除
          </button>
        )}
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>
        AIがあなたの過去の調査・分析を自動要約して記憶。常駐アシスタントや各機能が文脈を踏まえた回答をします。
      </p>

      {/* 統計 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 10, padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#6c63ff' }}>{memories.length}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>メモリ件数</span>
        </div>
      </div>

      {/* 検索 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 キーワードで検索..."
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          style={{ flex: 1, padding: '9px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
        <button onClick={handleSearch}
          style={{ padding: '9px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          検索
        </button>
      </div>

      {/* 手動メモリ追加 */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>✏️ 手動でメモリを追加</div>
        <input value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="タイトル（任意）"
          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
        <textarea value={manualText} onChange={e => setManualText(e.target.value)} placeholder="覚えさせたい内容を入力..."
          rows={3}
          style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
        <button onClick={handleManualAdd} disabled={saving || !manualText.trim()}
          style={{ marginTop: 8, padding: '8px 16px', borderRadius: 8, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (saving || !manualText.trim()) ? 0.5 : 1 }}>
          {saving ? '要約・保存中...' : '🧠 AIに記憶させる'}
        </button>
      </div>

      {/* メモリ一覧 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>読み込み中...</div>
      ) : memories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
          <div style={{ fontSize: 16 }}>メモリがありません</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>ライブラリに保存すると自動でメモリが蓄積されます</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {memories.map(m => {
            const catColor = CATEGORY_COLORS[m.category] || CATEGORY_COLORS.general;
            return (
              <div key={m.id} style={{
                padding: '12px 16px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <div style={{ width: 6, minHeight: 40, borderRadius: 3, background: catColor, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 4 }}>
                    {m.summary}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, background: `${catColor}15`, color: catColor, fontWeight: 600 }}>
                      {m.category}
                    </span>
                    {m.source_title && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        📄 {m.source_title.slice(0, 30)}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(m.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {m.keywords && m.keywords.split(',').filter(Boolean).slice(0, 3).map(kw => (
                      <span key={kw} style={{ fontSize: 10, padding: '0 6px', borderRadius: 10, background: 'rgba(108,99,255,0.08)', color: '#6c63ff' }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => handleDelete(m.id)}
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                  🗑
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
