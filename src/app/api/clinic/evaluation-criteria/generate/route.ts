import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { gradeId } = await req.json();
  if (!gradeId) return NextResponse.json({ error: 'gradeId は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  // 理念と等級情報を取得
  const sql = neon(process.env.DATABASE_URL!);
  const [philosophyRows, gradeRows] = await Promise.all([
    sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`,
    sql`SELECT * FROM grade_levels WHERE id = ${gradeId}`,
  ]);

  const philosophy = philosophyRows[0]?.content || '';
  const grade = gradeRows[0];
  if (!grade) return NextResponse.json({ error: '等級が見つかりません' }, { status: 404 });

  const systemPrompt = await buildSystemContext('あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。', 'evaluation');

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
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `以下のクリニック理念と等級情報に基づいて、評価シートを作成してください。

クリニック理念：
${philosophy}

等級情報：
- 等級名: ${grade.name}
- レベル: ${grade.level_number}
- 説明: ${grade.description || 'なし'}
- 昇格要件: ${grade.requirements_promotion || 'なし'}

以下のJSON形式で返してください：
{
  "categories": [
    {
      "name": "カテゴリ名",
      "weight": 30,
      "criteria": [
        {
          "name": "評価項目名",
          "description": "評価項目の説明",
          "indicators": {
            "5": "卓越している状態の具体的な行動指標",
            "4": "期待以上の状態の具体的な行動指標",
            "3": "期待通りの状態の具体的な行動指標",
            "2": "改善が必要な状態の具体的な行動指標",
            "1": "大幅な改善が必要な状態の具体的な行動指標"
          }
        }
      ]
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
