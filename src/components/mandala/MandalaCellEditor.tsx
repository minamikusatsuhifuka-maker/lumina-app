'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラ マスの編集パネル（§3-3）＋全画面（§3-4）
//
// 形式は**サイドパネル**（右側・固定）: マンダラは「隣のマスとの関係」を見ながら書くものなので、
// 編集中も 3×3 が見えている必要がある（モーダルだと隠れる）。狭い画面では全幅になる。
// createPortal で body 直下に描く（.page-enter の transform 配下では fixed が効かない・R-19）。
//
// 下書き（draft）はこの部品が1つだけ持ち、サイドパネルと全画面の両方が同じ draft を編集する。
// 全画面は共通の FullscreenReader をそのまま呼び（R-91）、閲覧は既定の整形本文（renderMarkdown＝MarkdownBody と同じ経路・R-97）、
// 編集は opt-in の `editor` prop に textarea を渡す（既定挙動は不変・R-88）。
// 全画面を閉じても draft はパネルに残るので、全画面の閉じる操作には警告を出さない。
// 警告が要るのは draft が失われる操作＝〈パネルを閉じる〉〈別マスへ移る〉〈ページを離れる〉（§3-3）。
//
// 保存: 二重発火は同期的な ref で閉じる（R-87）。保存成功の表示は**保存された行**から作る（R-95・cellSavedMessage）。
// 空で保存できる（マスを空に戻す・§4-4）。失敗は必ず見せる（トースト＋パネル内の状態行）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import FullscreenReader from '@/components/text-analysis/FullscreenReader';
import { CharCountBadge } from '@/components/LibraryItemRow';
import { useToast } from '@/components/ui/Toast';
import { formatJst } from '@/lib/jst';
import {
  MANDALA_BODY_MAX,
  MANDALA_CENTER,
  MANDALA_POSITION_LABELS,
  MANDALA_TITLE_MAX,
  MANDALA_UNSAVED_CONFIRM,
  cellDisplayTitle,
  cellSavedMessage,
  type MandalaCell,
} from '@/lib/mandala-shared';

const ACCENT = '#6c63ff';
const PANEL_Z = 9000; // FullscreenReader（10000）より下・AIアシスタント（9999）より下

const btn: CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const primaryBtn: CSSProperties = { ...btn, background: ACCENT, borderColor: ACCENT, color: '#fff' };
const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text-primary)',
  fontSize: 14,
  padding: '10px 12px',
  outline: 'none',
  fontFamily: 'inherit',
  lineHeight: 1.7,
};

type Status = { kind: 'ok' | 'error'; text: string; at: string } | null;

export default function MandalaCellEditor({
  cell,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  cell: MandalaCell;
  onClose: () => void;
  /** 保存された行（API 応答の cell）を親へ返す。親はこれでグリッドを更新する */
  onSaved: (row: MandalaCell) => void;
  /** 未保存の変更の有無。親が「別マスへ移る」を止めるのに使う */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(false);
  // 保存済みの値（保存された行から更新する・R-95）と、編集中の下書き
  const [base, setBase] = useState({ title: cell.title, body: cell.body });
  const [draft, setDraft] = useState({ title: cell.title, body: cell.body });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // R-87: state ではなく同期的な ref で二重発火を閉じる
  const [status, setStatus] = useState<Status>(null);
  const [fs, setFs] = useState(false);
  const fsRef = useRef(false);
  fsRef.current = fs;
  const [fsEdit, setFsEdit] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const dirty = draft.title !== base.title || draft.body !== base.body;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // 開いたら本文欄へフォーカス（キーボードで書き始められる）
  useEffect(() => {
    const t = window.setTimeout(() => bodyRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  // §3-3 ページを離れるときの警告: リロード/タブを閉じる（beforeunload）と、アプリ内リンク（サイドバー・一覧へ戻る）
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClickCapture = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || a.getAttribute('target') === '_blank') return;
      if (!window.confirm(MANDALA_UNSAVED_CONFIRM)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [dirty]);

  // パネルを閉じる（未保存なら確認1回・R-56）。全画面が開いている間は全画面側の Esc に譲る
  const requestClose = useCallback(() => {
    if (dirtyRef.current && !window.confirm(MANDALA_UNSAVED_CONFIRM)) return;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || fsRef.current || e.isComposing) return;
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const save = useCallback(async () => {
    if (savingRef.current) return; // R-87
    savingRef.current = true;
    setSaving(true);
    const sent = draftRef.current;
    try {
      const res = await fetch('/api/mandala/cells', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cellId: cell.id, title: sent.title, body: sent.body }),
      });
      const json = (await res.json().catch(() => ({}))) as { cell?: MandalaCell; error?: string };
      if (!res.ok || !json.cell) {
        const text = json.error || `保存に失敗しました（${res.status}）`;
        setStatus({ kind: 'error', text, at: new Date().toISOString() });
        showToast(text, 'error');
        return;
      }
      const row = json.cell;
      // R-95: 表示も base も**保存された行**から作る。送信後に編集が進んでいれば draft は触らない（dirty のまま残る）
      setBase({ title: row.title, body: row.body });
      if (draftRef.current === sent) setDraft({ title: row.title, body: row.body });
      const text = cellSavedMessage(row);
      setStatus({ kind: 'ok', text, at: row.updated_at });
      showToast(text, 'success');
      onSaved(row);
    } catch (e: unknown) {
      const text = e instanceof Error && e.message ? `保存に失敗しました: ${e.message}` : '保存に失敗しました';
      setStatus({ kind: 'error', text, at: new Date().toISOString() });
      showToast(text, 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [cell.id, onSaved, showToast]);

  // ⌘/Ctrl+S で保存（textarea 内でのブラウザ既定＝ページ保存ダイアログを奪う。編集中の標準操作なので許容）
  const onEditorKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (dirtyRef.current) void save();
      return;
    }
    // IME 変換の取り消しの Esc は全画面/パネルの「閉じる」に届かせない
    if (e.key === 'Escape' && e.nativeEvent.isComposing) e.stopPropagation();
  };

  const posLabel = MANDALA_POSITION_LABELS[cell.position] ?? String(cell.position);
  const isCenter = cell.position === MANDALA_CENTER;
  const headTitle = cellDisplayTitle({ title: draft.title, position: cell.position });

  const statusLine = status && (
    <span
      data-mandala-save-status={status.kind}
      style={{ fontSize: 11, color: status.kind === 'ok' ? '#1D9E75' : '#B91C1C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
      title={`${status.text}（${formatJst(status.at)}）`}
    >
      {status.kind === 'ok' ? '✅' : '⚠️'} {status.text}
    </span>
  );
  const dirtyBadge = dirty && (
    <span data-mandala-dirty style={{ fontSize: 11, fontWeight: 700, color: '#B45309', whiteSpace: 'nowrap' }}>
      ● 未保存
    </span>
  );

  const titleInput = (testId: string) => (
    <input
      data-mandala-title-input={testId}
      type="text"
      value={draft.title}
      maxLength={MANDALA_TITLE_MAX}
      placeholder={isCenter ? 'テーマ（＝このチャートの名前）' : `${posLabel}のタイトル`}
      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
      onKeyDown={onEditorKeyDown}
      style={{ ...inputStyle, fontWeight: 700 }}
    />
  );
  const bodyInput = (testId: string, extra: CSSProperties) => (
    <textarea
      ref={testId === 'panel' ? bodyRef : undefined}
      data-mandala-body-input={testId}
      value={draft.body}
      maxLength={MANDALA_BODY_MAX}
      placeholder="本文（長文可・Markdown の見出し・箇条書きは全画面の閲覧で整形されます）"
      onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
      onKeyDown={onEditorKeyDown}
      style={{ ...inputStyle, resize: 'none', ...extra }}
    />
  );

  if (!mounted) return null;

  return (
    <>
      {createPortal(
        <aside
          data-mandala-panel={cell.id}
          role="dialog"
          aria-label={`${posLabel}のマスを編集`}
          className="mandala-panel"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 'min(480px, 100vw)',
            zIndex: PANEL_Z,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-card, #fff)',
            borderLeft: '1px solid var(--border)',
            boxShadow: '-6px 0 24px rgba(0,0,0,0.12)',
            color: 'var(--text-primary)',
          }}
        >
          {/* ヘッダー */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)', minWidth: 0 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 999,
                background: isCenter ? ACCENT : 'var(--bg-secondary)',
                color: isCenter ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${isCenter ? ACCENT : 'var(--border)'}`,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {isCenter ? 'テーマ' : posLabel}
            </span>
            <span data-mandala-panel-title style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={headTitle}>
              {headTitle}
            </span>
            {dirtyBadge}
            <button type="button" data-mandala-panel-close onClick={requestClose} title="閉じる（Esc）" style={{ ...btn, padding: '4px 8px' }}>
              ✕
            </button>
          </div>

          {/* 本体 */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 14 }}>
            {titleInput('panel')}
            {bodyInput('panel', { flex: 1, minHeight: 160 })}
          </div>

          {/* フッター */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', minWidth: 0 }}>
            <CharCountBadge n={draft.body.length} />
            {statusLine}
            <span style={{ flex: 1 }} />
            <button type="button" data-mandala-fullscreen onClick={() => { setFsEdit(false); setFs(true); }} title="全画面で読む・書く" style={btn}>
              ⛶ 全画面
            </button>
            <button
              type="button"
              data-mandala-save="panel"
              onClick={() => void save()}
              disabled={!dirty || saving}
              title={dirty ? '保存（⌘S）' : '変更はありません'}
              style={{ ...primaryBtn, opacity: !dirty || saving ? 0.5 : 1, cursor: !dirty || saving ? 'default' : 'pointer' }}
            >
              {saving ? '⏳ 保存中…' : '💾 保存'}
            </button>
          </div>
          <style>{`
            @media (max-width: 768px) {
              .mandala-panel { width: 100vw !important; }
            }
          `}</style>
        </aside>,
        document.body,
      )}

      {/* §3-4 全画面: 共通 FullscreenReader をそのまま呼ぶ。閲覧＝既定の整形本文、編集＝opt-in の editor（R-88/R-91） */}
      <FullscreenReader
        open={fs}
        title={`${isCenter ? 'テーマ' : posLabel}: ${headTitle}`}
        content={draft.body}
        onClose={() => setFs(false)}
        actions={
          <>
            <button
              type="button"
              data-mandala-reader-view
              aria-pressed={!fsEdit}
              onClick={() => setFsEdit(false)}
              title="整形して読む"
              style={{ ...btn, ...(fsEdit ? {} : { borderColor: ACCENT, color: ACCENT }) }}
            >
              👁 閲覧
            </button>
            <button
              type="button"
              data-mandala-reader-edit
              aria-pressed={fsEdit}
              onClick={() => setFsEdit(true)}
              title="全画面のまま書く"
              style={{ ...btn, ...(fsEdit ? { borderColor: ACCENT, color: ACCENT } : {}) }}
            >
              ✏️ 編集
            </button>
            <button
              type="button"
              data-mandala-save="reader"
              onClick={() => void save()}
              disabled={!dirty || saving}
              title={dirty ? '保存（⌘S）' : '変更はありません'}
              style={{ ...primaryBtn, opacity: !dirty || saving ? 0.5 : 1, cursor: !dirty || saving ? 'default' : 'pointer' }}
            >
              {saving ? '⏳ 保存中…' : '💾 保存'}
            </button>
            <CharCountBadge n={draft.body.length} />
            {dirtyBadge}
            {statusLine}
          </>
        }
        editor={
          fsEdit ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 960, margin: '0 auto' }}>
              {titleInput('reader')}
              {bodyInput('reader', { flex: 1, minHeight: 0, fontSize: 'inherit', lineHeight: 1.85 })}
            </div>
          ) : undefined
        }
      />
    </>
  );
}
