/**
 * Anthropic API 応答の content 配列から text ブロックを全連結して取り出す共通ヘルパ。
 *
 * content[0] 固定参照は、thinking 既定ONのモデル（claude-sonnet-5 等）で
 * 思考ブロックが先頭に来ると undefined/空文字になり、パース失敗や偽の空応答を
 * 引き起こす（207実測・217本番実証）。text 抽出は必ずこの関数を使うこと。
 */
type AnthropicContentBlock = { type?: string; text?: string };

export function extractAnthropicText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return (content as AnthropicContentBlock[])
    .filter((b) => b?.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}
