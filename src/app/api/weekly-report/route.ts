import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  const session = await auth();
  if (!isCron && !session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const userIds = isCron
    ? (await sql`SELECT id FROM users`).map((u: any) => u.id)
    : [(session!.user as any).id];

  const results = [];

  for (const userId of userIds) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [libraryItems, memoryItems] = await Promise.all([
      sql`
        SELECT title, group_name, created_at FROM library
        WHERE user_id = ${userId} AND created_at >= ${weekAgo}
        ORDER BY created_at DESC LIMIT 20
      `,
      sql`
        SELECT summary FROM memory_items
        WHERE user_id = ${userId} AND created_at >= ${weekAgo}
        ORDER BY created_at DESC LIMIT 10
      `,
    ]);

    if (libraryItems.length === 0 && memoryItems.length === 0) continue;

    const categoryCount: Record<string, number> = {};
    libraryItems.forEach((item: any) => {
      const g = item.group_name || '未分類';
      categoryCount[g] = (categoryCount[g] ?? 0) + 1;
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: `あなたはxLUMINAのアナリストです。
ユーザーの先週の活動データをもとに、週次サマリーレポートを生成してください。
Markdown形式で出力してください。`,
        messages: [{
          role: 'user',
          content: `# 先週の活動データ\n\n## 保存したアイテム（${libraryItems.length}件）\n${Object.entries(categoryCount).map(([cat, count]) => `- ${cat}: ${count}件`).join('\n')}\n\n## 保存したアイテム一覧\n${libraryItems.slice(0, 10).map((i: any) => `- ${i.title}`).join('\n')}\n\n## AIメモリ（${memoryItems.length}件追加）\n${memoryItems.slice(0, 5).map((m: any) => `- ${m.summary}`).join('\n')}\n\n以下の構成でレポートを作成してください：\n1. 今週のハイライト（3行以内）\n2. 機能別活動サマリー\n3. よく調査したテーマ\n4. 来週のおすすめアクション（3つ）`,
        }],
      }),
    });

    const data = await response.json();
    const reportContent = data.content?.[0]?.text ?? '';

    const weekStr = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
    await sql`
      INSERT INTO library (id, user_id, title, content, group_name, tags)
      VALUES (gen_random_uuid()::text, ${userId}, ${'週次活動レポート ' + weekStr}, ${reportContent}, '週次レポート', '週次レポート')
    `;

    results.push({ userId, itemCount: libraryItems.length });
  }

  return NextResponse.json({ ok: true, processed: results.length });
}
