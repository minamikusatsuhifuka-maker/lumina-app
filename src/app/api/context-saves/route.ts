import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// AI背景情報コンテキストの保存・取得・削除API

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { topic, contextText, researchText, tags } = await req.json();
    if (!topic || !contextText) {
      return NextResponse.json({ error: 'topic と contextText は必須です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;
    const tagArr: string[] = Array.isArray(tags) ? tags : [];

    const result = await sql`
      INSERT INTO context_saves (user_id, topic, context_text, research_text, tags)
      VALUES (${userId}, ${topic}, ${contextText}, ${researchText || null}, ${tagArr})
      RETURNING id
    `;
    return NextResponse.json({ success: true, id: result[0].id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '保存に失敗しました' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    // 単一取得
    if (id) {
      const rows = await sql`
        SELECT id, topic, context_text, research_text, tags, created_at
        FROM context_saves
        WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
      `;
      if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(rows[0]);
    }

    // 一覧取得
    const rows = await sql`
      SELECT id, topic, context_text, research_text, tags, created_at
      FROM context_saves
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '取得に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id が必須です' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;
    await sql`DELETE FROM context_saves WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}`;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '削除に失敗しました' }, { status: 500 });
  }
}
