import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// アーキテクチャ設計セッションの一覧取得・作成・更新・削除

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  // 単体取得
  if (id) {
    const [row] = await sql`
      SELECT * FROM architecture_sessions
      WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
    `;
    if (!row) return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
    return NextResponse.json({ session: row });
  }

  // 一覧取得
  const sessions = await sql`
    SELECT id, title, description, status, created_at, updated_at
    FROM architecture_sessions
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT 30
  `;
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const { title } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`
    INSERT INTO architecture_sessions (user_id, title)
    VALUES (${userId}, ${title ?? '新しいアーキテクチャ設計'})
    RETURNING *
  `;
  return NextResponse.json({ session: row });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();
  const { id, messages, architecture, title, status } = body;
  if (!id) return NextResponse.json({ error: 'idが必要' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`
    UPDATE architecture_sessions
    SET
      messages = COALESCE(${messages ? JSON.stringify(messages) : null}::jsonb, messages),
      architecture = COALESCE(${architecture ? JSON.stringify(architecture) : null}::jsonb, architecture),
      title = COALESCE(${title ?? null}, title),
      status = COALESCE(${status ?? null}, status),
      updated_at = NOW()
    WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
    RETURNING *
  `;
  if (!row) return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
  return NextResponse.json({ session: row });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'idが必要' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM architecture_sessions WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
