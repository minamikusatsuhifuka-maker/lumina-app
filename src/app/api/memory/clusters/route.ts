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

  const memories = await sql`
    SELECT id, summary, keywords, category, created_at
    FROM memory_items
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  if (memories.length < 2) {
    return NextResponse.json({ clusters: [] });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `メモリのリストを分析してクラスター（テーマグループ）に分類してください。
必ずJSON形式のみで返答。マークダウン不要。

{
  "clusters": [
    {
      "theme": "クラスターのテーマ名（10字以内）",
      "emoji": "テーマを表す絵文字1つ",
      "description": "このテーマの説明（30字以内）",
      "memoryIds": ["id1", "id2"],
      "keywords": ["キーワード1", "キーワード2"]
    }
  ]
}

ルール：
- 3〜7クラスターに分類
- 類似・関連するメモリを同じクラスターに
- テーマは具体的に（「AI技術」「マーケティング」等）`,
      messages: [{
        role: 'user',
        content: `以下のメモリを分類してください：\n\n${
          memories.map((m: any) => `ID:${m.id} | ${m.summary}`).join('\n')
        }`,
      }],
    }),
  });

  const data = await response.json();
  let text = data.content?.[0]?.text ?? '{"clusters":[]}';
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    const parsed = JSON.parse(text);
    const clusters = parsed.clusters.map((cluster: any) => ({
      ...cluster,
      memories: memories.filter((m: any) => cluster.memoryIds.includes(m.id)),
      count: cluster.memoryIds?.length ?? 0,
    }));
    return NextResponse.json({ clusters });
  } catch {
    return NextResponse.json({ clusters: [] });
  }
}
