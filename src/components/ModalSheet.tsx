'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 326 §2: ダイアログの共通の器（暗幕＋パネル）。院長の実測（iPhone・ダーク）で
//   「種類ダイアログの背景が透けて後ろの文字と重なる」＝パネルが --bg-card（ダークで alpha 0.03）だったため。
//
// - パネルの背景は **不透明**（--bg-modal・ライト／ダークの全テーマで定義）。親に opacity を掛けない
// - 暗幕とパネルは別要素。暗幕は半透明＋blur、パネルは不透明
// - 狭幅（640px 未満）は全画面シート: 上部にタイトルと ✕・中身は縦スクロール・下部に主ボタン（固定）・セーフエリア
// - createPortal で body 直下（親の overflow・transform の影響を受けない・R-117 の mounted ゲート）
// - 開いている間は背面をスクロールさせない（閉じたら元に戻す）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// 開いているモーダルの数。重なっても最後の1つが閉じたときだけ元に戻す（prev の取り違えを避ける）
let scrollLockCount = 0;
let scrollLockPrev = '';

/** 背面のスクロールを止める（開いている間だけ・閉じたら元に戻す）。他のダイアログからも使う */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    if (scrollLockCount === 0) scrollLockPrev = document.body.style.overflow;
    scrollLockCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) document.body.style.overflow = scrollLockPrev;
    };
  }, [active]);
}

export default function ModalSheet({
  title,
  onClose,
  backdropAttrs,
  panelAttrs,
  closeAttrs,
  footer,
  children,
  maxWidth = 620,
  ariaLabel,
}: {
  title: ReactNode;
  onClose: () => void;
  /** 暗幕に付ける属性（既存 E2E のロケータをそのまま載せ替える用） */
  backdropAttrs?: Record<string, string>;
  panelAttrs?: Record<string, string>;
  closeAttrs?: Record<string, string>;
  /** 下部に固定する行（主ボタン等） */
  footer?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  ariaLabel?: string;
}) {
  const [mounted, setMounted] = useState(false); // R-117
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setMounted(true), []);
  // 開いたらパネルへフォーカスを移す（Esc がどの端末でも効く・読み上げの起点になる）
  useEffect(() => { if (mounted) panelRef.current?.focus(); }, [mounted]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useBodyScrollLock(mounted);
  if (!mounted) return null;
  const panel: CSSProperties = { ['--modal-max' as string]: `${maxWidth}px` };
  return createPortal(
    <div
      data-modal-backdrop
      {...backdropAttrs}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={panelRef} data-modal-panel {...panelAttrs} tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} style={{ ...panel, outline: 'none' }}>
        <div data-modal-head>
          <div data-modal-title>{title}</div>
          <button type="button" data-modal-close {...closeAttrs} onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        <div data-modal-body>{children}</div>
        {footer && <div data-modal-foot>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
