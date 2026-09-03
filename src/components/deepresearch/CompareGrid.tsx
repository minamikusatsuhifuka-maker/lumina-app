'use client';

// 290: 横並び比較の共通部品。271（同期スクロール・sticky列ヘッダー）・289（高さプリセット）を
// BatchCompareView から切り出し、モデル比較（ModelCompareView）と**同じ部品**を使う（新規に組まない・R-91）。
// data-compare-* の目印は 271〜289 のE2E（C69/C86/C91）がそのまま使うため、名前も構造も変えない。
// 判断（列数・高さの値・同期位置）は lib/batch-compare.ts の純関数に置き、ここは描画と入出力だけ。

import { useRef, type CSSProperties, type ReactNode } from 'react';
import {
  COMPARE_COLUMN_CHOICES,
  COMPARE_HEIGHT_LABEL,
  COMPARE_HEIGHT_PRESETS,
  COMPARE_HEIGHT_VH,
  type CompareColumnChoice,
  type CompareHeightPreset,
  scrollRatioOf,
  syncScrollTop,
} from '@/lib/batch-compare';

export const COMPARE_ACCENT = '#6c63ff';

export const compareCompactBtnStyle: CSSProperties = {
  padding: '4px 8px',
  borderRadius: 5,
  fontSize: 11,
  fontWeight: 600,
  border: '1px solid var(--border)',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

/**
 * 271 §3-1: 割合ベースの同期スクロール。列の ref を集め、1列のスクロールを他列へ配る。
 * 同期で動かした側の scroll イベントが跳ね返って無限に往復するのを requestAnimationFrame で防ぐ。
 */
export function useSyncedScroll(enabled: boolean) {
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const syncingRef = useRef(false);

  const setColRef = (idx: number) => (el: HTMLDivElement | null) => {
    colRefs.current[idx] = el;
  };

  const handleScroll = (idx: number) => {
    if (!enabled || syncingRef.current) return;
    const src = colRefs.current[idx];
    if (!src) return;
    const ratio = scrollRatioOf(src.scrollTop, src.scrollHeight, src.clientHeight);
    syncingRef.current = true;
    colRefs.current.forEach((el, i) => {
      if (!el || i === idx) return;
      el.scrollTop = syncScrollTop(ratio, el.scrollHeight, el.clientHeight);
    });
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  return { setColRef, handleScroll };
}

/** 289 §4: カード高さのプリセット（低＝2列×2行で4枚が1画面に収まる／高＝従来68vh） */
export function CompareHeightPicker({
  value,
  onChange,
}: {
  value: CompareHeightPreset;
  onChange: (h: CompareHeightPreset) => void;
}) {
  return (
    <span data-compare-height-picker style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title="カードの高さ（低＝2列×2行で4枚が1画面に収まる目安）">
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>高さ</span>
      {COMPARE_HEIGHT_PRESETS.map((h) => (
        <button
          key={h}
          type="button"
          data-compare-height-choice={h}
          aria-pressed={value === h}
          onClick={() => onChange(h)}
          title={`${COMPARE_HEIGHT_LABEL[h]}（${COMPARE_HEIGHT_VH[h]}vh）`}
          style={{ ...compareCompactBtnStyle, padding: '4px 8px', borderColor: value === h ? COMPARE_ACCENT : 'var(--border)', background: value === h ? `${COMPARE_ACCENT}15` : 'var(--bg-primary)', fontWeight: value === h ? 700 : 600 }}
        >
          {COMPARE_HEIGHT_LABEL[h]}
        </button>
      ))}
    </span>
  );
}

/**
 * 289 §3-1: 列数の手動指定（自動／1〜4）。291で BatchCompareView から切り出し、リサーチ保存の比較と共用。
 * data-compare-cols-picker / data-compare-cols-choice の目印は C91 がそのまま使うため変えない。
 * タッチ端末では呼び出し側が出さない（1列固定）。狭い画面でも制限・警告はかけない。
 */
export function CompareColumnsPicker({
  value,
  onChange,
}: {
  value: CompareColumnChoice;
  onChange: (c: CompareColumnChoice) => void;
}) {
  return (
    <span data-compare-cols-picker style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title="横に並べる列数（自動＝画面幅で決める）">
      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>列</span>
      {COMPARE_COLUMN_CHOICES.map((c) => (
        <button
          key={String(c)}
          type="button"
          data-compare-cols-choice={String(c)}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          style={{ ...compareCompactBtnStyle, padding: '4px 8px', borderColor: value === c ? COMPARE_ACCENT : 'var(--border)', background: value === c ? `${COMPARE_ACCENT}15` : 'var(--bg-primary)', fontWeight: value === c ? 700 : 600 }}
        >
          {c === 'auto' ? '自動' : c}
        </button>
      ))}
    </span>
  );
}

/** 271 §3-1: 同期スクロールのトグル（既定ON・OFFにできる） */
export function CompareSyncToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
      <input type="checkbox" data-compare-sync checked={checked} onChange={(e) => onChange(e.target.checked)} />
      同期スクロール
    </label>
  );
}

/**
 * 1列の外枠。§4-3: 長文比較なので画面高さをできるだけ使う（高さは 289 のプリセット・既定 high＝68vh）。
 * §3-2: 列ヘッダーは sticky 固定。5,000字をスクロールしてもどの列か分かるようにする。
 * ルート zoom（文字サイズ4段階）は vh 指定の要素も拡大するため、低プリセットの2×2は
 * 100%以外の倍率では1画面に収まらないことがある（289 §4-3・報告済み）。
 */
export function CompareColumnShell({
  index,
  heightPreset,
  colRef,
  onScroll,
  header,
  children,
  extraAttrs,
}: {
  index: number;
  heightPreset: CompareHeightPreset;
  colRef: (el: HTMLDivElement | null) => void;
  onScroll: () => void;
  header: ReactNode;
  children: ReactNode;
  /** 呼び出し側の目印（data-compare-model 等）。data-compare-col/header は本部品が付ける */
  extraAttrs?: Record<string, string | number | undefined>;
}) {
  return (
    <div
      data-compare-col={index}
      {...extraAttrs}
      ref={colRef}
      onScroll={onScroll}
      style={{
        maxHeight: `${COMPARE_HEIGHT_VH[heightPreset]}vh`,
        overflowY: 'auto',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        minWidth: 0,
      }}
    >
      <div
        data-compare-header={index}
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          padding: '10px 12px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {header}
      </div>
      {children}
    </div>
  );
}
