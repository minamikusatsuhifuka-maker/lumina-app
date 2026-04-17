import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { original, improved, templateLabel } = await req.json();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `以下の【元の文章】と【改善後の文章】を比較・評価してください。

【元の文章】
${original}

【改善後の文章（${templateLabel}）】
${improved}

以下の形式でJSONのみ返してください（前置き・説明不要）：

{
  "score": 採点スコア（0〜100の整数。クリニックの理念・ティール組織・リードマネジメント・インサイドアウトとの一致度）,
  "score_diff": 元の文章からの変化（例: +12, -3, 0）,
  "comment": "総合評価コメント（2〜3文）",
  "good_points": ["良い点1", "良い点2", "良い点3"],
  "improve_points": ["改善できる点1", "改善できる点2"],
  "balance": {
    "readability": 読みやすさ（0〜10）,
    "agency": スタッフの主体性・自律を促す度合い（0〜10）,
    "specificity": 具体性・行動イメージのしやすさ（0〜10）,
    "philosophy": 理念・哲学との一致度（0〜10）,
    "warmth": 温かみ・共感（0〜10）
  }
}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}';

  // コードブロックを除去してからparse
  const cleaned = text
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(cleaned);
  } catch (e) {
    console.error('JSON parse error:', cleaned);
    // パースできない場合はデフォルト値を返す
    return NextResponse.json({
      score: 70,
      score_diff: 0,
      comment: cleaned.slice(0, 200),
      good_points: [],
      improve_points: [],
      balance: {
        readability: 7,
        agency: 7,
        specificity: 7,
        philosophy: 7,
        warmth: 7,
      },
    });
  }

  return NextResponse.json(data);
}
