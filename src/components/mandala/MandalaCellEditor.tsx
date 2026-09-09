'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラ マスの編集パネル（§3-3）＋全画面（§3-4）
// 302: リンク欄（§4）＋未保存本文の退避と復元（§6）
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
//
// 302 §6 退避: 入力のたび（デバウンス）に localStorage へ {title, body, at} を鍵＝マス id で退避。
//   保存成功で「保存された行と退避が一致」したら消す。開いたとき、退避があり保存済みと**異なる**場合だけ
//   復元／破棄を提案する（黙って上書きしない）。同じなら何も出さず消す。popstate は捕まえない（§6-3）。
// 302 §4 リンク: 状態はこの部品が1つ持ち、パネルと全画面編集の両方に MandalaLinkSection を描く。
//   付け外しの結果は親へ返し、グリッドの件数（🔗n・📔n）を更新する。
// 308: 区分（meta.tier があるマスだけ）の無料⇄有料切替と、反応記録の欄（折りたたみ・既定は閉じる）。
//   どちらも同じ保存API（PATCH /api/mandala/cells）に tier／reaction を送る＝サーバがキー単位でマージ。
//   ⌘+Enter は本文の保存のまま（反応欄の入力には付けない）。保存成功の表示は保存された行から（R-95）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cellOrigin } from '@/lib/mandala-generate';
import { createPortal } from 'react-dom';
import FullscreenReader from '@/components/text-analysis/FullscreenReader';
import { CharCountBadge } from '@/components/LibraryItemRow';
import { useToast } from '@/components/ui/Toast';
import { formatJst, jstDateTimeString } from '@/lib/jst';
import { useRunKeyHints } from '@/lib/shortcuts';
import {
  MANDALA_BODY_MAX,
  MANDALA_CENTER,
  MANDALA_POSITION_LABELS,
  MANDALA_REACTION_KEYS,
  MANDALA_REACTION_LABELS,
  MANDALA_REACTION_MEMO_MAX,
  MANDALA_REACTION_X_KEYS,
  MANDALA_REACTION_X_LABELS,
  hasNoteReaction,
  normalizeReactionXInput,
  MANDALA_STASH_DEBOUNCE_MS,
  MANDALA_TIERS,
  MANDALA_TIER_LABELS,
  MANDALA_TITLE_MAX,
  MANDALA_UNSAVED_CONFIRM,
  cellDisplayTitle,
  cellSavedMessage,
  cellTier,
  clearStash,
  formatRate,
  isStashSameAsSaved,
  linkBulkResultMessage,
  loadStash,
  normalizeReactionInput,
  parseReaction,
  purchaseRate,
  saveStash,
  shouldOfferRestore,
  type MandalaCell,
  type MandalaReactionKey,
  type MandalaReactionXKey,
  type MandalaTier,
  type MandalaLinkResolved,
  type MandalaStash,
} from '@/lib/mandala-shared';
import { MandalaLinkPicker, MandalaLinkSection, linkKeyOf, type AddLinksResponse } from '@/components/mandala/MandalaLinks';

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
  onLinksChanged,
  pathLabel,
  titlePlaceholder,
  onResearchRequest,
  researchOrderState,
  onRegeneratePoint,
  pointRegenState,
  aiOriginNotice,
}: {
  cell: MandalaCell;
  /** 311: 「🔍 リサーチを発注」（親が発注ダイアログを開く）。省略時はボタンを出さない */
  onResearchRequest?: (cell: MandalaCell) => void;
  /** 311是正: 発注の可否（純関数 cellOrderState）。未記入の型マス／中央テーマ無しは無効化＋理由（R-101）。省略時は従来どおり */
  researchOrderState?: { enabled: boolean; reason: string | null };
  /** 316 §3-6: この要点の小項目だけ再生成（記事から生成したチャートの第1階層だけ渡される） */
  onRegeneratePoint?: (cell: MandalaCell) => void;
  pointRegenState?: { enabled: boolean; reason: string | null };
  /** 316 §3-5: 記事から生成したチャートのとき、パネルに出す注意書き */
  aiOriginNotice?: string;
  /** 308: 型のチャートの中央に出すプレースホルダ（例: 読者の着地点を1行で）。省略時は従来どおり */
  titlePlaceholder?: string;
  onClose: () => void;
  /** 305: 見出しの位置ラベル（第2階層は「親 › 子」）。省略時は自マスの位置ラベル */
  pathLabel?: string;
  /** 保存された行（API 応答の cell）を親へ返す。親はこれでグリッドを更新する */
  onSaved: (row: MandalaCell) => void;
  /** 未保存の変更の有無。親が「別マスへ移る」を止めるのに使う */
  onDirtyChange?: (dirty: boolean) => void;
  /** 302: リンクの付け外し後の一覧（解決済み）を親へ返す。親はグリッドの件数を更新する */
  onLinksChanged?: (cellId: string, links: MandalaLinkResolved[]) => void;
}) {
  const { showToast } = useToast();
  // 302 §6-4: 保存ボタンのキー併記（⌘↵ / Ctrl+↵）。表記は RUN_KEY_LABELS と同じ値（キーボードの無い端末では出さない）
  const keyHints = useRunKeyHints();
  const saveLabel = keyHints ? `💾 保存 ${keyHints.run}` : '💾 保存';
  const saveTitle = (d: boolean) => (d ? '保存（⌘+Enter／Ctrl+Enter）' : '変更はありません');
  const [mounted, setMounted] = useState(false);
  // 保存済みの値（保存された行から更新する・R-95）と、編集中の下書き
  const [base, setBase] = useState({ title: cell.title, body: cell.body });
  const baseRef = useRef(base);
  baseRef.current = base;
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
  // 302 §6: 退避の復元提案（開いたときに退避があり保存済みと異なるときだけ）
  const [restoreOffer, setRestoreOffer] = useState<MandalaStash | null>(null);
  // 302 §4: リンク
  const [links, setLinks] = useState<MandalaLinkResolved[]>([]);
  const [linksStatus, setLinksStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerOpenRef = useRef(false);
  pickerOpenRef.current = pickerOpen;
  const [removingId, setRemovingId] = useState<number | null>(null);
  // 308: 区分と反応記録（保存された行から・R-95）。cell は親が onSaved で差し替えるので、その meta を読む
  const tier = cellTier(cell);
  const savedReaction = parseReaction(cell.meta);
  const [tierSaving, setTierSaving] = useState(false);
  const tierSavingRef = useRef(false);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [reactionDraft, setReactionDraft] = useState<Record<MandalaReactionKey, string> & { memo: string }>(() => ({
    views: savedReaction?.views != null ? String(savedReaction.views) : '',
    likes: savedReaction?.likes != null ? String(savedReaction.likes) : '',
    shares: savedReaction?.shares != null ? String(savedReaction.shares) : '',
    purchases: savedReaction?.purchases != null ? String(savedReaction.purchases) : '',
    memo: savedReaction?.memo ?? '',
  }));
  const [reactionSaving, setReactionSaving] = useState(false);
  const reactionSavingRef = useRef(false);
  const [reactionError, setReactionError] = useState('');
  // 312 §3-5: X の反応（note 側とは別グループ・別タブ）。保存はグループ単位（触らない側は残る・R-113）
  const [reactionTab, setReactionTab] = useState<'note' | 'x'>('note');
  const [xDraft, setXDraft] = useState<Record<MandalaReactionXKey, string> & { memo: string }>(() => ({
    impressions: savedReaction?.x?.impressions != null ? String(savedReaction.x.impressions) : '',
    likes: savedReaction?.x?.likes != null ? String(savedReaction.x.likes) : '',
    reposts: savedReaction?.x?.reposts != null ? String(savedReaction.x.reposts) : '',
    shares: savedReaction?.x?.shares != null ? String(savedReaction.x.shares) : '',
    profileClicks: savedReaction?.x?.profileClicks != null ? String(savedReaction.x.profileClicks) : '',
    memo: savedReaction?.x?.memo ?? '',
  }));

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

  // 302 §6-2: 退避の確認（マウント時1回）。同じ内容なら黙って消す。異なるときだけ提案（黙って上書きしない）
  useEffect(() => {
    const stash = loadStash(cell.id);
    if (!stash) return;
    if (shouldOfferRestore(stash, { title: cell.title, body: cell.body })) {
      setRestoreOffer(stash);
    } else {
      clearStash(cell.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell.id]);

  // 302 §6-1: 入力のたびに（デバウンス）退避。保存済みと同じ内容に戻ったら退避も消す
  useEffect(() => {
    if (!dirty) {
      const stash = loadStash(cell.id);
      if (stash && isStashSameAsSaved(stash, baseRef.current)) clearStash(cell.id);
      return;
    }
    const t = window.setTimeout(() => {
      saveStash(cell.id, { title: draftRef.current.title, body: draftRef.current.body, at: new Date().toISOString() });
    }, MANDALA_STASH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [draft, dirty, cell.id]);

  // 302 §4: リンク一覧（解決済み）を読む
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/mandala/links?cellId=${encodeURIComponent(cell.id)}`, { cache: 'no-store' });
        const json = (await res.json().catch(() => ({}))) as { links?: MandalaLinkResolved[] };
        if (cancelled) return;
        if (!res.ok || !Array.isArray(json.links)) throw new Error(String(res.status));
        setLinks(json.links);
        setLinksStatus('ready');
      } catch {
        if (!cancelled) setLinksStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cell.id]);

  // §3-3 ページを離れるときの警告: リロード/タブを閉じる（beforeunload）と、アプリ内リンク（サイドバー・一覧へ戻る）。
  // 302: リンクの「開く」（新しいタブ）は対象外＝編集中の内容は残る
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

  // パネルを閉じる（未保存なら確認1回・R-56）。全画面・ピッカーが開いている間はそちらの Esc に譲る
  const requestClose = useCallback(() => {
    if (dirtyRef.current && !window.confirm(MANDALA_UNSAVED_CONFIRM)) return;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || fsRef.current || pickerOpenRef.current || e.isComposing) return;
      requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // マス保存API（PATCH /api/mandala/cells）の呼び出しは**この1箇所**。title/body（save）・tier・reaction（308）はすべてここを通す（R-91）
  const patchCell = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/mandala/cells', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cellId: cell.id, ...payload }),
    });
    const json = (await res.json().catch(() => ({}))) as { cell?: MandalaCell; error?: string; unchanged?: boolean };
    return { res, json };
  }, [cell.id]);

  const save = useCallback(async () => {
    if (savingRef.current) return; // R-87
    savingRef.current = true;
    setSaving(true);
    const sent = draftRef.current;
    try {
      const { res, json } = await patchCell({ title: sent.title, body: sent.body });
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
      // 302 §6-1: 退避と保存された行が一致した時点で退避を消す（送信後に進んだ編集は退避のまま残す）
      const stash = loadStash(cell.id);
      if (stash && isStashSameAsSaved(stash, { title: row.title, body: row.body })) clearStash(cell.id);
      setRestoreOffer(null);
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
  }, [cell.id, onSaved, showToast, patchCell]);

  // 302 §6-2: 復元／破棄
  const restore = () => {
    if (!restoreOffer) return;
    setDraft({ title: restoreOffer.title, body: restoreOffer.body });
    setRestoreOffer(null);
    showToast('未保存の内容を復元しました（まだ保存されていません）', 'info');
  };
  const discardStash = () => {
    clearStash(cell.id);
    setRestoreOffer(null);
  };

  // 302 §4: リンクの付け外し
  const applyLinks = useCallback(
    (next: MandalaLinkResolved[]) => {
      setLinks(next);
      setLinksStatus('ready');
      onLinksChanged?.(cell.id, next);
    },
    [cell.id, onLinksChanged],
  );
  const onPickerAdded = (res: AddLinksResponse) => {
    applyLinks(res.links);
    setPickerOpen(false);
    const msg = linkBulkResultMessage({ added: res.added.length, unchanged: res.unchanged.length, failed: res.failed.length });
    setStatus({ kind: res.failed.length > 0 ? 'error' : 'ok', text: msg, at: new Date().toISOString() });
    showToast(msg, res.failed.length > 0 ? 'warning' : 'success');
  };
  const removeLink = async (link: MandalaLinkResolved) => {
    if (removingId !== null) return;
    setRemovingId(link.id);
    try {
      const res = await fetch(`/api/mandala/links?id=${link.id}`, { method: 'DELETE' });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok && res.status !== 404) throw new Error(json.error || `リンクを外せませんでした（${res.status}）`);
      applyLinks(links.filter((l) => l.id !== link.id));
      showToast('リンクを外しました（記事は消えていません）', 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'リンクを外せませんでした', 'error');
    } finally {
      setRemovingId(null);
    }
  };
  const linkedKeys = new Set(links.map((l) => linkKeyOf(l.scope, l.item_key)));

  // 308 §2-1: 区分の切替（tier のあるマスだけ）。同じ PATCH に tier だけ送る＝サーバがキー単位でマージ（reaction 等は残る）
  const setTier = async (next: MandalaTier) => {
    if (tierSavingRef.current || next === tier) return;
    tierSavingRef.current = true;
    setTierSaving(true);
    try {
      const { res, json } = await patchCell({ tier: next });
      if (!res.ok || !json.cell) throw new Error(json.error || `区分の変更に失敗しました（${res.status}）`);
      onSaved(json.cell);
      showToast(`区分を「${MANDALA_TIER_LABELS[next]}」にしました`, 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '区分の変更に失敗しました', 'error');
    } finally {
      tierSavingRef.current = false;
      setTierSaving(false);
    }
  };

  // 308 §3-2: 反応の記録。検証は画面とサーバで同じ純関数（normalizeReactionInput）。全部空＝記録を消す。二重発火は ref（R-87）
  const saveReaction = async () => {
    if (reactionSavingRef.current) return;
    // 312: 開いているタブのグループだけ送る（note 側は項目そのもの、X 側は x:{…}）。全部空ならそのグループを消す（もう一方は残る）
    const isX = reactionTab === 'x';
    const check = isX ? normalizeReactionXInput(xDraft) : normalizeReactionInput(reactionDraft);
    if (!check.ok) {
      setReactionError(check.error);
      return;
    }
    reactionSavingRef.current = true;
    setReactionSaving(true);
    setReactionError('');
    try {
      const { res, json } = await patchCell({ reaction: isX ? { x: { ...xDraft } } : { ...reactionDraft } });
      if (!res.ok || !json.cell) throw new Error(json.error || `記録に失敗しました（${res.status}）`);
      const saved = parseReaction(json.cell.meta);
      onSaved(json.cell);
      const text = saved ? `反応を記録しました（${jstDateTimeString(saved.recordedAt)}）` : '反応の記録を消しました';
      setStatus({ kind: 'ok', text, at: saved?.recordedAt ?? new Date().toISOString() });
      showToast(text, 'success');
    } catch (e: unknown) {
      const text = e instanceof Error ? e.message : '記録に失敗しました';
      setReactionError(text);
      showToast(text, 'error');
    } finally {
      reactionSavingRef.current = false;
      setReactionSaving(false);
    }
  };
  const savedRate = purchaseRate(savedReaction);

  // 302 §6-4: ⌘/Ctrl+Enter で保存。保存ボタンと**同じ save()** を通す（savingRef の二重発火遮断・サーバの unchanged がそのまま効く）。
  // リスナーはこの編集要素（タイトル入力・本文 textarea・全画面編集の同要素）だけ＝画面全体の keydown は拾わない。
  // 日本語IMEの変換中（isComposing／keyCode 229）は無視。Enter 単独は触らない（textarea は改行のまま）。
  // ⌘/Ctrl+S も同じ経路（textarea 内でのブラウザ既定＝ページ保存ダイアログを奪う。編集中の標準操作なので許容）
  const onEditorKeyDown = (e: ReactKeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      // IME 変換の取り消しの Esc は全画面/パネルの「閉じる」に届かせない
      if (e.key === 'Escape') e.stopPropagation();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key.toLowerCase() === 's')) {
      e.preventDefault();
      if (dirtyRef.current) void save();
      return;
    }
  };

  const posLabel = pathLabel ?? (MANDALA_POSITION_LABELS[cell.position] ?? String(cell.position));
  const isCenter = cell.depth === 1 && cell.position === MANDALA_CENTER;
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
  // 302 §6-2: 復元提案（時刻は JST・R-86）。復元を選ぶまで編集欄は保存済みの値のまま
  const restoreBanner = restoreOffer && (
    <div
      data-mandala-restore
      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, border: '1px solid #B45309', background: 'rgba(180,83,9,0.08)', fontSize: 12, color: 'var(--text-primary)' }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        💾 未保存の内容があります（{restoreOffer.at ? formatJst(restoreOffer.at, { hour: '2-digit', minute: '2-digit' }) : '時刻不明'}）。復元しますか？
      </span>
      <button type="button" data-mandala-restore-apply onClick={restore} style={{ ...btn, borderColor: ACCENT, color: ACCENT }}>
        ↩ 復元
      </button>
      <button type="button" data-mandala-restore-discard onClick={discardStash} style={btn}>
        破棄
      </button>
    </div>
  );

  const titleInput = (testId: string) => (
    <input
      data-mandala-title-input={testId}
      type="text"
      value={draft.title}
      maxLength={MANDALA_TITLE_MAX}
      placeholder={titlePlaceholder ?? (isCenter ? 'テーマ（＝このチャートの名前）' : `${posLabel}のタイトル`)}
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
  const linkSection = (compact: boolean) => (
    <MandalaLinkSection links={links} status={linksStatus} onAddClick={() => setPickerOpen(true)} onRemove={(l) => void removeLink(l)} removingId={removingId} compact={compact} />
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
            {/* 308 §2-1: 区分の切替（tier のあるマスだけ出す＝既存チャートでは増えない） */}
            {tier && (
              <span data-mandala-tier-toggle={tier} role="group" aria-label="区分（無料／有料）" style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
                {MANDALA_TIERS.map((t) => {
                  const active = t === tier;
                  const color = t === 'paid' ? '#B45309' : '#1D9E75';
                  return (
                    <button
                      key={t}
                      type="button"
                      data-mandala-tier={t}
                      aria-pressed={active}
                      disabled={tierSaving}
                      onClick={() => void setTier(t)}
                      title={active ? `区分は「${MANDALA_TIER_LABELS[t]}」です` : `区分を「${MANDALA_TIER_LABELS[t]}」にする`}
                      style={{ ...btn, padding: '2px 8px', fontSize: 11, borderColor: active ? color : 'var(--border)', background: active ? `${color}22` : 'transparent', color: active ? color : 'var(--text-muted)', fontWeight: active ? 700 : 600, opacity: tierSaving ? 0.6 : 1 }}
                    >
                      {MANDALA_TIER_LABELS[t]}
                    </button>
                  );
                })}
              </span>
            )}
            {/* 316 §3-5: AI 由来の印（origin）。保存して内容が変わると 'edited' に */}
            {cellOrigin(cell) && (
              <span data-mandala-origin={cellOrigin(cell)} title={cellOrigin(cell) === 'ai' ? (aiOriginNotice ?? 'AIが記事から生成したマス') : '院長が編集したマス（AI生成から変更）'} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: cellOrigin(cell) === 'ai' ? 'rgba(108,99,255,0.14)' : 'rgba(29,158,117,0.12)', color: cellOrigin(cell) === 'ai' ? '#6c63ff' : '#1D9E75' }}>
                {cellOrigin(cell) === 'ai' ? 'AI' : '編集済み'}
              </span>
            )}
            {dirtyBadge}
            <button type="button" data-mandala-panel-close onClick={requestClose} title="閉じる（Esc）" style={{ ...btn, padding: '4px 8px' }}>
              ✕
            </button>
          </div>

          {/* 本体 */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 14 }}>
            {restoreBanner}
            {titleInput('panel')}
            {bodyInput('panel', { flex: 1, minHeight: 120 })}
            {linkSection(false)}
            {/* 308 §3-2: 反応記録（折りたたみ・既定は閉じる）。⌘+Enter は付けない（本文の保存のまま） */}
            <details
              data-mandala-reaction
              data-mandala-reaction-saved={savedReaction ? '1' : '0'}
              data-mandala-reaction-x-saved={savedReaction?.x ? '1' : '0'}
              open={reactionOpen}
              onToggle={(e) => setReactionOpen((e.currentTarget as HTMLDetailsElement).open)}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}
            >
              <summary data-mandala-reaction-summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                📈 反応
                {savedReaction && hasNoteReaction(savedReaction) ? (
                  <span data-mandala-reaction-brief style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>
                    {MANDALA_REACTION_KEYS.filter((k) => typeof savedReaction[k] === 'number').map((k) => `${MANDALA_REACTION_LABELS[k]} ${savedReaction[k]!.toLocaleString()}`).join('・')}
                    {savedRate !== null ? `・購入率 ${formatRate(savedRate)}` : ''}
                    {` — ${jstDateTimeString(savedReaction.recordedAt)}`}
                  </span>
                ) : (
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>note: 記録なし</span>
                )}
                {savedReaction?.x ? (
                  <span data-mandala-reaction-x-brief style={{ fontWeight: 400, color: '#e0684b', fontSize: 11 }}>
                    🐦 {MANDALA_REACTION_X_KEYS.filter((k) => typeof savedReaction.x![k] === 'number').map((k) => `${MANDALA_REACTION_X_LABELS[k]} ${savedReaction.x![k]!.toLocaleString()}`).join('・')}
                  </span>
                ) : (
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>X: 記録なし</span>
                )}
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {/* 312: note / X のタブ（グループを混ぜない） */}
                <div role="tablist" aria-label="反応の媒体" style={{ display: 'inline-flex', gap: 4 }}>
                  {(['note', 'x'] as const).map((t) => (
                    <button key={t} type="button" role="tab" data-mandala-reaction-tab={t} aria-selected={reactionTab === t} onClick={() => { setReactionTab(t); setReactionError(''); }} style={{ ...btn, padding: '2px 10px', fontSize: 11, borderColor: reactionTab === t ? (t === 'x' ? '#e0684b' : '#1D9E75') : 'var(--border)', color: reactionTab === t ? (t === 'x' ? '#e0684b' : '#1D9E75') : 'var(--text-muted)', fontWeight: reactionTab === t ? 700 : 600 }}>
                      {t === 'note' ? '📝 note' : '🐦 X'}
                    </button>
                  ))}
                </div>
                {reactionTab === 'note' ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                      {MANDALA_REACTION_KEYS.map((k) => (
                        <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-muted)', minWidth: 0 }}>
                          {MANDALA_REACTION_LABELS[k]}
                          <input
                            data-mandala-reaction-input={k}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={reactionDraft[k]}
                            onChange={(e) => setReactionDraft((d) => ({ ...d, [k]: e.target.value }))}
                            style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                          />
                        </label>
                      ))}
                    </div>
                    <input
                      data-mandala-reaction-memo
                      type="text"
                      value={reactionDraft.memo}
                      maxLength={MANDALA_REACTION_MEMO_MAX}
                      placeholder={`一言（何を出したか・気づき・${MANDALA_REACTION_MEMO_MAX}字まで）`}
                      onChange={(e) => setReactionDraft((d) => ({ ...d, memo: e.target.value }))}
                      style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                    />
                  </>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
                      {MANDALA_REACTION_X_KEYS.map((k) => (
                        <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-muted)', minWidth: 0 }}>
                          {MANDALA_REACTION_X_LABELS[k]}
                          <input
                            data-mandala-reaction-x-input={k}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={xDraft[k]}
                            onChange={(e) => setXDraft((d) => ({ ...d, [k]: e.target.value }))}
                            style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                          />
                        </label>
                      ))}
                    </div>
                    <input
                      data-mandala-reaction-x-memo
                      type="text"
                      value={xDraft.memo}
                      maxLength={MANDALA_REACTION_MEMO_MAX}
                      placeholder={`一言（どの投稿か・気づき・${MANDALA_REACTION_MEMO_MAX}字まで）`}
                      onChange={(e) => setXDraft((d) => ({ ...d, memo: e.target.value }))}
                      style={{ ...inputStyle, padding: '6px 8px', fontSize: 13 }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>共有・URLコピーが最重要シグナル（X-02）。プロフ遷移は手動検証の記録用（自動取得はしません）</div>
                  </>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {reactionTab === 'note' && (
                    <span data-mandala-reaction-rate={savedRate === null ? '' : String(savedRate)} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      購入率（購入÷アクセス）: {savedRate === null ? '—' : formatRate(savedRate)}
                    </span>
                  )}
                  {reactionError && (
                    <span data-mandala-reaction-error style={{ fontSize: 11, color: '#B91C1C' }}>⚠️ {reactionError}</span>
                  )}
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    data-mandala-reaction-save
                    onClick={() => void saveReaction()}
                    disabled={reactionSaving}
                    title={reactionTab === 'x' ? 'X の反応を記録する（全部空なら X の記録だけ消す・note 側は残る）' : 'この内容で反応を記録する（全部空なら note の記録だけ消す・X 側は残る）'}
                    style={{ ...btn, borderColor: reactionTab === 'x' ? '#e0684b' : '#1D9E75', color: reactionTab === 'x' ? '#e0684b' : '#1D9E75', opacity: reactionSaving ? 0.6 : 1 }}
                  >
                    {reactionSaving ? '⏳ 記録中…' : reactionTab === 'x' ? '🐦 記録する' : '📈 記録する'}
                  </button>
                </div>
              </div>
            </details>
          </div>

          {/* フッター */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', minWidth: 0 }}>
            <CharCountBadge n={draft.body.length} />
            {statusLine}
            <span style={{ flex: 1 }} />
            {/* 316 §3-6: この要点の小項目だけ再生成（子に edited があれば無効化＋理由） */}
            {onRegeneratePoint && pointRegenState && (
              <button type="button" data-mandala-regen-point={cell.id} disabled={!pointRegenState.enabled} title={pointRegenState.reason ?? 'この要点の小項目（8マス）を記事から作り直します'} onClick={() => onRegeneratePoint(cell)} style={{ ...btn, borderColor: '#6c63ff', color: '#6c63ff', opacity: pointRegenState.enabled ? 1 : 0.5, cursor: pointRegenState.enabled ? 'pointer' : 'not-allowed' }}>
                🔁 小項目を再生成
              </button>
            )}
            {/* 311 §3-2: リサーチを発注（リンク0件のマスで目立たせる。リンクがあっても追加調査できる） */}
            {onResearchRequest && (cell.title.trim() || cell.body.trim()) && (() => {
              const orderable = researchOrderState?.enabled ?? true;
              const uncovered = orderable && linksStatus === 'ready' && links.length === 0;
              return (
                <button
                  type="button"
                  data-mandala-research-order={cell.id}
                  data-mandala-research-order-uncovered={uncovered ? '1' : '0'}
                  data-mandala-research-order-reason={orderable ? undefined : researchOrderState?.reason ?? ''}
                  disabled={!orderable}
                  onClick={() => onResearchRequest(cell)}
                  title={!orderable ? researchOrderState?.reason ?? '' : uncovered ? 'このマスはまだ調べていません（リンク0件）。ディープリサーチ／テキスト分析を発注し、結果をこのマスに紐づけます' : '追加で調査を発注し、結果をこのマスに紐づけます'}
                  style={{ ...btn, ...(uncovered ? { background: '#0E7490', borderColor: '#0E7490', color: '#fff' } : { borderColor: '#0E7490', color: '#0E7490' }), ...(orderable ? {} : { opacity: 0.5, cursor: 'not-allowed' }) }}
                >
                  🔍 リサーチを発注
                </button>
              );
            })()}
            {/* 312 §3-1: このマスを X投稿にする（タイトルか本文がある。素材があれば添える）。発信ハブ③がマンダラの素材で開く */}
            {(cell.title.trim() || cell.body.trim()) && (
              <a
                data-mandala-x-cell={cell.id}
                href={`/dashboard/dr-hub?mandala=${encodeURIComponent(cell.chart_id)}&cell=${encodeURIComponent(cell.id)}&to=x`}
                target="_blank"
                rel="noopener noreferrer"
                title="このマスの気づき（タイトル・本文・素材・体験メモ）から X投稿群（既定3本）を起こす（発信ハブ③が新しいタブで開きます）"
                style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', borderColor: '#e0684b', color: '#e0684b' }}
              >
                🐦 X投稿にする
              </a>
            )}
            {/* 309 §3-1: このマスを無料記事にする（タイトルか本文がある＝保存済みの行で判定。中央も可）。発信ハブ①がマンダラの素材で開く */}
            {(cell.title.trim() || cell.body.trim() || links.some((l) => l.exists)) ? (
              <a
                data-mandala-note-free={cell.id}
                href={`/dashboard/dr-hub?mandala=${encodeURIComponent(cell.chart_id)}&cell=${encodeURIComponent(cell.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                title="このマスのタイトル・本文・リンク素材から無料のnote記事を起こす（発信ハブ①が新しいタブで開きます）"
                style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', borderColor: '#1D9E75', color: '#1D9E75' }}
              >
                📝 無料記事にする
              </a>
            ) : (
              <span data-mandala-note-free-disabled title="タイトルか本文を保存するか、素材をリンクすると無料記事にできます" style={{ ...btn, opacity: 0.5, cursor: 'default' }}>
                📝 無料記事にする
              </span>
            )}
            <button type="button" data-mandala-fullscreen onClick={() => { setFsEdit(false); setFs(true); }} title="全画面で読む・書く" style={btn}>
              ⛶ 全画面
            </button>
            <button
              type="button"
              data-mandala-save="panel"
              onClick={() => void save()}
              disabled={!dirty || saving}
              title={saveTitle(dirty)}
              style={{ ...primaryBtn, opacity: !dirty || saving ? 0.5 : 1, cursor: !dirty || saving ? 'default' : 'pointer' }}
            >
              {saving ? '⏳ 保存中…' : saveLabel}
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
              title={saveTitle(dirty)}
              style={{ ...primaryBtn, opacity: !dirty || saving ? 0.5 : 1, cursor: !dirty || saving ? 'default' : 'pointer' }}
            >
              {saving ? '⏳ 保存中…' : saveLabel}
            </button>
            <CharCountBadge n={draft.body.length} />
            {dirtyBadge}
            {statusLine}
          </>
        }
        editor={
          fsEdit ? (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 960, margin: '0 auto' }}>
              {restoreBanner}
              {titleInput('reader')}
              {bodyInput('reader', { flex: 1, minHeight: 0, fontSize: 'inherit', lineHeight: 1.85 })}
              {linkSection(true)}
            </div>
          ) : undefined
        }
      />

      {pickerOpen && (
        <MandalaLinkPicker
          cellId={cell.id}
          linkedKeys={linkedKeys}
          onClose={() => setPickerOpen(false)}
          onAdded={onPickerAdded}
          onError={(m) => showToast(m, 'error')}
        />
      )}
    </>
  );
}
