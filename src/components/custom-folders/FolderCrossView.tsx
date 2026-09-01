'use client';

// 253: マイフォルダを開いたときの「横断ビュー」。
//
// 共有したフォルダは、🗂保存一覧から開いても📚リサーチ保存から開いても**中身が全部見える**。
// そのため両画面で同じこの部品を使う（片方だけ別の見え方にすると、また件数と表示がずれる）。
//
// カードには出自バッジ（🗂分析 / 📚リサーチ）を必ず付ける。操作はアイテムの種類ごとに
// 実際に叩けるAPIへ振り分け、**その種類で使えない操作は最初から出さない**（押して失敗させない）。

import { useCallback, useEffect, useState } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { triggerDownload } from '@/lib/download';
import { renderMarkdown, sanitizeLatex } from '@/lib/markdown-renderer';
import { sanitizeFilename, yyyymmdd } from '@/lib/title-generator';
import { cardActionBtnStyle } from '@/components/text-analysis/cardActionButtonStyle';
// 282: 全画面リーダーは各画面で別実装せず共通部品を呼び出す（リサーチ保存と同時に横断表示にも揃える）
import FullscreenReader from '@/components/text-analysis/FullscreenReader';
import { confirmBulkDelete } from '@/lib/bulk-delete-confirm';
import FolderBadges from './FolderBadges';
import FolderPickerPopover from './FolderPickerPopover';
import { FOLDER_ACCENT } from './folderStyles';
import type { CustomFolder } from './useCustomFolders';

/** 横断ビューが扱うアイテムの種類（AI参照素材は独立体系なので入らない） */
export type CrossScope = 'text_analysis' | 'library';

export interface CrossFolderItem {
  scope: CrossScope;
  id: string;
  title: string;
  label: string;
  category: string | null;
  char_count: number;
  created_at: string;
  favorite: boolean;
  custom_folder_ids: number[];
}

/** 出自の表記。ここ1箇所で決める（画面ごとに言い方が変わらないように） */
const ORIGIN: Record<CrossScope, { icon: string; label: string; color: string; hint: string }> = {
  text_analysis: {
    icon: '🗂',
    label: '分析',
    color: '#6c63ff',
    hint: '🗂 保存一覧（テキスト分析）のアイテム',
  },
  library: {
    icon: '📚',
    label: 'リサーチ',
    color: '#0ea5e9',
    hint: '📚 リサーチ保存のアイテム',
  },
};

interface Props {
  folderId: number;
  folders: CustomFolder[];
  /** 分類の変更・削除でフォルダ件数が動いたときに親へ知らせる */
  onFoldersChanged: () => void;
  onCreateFolder: (name: string) => Promise<CustomFolder | null>;
  /** 絞り込みを解除して通常の一覧へ戻る */
  onExit: () => void;
  notify: (message: string) => void;
}

export default function FolderCrossView({
  folderId,
  folders,
  onFoldersChanged,
  onCreateFolder,
  onExit,
  notify,
}: Props) {
  const [items, setItems] = useState<CrossFolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [picker, setPicker] = useState<{ item: CrossFolderItem; rect: DOMRect } | null>(null);
  // 282: 全画面リーダーで表示中のアイテムと本文（null=非表示。本文は fetchBody を共有＝二重実装しない）
  const [reader, setReader] = useState<{ item: CrossFolderItem; content: string } | null>(null);

  const key = (it: { scope: CrossScope; id: string }) => `${it.scope}:${it.id}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/custom-folders/items?folderId=${folderId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || '取得に失敗しました');
      setItems(Array.isArray(data.items) ? data.items : []);
      setTruncated(!!data.truncated);
    } catch {
      setItems([]);
      notify('フォルダの中身を取得できませんでした');
    } finally {
      setLoading(false);
    }
  }, [folderId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  // 本文はアイテムの種類ごとに取りに行く（一覧には本文を載せない）
  const fetchBody = async (item: CrossFolderItem): Promise<string | null> => {
    const k = key(item);
    if (bodies[k] !== undefined) return bodies[k];
    setBusyId(k);
    try {
      const res = await fetch(
        `/api/custom-folders/items?full=1&scope=${item.scope}&id=${encodeURIComponent(item.id)}`,
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      const content = typeof data?.content === 'string' ? data.content : '';
      setBodies((prev) => ({ ...prev, [k]: content }));
      return content;
    } catch {
      notify('本文を取得できませんでした');
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const handleExpand = async (item: CrossFolderItem) => {
    const k = key(item);
    if (expanded === k) {
      setExpanded(null);
      return;
    }
    const body = await fetchBody(item);
    if (body === null) return;
    setExpanded(k);
  };

  const handleCopy = async (item: CrossFolderItem) => {
    const body = await fetchBody(item);
    if (body === null) return;
    await copyToClipboard(body);
    setCopiedId(key(item));
    setTimeout(() => setCopiedId(null), 1800);
  };

  // 282: ⛶全画面（本文を取得してから開く。取得失敗は fetchBody 側の notify に任せ、開かない＝fail-closed）
  const openReader = async (item: CrossFolderItem) => {
    const body = await fetchBody(item);
    if (body === null) return;
    setReader({ item, content: body });
  };

  const handleDownloadMd = async (item: CrossFolderItem) => {
    const body = await fetchBody(item);
    if (body === null) return;
    triggerDownload(
      `${yyyymmdd()}_${sanitizeFilename(item.title).slice(0, 40)}.md`,
      `# ${item.title}\n\n${body}`,
      'text/markdown',
    );
  };

  /** 削除はアイテムの種類ごとに別のAPIへ振り分ける */
  const deleteOne = async (item: CrossFolderItem): Promise<boolean> => {
    if (item.scope === 'text_analysis') {
      const res = await fetch(`/api/text-analysis/saves?id=${item.id}`, { method: 'DELETE' });
      return res.ok;
    }
    const res = await fetch('/api/library', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    });
    return res.ok;
  };

  const handleDelete = async (item: CrossFolderItem) => {
    if (!window.confirm(`「${item.title}」を削除します。\n\n元に戻せません。よろしいですか？`)) return;
    const ok = await deleteOne(item);
    if (!ok) {
      notify('削除に失敗しました');
      return;
    }
    setItems((prev) => prev.filter((i) => key(i) !== key(item)));
    onFoldersChanged();
  };

  /** 一括削除は種類ごとにまとめて、それぞれのAPIへ投げる */
  const handleBulkDelete = async () => {
    const targets = items.filter((i) => selected.has(key(i)));
    if (targets.length === 0 || bulkDeleting) return;
    if (!confirmBulkDelete(targets.length, 'アイテム')) return;
    setBulkDeleting(true);
    try {
      const saveIds = targets.filter((i) => i.scope === 'text_analysis').map((i) => i.id);
      const libIds = targets.filter((i) => i.scope === 'library').map((i) => i.id);
      const results: boolean[] = [];
      if (saveIds.length > 0) {
        const res = await fetch('/api/text-analysis/saves', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bulk_delete', ids: saveIds.map(Number) }),
        });
        results.push(res.ok);
      }
      if (libIds.length > 0) {
        const res = await fetch('/api/library', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: libIds }),
        });
        results.push(res.ok);
      }
      if (results.some((r) => !r)) {
        notify('一部の削除に失敗しました');
        await load();
        onFoldersChanged();
        return;
      }
      const gone = new Set(targets.map(key));
      setItems((prev) => prev.filter((i) => !gone.has(key(i))));
      setSelected(new Set());
      onFoldersChanged();
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleAssign = async (item: CrossFolderItem, folderIds: number[]) => {
    const before = item.custom_folder_ids;
    setItems((prev) =>
      prev.map((i) => (key(i) === key(item) ? { ...i, custom_folder_ids: folderIds } : i)),
    );
    try {
      const res = await fetch('/api/custom-folders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: item.scope,
          action: 'assign',
          itemId: item.id,
          folderIds,
        }),
      });
      if (!res.ok) throw new Error();
      onFoldersChanged();
    } catch {
      setItems((prev) =>
        prev.map((i) => (key(i) === key(item) ? { ...i, custom_folder_ids: before } : i)),
      );
      notify('分類を保存できませんでした');
    }
  };

  const toggleSelectAll = () => {
    const allKeys = items.map(key);
    const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
    setSelected(allSelected ? new Set() : new Set(allKeys));
  };

  const counts = {
    text_analysis: items.filter((i) => i.scope === 'text_analysis').length,
    library: items.filter((i) => i.scope === 'library').length,
  };

  return (
    <div data-folder-cross-view={folderId} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 見出し: 何件あって、その内訳がどちらの画面のものかを最初に出す */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          padding: '10px 14px',
          borderRadius: 10,
          border: `1px solid ${FOLDER_ACCENT}`,
          background: 'rgba(245,158,11,0.10)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: FOLDER_ACCENT }}>
          📂 このフォルダの中身
        </span>
        <span data-cross-total style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {loading ? '読み込み中…' : `${items.length}件`}
          {!loading && (
            <>
              （{ORIGIN.text_analysis.icon}
              {ORIGIN.text_analysis.label} {counts.text_analysis} ／{ORIGIN.library.icon}
              {ORIGIN.library.label} {counts.library}）
            </>
          )}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          保存一覧とリサーチ保存の両方をまとめて表示しています
        </span>
        <button
          type="button"
          data-cross-exit
          onClick={onExit}
          style={{ ...cardActionBtnStyle(), marginLeft: 'auto' }}
        >
          ✕ 絞り込みを解除
        </button>
      </div>

      {truncated && (
        <div style={{ fontSize: 11, color: '#b45309', background: '#fef3c7', padding: '8px 12px', borderRadius: 8 }}>
          このフォルダの件数が多いため、新しい順に500件までを表示しています。
        </div>
      )}

      {/* 選択操作（250の一括削除を横断でも使えるように） */}
      {items.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" data-cross-select-all onClick={toggleSelectAll} style={cardActionBtnStyle()}>
            {items.length > 0 && items.every((i) => selected.has(key(i)))
              ? '☑ 選択を解除'
              : `☑ ${items.length}件すべて選択`}
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              data-cross-bulk-delete
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              style={{
                fontSize: 11,
                padding: '4px 12px',
                borderRadius: 6,
                border: 'none',
                background: bulkDeleting ? 'var(--border)' : '#dc2626',
                color: '#fff',
                fontWeight: 700,
                cursor: bulkDeleting ? 'not-allowed' : 'pointer',
              }}
            >
              {bulkDeleting ? '⏳ 削除中...' : `🗑 選択した${selected.size}件を削除`}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>
          読み込み中...
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 30,
            color: 'var(--text-muted)',
            fontSize: 13,
            border: '1px dashed var(--border)',
            borderRadius: 12,
          }}
        >
          このフォルダにはまだ何も入っていません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => {
            const k = key(item);
            const origin = ORIGIN[item.scope];
            const isOpen = expanded === k;
            return (
              <div
                key={k}
                data-cross-card={k}
                style={{
                  border: `1px solid ${selected.has(k) ? FOLDER_ACCENT : 'var(--border)'}`,
                  borderLeft: `4px solid ${origin.color}`,
                  borderRadius: 12,
                  padding: 12,
                  background: 'var(--bg-card)',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    data-cross-check={k}
                    checked={selected.has(k)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(k);
                      else next.delete(k);
                      setSelected(next);
                    }}
                    style={{ marginTop: 4, accentColor: FOLDER_ACCENT, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      {/* 出自バッジ: どちらの画面のものか */}
                      <span
                        data-origin-badge={item.scope}
                        title={origin.hint}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          color: '#fff',
                          background: origin.color,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {origin.icon} {origin.label}
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
                        {item.label}
                      </span>
                      {item.category && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: 'var(--bg-secondary)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          📁 {item.category}
                        </span>
                      )}
                      <FolderBadges folderIds={item.custom_folder_ids} folders={folders} />
                      {item.favorite && <span style={{ fontSize: 14 }}>⭐</span>}
                    </div>

                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        wordBreak: 'break-word',
                        marginBottom: 4,
                      }}
                    >
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                      {new Date(item.created_at).toLocaleString('ja-JP')} ・
                      {item.char_count.toLocaleString()}文字
                    </div>

                    {/* 操作: この種類で実際に叩けるものだけを出す */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button type="button" onClick={() => void handleExpand(item)} style={cardActionBtnStyle()}>
                        {busyId === k ? '⏳ 取得中...' : isOpen ? '▲ 閉じる' : '▼ 全文表示'}
                      </button>
                      <button
                        type="button"
                        data-cross-fullscreen={k}
                        onClick={() => void openReader(item)}
                        style={cardActionBtnStyle()}
                        title="全画面のリーダー表示で読む"
                      >
                        ⛶ 全画面
                      </button>
                      <button type="button" onClick={() => void handleCopy(item)} style={cardActionBtnStyle()}>
                        {copiedId === k ? '✅ コピー済み' : '📋 コピー'}
                      </button>
                      <button type="button" onClick={() => void handleDownloadMd(item)} style={cardActionBtnStyle()}>
                        📥 MD
                      </button>
                      <button
                        type="button"
                        data-cross-assign={k}
                        onClick={(e) => setPicker({ item, rect: e.currentTarget.getBoundingClientRect() })}
                        style={{
                          ...cardActionBtnStyle(),
                          background: '#fef3c7',
                          border: `1px solid ${FOLDER_ACCENT}`,
                          color: '#92400e',
                          fontWeight: 700,
                        }}
                      >
                        ⭐ 分類
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        style={{
                          ...cardActionBtnStyle(),
                          color: '#ef4444',
                          borderColor: 'rgba(239,68,68,0.3)',
                          marginLeft: 'auto',
                        }}
                      >
                        🗑 削除
                      </button>
                    </div>

                    {isOpen && (
                      <div
                        className="markdown-body"
                        style={{
                          marginTop: 10,
                          padding: 12,
                          borderRadius: 8,
                          background: 'var(--bg-secondary)',
                          maxHeight: 420,
                          overflowY: 'auto',
                          fontSize: 13,
                          lineHeight: 1.8,
                        }}
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(sanitizeLatex(bodies[k] ?? '')),
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 282: 全画面リーダー（横断表示の本文を読み物表示）。カードと同じハンドラを共有。
          一覧の状態を変える操作（分類・削除）は誤操作防止のため入れない */}
      <FullscreenReader
        open={reader !== null}
        title={reader?.item.title ?? '無題'}
        content={reader?.content ?? ''}
        onClose={() => setReader(null)}
        actions={
          reader && (
            <>
              <button type="button" onClick={() => void handleCopy(reader.item)} style={cardActionBtnStyle()}>
                {copiedId === key(reader.item) ? '✅ コピー済み' : '📋 コピー'}
              </button>
              <button type="button" onClick={() => void handleDownloadMd(reader.item)} style={cardActionBtnStyle()}>
                📥 MD
              </button>
            </>
          )
        }
      />

      {picker && (
        <FolderPickerPopover
          anchorRect={picker.rect}
          folders={folders}
          selectedIds={
            items.find((i) => key(i) === key(picker.item))?.custom_folder_ids ??
            picker.item.custom_folder_ids
          }
          // お気に入りの解除は各画面の☆で行う。ここで出すと種類ごとに別APIへの
          // 振り分けが要り、押して失敗する口を増やすため出さない
          isFavorite={false}
          onChange={(ids) => void handleAssign(picker.item, ids)}
          onCreate={onCreateFolder}
          onUnfavorite={() => setPicker(null)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
