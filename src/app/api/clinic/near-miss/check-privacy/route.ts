import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/require-auth';
import { robustJsonParse } from '@/lib/ai-json-parser';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 206: fail-closed。個人情報チェックはAI呼び出し・パースのどちらが失敗しても
// 「個人情報なし」で通過させない（205調査: 旧実装はパース失敗時に has_personal_info:false を
// 返しており、チェック機能が無音で逆転していた）。has_personal_info:true を返すことで
// 既存UI（staff/near-miss・admin/near-miss）は送信をブロックし、文言をそのまま表示する。
const FAIL_CLOSED = {
  has_personal_info: true,
  check_failed: true,
  detected_items: [] as string[],
  suggestion:
    '自動チェックを実行できませんでした。個人情報が含まれていないか内容をご自身で確認のうえ、時間をおいて再度お試しください。',
};

export async function POST(req: Request) {
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { text } = await req.json();

  try {
    const message = await anthropic.messages.create({
    model: CLAUDE_TEXT_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `以下のテキストに、個人を特定できる情報が含まれているか確認してください。

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
}`,
        },
      ],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    // 標準パーサで救済（フェンス・前置き・末尾カンマ・jsonrepair）。それでも失敗なら fail-closed
    const data = robustJsonParse(raw);
    return NextResponse.json(data);
  } catch (e) {
    console.error('check-privacy fail-closed:', e instanceof Error ? e.message : e);
    return NextResponse.json(FAIL_CLOSED);
  }
}
