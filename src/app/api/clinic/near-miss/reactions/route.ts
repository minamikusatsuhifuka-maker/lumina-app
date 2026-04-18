import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET: report_id のリアクション集計取得
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const report_id = searchParams.get('report_id');
  const rows = await sql`
    SELECT emoji, COUNT(*) as count
    FROM near_miss_reactions
    WHERE report_id = ${report_id}
    GROUP BY emoji
    ORDER BY count DESC
  `;
  return NextResponse.json({ reactions: rows });
}

// POST: リアクション追加
export async function POST(req: Request) {
  const { report_id, emoji, reactor } = await req.json();
  await sql`
    INSERT INTO near_miss_reactions (report_id, emoji, reactor)
    VALUES (${report_id}, ${emoji}, ${reactor ?? '匿名'})
  `;
  return NextResponse.json({ ok: true });
}
