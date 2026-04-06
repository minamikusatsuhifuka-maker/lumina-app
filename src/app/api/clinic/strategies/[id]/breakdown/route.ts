import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const stratRows = await sql`SELECT * FROM strategies WHERE id = ${id}`;
  if (!stratRows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const s = stratRows[0];
  const systemContext = await buildSystemContext(
    'あなたはクリニック経営戦略の実行計画策定の専門家です。必ずJSON形式のみで返してください。JSONのみを返し、それ以外のテキストは含めないでください。',
    'strategy'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemContext,
      messages: [{
        role: 'user',
        content: `以下の戦略を5〜10個の具体的なタスクに分解してください。

戦略タイトル：${s.title}
カテゴリ：${s.category || '未設定'}
説明：${s.description || '未設定'}
目標：${s.goal || '未設定'}
背景：${s.background || '未設定'}

以下のJSON形式で返してください：
{
  "tasks": [
    {
      "title": "タスクタイトル",
      "description": "タスクの詳細説明",
      "assigneeRole": "担当者の役割（例：院長、事務長、看護師長、受付）",
      "priority": "high/medium/low",
      "dueInDays": 7,
      "category": "タスクカテゴリ"
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
