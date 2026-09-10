'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 320 §3-1/3-2: 生成結果から直接「🖼 図解・画像を作る」（🔭DR結果・🗂分析の成果物・⚖比較の完了列）
//
// - 押すと種類を選ぶ小ダイアログ（画像／表／フロー／比較／手順／概念図／関連図／相関図／時系列／数字／1枚サマリー・複数可）。
//   既定は関連図・表・画像。各行に一言と目安（画像は費用・他はコード描画で無料）
// - 「進む」で 315 の画面を新しいタブで開く（`?types=`＋`?autoplan=1`）。保存済みなら `?scope=&id=`、未保存なら一回限りキー（R-121）。
//   **ここでは AI も描画も走らない**（315 側の STEP1 が自動で1回・STEP2/3 は院長の操作）。「やめる」「Esc」で何も起きない
// - 326: 器は共通の ModalSheet（不透明パネル --bg-modal・狭幅は全画面シート・背面スクロールロック・portal）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import ModalSheet from '@/components/ModalSheet';
import { estimateImageCost, formatUsd } from '@/lib/model-pricing';
import { writeOneTimeHandoff } from '@/lib/one-time-handoff';
import {
  VISUALS_HANDOFF_KEY,
  VISUAL_QUICK_DEFAULT_TYPES,
  VISUAL_TYPE_META,
  VISUAL_TYPE_GROUPS,
  VISUAL_TYPE_PICKER_NOTE,
  type VisualHandoffFrom,
  type VisualType,
  type VisualsHandoff,
  normalizeVisualTypes,
  visualsHrefFor,
} from '@/lib/visuals';

const btnBase: CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' };
/** 画像の目安（中品質・横・プロンプト 200 字の想定）。上限ではない */
const IMAGE_ESTIMATE = estimateImageCost('medium', 'landscape', 200);

export function VisualTypePickerDialog({
  text,
  title,
  saved,
  from,
  onClose,
}: {
  text: string;
  title: string;
  /** 保存済みの行（scope・id）。null＝未保存（本文を一回限りキーで渡す） */
  saved: { scope: string; id: string } | null;
  from: VisualHandoffFrom;
  onClose: () => void;
}) {
  const [types, setTypes] = useState<VisualType[]>([...VISUAL_QUICK_DEFAULT_TYPES]);
  const [error, setError] = useState('');
  const startedRef = useRef(false); // R-87
  const chars = text.trim().length;
  const tooShort = chars < 20;
  const canGo = types.length > 0 && !tooShort;
  const reason = tooShort ? '本文が短すぎます（20字以上）' : types.length === 0 ? '種類を1つ以上選んでください' : null;
  const toggle = (t: VisualType, on: boolean) => setTypes((prev) => normalizeVisualTypes(on ? [...prev, t] : prev.filter((x) => x !== t)));
  const go = () => {
    if (startedRef.current || !canGo) return; // R-87
    startedRef.current = true;
    if (!saved) {
      const handoff: VisualsHandoff = { title, text: text.trim(), from, at: new Date().toISOString() };
      if (!writeOneTimeHandoff(VISUALS_HANDOFF_KEY, handoff)) {
        startedRef.current = false;
        setError('ブラウザの保存領域に書けませんでした（プライベートモード等）。通常のタブで開き直してください');
        return;
      }
    }
    window.open(visualsHrefFor({ saved, types }), '_blank', 'noopener');
    onClose();
  };

  return (
    <ModalSheet
      title="🖼 図解・画像を作る"
      ariaLabel="図解・画像の種類を選ぶ"
      onClose={onClose}
      backdropAttrs={{ 'data-vis-picker-dialog': '' }}
      closeAttrs={{ 'data-vis-picker-close': '' }}
      footer={
        <>
          <span data-vis-picker-reason style={{ fontSize: 11, color: canGo ? 'var(--text-muted)' : '#B45309', flex: 1, minWidth: 0 }}>
            {reason ?? `${types.length}種類のプランを提案します`}
            <span data-vis-picker-selected={types.length} style={{ display: 'block', color: 'var(--text-muted)' }}>
              選択 {types.length} 件{types.includes('image') ? ` ／ 画像 1 枚・約 ${formatUsd(IMAGE_ESTIMATE.usd)}` : ' ／ 画像なし（コード描画は無料）'}
            </span>
          </span>
          <button type="button" data-vis-picker-cancel onClick={onClose} style={btnBase}>やめる</button>
          <button type="button" data-vis-picker-go onClick={go} disabled={!canGo} title={reason ?? undefined} style={{ ...btnBase, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, opacity: canGo ? 1 : 0.5, cursor: canGo ? 'pointer' : 'not-allowed' }}>
            進む
          </button>
        </>
      }
    >
      <div data-vis-picker-source={saved ? `${saved.scope}:${saved.id}` : 'unsaved'} data-vis-picker-chars={chars} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        元テキスト: <strong>{title || '（無題）'}</strong>（{chars.toLocaleString()}字・{saved ? '保存済みの行を渡します' : '未保存＝本文をそのまま渡します'}）
      </div>
      {/* 328: まとまりごとの小見出し＋多列グリッド（狭幅は1列）。カードは高さを揃え、説明は2行まで */}
      {VISUAL_TYPE_GROUPS.map((group) => (
        <div key={group.label} data-vis-picker-group={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{group.label}</div>
          <div data-vis-picker-grid>
            {group.types.map((t) => {
              const meta = VISUAL_TYPE_META[t];
              const checked = types.includes(t);
              return (
                <label key={t} data-vis-picker-type={t} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', padding: '8px 10px', minHeight: 44, borderRadius: 8, border: `1px solid ${checked ? 'var(--border-accent)' : 'var(--border)'}`, cursor: 'pointer' }}>
                  <input type="checkbox" data-vis-picker-check={t} checked={checked} onChange={(e) => toggle(t, e.target.checked)} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700 }}>{meta.emoji} {meta.label}</span>
                    <span data-vis-picker-note-text style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>{VISUAL_TYPE_PICKER_NOTE[t]}</span>
                    <span data-vis-picker-note={t} style={{ display: 'block', fontSize: 11, color: t === 'image' ? '#B45309' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {t === 'image' ? `1枚 ${formatUsd(IMAGE_ESTIMATE.usd)}（目安）` : 'コード描画・無料'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        進むと🖼図解生成の画面が新しいタブで開き、選んだ種類のプラン（候補）だけを自動で1回提案します。赤い印の確認と描画・画像生成はその画面で行います（自動では描きません）。
      </div>
      {error && <div data-vis-picker-error style={{ fontSize: 12, color: '#B91C1C' }}>⚠️ {error}</div>}
    </ModalSheet>
  );
}

/** 結果画面に置く入口ボタン（押すと種類ダイアログ） */
export function VisualQuickButton({
  text,
  title,
  saved,
  from,
  dataKey,
  label = '🖼 図解・画像を作る',
  style,
  disabled = false,
  fixedTypes,
}: {
  text: string;
  title: string;
  saved: { scope: string; id: string } | null;
  from: VisualHandoffFrom;
  dataKey: string;
  label?: ReactNode;
  style?: CSSProperties;
  disabled?: boolean;
  /** 324: 種類を固定して直接開く（例: 9マスシート＝['grid9']）。ダイアログは出さない */
  fixedTypes?: readonly VisualType[];
}) {
  const [open, setOpen] = useState(false);
  const off = disabled || text.trim().length < 20;
  const startedRef = useRef(false);
  const goFixed = () => {
    if (!fixedTypes || startedRef.current) return;
    startedRef.current = true;
    if (!saved) {
      const handoff: VisualsHandoff = { title, text: text.trim(), from, at: new Date().toISOString() };
      if (!writeOneTimeHandoff(VISUALS_HANDOFF_KEY, handoff)) { startedRef.current = false; return; }
    }
    window.open(visualsHrefFor({ saved, types: fixedTypes }), '_blank', 'noopener');
    setTimeout(() => { startedRef.current = false; }, 800);
  };
  return (
    <>
      <button
        type="button"
        data-vis-quick-open={dataKey}
        data-vis-quick-saved={saved ? `${saved.scope}:${saved.id}` : 'unsaved'}
        data-vis-quick-fixed={fixedTypes ? fixedTypes.join(',') : undefined}
        onClick={(e) => { e.stopPropagation(); if (off) return; if (fixedTypes) goFixed(); else setOpen(true); }}
        disabled={off}
        title={off ? '本文が表示されると使えます（20字以上）' : fixedTypes ? `この結果から${fixedTypes.map((t) => VISUAL_TYPE_META[t].label).join('・')}の候補を提案します（新しいタブ・自動では描きません）` : 'この結果から図解（表・フロー・関連図・相関図など）やイメージ画像を作る（種類を選んで新しいタブ・自動では描きません）'}
        style={{ ...style, ...(off ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
      >
        {label}
      </button>
      {open && <VisualTypePickerDialog text={text} title={title} saved={saved} from={from} onClose={() => setOpen(false)} />}
    </>
  );
}
