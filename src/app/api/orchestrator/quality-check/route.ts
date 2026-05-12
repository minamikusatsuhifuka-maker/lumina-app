import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';

export const maxDuration = 60;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const QUALITY_CRITERIA: Record<string, string> = {
  market_research: `
    評価基準（各20点、合計100点）:
    1. 具体的な数値・データが含まれているか
    2. 競合分析が3社以上含まれているか
    3. ターゲット顧客が明確に定義されているか
    4. 市場規模・成長率の言及があるか
    5. 実践的な示唆が含まれているか`,

  lp: `
    評価基準（各20点、合計100点）:
    1. ヘッドライン・サブヘッドが読者の感情を動かすか
    2. ベネフィットが3つ以上明確に提示されているか
    3. 社会的証明（数字・実績・お客様の声）があるか
    4. 明確なCTA（行動喚起）があるか
    5. 1500字以上の十分なボリュームがあるか`,

  step_mail: `
    評価基準（各20点、合計100点）:
    1. 件名が開封したくなる内容か
    2. 各メールに明確な目的があるか
    3. ストーリー性・一貫性があるか
    4. 段階的に購買へ誘導する構成か
    5. 5通以上のシーケンスか`,

  consent: `
    評価基準（各20点、合計100点）:
    1. インフォームドコンセントの7要素が揃っているか
    2. リスク・副作用が明記されているか
    3. 患者の署名欄・日付欄があるか
    4. 医師の説明記載欄があるか
    5. 平易な言葉で書かれているか`,

  default: `
    評価基準（各20点、合計100点）:
    1. 要求された内容が網羅されているか
    2. 具体性・詳細さが十分か
    3. 論理的な構成になっているか
    4. 実践的に使える品質か
    5. 十分なボリューム・深度があるか`,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { stepId, stepLabel, content, intent } = await req.json();

  if (!content || content.length < 50) {
    return NextResponse.json({
      score: 0,
      passed: false,
      reason: 'コンテンツが空または短すぎます',
      improvements: ['内容を再生成してください'],
    });
  }

  const criteria = QUALITY_CRITERIA[stepId] ?? QUALITY_CRITERIA.default;

  const prompt = `あなたは厳格な品質管理AIエージェントです。
以下の生成コンテンツを評価してください。

## 評価対象ステップ
${stepLabel}

## 意図・目的
${intent}

## 生成されたコンテンツ
${content.slice(0, 3000)}

${criteria}

## 出力形式（必ずJSONのみ出力）
\`\`\`json
{
  "score": 0〜100の整数,
  "breakdown": {
    "criterion1": { "score": 0〜20, "comment": "評価コメント" },
    "criterion2": { "score": 0〜20, "comment": "評価コメント" },
    "criterion3": { "score": 0〜20, "comment": "評価コメント" },
    "criterion4": { "score": 0〜20, "comment": "評価コメント" },
    "criterion5": { "score": 0〜20, "comment": "評価コメント" }
  },
  "passed": true（70点以上）またはfalse,
  "reason": "総合評価コメント（50字以内）",
  "improvements": [
    "改善点1（具体的に）",
    "改善点2（具体的に）",
    "改善点3（具体的に）"
  ],
  "improved_prompt_addition": "次回の生成時にプロンプトに追加すべき指示（100字以内）"
}
\`\`\``;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[1]);
      return NextResponse.json(result);
    }

    return NextResponse.json({
      score: 60,
      passed: false,
      reason: '品質評価の解析に失敗しました',
      improvements: ['再生成を試みてください'],
    });
  } catch (err) {
    return NextResponse.json({
      score: 0,
      passed: false,
      reason: String(err),
      improvements: [],
    });
  }
}
