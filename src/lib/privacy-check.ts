// 206/207: 個人情報チェックの共通ロジック。
// /api/clinic/near-miss/check-privacy（ルート）と scripts/recheck-207-nearmiss.mjs
// （過去レコードのバッチ再チェック）の両方から使う＝判定基準を二重管理しない。
// import は node --env-file 直実行（type stripping）でも解決できるよう
// 相対パス＋.ts拡張子にする（Node ESMは拡張子必須。tsconfigはallowImportingTsExtensionsで許可）。
import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_TEXT_MODEL } from './ai-models.ts';
import { robustJsonParse } from './ai-json-parser.ts';

export interface PrivacyCheckResult {
  has_personal_info: boolean;
  detected_items: string[];
  suggestion: string;
  // fail-closed（AI呼び出し/パース失敗）で「要確認」扱いになったことを示すフラグ
  check_failed?: boolean;
}

// 206: fail-closed。チェックが実行できなかったときに「個人情報なし」で通過させない
export const PRIVACY_CHECK_FAIL_CLOSED: PrivacyCheckResult = {
  has_personal_info: true,
  check_failed: true,
  detected_items: [],
  suggestion:
    '自動チェックを実行できませんでした。個人情報が含まれていないか内容をご自身で確認のうえ、時間をおいて再度お試しください。',
};

export function buildPrivacyCheckPrompt(text: string): string {
  return `以下のテキストに、個人を特定できる情報が含まれているか確認してください。

## 個人情報として検出するもの
- 患者の氏名・フルネーム・名前（「田中さん」「山田様」「鈴木花子」など）
- 患者の生年月日・年齢（「1980年生まれ」「45歳」など）
- 患者の住所・電話番号・メールアドレス
- 患者の顔写真・画像の説明
- スタッフの個人的な氏名（「濱田さん」のような個人名。ただし報告者自身の名前として文脈上明確な場合は除く）

## 個人情報として検出しないもの（許可）
- ID番号・患者番号（「患者ID: 12345」「No.001」など）
- 役職・役割名（「看護師」「医師」「スタッフ」など）
- 部署名（「受付」「施術室」など）
- 「患者様」「患者さん」などの一般的な呼称
- 「〇〇さん」のような匿名的な表現（名前が特定されない場合）
- 報告者本人の名前（文脈上、報告者自身を指す場合）

## チェック対象テキスト
${text}

## 出力形式
以下のJSONのみを返してください（コードブロック不要）：
{
  "has_personal_info": true または false,
  "detected_items": ["検出した個人情報1", "検出した個人情報2"],
  "suggestion": "修正の提案（has_personal_infoがtrueの場合のみ）"
}`;
}

// AI呼び出し＋標準パーサ。失敗時は PRIVACY_CHECK_FAIL_CLOSED を返す（例外を投げない）
export async function checkPrivacyText(
  text: string,
  apiKey = process.env.ANTHROPIC_API_KEY,
): Promise<PrivacyCheckResult> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: CLAUDE_TEXT_MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: buildPrivacyCheckPrompt(text) }],
    });
    // content[0] 固定参照だと text 以外のブロックが先頭に来たとき空文字になり
    // fail-closed に落ちる（207バッチで実測3件）。全 text ブロックを連結して救済
    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('');
    const data = robustJsonParse<Partial<PrivacyCheckResult>>(raw);
    return {
      has_personal_info: data.has_personal_info === true,
      detected_items: Array.isArray(data.detected_items) ? data.detected_items : [],
      suggestion: typeof data.suggestion === 'string' ? data.suggestion : '',
    };
  } catch (e) {
    console.error('privacy-check fail-closed:', e instanceof Error ? e.message : e);
    return PRIVACY_CHECK_FAIL_CLOSED;
  }
}
