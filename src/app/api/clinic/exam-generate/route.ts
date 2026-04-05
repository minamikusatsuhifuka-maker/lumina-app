import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { subject, targetRole, gradeLevel, difficulty } = await req.json();
  if (!subject) return NextResponse.json({ error: 'subject は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  // クリニック理念を取得
  const sql = neon(process.env.DATABASE_URL!);
  const philosophyRows = await sql`SELECT * FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
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
      system: 'あなたはクリニックの人材育成専門家です。必ずJSON形式のみで返してください。',
      messages: [{
        role: 'user',
        content: `以下の条件でスタッフ向け試験問題を10問、JSON形式で作成してください。

科目: ${subject}
対象: ${targetRole || '全スタッフ'}
等級レベル: ${gradeLevel || '指定なし'}
難易度: ${difficulty || '普通'}
${philosophy ? `\nクリニック理念:\n${philosophy}` : ''}

以下のJSON形式で返してください：
{
  "title": "試験タイトル",
  "description": "試験の説明",
  "passingScore": 70,
  "questions": [
    {
      "id": "q1",
      "question": "問題文",
      "options": {
        "A": "選択肢A",
        "B": "選択肢B",
        "C": "選択肢C",
        "D": "選択肢D"
      },
      "correctAnswer": "A",
      "explanation": "解説文"
    }
  ]
}

問題はクリニック業務に関連する実践的な内容にしてください。`,
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
