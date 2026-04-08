import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { category, challenge, goal } = await req.json();
  if (!category) return NextResponse.json({ error: 'category は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  const systemPrompt = await buildSystemContext('あなたはクリニック経営戦略の専門家です。必ずJSON形式のみで返してください。JSONのみを返し、それ以外のテキストは含めないでください。', 'strategy');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `クリニックの理念：${philosophy}
カテゴリ：${category}
課題：${challenge || '特になし'}
目標：${goal || '特になし'}

以下のJSON形式でクリニック経営戦略を作成してください。全項目を具体的に記載してください：
{
  "title": "戦略タイトル",
  "description": "戦略の概要説明（3〜5文）",
  "background": "この戦略が必要な背景・現状分析",
  "goal": "達成目標（具体的な数値目標を含む）",
  "phases": [
    {
      "name": "フェーズ名",
      "duration": "期間（例：1〜2ヶ月目）",
      "description": "このフェーズで行うこと",
      "milestones": ["マイルストーン①", "マイルストーン②"]
    }
  ],
  "kpi": ["KPI指標①（具体的な数値目標）", "KPI指標②"],
  "risks": ["想定リスク①と対策", "想定リスク②と対策"],
  "firstActions": [
    {
      "title": "最初に取るべきアクション",
      "assignee": "担当者の役割（例：院長、事務長、看護師長）",
      "dueInDays": 7,
      "description": "アクションの詳細説明"
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
