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
