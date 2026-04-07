'use client';
import { useState, useEffect, useMemo } from 'react';
import { LibraryItemRow } from '@/components/LibraryItemRow';

const TABS = [
  { key: 'all',       label: 'すべて' },
  { key: 'favorite',  label: '★ お気に入り' },
  { key: '文章作成',  label: '✍️ 文章作成' },
  { key: 'WEB調査',   label: '🌐 WEB調査' },
  { key: 'ディープリサーチ', label: '🔭 ディープリサーチ' },
  { key: '文献検索',  label: '🔬 文献検索' },
  { key: '分析',      label: '🧩 分析' },
  { key: '経営',      label: '💼 経営' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function LibraryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeResult, setMergeResult] = useState('');
  const [merging, setMerging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTags, setEditTags] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/library')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setItems(data); setLoading(false); });
  }, []);

  const generateMergeReport = async () => {
    const selected = items.filter((item: any) => selectedIds.has(item.id));
    if (selected.length < 2) return;
    setMerging(true);
    try {
      const res = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selected }),
      });
      const data = await res.json();
      setMergeResult(data.result || '');
    } finally {
      setMerging(false);
    }
  };

  const handleSaveMergeReport = async () => {
    if (!mergeResult) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `統合レポート ${new Date().toLocaleDateString('ja-JP')}`,
          content: mergeResult,
          type: 'merge',
          tags: '統合レポート',
          group_name: '統合レポート',
        }),
      });
      if (res.ok) {
        const newItem = await res.json();
        setItems(prev => [newItem, ...prev]);
        alert('ライブラリに保存しました！');
      } else {
        alert('保���に失敗しました');
      }
    } catch {
      alert('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

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

  const filtered = items.filter(i => {
    const matchSearch = !search || i.title?.includes(search) || i.content?.includes(search) || i.tags?.includes(search);
    return matchSearch;
  });

  const tabFilteredItems = useMemo(() => {
    if (activeTab === 'all') return filtered;
    if (activeTab === 'favorite') return filtered.filter((item: any) => item.is_favorite);
    return filtered.filter((item: any) => (item.group_name || '') === activeTab);
  }, [filtered, activeTab]);

  return (
    <div>
      {/* 統合レポートモード切替 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>📚 ライブラリ</h1>
        <button
          onClick={() => { setMergeMode(!mergeMode); setSelectedIds(new Set()); setMergeResult(''); }}
          style={{
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
            background: mergeMode ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-card)',
            color: mergeMode ? '#fff' : 'var(--text-muted)',
            border: `1px solid ${mergeMode ? 'transparent' : 'var(--border)'}`,
            fontSize: 13, fontWeight: 600,
          }}
        >
          {mergeMode ? '✕ 統合モード終了' : '🔗 複数統合レポート'}
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>保存した調査・分析・文章を管理。お気に入り・タグ・グループ分けに対応。</p>

      {/* 統合モード時のUI */}
      {mergeMode && (
        <div style={{
          padding: 16, background: 'var(--accent-soft)',
          border: '1px solid var(--border-accent)',
          borderRadius: 12, marginBottom: 16,
        }}>
          <p style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 10, fontWeight: 600 }}>
            🔗 統合したい資料を選択してください（2件以上）：{selectedIds.size}件選択中
          </p>
          {selectedIds.size >= 2 && (
            <button
              onClick={generateMergeReport}
              disabled={merging}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                color: '#fff', fontWeight: 700, fontSize: 13,
                opacity: merging ? 0.7 : 1,
              }}
            >
              {merging ? '統合レポート生成中...' : '⚡ 統合レポートを生成'}
            </button>
          )}
          {mergeResult && (
            <>
              <div style={{
                marginTop: 16, padding: 16, background: 'var(--bg-secondary)',
                borderRadius: 10, fontSize: 13, color: 'var(--text-secondary)',
                lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: '60vh', overflowY: 'auto',
              }}>
                {mergeResult}
              </div>
              <button
                onClick={handleSaveMergeReport}
                disabled={isSaving}
                style={{
                  marginTop: 12, padding: '9px 20px', borderRadius: 8, border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer',
                  background: isSaving ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                }}
              >
                {isSaving ? '保存中...' : '📚 ライブラリに保存'}
              </button>
            </>
          )}
        </div>
      )}

      {/* 検索 */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 タイトル・内容・タグを検索..."
          style={{ width: '100%', maxWidth: 480, padding: '9px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* 統計 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const }}>
        {[
          { label: '総アイテム', value: items.length, color: '#6c63ff' },
          { label: 'お気に入り', value: items.filter(i => i.is_favorite).length, color: '#f5a623' },
          { label: 'グループ数', value: new Set(items.map(i => i.group_name)).size, color: '#00d4b8' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-secondary)', border: `1px solid ${s.color}20`, borderRadius: 10, padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── タブバー ── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', overflowX: 'auto', marginBottom: 16 }}>
        {TABS.map(tab => {
          const count =
            tab.key === 'all'      ? items.length :
            tab.key === 'favorite' ? items.filter(i => i.is_favorite).length :
            items.filter(i => (i.group_name || '') === tab.key).length;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flexShrink: 0, padding: '8px 16px', fontSize: 13,
                borderBottom: `2px solid ${activeTab === tab.key ? 'var(--accent)' : 'transparent'}`,
                background: 'none', border: 'none',
                borderBottomWidth: 2, borderBottomStyle: 'solid',
                borderBottomColor: activeTab === tab.key ? 'var(--accent)' : 'transparent',
                color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: activeTab === tab.key ? 600 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── アイテムリスト ── */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>読み込み中...</div>
      ) : tabFilteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <div style={{ fontSize: 16 }}>アイテムがありません</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>各ページの「保存」ボタンで追加できます</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tabFilteredItems.map((item: any) => (
            <div key={item.id}>
              <LibraryItemRow
                item={item}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                mergeMode={mergeMode}
                selected={selectedIds.has(item.id)}
                onSelectToggle={(id, checked) => {
                  const next = new Set(selectedIds);
                  if (checked) next.add(id); else next.delete(id);
                  setSelectedIds(next);
                }}
                onFavoriteToggle={toggleFavorite}
                onDelete={deleteItem}
                onEdit={(it) => { setEditingId(it.id); setEditTags(it.tags || ''); setEditGroup(it.group_name || '未分類'); }}
                onExportTxt={downloadTxt}
                onExportMd={downloadMd}
                onExportPdf={async (it) => {
                  const { exportToPdf } = await import('@/lib/exportPdf');
                  await exportToPdf(it.title?.slice(0, 40) || 'ライブラリ', it.content || '');
                }}
                onUseInWrite={(it) => { localStorage.setItem('lumina_research_context', it.content || ''); window.location.href = '/dashboard/write'; }}
                onStartTagEdit={(it) => { setEditingId(it.id); setEditTags(it.tags || ''); setEditGroup(it.group_name || '未分類'); }}
                onExpandToggle={(id) => setExpandedId(expandedId === id ? null : id)}
                isExpanded={expandedId === item.id}
              />

              {/* 編集フォーム */}
              {editingId === item.id && (
                <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center', marginTop: -1, borderRadius: '0 0 10px 10px', border: '1px solid var(--border)', borderTopColor: 'transparent' }}>
                  <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="タグ（カンマ区切り例：医療,採用）"
                    style={{ flex: 1, minWidth: 160, padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                  <input value={editGroup} onChange={e => setEditGroup(e.target.value)} placeholder="グループ名（例：採用戦略）"
                    style={{ flex: 1, minWidth: 140, padding: '6px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                  <button onClick={() => saveEdit(item.id)} style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>保存</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              )}

              {/* 展開コンテンツ */}
              {expandedId === item.id && item.content && (
                <div style={{
                  padding: '12px 16px', marginTop: -1,
                  border: '1px solid var(--border)', borderTopColor: 'transparent',
                  borderRadius: '0 0 10px 10px',
                  background: 'var(--bg-secondary)',
                  fontSize: 13, color: 'var(--text-secondary)',
                  lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: '60vh', overflowY: 'auto',
                }}
                  dangerouslySetInnerHTML={{
                    __html: item.content
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(
                        /(https?:\/\/[^\s）\]。、！？\n"'<>&]+)/g,
                        '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;word-break:break-all;">$1 ↗</a>'
                      )
                      .replace(/^## (.+)$/gm, '<div style="font-size:14px;font-weight:700;color:var(--text-primary);margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border);">$1</div>')
                      .replace(/^# (.+)$/gm, '<div style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0 0 12px;">$1</div>')
                      .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0;">')
                      .replace(/^- (https?:\/\/.+)$/gm, '• <a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;word-break:break-all;">$1 ↗</a>')
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
