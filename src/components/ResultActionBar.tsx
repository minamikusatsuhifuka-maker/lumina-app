'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 321: 結果画面の操作行の共通部品（まず 🔭DR 結果。🗂分析の成果物・⚖比較の列などは候補）
//
// - 1段目＝主操作（primary＝塗りつぶし1つだけ）＋ main（枠線）＋右端 aside（文字サイズ等）。flex-wrap で折り返す（縦書きにしない）
// - 2段目＝メニュー（⬇ ダウンロード ▾／➡ 送る ▾）＋ extra（🧠 記憶する等）
// - 中の要素は**呼び出し側の既存要素をそのまま置く**（ハンドラ・data 属性・活性条件は不変＝既存 E2E のロケータを壊さない）。
//   高さ・角丸・色の統一は globals.css の [data-result-action-bar] が担う（機能ごとの多色は使わない・主操作だけ indigo）
// - メニューは最小実装（HoverPopover は「ホバーで出す」前提なので使わない）: クリックで開閉・Esc・外側クリックで閉じる・
//   トリガーは button なのでキーボード（Enter/Space）で開閉できる。中の要素を押したら閉じる（ただし [data-context-modal] の中は閉じない）
// - 縦書きの根本＝flex の縮小で1文字ずつ折れる事象。globals.css の `button { white-space: nowrap }` で「ボタンは常に横書き」を規約にした
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface ResultActionMenu {
  key: string;
  /** トリガーのラベル（12字以内・R-57。「▾」は部品が足す） */
  label: string;
  title?: string;
  /** 中に置く既存の要素（ボタン・リンク） */
  items: ReactNode;
}

export function ResultActionMenuButton({ menu }: { menu: ResultActionMenu }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && rootRef.current && !rootRef.current.contains(t)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);
  return (
    <div ref={rootRef} data-result-menu={menu.key} data-result-menu-open={open ? '1' : '0'} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        data-result-menu-trigger={menu.key}
        aria-haspopup="menu"
        aria-expanded={open}
        title={menu.title}
        onClick={() => setOpen((v) => !v)}
      >
        {menu.label} ▾
      </button>
      {open && (
        <div
          role="menu"
          data-result-menu-panel={menu.key}
          onClick={(e) => {
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (t.closest('[data-context-modal]')) return; // 中でさらに開く操作（🧠 AI参照素材の保存パネル）は閉じない
            if (t.closest('button, a')) setOpen(false);
          }}
          style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 60, minWidth: 220, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
        >
          {menu.items}
        </div>
      )}
    </div>
  );
}

export default function ResultActionBar({
  attrs,
  primary,
  main,
  aside,
  menus,
  extra,
}: {
  attrs?: Record<string, string>;
  /** 主操作（塗りつぶし1つ）。SaveToLibraryButton 等 */
  primary?: ReactNode;
  /** 1段目の枠線ボタン */
  main?: ReactNode;
  /** 1段目の右端（文字サイズ等） */
  aside?: ReactNode;
  /** 2段目のメニュー */
  menus?: ResultActionMenu[];
  /** 2段目のメニュー以外（🧠 記憶する等） */
  extra?: ReactNode;
}) {
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 };
  return (
    <div data-result-action-bar {...attrs} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, minWidth: 0 }}>
      <div data-result-action-row="1" style={row}>
        {primary && <span data-result-action-primary style={{ display: 'inline-flex' }}>{primary}</span>}
        {main}
        {aside && <span data-result-action-aside style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{aside}</span>}
      </div>
      {((menus && menus.length > 0) || extra) && (
        <div data-result-action-row="2" style={row}>
          {menus?.map((m) => <ResultActionMenuButton key={m.key} menu={m} />)}
          {extra}
        </div>
      )}
    </div>
  );
}
