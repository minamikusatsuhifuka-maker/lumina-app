import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { positionName } = await req.json();
  if (!positionName) return NextResponse.json({ error: 'positionName は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: await buildSystemContext('あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。', 'grade'),
      messages: [{
        role: 'user',
        content: `クリニックの理念：${philosophy}

職種名：${positionName}

以下のJSON形式で職種定義を作成してください：
{
  "name": "${positionName}",
  "description": "職種の概要説明（3〜5文）",
  "responsibilities": ["主な責務①", "主な責務②", "主な責務③"],
  "requiredBaseSkills": ["必要な基礎スキル①", "必要な基礎スキル②", "必要な基礎スキル③"],
  "careerPath": "キャリアパスの説明"
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
