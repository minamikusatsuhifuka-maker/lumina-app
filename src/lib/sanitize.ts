/**
 * 文字列から孤立したサロゲート（High/Low の片割れだけ）を除去する。
 *
 * UTF-16 のサロゲートペア: High (U+D800-U+DBFF) + Low (U+DC00-U+DFFF) の2文字で1絵文字を表現。
 * どちらか片方だけ残った場合、JSON エンコード時に不正な \uXXXX が生成され、
 * Anthropic API などの厳格な JSON パーサで 400 エラーになる。
 *
 * 使用例:
 *   const safe = sanitizeForJson(userInputText);
 *   await anthropic.messages.create({ messages: [{ role: 'user', content: safe }] });
 */
export function sanitizeForJson(input: string): string {
  if (!input) return input;
  // 孤立した High Surrogate（後ろに Low が来ない）
  // 孤立した Low Surrogate（前に High が来ない）
  // 両方を除去
  return input.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

/**
 * PostgreSQL の text 型に安全に格納できる文字列へ均す（237）。
 *
 * 237の障害: ディープリサーチのレポート保存が「❌ 保存に失敗しました」で必ず失敗していた。
 * 真因は本文に紛れ込んだ **NUL文字（U+0000）** と **孤立サロゲート**。
 * PostgreSQL の text は U+0000 を格納できず（`unsupported Unicode escape sequence`）、
 * 孤立サロゲートは UTF-8 変換で落ちる。どちらも INSERT が例外になり、
 * try-catch の無い保存APIが500を返して**本文まるごとが保存できない**状態になっていた。
 *
 * 表示上ほぼ意味を持たない不可視文字だけを落とすため、内容の劣化はない。
 * **保存系APIは、DBへ渡す前にこの関数を通すこと（R-39）。**
 */
export function sanitizeForDb(input: unknown): string {
  if (input === null || input === undefined) return '';
  const s = String(input);
  if (!s) return s;
  return (
    sanitizeForJson(s)
      // NUL は PostgreSQL text が格納できない
      .replace(/\u0000/g, '')
  );
}
