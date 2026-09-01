'use client';

// 288: 読む画面の整形表示（R-45）を1行で書くための薄い包み。
// 整形そのものは既存の renderMarkdown（lib/markdown-renderer.ts）＝263①・271・283・287 と同じ経路で、
// ここでは新しい変換を足さない。`.markdown-body` の見出し/箇条書きの体裁（globals.css）を受ける。
// data-md-view は E2E の「生MD記法が露出していないか」の共通判定（helpers.expectNoRawMarkdown）の目印。
// コピー・ダウンロードの経路には使わない（R-71: 表示用レンダラの変換をコピー経路に流用しない）。

import type { CSSProperties } from 'react';
import { renderMarkdown } from '@/lib/markdown-renderer';

type Props = {
  text: string | null | undefined;
  style?: CSSProperties;
  className?: string;
  /** 生成中など、整形せずそのまま出したいときは true（「生成中は生・完了後に整形」の型を守る） */
  raw?: boolean;
  'data-testid'?: string;
};

export function MarkdownBody({ text, style, className, raw = false, ...rest }: Props) {
  const value = text ?? '';
  if (raw) {
    return (
      <div className={className} style={{ whiteSpace: 'pre-wrap', ...style }} {...rest}>
        {value}
      </div>
    );
  }
  return (
    <div
      data-md-view
      className={className ? `markdown-body ${className}` : 'markdown-body'}
      style={style}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
      {...rest}
    />
  );
}
