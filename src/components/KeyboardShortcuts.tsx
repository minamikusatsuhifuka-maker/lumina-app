'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  KB_ENABLED_EVENT,
  KB_HELP_EVENT,
  SHORTCUT_SECTIONS,
  isShortcutsEnabled,
  isTypingTarget,
  setShortcutsEnabled,
} from '@/lib/keyboard-shortcuts';

// 204: 全体ショートカット（? ヘルプ・/ 検索フォーカス・Esc 入力離脱）と
// ショートカット一覧モーダル＋設定トグル。dashboard layout に1回だけマウントする。
// - `/` は「いま画面に見えている検索ボックス」（data-kb-search 属性・offsetParent で可視判定）へフォーカス
// - モーダルは createPortal(document.body)（189: .page-enter の transform 対策で fixed 系は portal 必須）
// - 設定OFFのときは ? も / も発火しない（ヘルプはヘッダーの⌨ボタンから開ける＝復帰導線）

export default function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEnabled(isShortcutsEnabled());
    const onEnabledChange = (e: Event) => {
      const on = (e as CustomEvent).detail?.enabled;
      if (typeof on === 'boolean') setEnabled(on);
    };
    const onHelpOpen = () => setHelpOpen(true);
    window.addEventListener(KB_ENABLED_EVENT, onEnabledChange);
    window.addEventListener(KB_HELP_EVENT, onHelpOpen);
    return () => {
      window.removeEventListener(KB_ENABLED_EVENT, onEnabledChange);
      window.removeEventListener(KB_HELP_EVENT, onHelpOpen);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ヘルプモーダル自体の Esc クローズ（自前モーダルの後始末なので設定に関わらず有効）
      if (e.key === 'Escape' && helpOpen) {
        setHelpOpen(false);
        return;
      }
      if (!isShortcutsEnabled()) return;

      // Esc: 入力中なら入力から抜ける（blurのみ・値は消さない）
      if (e.key === 'Escape') {
        const t = e.target;
        if (
          t instanceof HTMLElement &&
          (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
        ) {
          t.blur();
        }
        return;
      }

      // 以降は単独キー: 入力中・IME変換中・修飾キー付きは発火させない（誤爆防止）
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;

      // ?: ショートカット一覧（Shift+/ でも key は '?' になる）
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      // /: 画面に見えている検索ボックスへフォーカス
      // （全画面リーダー等のモーダル表示中＝bodyスクロールロック中は背面に効かせない）
      if (e.key === '/') {
        if (document.body.style.overflow === 'hidden') return;
        const boxes = document.querySelectorAll<HTMLInputElement>('[data-kb-search]');
        for (const box of boxes) {
          // display:none のタブ内（offsetParent null）はスキップして可視のものへ
          if (box.offsetParent !== null) {
            e.preventDefault();
            box.focus();
            box.select();
            return;
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  // ヘルプ表示中は背面スクロールをロック（FullscreenReaderと同方式。
  // NoteBundleDock 側は overflow:hidden を「他モーダル表示中」の判定に使うため、ここでも揃える）
  useEffect(() => {
    if (!helpOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [helpOpen]);

  if (!mounted || !helpOpen) return null;

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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => setHelpOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10500,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 22,
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 17, color: 'var(--text-primary)', flex: 1 }}>
            ⌨ キーボードショートカット
          </h2>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            title="閉じる（Esc）"
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* 設定トグル（localStorage・既定ON。OFFでもEscの既存挙動は残る） */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            margin: '10px 0 6px',
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            fontSize: 13,
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
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
            （OFFでも Esc で閉じる操作は使えます）
          </span>
        </label>

        {SHORTCUT_SECTIONS.map((sec) => (
          <div key={sec.title} style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-muted)',
                marginBottom: 6,
              }}
            >
              {sec.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {sec.items.map((it) => (
                <div
                  key={it.desc}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}
                >
                  <span style={{ display: 'inline-flex', gap: 4, minWidth: 96 }}>
                    {it.keys.map(keyChip)}
                  </span>
                  <span style={{ color: 'var(--text-primary)' }}>{it.desc}</span>
                  {it.note && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{it.note}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ヘッダーに置く⌨ボタン（設定OFF時でもヘルプ＝設定トグルへ到達できる復帰導線）
export function ShortcutHelpButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(KB_HELP_EVENT))}
      title="キーボードショートカット一覧（?キーでも開けます）"
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
