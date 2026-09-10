'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 319 §3-1/3-2: 「🔭 追加リサーチ」のダイアログ（4箇所の入口で同じ部品）
//
// - 前提資料: 元資料のタイトル・字数・冒頭（GET /api/followup-research?mode=sources。本文は取らない）。
//   削除済みは「資料なし」、上限超えは末尾を切らず無効化＋理由（R-101）
// - プロンプト: 院長が自由に書く（必須）。候補チップは**文字列を入力欄に入れるだけ**（決定的・院長が直せる）
// - 分量（既定は元の DR と同じ・無ければスタンダード）／実行先（通常DR＝Gemini・既定／⚖ 3つのAIで比較＝314 のダイアログへ）
// - ☑ 継承（既定オン・R-77）／目安（314 の lib/model-pricing。前提資料の字数を入力に加算）
// - 「🔭 リサーチ開始」= 確認は1回（R-56）・二重発火は ref（R-87）。ここでは AI を呼ばない＝🔭画面へ handoff
//   （新しいタブ＝localStorage の一回限りキー・R-121）。「やめる」「Esc」ではリクエスト 0
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '@/components/ModalSheet';
import { GEMINI_TEXT_MODEL, GEMINI_TEXT_MODEL_LABEL } from '@/lib/ai-models';
import { estimateCost, estimatedSecondsLabel, formatUsd, pricingNote } from '@/lib/model-pricing';
import { useHoverPopover } from '@/components/HoverPopover';
import { MANDALA_SCOPE_META } from '@/lib/mandala-shared';
import {
  FOLLOWUP_HANDOFF_KEY,
  FOLLOWUP_MAX_SOURCES,
  FOLLOWUP_MODES,
  FOLLOWUP_MODE_DEFAULT,
  FOLLOWUP_MODE_LABEL,
  FOLLOWUP_PAGE_HREF,
  FOLLOWUP_PROMPT_CHIPS,
  FOLLOWUP_PROMPT_MAX,
  FOLLOWUP_REJECT_MISSING,
  FOLLOWUP_SCOPE_LABEL,
  FOLLOWUP_WRITING_RULES,
  type FollowUpHandoff,
  type FollowUpMode,
  type FollowUpRef,
  type FollowUpScope,
  type FollowUpTarget,
  followUpStartState,
  followUpTooManyReason,
} from '@/lib/followup-research';

interface SourceMeta {
  scope: FollowUpScope;
  id: string;
  title: string;
  chars: number;
  preview: string;
  missing?: boolean;
}

const btnBase: CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' };

/** 発注文の定型（【書き方】等）の字数＝目安の入力に足す分 */
const ORDER_OVERHEAD_CHARS = FOLLOWUP_WRITING_RULES.join('\n').length + 60;

export function FollowUpResearchDialog({
  refs,
  onClose,
  defaultMode = FOLLOWUP_MODE_DEFAULT,
}: {
  refs: readonly FollowUpRef[];
  onClose: () => void;
  /** 既定の分量（元の DR の分量があれば同じ・無ければスタンダード） */
  defaultMode?: FollowUpMode;
}) {
  const [mounted, setMounted] = useState(false);
  const [sources, setSources] = useState<SourceMeta[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<FollowUpMode>(defaultMode);
  const [target, setTarget] = useState<FollowUpTarget>('normal');
  const [inherit, setInherit] = useState(true);
  const startedRef = useRef(false); // R-87
  const tooMany = refs.length > FOLLOWUP_MAX_SOURCES;

  useEffect(() => setMounted(true), []);
  useBodyScrollLock(mounted); // 326: 開いている間は背面をスクロールさせない
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (tooMany) return; // 上限超えは取りに行かない（理由だけ出す・R-101）
    let cancelled = false;
    (async () => {
      try {
        const q = refs.map((r) => `${r.scope}:${r.id}`).join(',');
        const res = await fetch(`/api/followup-research?mode=sources&refs=${encodeURIComponent(q)}`);
        const json = (await res.json().catch(() => ({}))) as { sources?: SourceMeta[]; missing?: FollowUpRef[]; error?: string };
        if (!res.ok || !json.sources) throw new Error(json.error || `前提資料を確認できませんでした（${res.status}）`);
        if (cancelled) return;
        // 入力順を保ち、削除済みは missing の印で残す（黙って落とさない）
        const found = new Map(json.sources.map((s) => [`${s.scope}:${s.id}`, s]));
        setSources(refs.map((r) => found.get(`${r.scope}:${r.id}`) ?? { scope: r.scope, id: r.id, title: '（資料なし）', chars: 0, preview: '', missing: true }));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // refs は呼び出し側で固定される（ダイアログを開いた時点の選択）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooMany]);

  if (!mounted) return null;

  const state = tooMany
    ? { enabled: false, reason: followUpTooManyReason(refs.length) }
    : !sources
      ? { enabled: false, reason: loadError || '前提資料を確認中…' }
      : followUpStartState(sources, prompt);
  const sourceChars = (sources ?? []).reduce((n, s) => n + s.chars, 0);
  const orderChars = sourceChars + prompt.trim().length + ORDER_OVERHEAD_CHARS;
  const est = estimateCost(GEMINI_TEXT_MODEL, mode, orderChars);
  const start = () => {
    if (startedRef.current || !state.enabled || !sources) return; // R-87
    startedRef.current = true;
    const handoff: FollowUpHandoff = {
      sources: sources.map((s) => ({ scope: s.scope, id: s.id, title: s.title, chars: s.chars })),
      prompt: prompt.trim(),
      mode,
      target,
      inherit,
      at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(FOLLOWUP_HANDOFF_KEY, JSON.stringify(handoff));
    } catch {
      startedRef.current = false;
      setLoadError('ブラウザの保存領域に書けませんでした（プライベートモード等）。通常のタブで開き直してください');
      return;
    }
    window.open(FOLLOWUP_PAGE_HREF, '_blank', 'noopener');
    onClose();
  };

  return createPortal(
    <div
      data-followup-dialog
      role="dialog"
      aria-label="追加リサーチ"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.35)' }}
    >
      <div style={{ width: 'min(680px, 100%)', maxHeight: '100dvh', overflowY: 'auto', background: 'var(--bg-modal)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13, color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🔭 これを元に追加リサーチ</div>
          <button type="button" data-followup-close onClick={onClose} style={{ ...btnBase, padding: '4px 8px' }}>✕</button>
        </div>

        {/* 前提資料 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
            前提資料{sources ? `（${sources.length}件・${sourceChars.toLocaleString()}字）` : tooMany ? `（${refs.length}件）` : ''}
          </div>
          {tooMany && <div data-followup-reason-sources style={{ fontSize: 12, color: '#B45309' }}>⚠️ {followUpTooManyReason(refs.length)}</div>}
          {!tooMany && loadError && <div data-followup-load-error style={{ fontSize: 12, color: '#B91C1C' }}>⚠️ {loadError}</div>}
          {!tooMany && !sources && !loadError && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>前提資料を確認中…</div>}
          {sources?.map((s) => (
            <div key={`${s.scope}:${s.id}`} data-followup-source={`${s.scope}:${s.id}`} data-followup-source-missing={s.missing ? '1' : undefined} data-followup-source-chars={s.chars} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${s.missing ? '#B45309' : 'var(--border)'}`, background: 'var(--bg-primary)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.missing ? FOLLOWUP_REJECT_MISSING : s.title}</strong>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{FOLLOWUP_SCOPE_LABEL[s.scope]}{s.missing ? '' : `・${s.chars.toLocaleString()}字`}</span>
              </div>
              {!s.missing && s.preview && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 48, overflow: 'hidden' }}>{s.preview}{s.chars > s.preview.length ? '…' : ''}</div>}
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>本文はそのまま渡します（要約・末尾の切り詰めはしません）。</div>
        </div>

        {/* プロンプト */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }} htmlFor="followup-prompt">プロンプト（必須）</label>
          <textarea
            id="followup-prompt"
            data-followup-prompt
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={FOLLOWUP_PROMPT_MAX}
            placeholder="例: これらの会社の2022年〜2025年の年間売上を調べて"
            style={{ width: '100%', minHeight: 72, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FOLLOWUP_PROMPT_CHIPS.map((chip, i) => (
              <button key={chip} type="button" data-followup-chip={i} onClick={() => setPrompt(chip)} title="押すとこの文をプロンプト欄に入れます（そのまま直せます）" style={{ ...btnBase, padding: '4px 10px', fontSize: 11, borderRadius: 999 }}>
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* 分量・実行先・継承 */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>分量</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FOLLOWUP_MODES.map((m) => (
                <label key={m} data-followup-mode={m} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, border: `1px solid ${mode === m ? 'var(--border-accent)' : 'var(--border)'}`, cursor: 'pointer', fontSize: 12 }}>
                  <input type="radio" name="followup-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                  {FOLLOWUP_MODE_LABEL[m]}
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>実行先</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <label data-followup-target="normal" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, border: `1px solid ${target === 'normal' ? 'var(--border-accent)' : 'var(--border)'}`, cursor: 'pointer', fontSize: 12 }}>
                <input type="radio" name="followup-target" value="normal" checked={target === 'normal'} onChange={() => setTarget('normal')} />
                通常DR（{GEMINI_TEXT_MODEL_LABEL}）
              </label>
              <label data-followup-target="compare" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8, border: `1px solid ${target === 'compare' ? 'var(--border-accent)' : 'var(--border)'}`, cursor: 'pointer', fontSize: 12 }} title="🔭画面で並列比較の確認ダイアログを開きます（モデルの選択と費用の目安はそちらで）">
                <input type="radio" name="followup-target" value="compare" checked={target === 'compare'} onChange={() => setTarget('compare')} />
                ⚖ 3つのAIで比較
              </label>
            </div>
          </div>
        </div>
        <label data-followup-inherit style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={inherit} onChange={(e) => setInherit(e.target.checked)} />
          元資料の用途カテゴリ・マイフォルダを結果に付ける（複数なら和集合）
        </label>

        {/* 目安 */}
        <div data-followup-estimate style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          {target === 'normal' ? (
            <>
              目安: 費用 <strong data-followup-cost data-followup-cost-usd={est ? est.usd.toFixed(4) : ''} title={est ? `入力 約${est.inputTokens.toLocaleString()} tok（前提資料 ${sourceChars.toLocaleString()} 字を含む）× $${est.unit.inputPerM}/1M ＋ 出力 約${est.outputTokens.toLocaleString()} tok × $${est.unit.outputPerM}/1M` : undefined}>{est ? formatUsd(est.usd) : '単価未設定'}</strong>
              {' ／ 所要 '}<span data-followup-time>{estimatedSecondsLabel(GEMINI_TEXT_MODEL, mode)}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>（{GEMINI_TEXT_MODEL_LABEL}・{pricingNote()}）</span>
            </>
          ) : (
            <span>モデルごとの費用・所要時間の目安は、次の「並列比較の確認」で表示します（前提資料 {sourceChars.toLocaleString()} 字を入力に加算）。</span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span data-followup-reason style={{ fontSize: 11, color: state.enabled ? 'var(--text-muted)' : '#B45309', flex: 1, minWidth: 0 }}>
            {state.reason ?? (target === 'compare' ? '🔭画面を新しいタブで開き、並列比較の確認へ進みます' : '🔭画面を新しいタブで開いてリサーチを始めます（結果は📚に保存されます）')}
          </span>
          <button type="button" data-followup-cancel onClick={onClose} style={btnBase}>やめる</button>
          <button type="button" data-followup-start onClick={start} disabled={!state.enabled} title={state.reason ?? undefined} style={{ ...btnBase, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, opacity: state.enabled ? 1 : 0.5, cursor: state.enabled ? 'pointer' : 'not-allowed' }}>
            🔭 リサーチ開始
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 行・結果画面に置く入口ボタン（押すとダイアログ）。refs は1件（行）でも複数（選択バー）でも同じ */
export function FollowUpResearchButton({
  refs,
  label = '🔭 追加リサーチ',
  style,
  title = 'この結果を前提資料に、プロンプトを指定してディープリサーチを続けます（新しいタブ・結果は📚に保存）',
  dataKey,
  defaultMode,
  disabled = false,
  disabledReason,
}: {
  refs: readonly FollowUpRef[];
  label?: ReactNode;
  style?: CSSProperties;
  title?: string;
  /** data-followup-open の値（E2E・行の識別） */
  dataKey?: string;
  defaultMode?: FollowUpMode;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-followup-open={dataKey ?? refs.map((r) => `${r.scope}:${r.id}`).join(',')}
        onClick={(e) => { e.stopPropagation(); if (!disabled) setOpen(true); }}
        disabled={disabled}
        title={disabled ? disabledReason ?? title : title}
        style={{ ...style, ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
      >
        {label}
      </button>
      {open && <FollowUpResearchDialog refs={refs} defaultMode={defaultMode} onClose={() => setOpen(false)} />}
    </>
  );
}

interface FollowUpListItem {
  id: string;
  title: string;
  prompt: string;
  mode: string;
  model: string;
  at: string;
  created_at: string;
}

/** 元資料の行の「🔭 追加: n」。ホバー／タップで一覧（304 HoverPopover）→ 新しいタブで開く（302 ?open=・R-121 の handoff は不要） */
export function FollowUpCountBadge({ scope, id, count, style }: { scope: FollowUpScope; id: string; count: number; style?: CSSProperties }) {
  const [items, setItems] = useState<FollowUpListItem[] | null>(null);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const res = await fetch(`/api/followup-research?mode=list&scope=${scope}&id=${encodeURIComponent(id)}`);
      const json = (await res.json().catch(() => ({}))) as { items?: FollowUpListItem[]; error?: string };
      if (!res.ok || !json.items) throw new Error(json.error || `一覧を取得できませんでした（${res.status}）`);
      setItems(json.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  // R-119: 描画関数が参照する値はフックより前に宣言する
  const popover = useHoverPopover<{ id: string }>(
    () => (
      <div data-followup-popover={id} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, minWidth: 220 }}>
        <div style={{ fontWeight: 700, color: '#0E7490' }}>🔭 この資料を元にした追加リサーチ</div>
        {error && <div style={{ color: '#B91C1C' }}>⚠️ {error}</div>}
        {!items && !error && <div style={{ color: 'var(--text-muted)' }}>取得中…</div>}
        {items?.length === 0 && <div style={{ color: 'var(--text-muted)' }}>（まだありません）</div>}
        {items?.map((it) => (
          <a
            key={it.id}
            data-followup-popover-item={it.id}
            href={MANDALA_SCOPE_META.library.openHref(it.id)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', textDecoration: 'none' }}
          >
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title || '（無題）'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>「{it.prompt}」・{FOLLOWUP_MODE_LABEL[it.mode as FollowUpMode] ?? it.mode}</div>
          </a>
        ))}
      </div>
    ),
    { onOpen: () => { if (!items && !error) void load(); } },
  );
  if (count <= 0) return null;
  const b = popover.bind(`followup:${scope}:${id}`, { id });
  return (
    <>
      <span
        {...b}
        onClick={(e) => { e.stopPropagation(); b.onClick(e); }}
        data-followup-count={count}
        aria-label={`この資料を元にした追加リサーチ ${count}件`}
        style={{ ...style, cursor: 'pointer', color: '#0E7490', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        🔭 追加: {count}
      </span>
      {popover.layer}
    </>
  );
}
