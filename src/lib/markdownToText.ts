/**
 * Markdown を、記号を除いた読みやすいプレーンテキストへ変換する。
 * テキスト(.txt)ダウンロード時に使用する（MD ダウンロードには使わない）。
 *
 * `##` `###` `**` `*` `---` などの記号がそのまま .txt に残ると
 * macOS 標準ビューア等で体裁が崩れて読みにくいため、見出し・強調・
 * リスト・引用・水平線などを読みやすい記号へ置換・除去する。
 */
export function markdownToReadableText(md: string | null | undefined): string {
  if (!md) return '';

  const src = md.replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const out: string[] = [];

  const stripInline = (s: string): string =>
    s
      // 画像 ![alt](url) → alt
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      // リンク [text](url) → text（url）
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）')
      // 太字 **text** / __text__
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      // 斜体 *text* / _text_
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])/g, '$1')
      // 取り消し線 ~~text~~
      .replace(/~~([^~]+)~~/g, '$1')
      // インラインコード `code`
      .replace(/`([^`]+)`/g, '$1')
      .trimEnd();

  let inCodeBlock = false;

  for (const raw of lines) {
    // コードブロック ``` は中身をそのまま保持し、``` 行自体は出力しない
    if (/^\s*```/.test(raw)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      out.push(raw);
      continue;
    }

    // 水平線
    if (/^\s*([-*_])\1{2,}\s*$/.test(raw)) {
      out.push('────────────────────────────');
      continue;
    }

    // 見出し
    const h = raw.match(/^(#{1,6})\s+(.*\S)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      const text = stripInline(h[2]);
      if (level === 1) {
        out.push('');
        out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━');
        out.push('  ' + text);
        out.push('━━━━━━━━━━━━━━━━━━━━━━━━━━');
        out.push('');
      } else if (level === 2) {
        out.push('');
        out.push('■ ' + text);
        out.push('');
      } else if (level === 3) {
        out.push('');
        out.push('◆ ' + text);
      } else {
        out.push('● ' + text);
      }
      continue;
    }

    // 箇条書き（ネスト対応）
    const b = raw.match(/^(\s*)([-*+])\s+(.*)$/);
    if (b) {
      const indentWidth = b[1].replace(/\t/g, '  ').length;
      const depth = Math.min(Math.floor(indentWidth / 2), 3);
      const markers = ['・', '－', '＊', '·'];
      const pad = '　'.repeat(depth); // 全角スペースで字下げ
      out.push(pad + markers[depth] + ' ' + stripInline(b[3]));
      continue;
    }

    // 番号付きリスト（番号は残す）
    const n = raw.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (n) {
      const indentWidth = n[1].replace(/\t/g, '  ').length;
      const pad = '　'.repeat(Math.min(Math.floor(indentWidth / 2), 3));
      out.push(pad + n[2] + '. ' + stripInline(n[3]));
      continue;
    }

    // 引用 >
    const q = raw.match(/^\s*>\s?(.*)$/);
    if (q) {
      out.push('｜ ' + stripInline(q[1]));
      continue;
    }

    // 通常行
    out.push(stripInline(raw));
  }

  // 連続する空行を2行までに圧縮し、末尾を整える
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
