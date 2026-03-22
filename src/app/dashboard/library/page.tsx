'use client';
import { useState, useEffect } from 'react';

const TYPE_ICONS: Record<string, string> = {
  research: '🌐', deepresearch: '🔭', analysis: '🧩',
  strategy: '💼', draft: '✍️', paper: '🔬', default: '📄',
};

const GROUP_COLORS: Record<string, string> = {
  '未分類': '#7878a0', '医療': '#f87171', 'マーケ': '#f5a623',
  '採用': '#4ade80', '経営戦略': '#6c63ff', '調査': '#00d4b8',
  'コンテンツ': '#a89fff', '人材育成': '#fb923c',
};

export default function LibraryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('すべて');
  const [filterFav, setFilterFav] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTags, setEditTags] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/library')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setItems(data); setLoading(false); });
  }, []);

  const toggleFavorite = async (item: any) => {
    const newVal = item.is_favorite ? 0 : 1;
    await fetch('/api/library', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, is_favorite: newVal }),
    });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_favorite: newVal } : i));
  };

  const saveEdit = async (id: string) => {
    await fetch('/api/library', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tags: editTags, group_name: editGroup }),
    });
    setItems(prev => prev.map(i => i.id === id ? { ...i, tags: editTags, group_name: editGroup } : i));
    setEditingId(null);
  };

  const deleteItem = async (id: string) => {
    if (!confirm('削除しますか？')) return;
    await fetch('/api/library', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const downloadTxt = (item: any) => {
    const text = `${item.title}\n${'='.repeat(40)}\n作成日: ${new Date(item.created_at).toLocaleDateString('ja-JP')}\nタグ: ${item.tags || 'なし'}\nグループ: ${item.group_name || '未分類'}\n\n${item.content || ''}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `${item.title.slice(0, 30)}.txt`;
    a.click();
  };

  const downloadMd = (item: any) => {
    const text = `# ${item.title}\n\n> 作成日: ${new Date(item.created_at).toLocaleDateString('ja-JP')} | タグ: ${item.tags || 'なし'} | グループ: ${item.group_name || '未分類'}\n\n${item.content || ''}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `${item.title.slice(0, 30)}.md`;
    a.click();
  };

  const groups = ['すべて', ...Array.from(new Set(items.map(i => i.group_name || '未分類')))];

  const filtered = items.filter(i => {
    const matchSearch = !search || i.title?.includes(search) || i.content?.includes(search) || i.tags?.includes(search);
    const matchGroup = filterGroup === 'すべて' || i.group_name === filterGroup;
    const matchFav = !filterFav || i.is_favorite;
    return matchSearch && matchGroup && matchFav;
  });

  const grouped = filtered.reduce((acc: Record<string, any[]>, item) => {
    const g = item.group_name || '未分類';
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {});

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>📚 ライブラリ</h1>
      <p style={{ color: '#7878a0', marginBottom: 20 }}>保存した調査・分析・文章を管理。お気に入り・タグ・グループ分けに対応。</p>

      {/* 検索・フィルター */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 タイトル・内容・タグを検索..."
          style={{ flex: 1, minWidth: 200, padding: '9px 14px', background: '#12142a', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 8, color: '#f0f0ff', fontSize: 13, outline: 'none' }}
        />
        <button
          onClick={() => setFilterFav(!filterFav)}
          style={{ padding: '9px 16px', borderRadius: 8, border: `1px solid ${filterFav ? '#f5a623' : 'rgba(130,140,255,0.2)'}`, background: filterFav ? 'rgba(245,166,35,0.1)' : '#12142a', color: filterFav ? '#f5a623' : '#7878a0', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          ★ お気に入りのみ
        </button>
        <select
          value={filterGroup}
          onChange={e => setFilterGroup(e.target.value)}
          style={{ padding: '9px 14px', background: '#12142a', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 8, color: '#f0f0ff', fontSize: 13, outline: 'none' }}
        >
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {/* 統計 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const }}>
        {[
          { label: '総アイテム', value: items.length, color: '#6c63ff' },
          { label: 'お気に入り', value: items.filter(i => i.is_favorite).length, color: '#f5a623' },
          { label: 'グループ数', value: new Set(items.map(i => i.group_name)).size, color: '#00d4b8' },
        ].map(s => (
          <div key={s.label} style={{ background: '#12142a', border: `1px solid ${s.color}20`, borderRadius: 10, padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: 12, color: '#7878a0' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#7878a0', textAlign: 'center', padding: 40 }}>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#5a5a7a' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <div style={{ fontSize: 16 }}>アイテムがありません</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>各ページの「保存」ボタンで追加できます</div>
        </div>
      ) : (
        Object.entries(grouped).map(([group, groupItems]) => (
          <div key={group} style={{ marginBottom: 28 }}>
            {/* グループヘッダー */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: GROUP_COLORS[group] || '#7878a0' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: GROUP_COLORS[group] || '#7878a0', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{group}</span>
              <span style={{ fontSize: 11, color: '#5a5a7a' }}>({groupItems.length}件)</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {groupItems.map(item => (
                <div key={item.id} style={{ background: '#12142a', border: `1px solid ${item.is_favorite ? 'rgba(245,166,35,0.3)' : 'rgba(130,140,255,0.1)'}`, borderRadius: 12, overflow: 'hidden' }}>
                  {/* アイテムヘッダー */}
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{TYPE_ICONS[item.type] || TYPE_ICONS.default}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0ff', marginBottom: 4, cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                        {item.title}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#5a5a7a' }}>{new Date(item.created_at).toLocaleDateString('ja-JP')}</span>
                        {item.tags && item.tags.split(',').filter(Boolean).map((tag: string) => (
                          <span key={tag} style={{ fontSize: 11, padding: '1px 8px', borderRadius: 20, background: 'rgba(108,99,255,0.15)', color: '#a89fff' }}>#{tag.trim()}</span>
                        ))}
                      </div>
                    </div>

                    {/* アクションボタン */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => toggleFavorite(item)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: item.is_favorite ? 'rgba(245,166,35,0.2)' : 'rgba(130,140,255,0.1)', color: item.is_favorite ? '#f5a623' : '#5a5a7a', cursor: 'pointer', fontSize: 14 }}>★</button>
                      <button onClick={() => { setEditingId(item.id); setEditTags(item.tags || ''); setEditGroup(item.group_name || '未分類'); }} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(130,140,255,0.1)', color: '#7878a0', cursor: 'pointer', fontSize: 12 }}>🏷</button>
                      <button onClick={() => downloadTxt(item)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(130,140,255,0.1)', color: '#7878a0', cursor: 'pointer', fontSize: 12 }}>📄</button>
                      <button onClick={() => downloadMd(item)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(130,140,255,0.1)', color: '#7878a0', cursor: 'pointer', fontSize: 12 }}>📝</button>
                      <button onClick={() => { localStorage.setItem('lumina_research_context', item.content || ''); window.location.href = '/dashboard/write'; }} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(108,99,255,0.15)', color: '#a89fff', cursor: 'pointer', fontSize: 12 }}>✍️</button>
                      <button onClick={() => deleteItem(item.id)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(255,107,107,0.1)', color: '#ff6b6b', cursor: 'pointer', fontSize: 12 }}>🗑</button>
                    </div>
                  </div>

                  {/* 編集フォーム */}
                  {editingId === item.id && (
                    <div style={{ padding: '12px 16px', background: '#0d0f20', borderTop: '1px solid rgba(130,140,255,0.1)', display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                      <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="タグ（カンマ区切り例：医療,採用）"
                        style={{ flex: 1, minWidth: 160, padding: '6px 10px', background: '#12142a', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 6, color: '#f0f0ff', fontSize: 12, outline: 'none' }} />
                      <input value={editGroup} onChange={e => setEditGroup(e.target.value)} placeholder="グループ名（例：採用戦略）"
                        style={{ flex: 1, minWidth: 140, padding: '6px 10px', background: '#12142a', border: '1px solid rgba(130,140,255,0.2)', borderRadius: 6, color: '#f0f0ff', fontSize: 12, outline: 'none' }} />
                      <button onClick={() => saveEdit(item.id)} style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>保存</button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '6px 10px', background: '#1a1d36', border: '1px solid rgba(130,140,255,0.2)', color: '#7878a0', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </div>
                  )}

                  {/* 展開コンテンツ */}
                  {expandedId === item.id && item.content && (
                    <div style={{ padding: '12px 16px', background: '#0d0f20', borderTop: '1px solid rgba(130,140,255,0.1)', fontSize: 13, color: '#c0c0e0', lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto' as const }}>
                      {item.content.slice(0, 1000)}{item.content.length > 1000 ? '...' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
