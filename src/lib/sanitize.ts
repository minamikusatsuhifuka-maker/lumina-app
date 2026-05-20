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
