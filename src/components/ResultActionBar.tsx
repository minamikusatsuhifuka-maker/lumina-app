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
// - 326是正: 狭幅（**画面幅** 640px 未満）は**アコーディオン**。常に見えるのは [主操作][keepVisible][⋯ 操作 ▾] の3つで、
//   残りは展開部へ縦1列（44px 以上）。展開部は**閉じている間も DOM に置き `hidden`**（ハンドラ・data 属性・活性条件を保つ＝R-88）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { STICKY_BAR_NARROW_MAX_WIDTH } from '@/lib/sticky-action-bar';

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
  // 狭幅（iPhone）: トリガーが右寄りだとパネルが画面の右へはみ出すので、測って右揃えに切り替える（横スクロールを作らない・R-64）
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setAlignRight(false);
      return;
    }
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 4) setAlignRight(true);
  }, [open]);
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
          ref={panelRef}
          role="menu"
          data-result-menu-panel={menu.key}
          data-result-menu-align={alignRight ? 'right' : 'left'}
          onClick={(e) => {
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (t.closest('[data-context-modal]')) return; // 中でさらに開く操作（🧠 AI参照素材の保存パネル）は閉じない
            if (t.closest('button, a')) setOpen(false);
          }}
          style={{ position: 'absolute', top: 'calc(100% + 4px)', ...(alignRight ? { right: 0 } : { left: 0 }), zIndex: 60, minWidth: 220, maxWidth: 'calc(100vw - 16px)', overflowX: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: 6, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}
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
  keepVisible,
  main,
  aside,
  asideLabel = '表示の高さ',
  menus,
  extra,
}: {
  attrs?: Record<string, string>;
  /** 主操作（塗りつぶし1つ）。SaveToLibraryButton 等 */
  primary?: ReactNode;
  /** 326: 狭幅でも1段目に残す枠線ボタン（🖼 図解・画像を作る） */
  keepVisible?: ReactNode;
  /** 1段目の枠線ボタン */
  main?: ReactNode;
  /** 1段目の右端（文字サイズ等） */
  aside?: ReactNode;
  /** 326: 狭幅の展開部で aside に付ける見出し（高さプリセット等） */
  asideLabel?: string;
  /** 2段目のメニュー */
  menus?: ResultActionMenu[];
  /** 2段目のメニュー以外（🧠 記憶する等） */
  extra?: ReactNode;
}) {
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 };
  // 326是正: 狭幅は**画面幅**で判定する（しきい値は 313 と同じ 640px）。開閉は成果物ごと・記憶しない（既定は閉じる）。
  //   アコーディオンは iPhone で操作行が4段になる問題への対処。PC で成果物が複数枚並んで1枚が細いだけなら畳まない
  //   （81マスのブロック表示のように「要素が実際に狭くなる」判定は容器幅のまま＝313・322 は不変）
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(max-width: ${STICKY_BAR_NARROW_MAX_WIDTH - 0.02}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  useEffect(() => {
    if (!narrow) setOpen(false);
  }, [narrow]);
  const hasMore = !!main || !!aside || (menus && menus.length > 0) || !!extra;
  const rest = (
    <>
      {main}
      {aside && (
        <span data-result-more-group>
          {narrow && <span data-result-more-label>{asideLabel}</span>}
          <span data-result-action-aside style={narrow ? { display: 'inline-flex', alignItems: 'center', gap: 6 } : { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{aside}</span>
        </span>
      )}
      {menus?.map((m) => <ResultActionMenuButton key={m.key} menu={m} />)}
      {extra}
    </>
  );
  return (
    <div ref={rootRef} data-result-action-bar {...attrs} data-result-narrow={narrow ? '1' : '0'} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, minWidth: 0 }}>
      {narrow ? (
        <>
          <div data-result-action-row="1" style={row}>
            {primary && <span data-result-action-primary style={{ display: 'inline-flex' }}>{primary}</span>}
            {keepVisible}
            {hasMore && (
              <button type="button" data-result-more aria-expanded={open} onClick={() => setOpen((v) => !v)} title="残りの操作を開きます">
                ⋯ 操作 {open ? '▴' : '▾'}
              </button>
            )}
          </div>
          {/* 閉じている間も DOM に置く（同じ要素・同じハンドラ＝E2E のロケータが1つのまま） */}
          <div data-result-more-panel hidden={!open}>{rest}</div>
        </>
      ) : (
        <>
          <div data-result-action-row="1" style={row}>
            {primary && <span data-result-action-primary style={{ display: 'inline-flex' }}>{primary}</span>}
            {keepVisible}
            {main}
            {aside && <span data-result-action-aside style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{aside}</span>}
          </div>
          {((menus && menus.length > 0) || extra) && (
            <div data-result-action-row="2" style={row}>
              {menus?.map((m) => <ResultActionMenuButton key={m.key} menu={m} />)}
              {extra}
            </div>
          )}
        </>
      )}
    </div>
  );
}
