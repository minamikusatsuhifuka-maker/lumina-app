'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { copyToClipboard } from '@/lib/copyToClipboard';

export interface AnalysisRecord {
  id: number;
  user_id: string;
  file_name: string | null;
  auto_title: string | null;
  analysis_type: string;
  analysis_label: string;
  content: string;
  tags: string[] | null;
  folder: string | null;
  favorite: boolean;
  locked: boolean;
  char_count: number;
  created_at: string;
  updated_at: string;
}

const FOLDER_PALETTE = [
  '#3b82f6',
  '#1D9E75',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
  '#10b981',
];

function getFolderColor(folder: string, allFolders: string[]): string {
  const idx = allFolders.indexOf(folder);
  return idx >= 0
    ? FOLDER_PALETTE[idx % FOLDER_PALETTE.length]
    : '#6b7280';
}

interface Props {
  records: AnalysisRecord[];
  onRecordsChange: (records: AnalysisRecord[]) => void;
  onSelectForCross?: (
    articles: { id: number; title: string; content: string; category?: string }[],
  ) => void;
  highlightId?: number | null;
  onHighlightClear?: () => void;
}

export default function SavedAnalysisList({
  records,
  onRecordsChange,
  onSelectForCross,
  highlightId,
  onHighlightClear,
}: Props) {
  const { showToast } = useToast();
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showCategoryGrid, setShowCategoryGrid] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopy = async (id: number, text: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedId(id);
      showToast('コピーしました', 'success');
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
    } else {
      showToast('コピーできませんでした。手動で選択してコピーしてください。', 'error');
    }
  };

  const handleRenameCategory = async (oldName: string) => {
    const newName = editingValue.trim();
    if (!newName || newName === oldName) {
      setEditingCategory(null);
      return;
    }
    setIsRenaming(true);
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename_folder', oldName, newName }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error ?? '変更できませんでした');
        return;
      }
      onRecordsChange(
        records.map((r) => (r.folder === oldName ? { ...r, folder: newName } : r)),
      );
      if (activeFolder === oldName) setActiveFolder(newName);
      showToast(`カテゴリ名を「${newName}」に変更しました`, 'success');
    } catch {
      showToast('変更に失敗しました', 'error');
    } finally {
      setIsRenaming(false);
      setEditingCategory(null);
    }
  };

  const uniqueFolders = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.folder && r.folder.trim()) set.add(r.folder);
    });
    return Array.from(set);
  }, [records]);

  const visibleRecords = useMemo(() => {
    let list = records;
    if (activeFolder !== null) {
      list = list.filter((r) => (r.folder ?? '') === activeFolder);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (r) =>
          (r.auto_title ?? r.file_name ?? '').toLowerCase().includes(q) ||
          r.content.toLowerCase().includes(q),
      );
    }
    return list;
  }, [records, activeFolder, searchTerm]);

  // 表示中レコードから分析タイプ別の件数とラベルを動的に抽出
  const typeStats = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const r of visibleRecords) {
      const type = r.analysis_type;
      const existing = map.get(type);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(type, {
          label: r.analysis_label || type,
          count: 1,
        });
      }
    }
    return Array.from(map.entries()).map(([type, info]) => ({ type, ...info }));
  }, [visibleRecords]);

  const handleSelectByType = (analysisType: string) => {
    const targetIds = visibleRecords
      .filter((r) => r.analysis_type === analysisType)
      .map((r) => r.id);
    if (targetIds.length === 0) return;
    const allSelected = targetIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      targetIds.forEach((id) => next.delete(id));
    } else {
      targetIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const isAllSelectedByType = (analysisType: string) => {
    const targetIds = visibleRecords
      .filter((r) => r.analysis_type === analysisType)
      .map((r) => r.id);
    if (targetIds.length === 0) return false;
    return targetIds.every((id) => selectedIds.has(id));
  };

  const handleSelectAllVisible = () => {
    const allIds = visibleRecords.map((r) => r.id);
    if (allIds.length === 0) return;
    const allSelected = allIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      const next = new Set(selectedIds);
      allIds.forEach((id) => next.delete(id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      allIds.forEach((id) => next.add(id));
      setSelectedIds(next);
    }
  };

  const handleBulkMove = async (folder: string) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_folder', ids, folder }),
      });
      if (!res.ok) throw new Error('一括移動に失敗しました');
      onRecordsChange(
        records.map((r) => (selectedIds.has(r.id) ? { ...r, folder } : r)),
      );
      setSelectedIds(new Set());
      showToast(
        `${ids.length}件を「${folder || '未分類'}」に移動しました`,
        'success',
      );
    } catch {
      showToast('一括移動に失敗しました', 'error');
    }
  };

  const handleToggleFavorite = async (id: number) => {
    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_favorite', id }),
      });
      if (!res.ok) throw new Error();
      onRecordsChange(
        records.map((r) =>
          r.id === id ? { ...r, favorite: !r.favorite } : r,
        ),
      );
    } catch {
      showToast('更新に失敗しました', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この保存を削除しますか？')) return;
    try {
      const res = await fetch(`/api/text-analysis/saves?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      onRecordsChange(records.filter((r) => r.id !== id));
      showToast('削除しました', 'success');
    } catch {
      showToast('削除に失敗しました', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .category-card:hover .category-edit-btn { opacity: 1 !important; }
      `}</style>
      {/* カテゴリ概覧ヘッダー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: -8,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          📂 カテゴリ概覧
        </span>
        <button
          type="button"
          onClick={() => setShowCategoryGrid((v) => !v)}
          style={{
            fontSize: 11,
            color: 'var(--accent)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {showCategoryGrid ? '▲ 折りたたむ' : '▼ 展開'}
        </button>
      </div>

      {showCategoryGrid && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 8,
          }}
        >
          {/* すべて */}
          <button
            type="button"
            onClick={() => setActiveFolder(null)}
            style={categoryCardStyle(activeFolder === null)}
          >
            <span style={{ fontSize: 18, marginBottom: 2 }}>📂</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
              }}
            >
              すべて
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              {records.length}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>件</span>
          </button>

          {uniqueFolders.map((folder) => {
            const count = records.filter((r) => r.folder === folder).length;
            const color = getFolderColor(folder, uniqueFolders);
            const active = activeFolder === folder;
            const isEditing = editingCategory === folder;
            const canRename = folder !== '横断まとめ';
            return (
              <div
                key={folder}
                onClick={() => {
                  if (!isEditing) setActiveFolder(folder);
                }}
                className="category-card"
                style={{
                  ...categoryCardStyle(active),
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    background: color,
                  }}
                />
                <span style={{ fontSize: 18, marginBottom: 2, paddingLeft: 6 }}>📁</span>
                {isEditing ? (
                  <div
                    style={{ paddingLeft: 6, width: '100%' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCategory(folder);
                        if (e.key === 'Escape') setEditingCategory(null);
                      }}
                      onBlur={() => handleRenameCategory(folder)}
                      disabled={isRenaming}
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        fontSize: 11,
                        fontWeight: 600,
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        border: `1px solid ${color}`,
                        borderRadius: 4,
                        outline: 'none',
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      paddingLeft: 6,
                      width: '100%',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {folder}
                    </span>
                    {canRename && (
                      <button
                        type="button"
                        className="category-edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingCategory(folder);
                          setEditingValue(folder);
                        }}
                        title="カテゴリ名を変更"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 2,
                          fontSize: 11,
                          cursor: 'pointer',
                          opacity: 0,
                          transition: 'opacity 0.15s',
                          color: 'var(--text-muted)',
                          flexShrink: 0,
                        }}
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 4,
                    paddingLeft: 6,
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 700, color }}>{count}</span>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      marginBottom: 2,
                    }}
                  >
                    件
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 検索 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 タイトル・本文で検索"
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 12,
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {visibleRecords.length}件 / 全{records.length}件
        </span>
      </div>

      {/* 一括移動パネル */}
      {selectedIds.size > 0 && (
        <div
          style={{
            border: '2px solid var(--accent)',
            background: 'rgba(108,99,255,0.08)',
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--accent)',
              }}
            >
              📋 {selectedIds.size}件を選択中
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--accent)',
                background: 'var(--bg-card)',
                border: '1px solid var(--accent)',
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              ✕ 選択をすべて解除
            </button>
          </div>
          {/* 分析タイプ別一括選択 */}
          {typeStats.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  margin: 0,
                  marginBottom: 6,
                }}
              >
                🏷 タイプ別一括選択
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {typeStats.map((stat) => {
                  const allSelected = isAllSelectedByType(stat.type);
                  return (
                    <button
                      key={stat.type}
                      type="button"
                      onClick={() => handleSelectByType(stat.type)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 12px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        border: `1px solid ${allSelected ? '#9333ea' : 'var(--border)'}`,
                        background: allSelected ? '#9333ea' : 'var(--bg-card)',
                        color: allSelected ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span>{allSelected ? '✅' : '☐'}</span>
                      <span>{stat.label}</span>
                      <span
                        style={{
                          padding: '1px 7px',
                          borderRadius: 999,
                          fontSize: 10,
                          fontWeight: 600,
                          background: allSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
                          color: allSelected ? '#fff' : 'var(--text-muted)',
                        }}
                      >
                        {stat.count}
                      </span>
                    </button>
                  );
                })}
                {visibleRecords.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllVisible}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 12px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 600,
                      border: `1px solid ${
                        visibleRecords.every((r) => selectedIds.has(r.id))
                          ? 'var(--text-primary)'
                          : 'var(--border)'
                      }`,
                      background: visibleRecords.every((r) => selectedIds.has(r.id))
                        ? 'var(--text-primary)'
                        : 'var(--bg-card)',
                      color: visibleRecords.every((r) => selectedIds.has(r.id))
                        ? 'var(--bg-primary)'
                        : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>📋</span>
                    <span>表示中を全選択</span>
                    <span
                      style={{
                        padding: '1px 7px',
                        borderRadius: 999,
                        fontSize: 10,
                        fontWeight: 600,
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {visibleRecords.length}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--accent)',
              margin: 0,
            }}
          >
            📁 カテゴリに移動
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {uniqueFolders.map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => handleBulkMove(folder)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 500,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {folder}
              </button>
            ))}
            <button
              type="button"
              onClick={async () => {
                const name = prompt('新しいカテゴリ名');
                if (!name?.trim()) return;
                await handleBulkMove(name.trim());
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                border: '1px dashed var(--accent)',
                background: 'transparent',
                color: 'var(--accent)',
                cursor: 'pointer',
              }}
            >
              + 新規カテゴリ
            </button>
            <button
              type="button"
              onClick={() => handleBulkMove('')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              未分類に戻す
            </button>
          </div>

          {selectedIds.size >= 2 && onSelectForCross && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
              <button
                type="button"
                onClick={() => {
                  const articles = records
                    .filter((r) => selectedIds.has(r.id))
                    .map((r) => ({
                      id: r.id,
                      title: r.auto_title ?? r.file_name ?? '無題',
                      content: r.content,
                      category: r.folder ?? undefined,
                    }));
                  onSelectForCross(articles);
                }}
                style={{
                  padding: '10px 22px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  border: 'none',
                  background: '#9333ea',
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(147,51,234,0.3)',
                }}
              >
                🔀 選択した{selectedIds.size}件を横断分析する
              </button>
            </div>
          )}
        </div>
      )}

      {/* 一覧 */}
      {visibleRecords.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 40,
            color: 'var(--text-muted)',
            fontSize: 13,
            border: '1px dashed var(--border)',
            borderRadius: 12,
          }}
        >
          保存された分析結果はまだありません
        </div>
      ) : (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {visibleRecords.map((record) => {
            const title =
              record.auto_title || record.file_name || '無題';
            const checked = selectedIds.has(record.id);
            const expanded = expandedId === record.id;
            const folderColor = record.folder
              ? getFolderColor(record.folder, uniqueFolders)
              : null;
            const highlighted = highlightId === record.id;
            return (
              <div
                key={record.id}
                id={`article-${record.id}`}
                onClick={() => {
                  if (highlighted) onHighlightClear?.();
                }}
                style={{
                  background: highlighted ? 'rgba(147,51,234,0.08)' : 'var(--bg-card)',
                  border: `1px solid ${
                    highlighted
                      ? '#9333ea'
                      : checked
                        ? 'var(--accent)'
                        : 'var(--border)'
                  }`,
                  borderRadius: 12,
                  padding: 12,
                  boxShadow: highlighted ? '0 0 0 3px rgba(147,51,234,0.25)' : undefined,
                  transition: 'all 0.2s',
                }}
              >
                {highlighted && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#9333ea',
                    }}
                  >
                    <span>📎 横断まとめで使用した記事</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onHighlightClear?.();
                      }}
                      style={{
                        marginLeft: 'auto',
                        background: 'transparent',
                        border: 'none',
                        color: '#9333ea',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(record.id)) next.delete(record.id);
                        else next.add(record.id);
                        return next;
                      });
                    }}
                    style={{ accentColor: 'var(--accent)', marginTop: 4 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {title}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(108,99,255,0.15)',
                          color: 'var(--accent)',
                        }}
                      >
                        {record.analysis_label}
                      </span>
                      {record.folder && folderColor && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 8px',
                            borderRadius: 999,
                            color: '#fff',
                            background: folderColor,
                            fontWeight: 500,
                          }}
                        >
                          📁 {record.folder}
                        </span>
                      )}
                      {record.favorite && (
                        <span style={{ fontSize: 12 }}>⭐</span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        marginBottom: 6,
                      }}
                    >
                      {new Date(record.created_at).toLocaleString('ja-JP')} ・
                      {record.char_count?.toLocaleString() ?? 0}文字
                    </div>
                    {expanded ? (
                      <div
                        style={{
                          padding: 10,
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          maxHeight: 400,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          fontSize: 12,
                          color: 'var(--text-primary)',
                          lineHeight: 1.7,
                        }}
                      >
                        {record.content}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {record.content}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(expanded ? null : record.id)
                        }
                        style={listBtnStyle()}
                      >
                        {expanded ? '▲ 閉じる' : '▼ 全文表示'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(record.id, record.content)}
                        style={{
                          ...listBtnStyle(),
                          background:
                            copiedId === record.id
                              ? 'rgba(34,197,94,0.12)'
                              : listBtnStyle().background,
                          borderColor:
                            copiedId === record.id
                              ? 'rgba(34,197,94,0.4)'
                              : 'var(--border)',
                          color: copiedId === record.id ? '#16a34a' : 'var(--text-secondary)',
                        }}
                      >
                        {copiedId === record.id ? '✅ コピー済み' : '📋 コピー'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(record.id)}
                        style={listBtnStyle()}
                      >
                        {record.favorite ? '⭐ 解除' : '☆ お気に入り'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(record.id)}
                        style={{
                          ...listBtnStyle(),
                          color: '#ef4444',
                        }}
                      >
                        🗑 削除
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function categoryCardStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 12,
    border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'rgba(108,99,255,0.08)' : 'var(--bg-card)',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };
}

function listBtnStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  };
}

