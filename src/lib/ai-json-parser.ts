import { jsonrepair } from 'jsonrepair';

/**
 * AI応答から JSON を堅牢に取り出す共通パーサ。
 * markdownフェンス除去 → 括弧抽出 → 素直にパース → 末尾カンマ除去 → jsonrepair の順で試行する。
 * すべて失敗した場合は生応答の先頭500字をログ出力して例外を投げる。
 */
export function robustJsonParse<T = any>(rawText: string): T {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('空または不正な応答');
  }

  let text = rawText.trim();

  // markdown コードフェンス除去（```json ... ```）
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim();

  // 最初の { または [ から、最後の } または ] まで抽出（前後の説明文を切り落とす）
  const first = text.search(/[{[]/);
  const last = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (first !== -1 && last > first) text = text.slice(first, last + 1);

  // 1) 素直にパース
  try { return JSON.parse(text); } catch {}

  // 2) 末尾カンマ除去
  try { return JSON.parse(text.replace(/,(\s*[\]}])/g, '$1')); } catch {}

  // 3) jsonrepair で修復
  try {
    return JSON.parse(jsonrepair(text));
  } catch (e: any) {
    console.error('[ai-json-parser] JSON修復失敗:', e?.message);
    console.error('[ai-json-parser] 生応答先頭500字:', text.slice(0, 500));
    throw new Error(`JSON解析に失敗: ${e?.message || 'unknown'}`);
  }
}

/**
 * robustJsonParse の例外を握りつぶし、失敗時は fallback を返す版。
 */
export function safeJsonParse<T = any>(rawText: string, fallback: T): T {
  try {
    return robustJsonParse<T>(rawText);
  } catch {
    return fallback;
  }
}
