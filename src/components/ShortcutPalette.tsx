'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  KB_ENABLED_EVENT,
  KB_HELP_EVENT,
  SHORTCUT_SECTIONS,
  type ShortcutScope,
  isShortcutsEnabled,
  isTypingTarget,
  setShortcutsEnabled,
} from '@/lib/shortcuts';

// 204改訂v2: ショートカット一覧の「小窓」（移動・リサイズ可能なフローティングパレット）＋
// 全体ショートカット（? 小窓トグル・/ 検索フォーカス・Esc 入力離脱）。dashboard layout に1回マウント。
// - 非モーダル: 背景オーバーレイなし・スクロールロックなし＝作業しながら参照できる
// - 移動: ヘッダー部を Pointer Events（setPointerCapture）でドラッグ（タッチ対応）
// - リサイズ: 右下ハンドル。最小 280×200 / 最大 viewport の 90%
// - クランプ: 移動・リサイズ・window.resize 時とも viewport 内に制限
// - 位置・サイズは localStorage（xlumina:shortcut-palette）に保存・復元（viewport外なら既定へ）
// - モバイル（<640px）はドラッグ・リサイズ無効の下部固定ボトムシートにフォールバック
// - 設定OFFでも小窓は開ける（「OFFだから一覧も見られない」にしない）。?キーだけは設定に従う
// - createPortal(document.body)（189: .page-enter の transform 対策で fixed 系は portal 必須）

const STORAGE_KEY = 'xlumina:shortcut-palette';
const MIN_W = 280;
const MIN_H = 200;
const DEFAULT_W = 360;
const DEFAULT_H = 440;
const MOBILE_BREAKPOINT = 640;

// z-index の根拠: 追従Dockのピル(900)より上・Dockの確認モーダル(1000)や
// AIアシスタント(9999)・全画面リーダー(10000)より下 ＝「通常UIより上・モーダルより下」
const PALETTE_Z = 950;

type Box = { x: number; y: number; w: number; h: number };

function clampBox(b: Box): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(b.w, MIN_W), Math.floor(vw * 0.9));
  const h = Math.min(Math.max(b.h, MIN_H), Math.floor(vh * 0.9));
  const x = Math.min(Math.max(b.x, 0), Math.max(0, vw - w));
  const y = Math.min(Math.max(b.y, 0), Math.max(0, vh - h));
  return { x, y, w, h };
}

function defaultBox(): Box {
  // 初期位置は右上寄り（右下のフローティング3つ＝📖/📝/💬と重ならない）
  const w = DEFAULT_W;
  const h = Math.min(DEFAULT_H, Math.floor(window.innerHeight * 0.8));
  return clampBox({ x: window.innerWidth - w - 24, y: 72, w, h });
}

export default function ShortcutPalette() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  // 現在の画面で有効なスコープ（無効セクションは淡色表示）
  const [scopes, setScopes] = useState<{ reader: boolean; list: boolean }>({
    reader: false,
    list: true,
  });
  const dragRef = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; orig: Box } | null>(null);
  const boxRef = useRef<Box | null>(null);
  boxRef.current = box;

  // 初期化: 保存済みの位置・サイズを復元（viewport外・不正値は既定へ）
  useEffect(() => {
    setMounted(true);
    setEnabled(isShortcutsEnabled());
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if ([p?.x, p?.y, p?.w, p?.h].every((n) => typeof n === 'number' && Number.isFinite(n))) {
          const c = clampBox(p);
          // クランプで大きく動いた（=viewport外だった）場合は既定位置へ
          setBox(Math.abs(c.x - p.x) > 40 || Math.abs(c.y - p.y) > 40 ? defaultBox() : c);
          return;
        }
      }
    } catch {
      // 破損時は既定へ
    }
    setBox(null); // 初回オープン時に defaultBox() を計算
  }, []);

  const persist = (b: Box) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
    } catch {}
  };

  // 開閉トグル（⌨ボタン=KB_HELP_EVENT・?キー・×・Esc）
  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onEnabledChange = (e: Event) => {
      const on = (e as CustomEvent).detail?.enabled;
      if (typeof on === 'boolean') setEnabled(on);
    };
    window.addEventListener(KB_HELP_EVENT, onToggle);
    window.addEventListener(KB_ENABLED_EVENT, onEnabledChange);
    return () => {
      window.removeEventListener(KB_HELP_EVENT, onToggle);
      window.removeEventListener(KB_ENABLED_EVENT, onEnabledChange);
    };
  }, []);

  // 全体キー: Esc（入力離脱→小窓クローズ）・?（小窓トグル）・/（検索フォーカス）。
  // Esc の優先順位: 入力中=blur ＞ モーダル表示中=そちらに譲る ＞ 小窓を閉じる（capture+stopPropagationで
  // NoteBundleDock の「選択モード解除」等の後段リスナーに波及させない）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const t = e.target;
        if (
          t instanceof HTMLElement &&
          (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
        ) {
          if (isShortcutsEnabled()) t.blur(); // Esc入力離脱は新設ショートカット＝設定に従う
          return;
        }
        if (open && document.body.style.overflow !== 'hidden') {
          e.stopPropagation();
          setOpen(false);
        }
        return;
      }
      if (!isShortcutsEnabled()) return;
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;

      // ?: 小窓のトグル（Shift+/ でも key は '?' になる）
      if (e.key === '?') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // /: 画面に見えている検索ボックスへフォーカス
      // （全画面リーダー等のモーダル表示中＝bodyスクロールロック中は背面に効かせない）
      if (e.key === '/') {
        if (document.body.style.overflow === 'hidden') return;
        const boxes = document.querySelectorAll<HTMLInputElement>('[data-kb-search]');
        for (const el of boxes) {
          // display:none のタブ内（offsetParent null）はスキップして可視のものへ
          if (el.offsetParent !== null) {
            e.preventDefault();
            el.focus();
            el.select();
            return;
          }
        }
      }
    };
    // capture: Esc クローズを他のwindowリスナー（Dock等）より先に処理するため
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // window.resize: 再クランプ＋モバイル判定の更新
  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
      setBox((b) => (b ? clampBox(b) : b));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 開いている間、現在の画面で有効なスコープを更新（1秒ポーリング＝画面遷移・リーダー開閉に追従）
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const reader = !!document.querySelector('[data-kb-scope="reader"]');
      const list = !reader &&
        [...document.querySelectorAll<HTMLElement>('[data-kb-search]')].some(
          (el) => el.offsetParent !== null,
        );
      setScopes({ reader, list });
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [open]);

  // ドラッグ移動・リサイズ（Pointer Events + setPointerCapture＝タッチ対応。モバイルでは無効）
  const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent<HTMLElement>) => {
    if (isMobile || !boxRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, orig: boxRef.current };
  };
  const onDragMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    setBox(
      clampBox(
        d.mode === 'move'
          ? { ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy }
          : { ...d.orig, w: d.orig.w + dx, h: d.orig.h + dy },
      ),
    );
  };
  const endDrag = () => {
    if (dragRef.current && boxRef.current) persist(boxRef.current);
    dragRef.current = null;
  };

  if (!mounted || !open) return null;

  const b = box ?? defaultBox();

  const keyChip = (k: string) => (
    <kbd
      key={k}
      style={{
        display: 'inline-block',
        minWidth: 22,
        padding: '2px 7px',
        textAlign: 'center',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        fontSize: 12,
        fontFamily: 'inherit',
        fontWeight: 700,
      }}
    >
      {k}
    </kbd>
  );

  const isScopeActive = (scope: ShortcutScope) =>
    scope === 'global' || (scope === 'reader' ? scopes.reader : scopes.list);

  return createPortal(
    <div
      role="region"
      aria-label="キーボードショートカット一覧"
      data-kb-palette
      style={{
        position: 'fixed',
        zIndex: PALETTE_Z,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        boxShadow: '0 16px 44px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        ...(isMobile
          ? {
              // モバイル: 下部固定のボトムシート（ドラッグ・リサイズ無効）
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: '60vh',
              borderRadius: '14px 14px 0 0',
            }
          : {
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              borderRadius: 12,
            }),
      }}
    >
      {/* ヘッダー（ドラッグハンドル） */}
      <div
        onPointerDown={startDrag('move')}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          cursor: isMobile ? 'default' : 'move',
          userSelect: 'none',
          touchAction: 'none',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          ⌨ キーボードショートカット
        </span>
        {!isMobile && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }} aria-hidden>
            ドラッグで移動
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          onPointerDown={(e) => e.stopPropagation()}
          title="閉じる（Esc / ⌨ボタン再押下）"
          style={{
            width: 24,
            height: 24,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 12,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* 中身（小窓内スクロール可＝リサイズで狭くしても全件参照できる） */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 14px' }}>
        {/* 設定トグル: ショートカットの動作のみ制御（OFFでも小窓は見られる・Escは常に有効） */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            margin: '2px 0 4px',
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--text-primary)',
            fontWeight: 600,
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setShortcutsEnabled(e.target.checked);
            }}
            style={{ accentColor: 'var(--accent, #6c63ff)' }}
          />
          キーボードショートカットを有効にする
        </label>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 6px' }}>
          OFFでも Esc で閉じる操作とこの一覧は使えます。一覧は{' '}
          <a href="/dashboard/guide" style={{ color: 'var(--accent, #6c63ff)' }}>
            📖 使い方ガイド
          </a>{' '}
          にも常設。
        </p>

        {SHORTCUT_SECTIONS.map((sec) => {
          const active = isScopeActive(sec.scope);
          return (
            <div key={sec.title} style={{ marginTop: 10, opacity: active ? 1 : 0.45 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  marginBottom: 5,
                }}
              >
                {sec.title}
                {!active && <span style={{ fontWeight: 400 }}>（この画面では無効）</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sec.items.map((it) => (
                  <div
                    key={it.desc}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                  >
                    <span style={{ display: 'inline-flex', gap: 3, minWidth: 88, flexShrink: 0 }}>
                      {it.keys.map(keyChip)}
                    </span>
                    <span style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {it.desc}
                      {it.note && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}> {it.note}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {isMobile && (
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '12px 0 0' }}>
            ※ ショートカットは物理キーボード接続時に利用できます。
          </p>
        )}
      </div>

      {/* 右下リサイズハンドル（モバイルでは非表示） */}
      {!isMobile && (
        <div
          onPointerDown={startDrag('resize')}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="ドラッグでサイズ変更"
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 18,
            height: 18,
            cursor: 'nwse-resize',
            touchAction: 'none',
            background:
              'linear-gradient(135deg, transparent 50%, var(--border) 50%, var(--border) 60%, transparent 60%, transparent 70%, var(--border) 70%, var(--border) 80%, transparent 80%)',
          }}
        />
      )}
    </div>,
    document.body,
  );
}

// ヘッダーに置く⌨ボタン（小窓のトグル。設定OFF時でも一覧＝設定トグルへ到達できる復帰導線）
export function ShortcutHelpButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(KB_HELP_EVENT))}
      title="キーボードショートカット一覧の小窓（?キーでも開閉できます）"
      style={{
        width: 30,
        height: 30,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--text-muted)',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      ⌨
    </button>
  );
}
