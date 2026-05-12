import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';

export const maxDuration = 30;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!(session?.user as any)?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { originalInput, failedContent: _failedContent, improvements, stepLabel, attempt } = await req.json();

  const prompt = `あなたはプロンプトエンジニアリングの専門家AIエージェントです。
以下の生成が品質基準を満たさなかったため、プロンプトを改善してください。

## ステップ: ${stepLabel}（${attempt}回目の試行）
## 元のリクエスト
${JSON.stringify(originalInput, null, 2).slice(0, 500)}

## 品質チェックで指摘された改善点
${(improvements ?? []).join('\n')}

## 改善されたリクエストを生成してください
元のリクエストの構造を維持しつつ、以下を強化したJSONを出力してください：
- 具体性を増す追加指示
- 品質基準を明示した指示
- 長さ・深度への要求を強化

必ずJSONのみを出力してください（説明文不要）：`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) ?? text.match(/\{[\s\S]*\}/);
    const improvedInput = jsonMatch
      ? JSON.parse(jsonMatch[1] ?? jsonMatch[0])
      : { ...originalInput, qualityBoost: (improvements ?? []).join('; ') };

    return NextResponse.json({ improvedInput });
  } catch {
    return NextResponse.json({
      improvedInput: {
        ...originalInput,
        qualityRequirements: (improvements ?? []).join('\n'),
        minimumLength: '2000字以上',
        requiredElements: improvements ?? [],
      },
    });
  }
}
