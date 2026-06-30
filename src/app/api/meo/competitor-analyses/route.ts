import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { ensureSeoMeoSchema } from '@/lib/seo-tools';

export const runtime = 'nodejs';

// 148-4 競合分析の履歴取得・削除。owner検証。

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

export async function GET() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    const rows = await sql`
      SELECT ca.id, ca.competitor_id, ca.result, ca.ad_check, ca.created_at, c.name AS competitor_name
      FROM competitor_analyses ca
      LEFT JOIN competitors c ON c.id = ca.competitor_id
      WHERE ca.owner = ${owner}
      ORDER BY ca.created_at DESC LIMIT 100
    `;
    return NextResponse.json({ analyses: rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/competitor-analyses] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
    const sql = neon(process.env.DATABASE_URL!);
    await ensureSeoMeoSchema(sql);
    await sql`DELETE FROM competitor_analyses WHERE id = ${id} AND owner = ${owner}`;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/competitor-analyses] DELETE error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
