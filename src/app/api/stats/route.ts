import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const [
    libraryCount,
    memoryCount,
    glossaryCount,
    templateCount,
    recentLibrary,
  ] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM library WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*) as count FROM memory_items WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*) as count FROM glossary_items WHERE user_id = ${userId}`,
    sql`SELECT COUNT(*) as count FROM writing_templates WHERE user_id = ${userId}`,
    sql`
      SELECT group_name as group_type, COUNT(*) as count
      FROM library
      WHERE user_id = ${userId}
      GROUP BY group_name
      ORDER BY count DESC
      LIMIT 8
    `,
  ]);

  // 過去7日間の保存数
  const weeklyStats = await sql`
    SELECT
      DATE(created_at) as date,
      COUNT(*) as count
    FROM library
    WHERE user_id = ${userId}
      AND created_at >= NOW() - INTERVAL '7 days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `;

  return NextResponse.json({
    totals: {
      library: Number(libraryCount[0]?.count ?? 0),
      memory: Number(memoryCount[0]?.count ?? 0),
      glossary: Number(glossaryCount[0]?.count ?? 0),
      templates: Number(templateCount[0]?.count ?? 0),
    },
    categoryBreakdown: recentLibrary,
    weeklyStats,
  });
}
