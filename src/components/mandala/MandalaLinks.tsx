'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 302 §4: マスのリンク欄（MandalaLinkSection）とリンク先を探すピッカー（MandalaLinkPicker）
//
// - scope の許容値・表示名・遷移先は lib/mandala-shared.ts（MANDALA_LINK_SCOPES / MANDALA_SCOPE_META）が正本。
//   ここに別の列挙を作らない
// - ピッカーの検索元は既存の**軽い一覧API**（pickerSearchUrl）。応答の形の差は pickerItemsOf が吸収する
// - 既にリンク済みの項目は無効化して「リンク済み」（一意制約にぶつけて失敗させない・R-101 の考え方）
// - 複数選んで1リクエスト（POST /api/mandala/links）。成功／失敗件数は呼び出し元がトーストで出す（R-39）
// - 「開く」は新しいタブ（編集中の内容を失わないため・§4-4）。title 属性で遷移先の種類が分かる（InstantTooltip・R-110）
// - 「外す」は非破壊（記事は消えない）ので確認ダイアログを増やさない（R-56 の趣旨）
// - リンク先が消えていても壊れない: 「リンク先なし」と出し、外せる（R-92: 鍵と解決結果を分ける）
// - 二重発火は ref で同期的に閉じる（R-87）。サーバー側は ON CONFLICT DO NOTHING で二重に付かない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CharCountBadge } from '@/components/LibraryItemRow';
import { jstDateTimeString, jstShortDate } from '@/lib/jst';
import { MANDALA_RESEARCH_KIND_LABELS, MANDALA_RESEARCH_STATE_LABELS, parseResearchMeta, researchState } from '@/lib/mandala-research';
const ACCENT_RESEARCH = '#0E7490';
import {
  MANDALA_LINK_BULK_LIMIT,
  MANDALA_LINK_SCOPES,
  linkDisplayTitle,
  pickerItemsOf,
  pickerSearchUrl,
  popoverRowsOf,
  scopeMetaOf,
  type MandalaLinkResolved,
  type MandalaPickerItem,
  MANDALA_REACTION_KEYS,
  MANDALA_REACTION_LABELS,
  formatRate,
  parseReaction,
  purchaseRate,
  type MandalaCell,
  MANDALA_REACTION_X_KEYS,
  MANDALA_REACTION_X_LABELS,
  hasNoteReaction,
} from '@/lib/mandala-shared';

const ACCENT = '#6c63ff';
const PICKER_Z = 10500; // FullscreenReader（10000）から開いても上に出る

const smallBtn: CSSProperties = {
  padding: '3px 8px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
};

export function ScopeBadge({ scope, compact = false, noTitle = false }: { scope: string; compact?: boolean; noTitle?: boolean }) {
  const meta = scopeMetaOf(scope);
  return (
    <span
      data-mandala-scope-badge={scope}
      // 304: ホバーポップアップの中では title を付けない（InstantTooltip と箱を同時に出さない・R-110）
      title={noTitle ? undefined : meta.label}
      aria-label={noTitle ? meta.label : undefined}
      style={{ fontSize: compact ? 11 : 12, flexShrink: 0, whiteSpace: 'nowrap' }}
    >
      {meta.icon}
      {!compact && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 2 }}>{meta.label}</span>}
    </span>
  );
}

export type LinkKey = `${string}:${string}`;
export function linkKeyOf(scope: string, itemKey: string): LinkKey {
  return `${scope}:${itemKey}`;
}

/** 編集パネル／全画面編集に置くリンク欄。状態は親（MandalaCellEditor）が1つだけ持ち、ここは描画と操作の口 */
export function MandalaLinkSection({
  links,
  status,
  onAddClick,
  onRemove,
  removingId,
  compact = false,
}: {
  links: MandalaLinkResolved[];
  status: 'loading' | 'ready' | 'failed';
  onAddClick: () => void;
  onRemove: (link: MandalaLinkResolved) => void;
  removingId: number | null;
  compact?: boolean;
}) {
  return (
    <div data-mandala-links style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
          🔗 リンク <span data-mandala-links-count={links.length} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({links.length})</span>
        </span>
        <span style={{ flex: 1 }} />
        <button type="button" data-mandala-link-add onClick={onAddClick} title="記事・エピソードを探してリンクする" style={{ ...smallBtn, borderColor: ACCENT, color: ACCENT }}>
          ＋ 追加
        </button>
      </div>
      {status === 'loading' && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>読み込み中…</div>}
      {status === 'failed' && <div data-mandala-links-error style={{ fontSize: 11, color: '#B91C1C' }}>⚠️ リンクの取得に失敗しました</div>}
      {status === 'ready' && links.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>リンクはまだありません（📚🗂🧠📔から付けられます）</div>}
      {links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: compact ? 120 : 220, overflowY: 'auto' }}>
          {links.map((l) => {
            const meta = scopeMetaOf(l.scope);
            const title = linkDisplayTitle(l);
            const href = l.exists ? meta.openHref(l.item_key) : '';
            return (
              <div
                key={l.id}
                data-mandala-link={l.id}
                data-mandala-link-scope={l.scope}
                data-mandala-link-exists={l.exists ? '1' : '0'}
                style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 12, padding: '3px 4px', borderRadius: 6, background: 'var(--bg-primary)' }}
              >
                <ScopeBadge scope={l.scope} compact />
                <span
                  data-mandala-link-title
                  title={title}
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: l.exists ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: l.exists ? 'normal' : 'italic' }}
                >
                  {title}
                </span>
                {l.exists && l.char_count != null && <CharCountBadge n={l.char_count} unit="字" compact />}
                {l.exists ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-mandala-link-open={l.id}
                    title={`${meta.icon} ${meta.label}で開く（新しいタブ）`}
                    style={smallBtn}
                  >
                    開く ↗
                  </a>
                ) : (
                  <span data-mandala-link-missing style={{ ...smallBtn, cursor: 'default', opacity: 0.6 }} title="リンク先が削除されています">
                    開けません
                  </span>
                )}
                <button
                  type="button"
                  data-mandala-link-remove={l.id}
                  onClick={() => onRemove(l)}
                  disabled={removingId === l.id}
                  title="リンクを外す（記事は消えません）"
                  style={{ ...smallBtn, opacity: removingId === l.id ? 0.5 : 1 }}
                >
                  外す
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface AddLinksResponse {
  success: boolean;
  added: string[];
  unchanged: string[];
  failed: string[];
  links: MandalaLinkResolved[];
}

/**
 * リンク先を探して複数選び、1リクエストで付けるピッカー（モーダル・body 直下・R-19）。
 * 検索元は scope ごとの軽い一覧API。選択は 'scope:key' の Set（順不同で可）。
 */
export function MandalaLinkPicker({
  cellId,
  linkedKeys,
  onClose,
  onAdded,
  onError,
}: {
  cellId: string;
  /** 既にリンク済み（'scope:item_key'）。ピッカーで無効化して「リンク済み」と出す */
  linkedKeys: ReadonlySet<string>;
  onClose: () => void;
  onAdded: (res: AddLinksResponse) => void;
  onError: (message: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [scope, setScope] = useState<string>(MANDALA_LINK_SCOPES[0]);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MandalaPickerItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [selected, setSelected] = useState<Map<string, MandalaPickerItem>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const submitRef = useRef(false); // R-87
  const reqSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  // Esc はこのピッカーだけを閉じる（下のパネル／全画面には届かせない＝capture で止める）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // 検索（scope・語が変わるたび・デバウンス）。古い応答は捨てる
  useEffect(() => {
    const seq = ++reqSeq.current;
    setStatus('loading');
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(pickerSearchUrl(scope, q), { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (seq !== reqSeq.current) return;
        setItems(pickerItemsOf(scope, json));
        setStatus('ready');
      } catch {
        if (seq !== reqSeq.current) return;
        setItems([]);
        setStatus('failed');
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [scope, q]);

  const toggle = (it: MandalaPickerItem) => {
    const k = linkKeyOf(it.scope, it.key);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else next.set(k, it);
      return next;
    });
  };

  const overLimit = selected.size > MANDALA_LINK_BULK_LIMIT;
  const canSubmit = selected.size > 0 && !overLimit && !submitting;
  const submitReason = selected.size === 0 ? '項目を選んでください' : overLimit ? `一度に付けられるのは${MANDALA_LINK_BULK_LIMIT}件までです（${selected.size}件選択中）` : null;

  const submit = async () => {
    if (submitRef.current || !canSubmit) return; // R-87
    submitRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mandala/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cellId, items: [...selected.values()].map((it) => ({ scope: it.scope, item_key: it.key })) }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<AddLinksResponse> & { error?: string };
      if (!res.ok || !Array.isArray(json.links)) {
        onError(json.error || `リンクの追加に失敗しました（${res.status}）`);
        return;
      }
      onAdded({ success: true, added: json.added ?? [], unchanged: json.unchanged ?? [], failed: json.failed ?? [], links: json.links });
    } catch (e: unknown) {
      onError(e instanceof Error && e.message ? `リンクの追加に失敗しました: ${e.message}` : 'リンクの追加に失敗しました');
    } finally {
      submitRef.current = false;
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      data-mandala-picker
      role="dialog"
      aria-modal="true"
      aria-label="リンク先を選ぶ"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: PICKER_Z, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(640px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-card, #fff)', color: 'var(--text-primary)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>🔗 リンク先を選ぶ</span>
          <span style={{ flex: 1 }} />
          <button type="button" data-mandala-picker-close onClick={onClose} title="閉じる（Esc）" style={{ ...smallBtn, padding: '4px 8px' }}>
            ✕
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 14px 0', flexWrap: 'wrap' }}>
          {MANDALA_LINK_SCOPES.map((s) => {
            const meta = scopeMetaOf(s);
            const active = s === scope;
            return (
              <button
                key={s}
                type="button"
                data-mandala-picker-scope={s}
                aria-pressed={active}
                onClick={() => setScope(s)}
                title={`${meta.label}から探す`}
                style={{ ...smallBtn, padding: '5px 10px', fontSize: 12, borderColor: active ? ACCENT : 'var(--border)', background: active ? `${ACCENT}15` : 'transparent', color: active ? ACCENT : 'var(--text-secondary)', fontWeight: active ? 700 : 600 }}
              >
                {meta.icon} {meta.label}
              </button>
            );
          })}
        </div>
        <div style={{ padding: '10px 14px 6px' }}>
          <input
            ref={inputRef}
            data-mandala-picker-search
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`🔍 ${scopeMetaOf(scope).label}をタイトルで検索`}
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, padding: '8px 10px', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>
        <div data-mandala-picker-list style={{ flex: 1, minHeight: 120, overflowY: 'auto', padding: '0 14px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {status === 'loading' && items.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>検索中…</div>}
          {status === 'failed' && <div data-mandala-picker-error style={{ fontSize: 12, color: '#B91C1C', padding: 8 }}>⚠️ 一覧の取得に失敗しました</div>}
          {status === 'ready' && items.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>該当する項目がありません</div>}
          {items.map((it) => {
            const k = linkKeyOf(it.scope, it.key);
            const linked = linkedKeys.has(k);
            const checked = selected.has(k);
            return (
              <label
                key={k}
                data-mandala-picker-item={k}
                data-mandala-picker-linked={linked ? '1' : undefined}
                title={linked ? 'このマスにリンク済みです' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: checked ? `${ACCENT}12` : 'var(--bg-primary)', opacity: linked ? 0.55 : 1, cursor: linked ? 'default' : 'pointer', minWidth: 0 }}
              >
                <input type="checkbox" checked={checked} disabled={linked} onChange={() => toggle(it)} data-mandala-picker-check={k} />
                <ScopeBadge scope={it.scope} compact />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.title}>
                    {it.title || '（無題）'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {it.sub && <span>{it.sub}</span>}
                    {it.createdAt && <span>{jstShortDate(it.createdAt)}</span>}
                  </span>
                </span>
                {linked ? (
                  <span data-mandala-picker-linked-label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>リンク済み</span>
                ) : (
                  <CharCountBadge n={it.charCount} unit="字" compact />
                )}
              </label>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
          <span data-mandala-picker-selected={selected.size} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {selected.size}件選択中
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={smallBtn}>
            やめる
          </button>
          <button
            type="button"
            data-mandala-picker-submit
            onClick={() => void submit()}
            disabled={!canSubmit}
            title={submitReason ?? `${selected.size}件をこのマスにリンクする`}
            style={{ ...smallBtn, padding: '6px 12px', fontSize: 12, background: ACCENT, borderColor: ACCENT, color: '#fff', opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'default' }}
          >
            {submitting ? '⏳ 付けています…' : `🔗 ${selected.size}件を付ける`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── 304: バッジのホバーポップアップの中身（HoverPopover に載せる。外す・追加はしない＝パネルへ誘導） ──

export function MandalaLinkPopoverContent({
  links,
  status,
  from,
  onOpenPanel,
}: {
  links: MandalaLinkResolved[] | null;
  status: 'loading' | 'ready' | 'failed';
  from: 'links' | 'episode';
  /** 「他 n件 → パネルで見る」「パネルで編集」（サイドパネルを開く） */
  onOpenPanel: () => void;
}) {
  const { rows, rest } = popoverRowsOf(links ?? [], from);
  return (
    <div data-mandala-popover style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '2px 4px' }}>🔗 リンク（{links?.length ?? 0}）</div>
      {status === 'loading' && !links && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>読み込み中…</div>}
      {status === 'failed' && !links && <div data-mandala-popover-error style={{ fontSize: 11, color: '#B91C1C', padding: '2px 4px' }}>⚠️ リンクの取得に失敗しました</div>}
      {rows.map((l) => {
        const meta = scopeMetaOf(l.scope);
        const title = linkDisplayTitle(l);
        const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '5px 6px', borderRadius: 6, textDecoration: 'none', color: 'inherit' };
        const inner = (
          <>
            <ScopeBadge scope={l.scope} compact noTitle />
            <span
              data-mandala-pop-title
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: l.exists ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: l.exists ? 'normal' : 'italic' }}
            >
              {title}
            </span>
            {l.exists && l.char_count != null && <CharCountBadge n={l.char_count} unit="字" compact />}
            {l.exists && <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>↗</span>}
          </>
        );
        return l.exists ? (
          <a
            key={l.id}
            href={meta.openHref(l.item_key)}
            target="_blank"
            rel="noopener noreferrer"
            data-mandala-pop-link={l.id}
            data-mandala-pop-scope={l.scope}
            aria-label={`${meta.label}で開く（新しいタブ）: ${title}`}
            style={{ ...rowStyle, cursor: 'pointer', background: 'var(--bg-primary)' }}
          >
            {inner}
          </a>
        ) : (
          <span key={l.id} data-mandala-pop-link-missing={l.id} data-mandala-pop-scope={l.scope} aria-disabled style={{ ...rowStyle, opacity: 0.6, cursor: 'default' }}>
            {inner}
          </span>
        );
      })}
      {rest > 0 && (
        <button type="button" data-mandala-pop-more={rest} onClick={onOpenPanel} style={{ ...smallBtn, justifyContent: 'center', borderStyle: 'dashed' }}>
          他 {rest}件 → パネルで見る
        </button>
      )}
      <button type="button" data-mandala-pop-edit onClick={onOpenPanel} style={{ ...smallBtn, justifyContent: 'center', borderColor: ACCENT, color: ACCENT, marginTop: 2 }}>
        ✏️ パネルで編集
      </button>
    </div>
  );
}

/**
 * 308 §3-3: 📈 バッジのポップアップ（HoverPopover の中身）。4項目＋購入率（導出・R-74）＋一言＋記録日時（JST）。
 * データ源はマスの meta（取得なし）。押せる要素は「パネルで記録する」だけ
 */
export function MandalaReactionPopoverContent({ cell, onOpenPanel }: { cell: MandalaCell; onOpenPanel: () => void }) {
  const r = parseReaction(cell.meta);
  const rate = purchaseRate(r);
  return (
    <div data-mandala-reaction-popover style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '2px 4px' }}>📈 反応記録</div>
      {!r ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>記録がありません</div>
      ) : (
        <>
          {hasNoteReaction(r) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4, padding: '2px 4px' }}>
            {MANDALA_REACTION_KEYS.map((k) => (
              <div key={k} data-mandala-reaction-pop={k} style={{ fontSize: 11, textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{MANDALA_REACTION_LABELS[k]}</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{typeof r[k] === 'number' ? r[k]!.toLocaleString() : '—'}</div>
              </div>
            ))}
          </div>
          )}
          {hasNoteReaction(r) && (
          <div style={{ fontSize: 11, padding: '2px 4px', color: 'var(--text-secondary)' }}>
            購入率:{' '}
            <span data-mandala-reaction-pop-rate={rate === null ? '' : String(rate)} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
              {rate === null ? '—（アクセス数が未記録）' : formatRate(rate)}
            </span>
          </div>
          )}
          {r.memo && (
            <div data-mandala-reaction-pop-memo style={{ fontSize: 11, padding: '2px 4px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
              💬 {r.memo}
            </div>
          )}
          {hasNoteReaction(r) && (
            <div data-mandala-reaction-pop-at style={{ fontSize: 10, padding: '2px 4px', color: 'var(--text-muted)' }}>
              記録 {r.recordedAt ? jstDateTimeString(r.recordedAt) : '（日時不明）'}
            </div>
          )}
          {/* 312 §3-5: X の行（note 側とは別グループ） */}
          {r.x && (
            <div data-mandala-reaction-pop-x style={{ borderTop: '1px dashed var(--border)', marginTop: 2, paddingTop: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '0 4px' }}>🐦 X</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 2, padding: '2px 4px' }}>
                {MANDALA_REACTION_X_KEYS.map((k) => (
                  <div key={k} data-mandala-reaction-pop-x-key={k} style={{ fontSize: 10, textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>{MANDALA_REACTION_X_LABELS[k]}</div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{typeof r.x![k] === 'number' ? r.x![k]!.toLocaleString() : '—'}</div>
                  </div>
                ))}
              </div>
              {r.x.memo && <div data-mandala-reaction-pop-x-memo style={{ fontSize: 11, padding: '2px 4px', overflowWrap: 'anywhere' }}>💬 {r.x.memo}</div>}
              <div style={{ fontSize: 10, padding: '2px 4px', color: 'var(--text-muted)' }}>記録 {r.x.recordedAt ? jstDateTimeString(r.x.recordedAt) : '（日時不明）'}</div>
            </div>
          )}
        </>
      )}
      <button type="button" data-mandala-reaction-pop-edit onClick={onOpenPanel} style={{ marginTop: 2, padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left' }}>
        パネルで記録する →
      </button>
    </div>
  );
}

/**
 * 309 §3-4: 📝 バッジのポップアップ。そのマスから起こした note 記事（記事の側の記録から導出）。行を押すと📚リサーチ保存で開く（新しいタブ）
 */
export function MandalaArticlesPopoverContent({ articles }: { articles: readonly { id: string; title: string; mode: 'free_cell' | 'paid_chart'; created_at: string }[] }) {
  return (
    <div data-mandala-articles-popover style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '2px 4px' }}>📝 起こした記事（{articles.length}）</div>
      {articles.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>記事がありません</div>}
      {articles.map((a) => (
        <a
          key={a.id}
          data-mandala-article={a.id}
          href={`/dashboard/library?open=${encodeURIComponent(a.id)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '5px 6px', borderRadius: 6, textDecoration: 'none', color: 'inherit', fontSize: 12 }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, padding: '0 5px', borderRadius: 4, background: a.mode === 'paid_chart' ? 'rgba(180,83,9,0.14)' : 'rgba(29,158,117,0.12)', color: a.mode === 'paid_chart' ? '#B45309' : '#1D9E75', flexShrink: 0 }}>
            {a.mode === 'paid_chart' ? '有料' : '無料'}
          </span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title || '（無題）'}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{jstShortDate(a.created_at)} ↗</span>
        </a>
      ))}
    </div>
  );
}

/**
 * 311 §3-5: 🔍 バッジのポップアップ。開始時刻（JST）・経路・状態（調査中／失敗／中断）。失敗・中断からは再発注できる
 */
export function MandalaResearchPopoverContent({ cell, nowMs, onReorder, onClear }: { cell: MandalaCell; nowMs: number; onReorder: () => void; onClear: () => void }) {
  const r = parseResearchMeta(cell.meta);
  const state = researchState(cell.meta, nowMs);
  if (!r || state === 'none') return <div data-mandala-research-popover style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>調査の記録がありません</div>;
  return (
    <div data-mandala-research-popover data-mandala-research-state={state} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: state === 'running' ? ACCENT_RESEARCH : '#B45309', padding: '2px 4px' }}>{MANDALA_RESEARCH_STATE_LABELS[state]}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '2px 4px' }}>{MANDALA_RESEARCH_KIND_LABELS[r.kind]}・開始 {jstDateTimeString(r.startedAt)}{r.jobId !== undefined ? `・ジョブ #${r.jobId}` : ''}</div>
      {state === 'failed' && r.reason && <div data-mandala-research-pop-reason style={{ fontSize: 11, color: '#B91C1C', padding: '2px 4px', overflowWrap: 'anywhere' }}>理由: {r.reason}</div>}
      {state === 'stale' && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>6時間以上経過しています。タブを閉じた・通信が切れた等で完了が届いていない可能性があります</div>}
      {state === 'running' && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>完了するとこのマスに 🔗 が付きます</div>}
      {state !== 'running' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <button type="button" data-mandala-research-pop-reorder onClick={onReorder} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: `1px solid ${ACCENT_RESEARCH}`, background: 'transparent', color: ACCENT_RESEARCH, cursor: 'pointer' }}>🔍 再発注</button>
          <button type="button" data-mandala-research-pop-clear onClick={onClear} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>印を消す</button>
        </div>
      )}
    </div>
  );
}

/** 312 §3-4: 🐦 バッジのポップアップ。そのマスから起こした X 投稿（記事の側の記録から導出）。押すと📚リサーチ保存で開く */
export function MandalaXPostsPopoverContent({ posts }: { posts: readonly { id: string; title: string; mode: 'cell' | 'series'; created_at: string }[] }) {
  return (
    <div data-mandala-xposts-popover style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '2px 4px' }}>🐦 起こした投稿（{posts.length}）</div>
      {posts.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>投稿がありません</div>}
      {posts.map((p) => (
        <a key={p.id} data-mandala-xpost={p.id} href={`/dashboard/library?open=${encodeURIComponent(p.id)}`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '5px 6px', borderRadius: 6, textDecoration: 'none', color: 'inherit', fontSize: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '0 5px', borderRadius: 4, background: 'rgba(224,104,75,0.14)', color: '#e0684b', flexShrink: 0 }}>{p.mode === 'series' ? 'シリーズ' : '投稿群'}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || '（無題）'}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{jstShortDate(p.created_at)} ↗</span>
        </a>
      ))}
    </div>
  );
}
