'use client';
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 318: 選択バー（n件選択中）の共通部品
// 📚リサーチ保存・🗂テキスト分析の保存一覧・🧠AI参照素材の3画面で同じものを使う（R-91）。
//
// - 一覧の上部（フィルタ行の直下）に sticky で固定。内容に被せない（in-flow なので一覧の先頭行はバーの下に見える）。
//   fixed ではないので幅は主カラムに揃い、サイドバーに被らず zoom 補正（R-80）も要らない
// - 横書き固定。操作は同じ高さ・同じ角丸のボタンを flex-wrap で並べ、入り切らなければ 2〜3 段に折り返す（横スクロール無し）
// - 右端に「🗑 削除」（赤の枠線・塗りつぶさない・確認は呼び出し側の1回＝R-56）と「✕ 選択をやめる」
// - 無効なボタンは薄く＋理由を title に（R-101・InstantTooltip が title を即時表示する）
// - 各操作のハンドラ・活性条件は呼び出し側のものをそのまま渡す（複製しない・R-88）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export type SelectionBarTone = 'default' | 'accent' | 'teal' | 'danger';

export interface SelectionBarAction {
  key: string;
  /** アイコン＋短いラベル（12字以内・R-57） */
  label: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** リンク型（新しいタブ）。onClick より優先 */
  href?: string;
  disabled?: boolean;
  /** 無効時の理由（title に出す・R-101） */
  reason?: string | null;
  /** 有効時の説明（title） */
  title?: string;
  /** 実行中（無効化＋実行中ラベル） */
  busy?: boolean;
  busyLabel?: string;
  tone?: SelectionBarTone;
  /** data-* 等の属性（既存E2Eの目印をそのまま渡す） */
  attrs?: Record<string, string | undefined>;
  /** ボタン以外（select 等）をそのまま置く。高さはバーに揃える */
  node?: ReactNode;
  /** 条件で出さない */
  hidden?: boolean;
}

export interface SelectionBarProps {
  count: number;
  actions: SelectionBarAction[];
  /** 右端の「🗑 削除」 */
  danger?: SelectionBarAction;
  onExit: () => void;
  exitLabel?: string;
  exitAttrs?: Record<string, string | undefined>;
  /** 2段目以降（タイプ別一括選択・カテゴリ移動など）。バーの中に横幅いっぱいで置く */
  children?: ReactNode;
  /** 補足の一文（小さく） */
  note?: string;
  /** sticky の上端（主カラムの scrollport 基準） */
  top?: number;
  attrs?: Record<string, string | undefined>;
}

/** ボタンの高さ（全操作で同じ・E2Eは boundingBox で揃いを見る） */
export const SELECTION_BAR_BUTTON_HEIGHT = 32;
/** 角丸（一覧カードと同じ値） */
export const SELECTION_BAR_RADIUS = 12;
export const SELECTION_BAR_BUTTON_RADIUS = 8;
/** ラベルの上限（R-57・アイコン込み） */
export const SELECTION_BAR_LABEL_MAX = 12;

const TONE: Record<SelectionBarTone, CSSProperties> = {
  default: { background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' },
  accent: { background: '#6c63ff', color: '#fff', border: '1px solid #6c63ff' },
  teal: { background: '#ccfbf1', color: '#115e59', border: '1px solid rgba(13,148,136,0.6)' },
  danger: { background: 'transparent', color: '#dc2626', border: '1px solid #dc2626' },
};

/** 操作ボタンの見た目（同じ高さ・同じ角丸・横書き・折り返さない） */
export function selectionActionStyle(tone: SelectionBarTone = 'default', disabled = false): CSSProperties {
  return {
    ...TONE[tone],
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: SELECTION_BAR_BUTTON_HEIGHT,
    boxSizing: 'border-box',
    padding: '0 12px',
    borderRadius: SELECTION_BAR_BUTTON_RADIUS,
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0,
  };
}

function ActionEl({ a }: { a: SelectionBarAction }) {
  const disabled = Boolean(a.disabled || a.busy);
  const title = disabled ? (a.reason ?? a.title ?? undefined) : (a.title ?? undefined);
  const label = a.busy ? (a.busyLabel ?? '⏳ 実行中...') : a.label;
  const style = selectionActionStyle(a.tone ?? 'default', disabled);
  if (a.node) {
    return (
      <span data-selection-bar-node={a.key} {...a.attrs} style={{ display: 'inline-flex', alignItems: 'center', height: SELECTION_BAR_BUTTON_HEIGHT, flexShrink: 0 }}>
        {a.node}
      </span>
    );
  }
  if (a.href !== undefined) {
    return (
      <a
        data-selection-bar-action={a.key}
        {...a.attrs}
        aria-disabled={disabled ? 'true' : undefined}
        href={disabled ? undefined : a.href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        style={style}
      >
        {label}
      </a>
    );
  }
  return (
    <button type="button" data-selection-bar-action={a.key} {...a.attrs} onClick={a.onClick} disabled={disabled} title={title} style={style}>
      {label}
    </button>
  );
}

export default function SelectionBar({ count, actions, danger, onExit, exitLabel = '✕ 選択をやめる', exitAttrs, children, note, top = 0, attrs }: SelectionBarProps) {
  if (count <= 0) return null;
  return (
    <div
      data-selection-bar
      data-selection-bar-count={count}
      {...attrs}
      style={{
        position: 'sticky',
        top,
        zIndex: 30,
        // 下の一覧が透けないよう不透明な下地の上に薄い帯を重ねる（塗りつぶしの大きな楕円にしない）
        background: 'var(--bg-primary)',
        paddingBottom: 8,
        marginBottom: 8,
        maxHeight: '45vh',
        overflowY: 'auto',
      }}
    >
      <div
        data-selection-bar-band
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: SELECTION_BAR_RADIUS,
          background: 'rgba(108,99,255,0.10)',
          border: '1px solid rgba(108,99,255,0.35)',
          maxWidth: '100%',
          boxSizing: 'border-box',
        }}
      >
        <span data-selection-bar-label style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          ☑ {count}件選択中
        </span>
        {actions.filter((a) => !a.hidden).map((a) => <ActionEl key={a.key} a={a} />)}
        <span data-selection-bar-right style={{ marginLeft: 'auto', display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {danger && !danger.hidden && <ActionEl a={{ ...danger, tone: 'danger' }} />}
          <button type="button" data-selection-bar-exit {...exitAttrs} onClick={onExit} title="選択を解除して操作バーを閉じる" style={selectionActionStyle('default')}>
            {exitLabel}
          </button>
        </span>
        {children && <div data-selection-bar-extra style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>}
        {note && <span data-selection-bar-note style={{ width: '100%', fontSize: 11, color: 'var(--text-muted)' }}>{note}</span>}
      </div>
    </div>
  );
}
