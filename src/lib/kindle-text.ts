// 223改善-2: 章本文の体裁ユーティリティ（クライアント/サーバ共用の純関数）
// AI生成の章本文が冒頭に「# 第N章: タイトル」型のH1を含むと、結合時の章見出しと
// 二重になるため除去する。
// - サーバ（generate-chapter保存前）: 防御的二重ガード
// - クライアント（⑥プレビュー・MD/テキスト/Word出力の結合時）: 既存生成分の救済
//   （DBは書き換えない・表示/出力時のみ）

// 先頭の非空行が「# 第N章…」または「# {章タイトル}」型のH1のとき、その1行を除去する。
// H1（#）のみ対象。小見出し（##）は本文の正当な構造なので触らない。
export function stripLeadingChapterHeading(
  content: string,
  chapterNumber?: number,
  title?: string,
): string {
  if (!content) return content;
  // 先頭の空行・空白をまたいで最初のH1行を見る（#の直後の空白は任意）
  const m = content.match(/^\s*#(?!#)[ \t]*(.+?)[ \t]*\r?(?:\n|$)/);
  if (!m) return content;
  const heading = m[1].trim();
  const isChapterHeading = /^第\s*\d+\s*章/.test(heading);
  const t = (title ?? '').trim();
  const headingWithoutChapterPrefix = heading.replace(/^第\s*\d+\s*章\s*[:：．.、-]?\s*/, '').trim();
  const equalsTitle = t !== '' && (heading === t || headingWithoutChapterPrefix === t);
  if (!isChapterHeading && !equalsTitle) return content;
  // 該当H1の1行だけを落とし、続く空行も詰める
  return content.slice((m.index ?? 0) + m[0].length).replace(/^\s*\n/, '').replace(/^[ \t]+/, '');
}

// ── 238【1】: 本文の途中に残る「章タイトル＋日付」ブロックの除去 ──
//
// 事象: Word出力の本文中に「第4章 ○○」＋「2026年8月8日」が割り込んでいた。
// 調査: docxエクスポータ側は正常（Titleスタイルは1個・日付1回・header/footer無し）。
// 原因: 章本文そのものに、AIが書いた章見出し行と日付行が**先頭以外の位置**で残っていた。
//       stripLeadingChapterHeading は先頭のH1しか見ないため素通りしていた。
//
// ここでは誤削除を避けるため、対象を厳しく限定する:
//   - 見出し記号の有無を問わず、行全体が「第N章 …」または章タイトルと一致する行のみ
//   - その直後に続く「日付だけの行」（2026年8月8日 / 2026/8/8 / 2026-08-08）
//   - 本文中の通常の文・小見出し（内容のある ## ###）は一切触らない
const DATE_ONLY_RE = /^\s*\d{4}\s*[年/.-]\s*\d{1,2}\s*[月/.-]\s*\d{1,2}\s*日?\s*(?:\([日月火水木金土]\)|（[日月火水木金土]）)?\s*$/;

function normalizeHeadingText(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s*/, '') // 見出し記号
    .replace(/^\s*\*\*(.+)\*\*\s*$/, '$1') // 太字だけの行
    .trim();
}

export function stripStrayChapterHeadings(
  content: string,
  chapterNumber?: number,
  title?: string,
): string {
  if (!content) return content;
  const t = (title ?? '').trim();
  const lines = content.split('\n');
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const text = normalizeHeadingText(lines[i]);
    if (text === '') {
      out.push(lines[i]);
      continue;
    }
    const withoutPrefix = text.replace(/^第\s*\d+\s*章\s*[:：．.、\-–—]?\s*/, '').trim();
    // 「第N章 …」形式か、章タイトルそのものの行か
    const isChapterLine =
      (/^第\s*\d+\s*章/.test(text) &&
        (chapterNumber === undefined ||
          new RegExp(`^第\\s*${chapterNumber}\\s*章`).test(text) ||
          withoutPrefix === t)) ||
      (t !== '' && text === t);
    if (!isChapterLine) {
      out.push(lines[i]);
      continue;
    }
    // 章見出し行を落とす。直後の日付だけの行と、続く空行も一緒に詰める
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j < lines.length && DATE_ONLY_RE.test(lines[j])) {
      i = j; // 日付行まで消費
    }
    // 直前に空行が積まれていれば1行に丸める（段落間が開きすぎるのを防ぐ）
    while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
    out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** 先頭H1の除去＋本文中の残存章見出しの除去をまとめて行う（出力・保存の共通入口） */
export function cleanChapterBody(content: string, chapterNumber?: number, title?: string): string {
  return stripStrayChapterHeadings(stripLeadingChapterHeading(content, chapterNumber, title), chapterNumber, title);
}
