'use client';

// 259/260: カーソルの無い端末（iPhone等）で「クリア」と「ペースト」を別操作にするための部品。
// 📝テキスト分析 と 🔭ディープリサーチ の2画面で同じものを使う。
//
// ── 260: 「📋 ペースト」ボタン1本に一本化した ────────────────────
// 259では「ボタンの見た目をした空の入力欄」を長押ししてもらう形を主経路にしたが、
// 実機で**タップするとキーボードが立ち上がり、欄の位置がずれて押し直しになる**
// ——編集可能な欄である以上これは構造的に避けられないため撤去した。
// readonly / inputmode="none" でも paste 自体は届くことを実測したが、実機で貼り付けを
// 起こす唯一の手段（長押しメニューに「ペースト」が出るか）は**OSが描くUIで観測できない**。
// 258・259と観測できないUIに賭けて2回外しているので、三度目は賭けない。
// 「📋 ペースト」は編集可能な要素を一切使わない＝**キーボードが出る余地が構造的に無い**。
// 判断の根拠と各案の実測値は `lib/paste-insert.ts` の冒頭に残している。
//
// このボタンは**入れるだけ**（消さない）。置き換えたいときは「✕ クリア」→「📋 ペースト」の
// 2操作で、クリアには既存のUndo（10秒）が付いている＝取り返しがつく。

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
