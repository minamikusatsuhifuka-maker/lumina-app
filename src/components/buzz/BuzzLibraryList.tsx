'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  generateTitleWithTimeout,
  sanitizeFilename,
  yyyymmdd,
} from '@/lib/title-generator';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { triggerDownload } from '@/lib/download';

// /api/library から返ってくる行（library テーブルそのまま）
interface LibraryItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  content: string;
  metadata: any;
  tags: string | null;
  group_name: string | null;
  is_favorite: number | boolean;
  folder_name: string | null;
  created_at: string;
}

type ModeKey = 'all' | 'single' | 'multi' | 'pattern' | 'other';

const MODE_LABELS: Record<Exclude<ModeKey, 'all'>, { label: string; color: string }> = {
  single: { label: '📚 単一URL', color: '#ec4899' },
  multi: { label: '📋 5本まとめ', color: '#8b5cf6' },
  pattern: { label: '🎯 分野別パターン', color: '#06b6d4' },
  other: { label: '📦 その他', color: '#6b7280' },
};

// タグ文字列からモードを判定（保存時のタグに準拠）
function detectMode(tags: string | null | undefined): Exclude<ModeKey, 'all'> {
  if (!tags) return 'other';
  if (tags.includes('単一URL')) return 'single';
  if (tags.includes('5本まとめ')) return 'multi';
  if (tags.includes('分野別パターン')) return 'pattern';
  return 'other';
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${dd} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

interface Props {
  onSwitchToExecute?: () => void;
  // 親のリロード制御用（保存直後に呼び出すため、refreshKey を変更するとフェッチが走る）
  refreshKey?: number;
}

export default function BuzzLibraryList({ onSwitchToExecute, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeKey>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // 複数選択（フィルタを切替えても選択状態は維持）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  // 個別チェック
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 取得
  const fetchItems = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/library?type=buzz-analysis', { cache: 'no-store' });
      if (!res.ok) {
        setError(`一覧取得に失敗しました（HTTP ${res.status}）`);
        setItems([]);
        return;
      }
      const data = (await res.json()) as LibraryItem[];
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(`通信エラー: ${e?.message || e}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // 各モードの件数集計
  const counts = useMemo(() => {
    const c: Record<ModeKey, number> = { all: items.length, single: 0, multi: 0, pattern: 0, other: 0 };
    items.forEach(it => {
      const m = detectMode(it.tags);
      c[m]++;
    });
    return c;
  }, [items]);

  // フィルタ + 検索
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(it => {
      if (favOnly && !Number(it.is_favorite)) return false;
      if (modeFilter !== 'all' && detectMode(it.tags) !== modeFilter) return false;
      if (q) {
        const inTitle = (it.title || '').toLowerCase().includes(q);
        const inContent = (it.content || '').toLowerCase().includes(q);
        if (!inTitle && !inContent) return false;
      }
      return true;
    });
  }, [items, search, modeFilter, favOnly]);

  // 表示中(filtered)の全選択 / 全解除トグル
  const filteredIds = useMemo(() => filtered.map(it => it.id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));
  const toggleSelectAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach(id => next.delete(id));
      } else {
        filteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // 選択中レコード（items から取得、フィルタ外も含む）
  const selectedRecords = useMemo(
    () => items.filter(it => selectedIds.has(it.id)),
    [items, selectedIds],
  );

  // 一括コピー
  const handleBulkCopy = async () => {
    if (selectedRecords.length === 0) return;
    const text = selectedRecords
      .map(r => `# ${r.title || '(無題)'}\n\n${r.content || ''}`)
      .join('\n\n---\n\n');
    try {
      await copyToClipboard(text);
      showToast(`📋 ${selectedRecords.length}件をコピーしました`);
    } catch {
      showToast('❌ コピーに失敗しました');
    }
  };

  // 一括MDダウンロード（1ファイルにまとめて出力）
  const handleBulkDownloadMd = async () => {
    if (selectedRecords.length === 0) return;
    setBulkDownloading(true);
    try {
      const date = yyyymmdd();
      const baseTitle = `バズり分析まとめ_${selectedRecords.length}件`;
      const fileTitle = sanitizeFilename(baseTitle);

      const indexLines = selectedRecords
        .map((r, i) => `${i + 1}. ${r.title || '(無題)'}`)
        .join('\n');

      const body = selectedRecords
        .map(r => {
          const modeKey = detectMode(r.tags);
          const modeLabel = MODE_LABELS[modeKey].label;
          const meta = r.metadata || {};
          const metaHeader =
            modeKey === 'single' && meta.url
              ? `> 対象URL: ${meta.url}`
              : modeKey === 'multi' && Array.isArray(meta.urls)
              ? `> 対象URL一覧:\n${meta.urls.map((u: string) => `> - ${u}`).join('\n')}`
              : modeKey === 'pattern' && meta.field
              ? `> 対象分野: ${meta.field}`
              : '';
          return `# ${r.title || '(無題)'}

> 保存日時: ${formatDate(r.created_at)}
> モード: ${modeLabel}
${metaHeader ? metaHeader + '\n' : ''}
${r.content || ''}`;
        })
        .join('\n\n---\n\n');

      const md = `# ${baseTitle}

> 出力日: ${new Date().toLocaleString('ja-JP')}
> 件数: ${selectedRecords.length}件

## 📋 目次
${indexLines}

---

${body}`;

      triggerDownload(`${fileTitle}_${date}.md`, md, 'text/markdown;charset=utf-8');
      showToast(`📥 ${selectedRecords.length}件のMDをダウンロードしました`);
    } finally {
      setBulkDownloading(false);
    }
  };

  // note 記事生成（Step 3）への引き渡し: sessionStorage に保管
  const handlePrepareForNoteArticle = () => {
    if (selectedRecords.length === 0) return;
    try {
      sessionStorage.setItem(
        'buzz-analysis-context',
        JSON.stringify({
          records: selectedRecords.map(r => ({
            id: r.id,
            title: r.title,
            content: r.content,
            tags: r.tags,
            created_at: r.created_at,
          })),
          savedAt: new Date().toISOString(),
        }),
      );
      showToast(
        `✍️ ${selectedRecords.length}件を「note 記事生成」の参考情報として準備しました（Step 3 実装後に活用予定）`,
      );
    } catch {
      showToast('❌ 準備に失敗しました（ブラウザストレージ制限）');
    }
  };

  // お気に入りトグル
  const toggleFavorite = async (item: LibraryItem) => {
    const nextFav = Number(item.is_favorite) ? false : true;
    // 楽観更新
    setItems(prev => prev.map(it => (it.id === item.id ? { ...it, is_favorite: nextFav ? 1 : 0 } : it)));
    try {
      const res = await fetch('/api/library', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, is_favorite: nextFav }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(nextFav ? '⭐ お気に入りに追加しました' : '☆ お気に入りを解除しました');
    } catch {
      // ロールバック
      setItems(prev => prev.map(it => (it.id === item.id ? { ...it, is_favorite: item.is_favorite } : it)));
      showToast('❌ 更新に失敗しました');
    }
  };

  // 削除
  const deleteItem = async (item: LibraryItem) => {
    if (!confirm(`「${item.title}」を削除しますか？（取り消せません）`)) return;
    try {
      const res = await fetch('/api/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems(prev => prev.filter(it => it.id !== item.id));
      if (expandedId === item.id) setExpandedId(null);
      // 選択からも除外
      setSelectedIds(prev => {
        if (!prev.has(item.id)) return prev;
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      showToast('🗑 削除しました');
    } catch {
      showToast('❌ 削除に失敗しました');
    }
  };

  // コピー
  const copyContent = async (item: LibraryItem) => {
    try {
      await copyToClipboard(item.content || '');
      showToast('📋 コピーしました');
    } catch {
      showToast('❌ コピーに失敗しました');
    }
  };

  // MDダウンロード
  const downloadMd = async (item: LibraryItem) => {
    if (!item.content) return;
    setDownloadingId(item.id);
    try {
      const modeKey = detectMode(item.tags);
      const label = modeKey === 'multi'
        ? 'バズり分析_5本まとめ'
        : modeKey === 'pattern'
        ? 'バズり分析_分野別パターン'
        : 'バズり分析';
      const fallback = item.title || label;
      const autoTitle = await generateTitleWithTimeout(item.content, label, fallback);
      const fileTitle = sanitizeFilename(autoTitle);
      const meta = item.metadata || {};
      const metaHeader =
        modeKey === 'single' && meta.url ? `> 対象URL: ${meta.url}\n` :
        modeKey === 'multi' && Array.isArray(meta.urls) ? `> 対象URL一覧:\n${meta.urls.map((u: string) => `> - ${u}`).join('\n')}\n` :
        modeKey === 'pattern' && meta.field ? `> 対象分野: ${meta.field}\n` :
        '';
      const dateLine = `> 保存日時: ${formatDate(item.created_at)}\n`;
      const md = `# ${autoTitle}\n\n${dateLine}${metaHeader}\n---\n\n${item.content}`;
      triggerDownload(`${fileTitle}_${yyyymmdd()}.md`, md, 'text/markdown;charset=utf-8');
    } finally {
      setDownloadingId(null);
    }
  };

  // フィルタボタン
  const FilterButton = ({ value, label }: { value: ModeKey; label: string }) => {
    const active = modeFilter === value;
    const count = counts[value];
    return (
      <button
        type="button"
        onClick={() => setModeFilter(value)}
        style={{
          padding: '6px 14px',
          borderRadius: 20,
          border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
          background: active ? 'var(--accent-soft)' : 'var(--bg-primary)',
          color: active ? 'var(--text-secondary)' : 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: active ? 600 : 500,
        }}
      >
        {label} <span style={{ opacity: 0.7, marginLeft: 4 }}>({count})</span>
      </button>
    );
  };

  // 空状態
  if (!loading && items.length === 0 && !error) {
    return (
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px dashed var(--border)',
        borderRadius: 12,
        padding: '48px 24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
          まだバズり分析結果がありません
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.7 }}>
          分析を実行してストック保存すると、ここに蓄積されます。
        </div>
        {onSwitchToExecute && (
          <button
            onClick={onSwitchToExecute}
            style={{
              padding: '10px 24px',
              background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            🚀 分析実行タブへ
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* 検索 + フィルタバー */}
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 タイトル・本文を検索..."
          style={{
            width: '100%',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 13,
            padding: '10px 14px',
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: 10,
          }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterButton value="all" label="全件" />
          <FilterButton value="single" label="📚 単一URL" />
          <FilterButton value="multi" label="📋 5本まとめ" />
          <FilterButton value="pattern" label="🎯 分野別パターン" />
          {counts.other > 0 && <FilterButton value="other" label="📦 その他" />}
          <div style={{ flex: 1 }} />
          {filteredIds.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: allFilteredSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: allFilteredSelected ? 'var(--accent-soft)' : 'var(--bg-primary)',
                color: allFilteredSelected ? 'var(--text-secondary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: allFilteredSelected ? 600 : 500,
              }}
              title={allFilteredSelected ? '表示中をすべて解除' : '表示中をすべて選択'}
            >
              {allFilteredSelected ? '☑ 表示中を全解除' : '☐ 表示中を全選択'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFavOnly(v => !v)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: favOnly ? '1px solid #f5a623' : '1px solid var(--border)',
              background: favOnly ? 'rgba(245,166,35,0.12)' : 'var(--bg-primary)',
              color: favOnly ? '#f5a623' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: favOnly ? 600 : 500,
            }}
          >
            {favOnly ? '⭐ お気に入りのみ' : '☆ お気に入りのみ表示'}
          </button>
          <button
            type="button"
            onClick={fetchItems}
            disabled={loading}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              color: 'var(--text-muted)',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 12,
            }}
          >
            🔄 更新
          </button>
        </div>
      </div>

      {/* ステータス */}
      {loading && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          <div style={{ width: 28, height: 28, border: '2px solid var(--border-accent)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
          読み込み中...
        </div>
      )}
      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 13, color: '#ef4444', marginBottom: 12 }}>
          ⚠️ {error}
        </div>
      )}
      {!loading && filtered.length === 0 && items.length > 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          検索・フィルタ条件に一致する記録がありません
        </div>
      )}

      {/* 選択中アクションバー（スティッキー） */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--accent)',
          borderRadius: 10,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          marginBottom: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>
            ☑ 選択中: <span style={{ color: 'var(--accent)' }}>{selectedIds.size}件</span>
          </span>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleBulkCopy}
              style={{
                padding: '6px 14px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              📋 まとめてコピー
            </button>
            <button
              type="button"
              onClick={handleBulkDownloadMd}
              disabled={bulkDownloading}
              style={{
                padding: '6px 14px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                borderRadius: 6,
                cursor: bulkDownloading ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
                opacity: bulkDownloading ? 0.6 : 1,
              }}
            >
              {bulkDownloading ? '⏳ 生成中...' : '📥 まとめてMD保存'}
            </button>
            <button
              type="button"
              onClick={handlePrepareForNoteArticle}
              style={{
                padding: '6px 14px',
                background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                border: 'none',
                color: '#fff',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ✍️ note 記事に活用
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{
                padding: '6px 14px',
                marginLeft: 4,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              ✕ 解除
            </button>
          </div>
        </div>
      )}

      {/* カード一覧 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(item => {
          const modeKey = detectMode(item.tags);
          const modeInfo = MODE_LABELS[modeKey];
          const isExpanded = expandedId === item.id;
          const isFav = !!Number(item.is_favorite);
          const isSelected = selectedIds.has(item.id);
          const preview = (item.content || '').replace(/[#*>`-]/g, '').slice(0, 200);

          // 選択中 > お気に入り > 通常 の優先で枠線色
          const borderColor = isSelected
            ? 'var(--accent)'
            : isFav
            ? 'rgba(245,166,35,0.4)'
            : 'var(--border)';

          return (
            <div
              key={item.id}
              style={{
                background: isSelected ? 'var(--accent-soft)' : 'var(--bg-secondary)',
                border: `${isSelected ? '2px' : '1px'} solid ${borderColor}`,
                borderRadius: 12,
                padding: 16,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {/* ヘッダー: チェックボックス + タイトル + バッジ */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    paddingTop: 2,
                  }}
                  title={isSelected ? '選択を外す' : '一括処理用に選択'}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(item.id)}
                    style={{
                      width: 16,
                      height: 16,
                      cursor: 'pointer',
                      accentColor: 'var(--accent)',
                    }}
                  />
                </label>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      background: `${modeInfo.color}1f`,
                      color: modeInfo.color,
                      border: `1px solid ${modeInfo.color}55`,
                    }}>
                      {modeInfo.label}
                    </span>
                    {isFav && <span style={{ fontSize: 12, color: '#f5a623' }}>⭐ お気に入り</span>}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(item.created_at)}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    {item.title || '(無題)'}
                  </div>
                </div>
              </div>

              {/* アクション（タイトル直下に配置 / v8・v9パターン） */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  style={{
                    padding: '5px 12px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  {isExpanded ? '▲ 閉じる' : '▼ 全文表示'}
                </button>
                <button
                  onClick={() => copyContent(item)}
                  style={{
                    padding: '5px 12px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  📋 コピー
                </button>
                <button
                  onClick={() => downloadMd(item)}
                  disabled={downloadingId === item.id}
                  style={{
                    padding: '5px 12px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-secondary)',
                    borderRadius: 6,
                    cursor: downloadingId === item.id ? 'not-allowed' : 'pointer',
                    fontSize: 11,
                    opacity: downloadingId === item.id ? 0.6 : 1,
                  }}
                >
                  {downloadingId === item.id ? '⏳ 生成中...' : '📥 MD'}
                </button>
                <button
                  onClick={() => toggleFavorite(item)}
                  style={{
                    padding: '5px 12px',
                    background: isFav ? 'rgba(245,166,35,0.12)' : 'var(--bg-primary)',
                    border: `1px solid ${isFav ? 'rgba(245,166,35,0.4)' : 'var(--border)'}`,
                    color: isFav ? '#f5a623' : 'var(--text-secondary)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  {isFav ? '⭐ お気に入り' : '☆ お気に入り'}
                </button>
                <button
                  onClick={() => deleteItem(item)}
                  style={{
                    padding: '5px 12px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#ef4444',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 11,
                    marginLeft: 'auto',
                  }}
                >
                  🗑 削除
                </button>
              </div>

              {/* プレビュー or 全文 */}
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.7,
                  marginBottom: 10,
                  cursor: 'pointer',
                  whiteSpace: isExpanded ? 'pre-wrap' : 'normal',
                  background: isExpanded ? 'var(--bg-primary)' : 'transparent',
                  padding: isExpanded ? 12 : 0,
                  borderRadius: isExpanded ? 8 : 0,
                  border: isExpanded ? '1px solid var(--border)' : 'none',
                  maxHeight: isExpanded ? 600 : 'none',
                  overflowY: isExpanded ? 'auto' : 'visible',
                  position: 'relative',
                }}
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
              >
                {/* 展開時のみ右上に sticky な閉じるボタン（スクロール追従） */}
                {isExpanded && (
                  <div style={{ position: 'sticky', top: 4, float: 'right', zIndex: 5, marginBottom: -28 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedId(null); }}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        background: 'rgba(255,255,255,0.92)',
                        color: '#374151',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                        backdropFilter: 'blur(4px)',
                        WebkitBackdropFilter: 'blur(4px)',
                        whiteSpace: 'nowrap',
                      }}
                      title="このアイテムを閉じる"
                    >
                      ▲ 閉じる
                    </button>
                  </div>
                )}
                {isExpanded ? (item.content || '') : preview + (item.content && item.content.length > 200 ? '…' : '')}
              </div>
            </div>
          );
        })}
      </div>

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, right: 32, zIndex: 9999,
          background: 'var(--bg-secondary)', border: '1px solid var(--border-accent)',
          color: 'var(--text-primary)', padding: '12px 24px', borderRadius: 12,
          fontSize: 14, fontWeight: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
