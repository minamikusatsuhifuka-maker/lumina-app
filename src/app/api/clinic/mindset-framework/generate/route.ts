import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { gradeCount, positions } = await req.json();
  if (!gradeCount || !positions) return NextResponse.json({ error: 'gradeCount と positions は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: `あなたはクリニックの人材育成専門家です。
以下の4つのコア価値を軸に、等級ごとの段階的なマインド成長を設計してください。

コア価値：
1. 自己成長（self_growth）
2. 社会貢献（social_contribution）
3. 学びの継続（continuous_learning）
4. 分かち合い・情報共有（sharing）

重要な前提：
- 新人はまず「自分が成長すること」から始まる
- 徐々に「チームへの貢献」「社会への貢献」へと広がっていく
- マインドは命令で身につくものではなく、段階的な体験と気づきで育まれる
- 各等級で「できる・やっている」行動として具体的に表現する
必ずJSON形式のみで返してください。`,
      messages: [{
        role: 'user',
        content: `クリニックの理念：${philosophy}

等級数：${gradeCount}
職種：${Array.isArray(positions) ? positions.join('、') : positions}

全等級 × 4つのコア価値（self_growth, social_contribution, continuous_learning, sharing）の組み合わせで、マインド成長フレームワークを作成してください。

以下のJSON形式で返してください：
{
  "framework": [
    {
      "gradeLevel": 1,
      "coreValue": "self_growth",
      "stageDescription": "この等級でのこのコア価値に対する段階説明",
      "behavioralIndicators": ["行動指標①", "行動指標②", "行動指標③"],
      "growthActions": ["成長アクション①", "成長アクション②"],
      "assessmentCriteria": "評価基準の説明"
    }
  ]
}`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
