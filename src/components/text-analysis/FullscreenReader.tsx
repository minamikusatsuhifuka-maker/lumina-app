'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderMarkdown } from '@/lib/markdown-renderer';

// 保存テキストの全画面リーダー（テキスト分析／コンテキストライブラリ共通）。
// position:fixed inset:0 のフルスクリーン表示で、本文は renderMarkdown 整形
// （renderMarkdown 内部で sanitizeLatex 済み＝ $\rightarrow$ 等を出さない）。
// z-index は AIアシスタント(9999)より上の 10000。Esc/×/背景クリックで閉じる。

type ReaderFont = 'sm' | 'md' | 'lg';
const FONT_KEY = 'ta_reader_font';
const FONT_SIZE: Record<ReaderFont, number> = { sm: 15, md: 17, lg: 20 };
const FONT_LABEL: Record<ReaderFont, string> = { sm: '小', md: '中', lg: '大' };

export default function FullscreenReader({
  open,
  title,
  content,
  onClose,
}: {
  open: boolean;
  title: string;
  content: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  // 既定の文字サイズは「小」。localStorage に保存値があればそれを尊重（マウント後 effect で上書き）。
  const [font, setFont] = useState<ReaderFont>('sm');

  // SSR では document が無いため、マウント後のみ portal を描画
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(FONT_KEY) as ReaderFont | null;
      if (saved === 'sm' || saved === 'md' || saved === 'lg') setFont(saved);
    } catch {}
  }, []);

  // Esc で閉じる + 背面スクロールロック（開いている間のみ）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const changeFont = (f: ReaderFont) => {
    setFont(f);
    try {
      localStorage.setItem(FONT_KEY, f);
    } catch {}
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ヘッダー（タイトル + 文字サイズ + 閉じる） */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--bg-card, #fff)',
          borderBottom: '1px solid var(--border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={title}
        >
          {title || '無題'}
        </div>
        {/* 文字サイズ調整（小/中/大） */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {(['sm', 'md', 'lg'] as ReaderFont[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => changeFont(f)}
              title={`文字サイズ: ${FONT_LABEL[f]}`}
              style={{
                padding: '4px 9px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid',
                borderColor: font === f ? 'var(--accent)' : 'var(--border)',
                background: font === f ? 'var(--accent)' : 'transparent',
                color: font === f ? '#fff' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {FONT_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {/* 本文（内スクロール・読み物フォント） */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg-primary, #fff)',
          padding: '24px 16px 80px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          className="markdown-body"
          style={{
            maxWidth: 760,
            margin: '0 auto',
            fontSize: FONT_SIZE[font],
            lineHeight: 1.85,
            color: 'var(--text-primary)',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      </div>

      {/* 閉じるボタン（右下固定）。親指で押しやすい位置・大きめ・目立つ配色。
          Esc・背景クリックでも閉じられるが、こちらを主導線にする。 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title="閉じる（Esc）"
        style={{
          position: 'absolute',
          right: 'max(20px, env(safe-area-inset-right))',
          bottom: 'max(20px, env(safe-area-inset-bottom))',
          zIndex: 2,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '13px 22px',
          borderRadius: 999,
          border: 'none',
          background: 'var(--accent, #6c63ff)',
          color: '#fff',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        }}
      >
        ✕ 閉じる
      </button>
    </div>,
    document.body,
  );
}
