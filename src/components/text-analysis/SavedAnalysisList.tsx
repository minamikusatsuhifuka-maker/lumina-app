'use client';

import { useMemo, useState } from 'react';
import { useToast } from '@/components/ui/Toast';

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
}

export default function SavedAnalysisList({ records, onRecordsChange }: Props) {
  const { showToast } = useToast();
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showCategoryGrid, setShowCategoryGrid] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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
            return (
              <button
                key={folder}
                type="button"
                onClick={() => setActiveFolder(folder)}
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
                <span
                  style={{ fontSize: 18, marginBottom: 2, paddingLeft: 6 }}
                >
                  📁
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    paddingLeft: 6,
                    width: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {folder}
                </span>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 4,
                    paddingLeft: 6,
                  }}
                >
                  <span
                    style={{ fontSize: 18, fontWeight: 700, color }}
                  >
                    {count}
                  </span>
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
              </button>
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
              justifyContent: 'space-between',
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
                fontSize: 11,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              選択解除
            </button>
          </div>
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
            return (
              <div
                key={record.id}
                style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${
                    checked ? 'var(--accent)' : 'var(--border)'
                  }`,
                  borderRadius: 12,
                  padding: 12,
                }}
              >
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
                        onClick={() => {
                          navigator.clipboard.writeText(record.content);
                          showToast('コピーしました', 'success');
                        }}
                        style={listBtnStyle()}
                      >
                        📋 コピー
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

