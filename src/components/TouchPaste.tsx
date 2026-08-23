'use client';

// 259: カーソルの無い端末（iPhone等）で「クリア」と「ペースト」を別操作にするための部品。
// 📝テキスト分析 と 🔭ディープリサーチ の2画面で同じものを使う。
//
// ── なぜ2つ置くか ─────────────────────────────────────────
// - `LongPressPasteField`（主）: **ボタンの見た目をした空の入力欄**。長押しすると
//   iOSのメニューが出るが、**空欄なので「ペースト」しか出ない**（選択する文字が無いため）。
//   ユーザー自身の貼り付け操作なので**確認ポップアップは出ない**。
//   院長案の「ボタンを長押しで完了」は、実体を編集可能にすればこの形で成立する
//   （ふつうの <button> では WebKit に paste が届かないことを実測。lib/paste-insert.ts 参照）。
// - `PasteButton`（併設）: 指示書259の「📋 ペースト」。`readText()` を通るため
//   **iOSでは確認が1回以上入る**（ブラウザ側の仕様でアプリからは減らせない）。
//   長押しが使えない場面の保険として置く。
//
// どちらも**入れるだけ**（消さない）。置き換えたいときは「✕ クリア」→ 貼り付け の2操作で、
// クリアには既存のUndo（10秒）が付いている＝取り返しがつく。

import { useRef, type RefObject } from 'react';
import { useFinePointer } from '@/lib/pointer-device';
import { readClipboardText } from '@/lib/clear-and-paste';
import {
  insertAtCursor,
  PASTE_BUTTON_MESSAGE,
  type PasteButtonResult,
} from '@/lib/paste-insert';

export interface TouchPasteTarget {
  /** いまの入力内容 */
  value: string;
  /** 入力内容を書き換える */
  setValue: (next: string) => void;
  /** 差し込み先の入力欄（カーソル位置の取得と、差し込み後のカーソル移動に使う） */
  targetRef: RefObject<HTMLTextAreaElement | null>;
  /** 実行中などで触らせたくないとき */
  disabled?: boolean;
  /** 結果の案内（トースト） */
  notify?: (text: string, kind: 'success' | 'warning') => void;
}

/** カーソル位置に差し込んで、カーソルをその直後へ置く（2つの部品で共通） */
function useInsert(target: TouchPasteTarget) {
  return (text: string) => {
    const el = target.targetRef.current;
    const { next, caret } = insertAtCursor(
      target.value,
      text,
      el?.selectionStart,
      el?.selectionEnd,
    );
    target.setValue(next);
    // state 反映後に DOM を触るため次のフレームで（254のクリアして貼付と同じ流儀）
    requestAnimationFrame(() => {
      const node = target.targetRef.current;
      if (!node) return;
      try {
        node.setSelectionRange(caret, caret);
      } catch {
        /* 位置指定が使えない要素でも、内容は入っているので十分 */
      }
    });
  };
}

/**
 * 案③: 「📋 ペースト」ボタン。カーソルのある端末では出さない
 * （デスクトップには「📋 クリアして貼付」と ⌘⇧V があり、増やす意味がないため）。
 */
export function PasteButton(props: TouchPasteTarget) {
  const pointer = useFinePointer();
  const insert = useInsert(props);
  const busy = useRef(false);
  if (!pointer.mounted || pointer.fine) return null;

  const onClick = async () => {
    if (busy.current || props.disabled) return;
    busy.current = true;
    try {
      // クリックのすぐ中で読む（同一のユーザー操作の中で呼ぶほど確認が軽くなるため）
      const clip = await readClipboardText();
      let result: PasteButtonResult;
      if (clip === null) result = 'denied';
      else if (clip.length === 0) result = 'empty';
      else {
        insert(clip);
        result = 'pasted';
      }
      const msg = PASTE_BUTTON_MESSAGE[result];
      props.notify?.(msg.text, msg.kind);
    } finally {
      busy.current = false;
    }
  };

  return (
    <button
      type="button"
      data-paste-button
      onClick={() => void onClick()}
      disabled={props.disabled}
      title="クリップボードの内容をカーソル位置に貼り付けます（iPhoneではSafariの確認が入ります）"
      style={{
        padding: '4px 10px',
        fontSize: 12,
        color: props.disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 6,
        opacity: props.disabled ? 0.5 : 1,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      📋 ペースト
    </button>
  );
}

/**
 * 案①＋案②: ボタンの見た目をした**空の貼り付け欄**。長押し→「ペースト」で本文へ入る。
 * 確認ポップアップは出ない（ユーザー自身の貼り付け操作のため）。
 * カーソルのある端末では出さない（マウスでは長押しに意味がないため）。
 */
export function LongPressPasteField(props: TouchPasteTarget) {
  const pointer = useFinePointer();
  const insert = useInsert(props);
  const fieldRef = useRef<HTMLInputElement>(null);
  if (!pointer.mounted || pointer.fine) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <input
        ref={fieldRef}
        type="text"
        data-long-press-paste
        aria-label="長押しして「ペースト」を選ぶと、上の入力欄に貼り付きます"
        placeholder="📋 ここを長押し →「ペースト」"
        disabled={props.disabled}
        // 中身は常に空に保つ。空欄だからこそ iOS のメニューが「ペースト」だけになる
        value=""
        onChange={() => {
          /* 直接の入力は受け取らない（貼り付け専用）。value を空に固定するため必要 */
        }}
        onPaste={(e) => {
          const text = e.clipboardData?.getData('text/plain') ?? '';
          // この欄には残さない（空のままにしておかないと次の長押しで選択メニューが出る）
          e.preventDefault();
          if (!text) {
            props.notify?.('クリップボードが空でした', 'warning');
            return;
          }
          insert(text);
          props.notify?.('貼り付けました', 'success');
          // キーボードが出たままにならないよう閉じる
          fieldRef.current?.blur();
        }}
        style={{
          width: '100%',
          padding: '10px 12px',
          fontSize: 16, // iOS Safari の自動ズーム防止（16px以上）
          textAlign: 'center',
          color: 'var(--text-secondary)',
          background: 'transparent',
          border: '1px dashed var(--border)',
          borderRadius: 8,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
