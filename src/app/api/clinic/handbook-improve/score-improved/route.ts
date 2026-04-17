import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { original, improved, templateLabel } = await req.json();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `あなたはクリニックのハンドブック文章の専門評価者です。
以下の【元の文章】と【改善後の文章】を厳密に比較・評価してください。

【元の文章】
${original}

【改善後の文章（テンプレート：${templateLabel}）】
${improved}

## 評価の観点
1. テンプレート「${templateLabel}」の意図がどれだけ実現されているか
2. クリニック理念（ティール組織・リードマネジメント・インサイドアウト・先払い哲学）との一致度
3. 元の文章との具体的な違いと改善度合い

## 重要な指示
- 各案の特徴を正直に差別化して評価すること
- スコアは文章の質に応じて50〜95点の範囲で厳密につけること
- バランス指標は各軸を独立して評価し、必ず異なる値をつけること（全て同じ値は禁止）
- score_diffは元の文章との実際の改善幅を示すこと

## 出力形式
必ず以下のJSONのみを返してください。コードブロック不要：

{
  "score": 整数（50〜95）,
  "score_diff": 整数（元文章からの変化。改善なら正、悪化なら負）,
  "comment": "この改善案の特徴と評価を2〜3文で具体的に",
  "good_points": ["具体的な良い点1", "具体的な良い点2"],
  "improve_points": ["具体的な改善点1", "具体的な改善点2"],
  "balance": {
    "readability": 読みやすさ（1〜10、文章の流れと理解しやすさ）,
    "agency": 主体性・自律（1〜10、スタッフが自分で考え動きたくなるか）,
    "specificity": 具体性（1〜10、行動イメージが湧くか）,
    "philosophy": 理念一致度（1〜10、クリニック理念との整合性）,
    "warmth": 温かみ（1〜10、感情に響く温かさがあるか）
  }
}`,
      },
    ],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text : '';
  console.log('[score-improved] raw response:', raw.slice(0, 300));

  // コードブロックを除去
  const cleaned = raw
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim();

  console.log('[score-improved] cleaned:', cleaned.slice(0, 300));

  try {
    const data = JSON.parse(cleaned);
    console.log('[score-improved] parse success, score:', data.score);
    return NextResponse.json(data);
  } catch (e) {
    console.error('[score-improved] JSON parse failed:', e);
    console.error('[score-improved] cleaned text:', cleaned);

    // parse失敗時は rawテキストをcommentに入れて返す（デバッグ用）
    return NextResponse.json({
      score: 0,
      score_diff: 0,
      comment: `⚠️ 採点結果のパースに失敗しました。生の返答：${cleaned.slice(0, 200)}`,
      good_points: [],
      improve_points: [],
      balance: {
        readability: 0,
        agency: 0,
        specificity: 0,
        philosophy: 0,
        warmth: 0,
      },
    });
  }
}
