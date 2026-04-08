import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { purpose, targetRole, gradeLevel, philosophyContext } = await req.json();
  if (!purpose) return NextResponse.json({ error: 'purpose は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  // クリニック理念を取得
  const sql = neon(process.env.DATABASE_URL!);
  const philosophyRows = await sql`SELECT * FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philosophyRows[0]?.content || philosophyContext || '';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: await buildSystemContext('あなたはクリニックの人材育成専門家です。必ずJSON形式のみで返してください。', 'mindset'),
      messages: [{
        role: 'user',
        content: `以下の条件でスタッフ向けアンケートをJSON形式で作成してください。

目的: ${purpose}
対象: ${targetRole || '全スタッフ'}
等級レベル: ${gradeLevel || '指定なし'}
${philosophy ? `\nクリニック理念:\n${philosophy}` : ''}

以下のJSON形式で返してください：
{
  "title": "アンケートタイトル",
  "description": "アンケートの説明",
  "questions": [
    {
      "id": "q1",
      "type": "radio|checkbox|text|scale",
      "question": "質問文",
      "options": ["選択肢1", "選択肢2"],
      "required": true
    }
  ]
}

typeはradio（単一選択）、checkbox（複数選択）、text（自由記述）、scale（5段階評価）のいずれかです。
質問は8〜12問程度で、理念に沿った内容を含めてください。`,
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
