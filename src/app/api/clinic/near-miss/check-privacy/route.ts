import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { text } = await req.json();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
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

  const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
  try {
    const data = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ has_personal_info: false, detected_items: [], suggestion: '' });
  }
}
