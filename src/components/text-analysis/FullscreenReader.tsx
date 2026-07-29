'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { renderMarkdown } from '@/lib/markdown-renderer';
import {
  KEY_HINT,
  isShortcutsEnabled,
  isTypingTarget,
  useShortcutHints,
} from '@/lib/shortcuts';

// 保存テキストの全画面リーダー（テキスト分析／コンテキストライブラリ共通）。
// position:fixed inset:0 のフルスクリーン表示で、本文は renderMarkdown 整形
// （renderMarkdown 内部で sanitizeLatex 済み＝ $\rightarrow$ 等を出さない）。
// z-index は AIアシスタント(9999)より上の 10000。Esc/×/背景クリックで閉じる。
//
// 204: ⌘+←（戻る）で閉じられるよう履歴方式を採用。
// - 開くとき history.pushState で履歴を1枚積む → 戻る操作は popstate 発火＝モーダルだけ閉じる
//   （キーイベントの乗っ取り不要・モバイルの戻るジェスチャーにも対応・ページ遷移は起きない）
// - ✕/Esc/背景クリックで閉じたときは cleanup で history.back() を呼び、積んだ1枚を戻す
//   （開く/閉じるで push/back を1対1に保つ＝整合が崩れてページ離脱する事故を防ぐ）
// - j/k=次・前の資料（onPrev/onNext が渡された場合のみ）・+/-=文字サイズ。
//   ↑↓は本文スクロールに使うため割り当てない。新設キーは設定OFFで無効、Esc(151)は常に有効

type ReaderFont = 'sm' | 'md' | 'lg';
const FONT_KEY = 'ta_reader_font';
const FONT_SIZE: Record<ReaderFont, number> = { sm: 15, md: 17, lg: 20 };
const FONT_LABEL: Record<ReaderFont, string> = { sm: '小', md: '中', lg: '大' };

export default function FullscreenReader({
  open,
  title,
  content,
  onClose,
  actions,
  onPrev,
  onNext,
}: {
  open: boolean;
  title: string;
  content: string;
  onClose: () => void;
  // 191: 呼び出し元のアクションボタン（📋コピー/📄Word等）。省略可＝従来表示のまま。
  // 機能ごとにアクションが違うためハードコードせず ReactNode で受ける
  // （✅コピー済み等のstate連動表示・SaveToLibraryButton のようなコンポーネントも渡せる）。
  actions?: ReactNode;
  // 204: 一覧の前後の資料へ移動（k / j キー・呼び出し元が一覧の文脈を持つ場合のみ渡す）。
  // 省略時はキーを無視（単発表示の呼び出し元では従来どおり）
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  // 既定の文字サイズは「小」。localStorage に保存値があればそれを尊重（マウント後 effect で上書き）。
  const [font, setFont] = useState<ReaderFont>('sm');
  // 204 第1層: キー併記の表示可否（設定OFF・モバイルでは出さない＝嘘の案内をしない）
  const showHints = useShortcutHints();
  // 204 第4層: 初回だけ「Esc / ⌘← で閉じられます」を数秒表示（localStorageで以降は出さない）
  const [firstHint, setFirstHint] = useState(false);

  // SSR では document が無いため、マウント後のみ portal を描画
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(FONT_KEY) as ReaderFont | null;
      if (saved === 'sm' || saved === 'md' || saved === 'lg') setFont(saved);
    } catch {}
  }, []);

  // 204: onClose/onPrev/onNext は ref 経由で参照し、履歴・キーの effect を [open] 依存に保つ
  // （j/k で資料が切り替わっても pushState が重複しない＝push/back の1対1を維持）
  const onCloseRef = useRef(onClose);
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);
  useEffect(() => {
    onCloseRef.current = onClose;
    onPrevRef.current = onPrev;
    onNextRef.current = onNext;
  });

  // 204 第4層: 初回オープン時のみヒントを5秒表示（キー併記と同じ条件＝設定OFF/モバイルでは出さない）
  const HINT_SEEN_KEY = 'kb_reader_hint_seen';
  useEffect(() => {
    if (!open || !showHints) return;
    try {
      if (localStorage.getItem(HINT_SEEN_KEY)) return;
      localStorage.setItem(HINT_SEEN_KEY, '1');
    } catch {
      return;
    }
    setFirstHint(true);
    const timer = setTimeout(() => setFirstHint(false), 5000);
    return () => {
      // 5秒以内に閉じた場合もヒントを畳む（次回オープンに持ち越さない）
      clearTimeout(timer);
      setFirstHint(false);
    };
  }, [open, showHints]);

  // 204: 履歴方式の ⌘+←（戻る）クローズ。設定OFF時は従来どおり（履歴に積まない）
  useEffect(() => {
    if (!open) return;
    if (!isShortcutsEnabled()) return;
    let pushed = true;
    window.history.pushState({ kbModal: 'fullscreen-reader' }, '');
    const onPop = () => {
      // 戻る操作（⌘+←・スワイプ・戻るボタン）: 積んだ1枚が消費された＝closeだけ行う
      pushed = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // ✕/Esc/背景クリックで閉じた場合はこちらで1枚戻して整合を取る（listener解除済み＝二重closeなし）
      if (pushed) window.history.back();
    };
  }, [open]);

  // Esc で閉じる + 背面スクロールロック（開いている間のみ）
  // 204: j/k（前後の資料）・+/-（文字サイズ）を追加。Esc は151の既存機能＝設定OFFでも有効、
  // 新設キーは設定ON時のみ・入力中/IME変換中/修飾キー付きは無効（誤爆防止）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (!isShortcutsEnabled()) return;
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j') {
        onNextRef.current?.();
      } else if (e.key === 'k') {
        onPrevRef.current?.();
      } else if (e.key === '+' || e.key === '=') {
        setFont((f) => {
          const next: ReaderFont = f === 'sm' ? 'md' : 'lg';
          try {
            localStorage.setItem(FONT_KEY, next);
          } catch {}
          return next;
        });
      } else if (e.key === '-') {
        setFont((f) => {
          const next: ReaderFont = f === 'lg' ? 'md' : 'sm';
          try {
            localStorage.setItem(FONT_KEY, next);
          } catch {}
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

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
      data-kb-scope="reader"
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
      {/* ヘッダー（タイトル + 文字サイズ + 閉じる、＋191: アクション行）。
          本文側が内部スクロール（overflowY:auto）のため、flexShrink:0 のこの領域は
          スクロールしても常に画面上部に固定表示される（sticky 相当の追従）。 */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flexShrink: 0,
          background: 'var(--bg-card, #fff)',
          borderBottom: '1px solid var(--border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
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
              title={`文字サイズ: ${FONT_LABEL[f]}${showHints ? KEY_HINT.fontSuffix : ''}`}
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
        {/* ヘッダー閉じるボタン（補助導線。主導線は右下の大きい閉じるボタン） */}
        <button
          type="button"
          onClick={onClose}
          title={showHints ? `閉じる（${KEY_HINT.readerClose}）` : '閉じる（Esc）'}
          style={{
            flexShrink: 0,
            width: 26,
            height: 26,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
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

      {/* 191: アクション行（呼び出し元から渡されたボタン群）。省略時は非描画＝従来表示。
          狭い画面では flexWrap で折り返し、はみ出さない。 */}
      {actions != null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            padding: '0 16px 10px',
          }}
        >
          {actions}
        </div>
      )}
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

      {/* 204 第4層: 初回だけのヒント（5秒で消える・localStorageで以降は出さない・操作は遮らない） */}
      {firstHint && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 'max(64px, calc(env(safe-area-inset-top) + 64px))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 3,
            padding: '8px 16px',
            borderRadius: 999,
            background: 'rgba(17,24,39,0.85)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          }}
        >
          💡 {KEY_HINT.readerClose} で閉じられます・j / k で前後の資料
        </div>
      )}

      {/* 閉じるボタン（右下固定）。親指で押しやすい位置・大きめ・目立つ配色。
          Esc・背景クリックでも閉じられるが、こちらを主導線にする。 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title={showHints ? `閉じる（${KEY_HINT.readerClose}）` : '閉じる（Esc）'}
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
