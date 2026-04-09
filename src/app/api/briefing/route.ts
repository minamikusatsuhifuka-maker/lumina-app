import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  // 最新のライブラリアイテム（3件）
  const recentItems = await sql`
    SELECT title, group_name, created_at FROM library
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 3
  `;

  // 最新のメモリ（5件）
  const memories = await sql`
    SELECT summary FROM memory_items
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 5
  `;

  const memoryText = memories.map((m: any) => `・${m.summary}`).join('\n');
  const recentText = recentItems.map((i: any) => `・${i.title}（${i.group_name}）`).join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `あなたはxLUMINAのAIアシスタントです。
ユーザーの活動履歴をもとに、今日のブリーフィングを生成してください。
JSON形式のみで返答。

{
  "greeting": "挨拶（ユーザーの活動を踏まえた一言・30字以内）",
  "insights": ["今日のインサイト1", "今日のインサイト2"],
  "recommendedActions": [
    { "action": "推奨アクション", "reason": "理由（20字以内）", "href": "/dashboard/..." }
  ],
  "focusTopic": "今日フォーカスすべきトピック（30字以内）"
}`,
      messages: [{
        role: 'user',
        content: `最近の活動：\n${recentText || 'なし'}\n\nAIメモリ：\n${memoryText || 'なし'}`,
      }],
    }),
  });

  const data = await response.json();
  let text = data.content?.[0]?.text ?? '{}';
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json({ greeting: '今日もxLUMINAをご活用ください！', insights: [], recommendedActions: [] });
  }
}
