import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { positions, count } = await req.json();
  if (!positions || !count) return NextResponse.json({ error: 'positions と count は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  // クリニック理念を取得
  const sql = neon(process.env.DATABASE_URL!);
  const philosophyRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philosophyRows[0]?.content || '';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: 'あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。',
      messages: [{
        role: 'user',
        content: `以下のクリニック理念に基づいて、${positions}向けの等級制度を${count}段階で作成してください。

クリニック理念：
${philosophy}

以下のJSON形式で返してください：
{
  "grades": [
    {
      "levelNumber": 1,
      "name": "等級名",
      "description": "等級の説明",
      "requirementsPromotion": "昇格要件",
      "requirementsDemotion": "降格要件",
      "salaryMin": 200000,
      "salaryMax": 250000,
      "keyCompetencies": ["能力1", "能力2"]
    }
  ],
  "designComment": "制度設計の意図やポイントの説明"
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
