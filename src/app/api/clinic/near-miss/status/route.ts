import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// PATCH: ステータス・ピン・同じ経験カウント更新
export async function PATCH(req: Request) {
  const body = await req.json();

  if (body.status !== undefined) {
    await sql`
      UPDATE near_miss_reports
      SET status = ${body.status}, status_note = ${body.status_note ?? ''}
      WHERE id = ${body.id}
    `;
  }
  if (body.is_pinned !== undefined) {
    await sql`UPDATE near_miss_reports SET is_pinned = ${body.is_pinned} WHERE id = ${body.id}`;
  }
  if (body.increment_same_experience) {
    await sql`
      UPDATE near_miss_reports
      SET same_experience_count = same_experience_count + 1
      WHERE id = ${body.id}
    `;
  }
  return NextResponse.json({ ok: true });
}
