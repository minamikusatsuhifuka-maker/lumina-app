import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

// 知識ツリーノードの取得・登録・削除API

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const rows = await sql`
      SELECT * FROM knowledge_nodes
      WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
    `;
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ node: rows[0] });
  }

  const nodes = await sql`
    SELECT * FROM knowledge_nodes
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
  `;
  return NextResponse.json({ nodes });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { parentId, topic, sourceType, summary, depth, suggestedTitles } = await req.json();
    if (!topic || !sourceType) {
      return NextResponse.json({ error: 'topic と sourceType が必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    // parentId が指定されている場合は所有権チェック
    let validParentId: number | null = null;
    if (parentId) {
      const pid = typeof parentId === 'string' ? parseInt(parentId, 10) : parentId;
      if (!isNaN(pid)) {
        const owns = await sql`
          SELECT id FROM knowledge_nodes WHERE id = ${pid} AND user_id = ${userId}
        `;
        if (owns.length > 0) validParentId = pid;
      }
    }

    const rows = await sql`
      INSERT INTO knowledge_nodes
        (user_id, parent_id, topic, source_type, summary, depth, suggested_titles)
      VALUES (
        ${userId},
        ${validParentId},
        ${topic},
        ${sourceType},
        ${summary || null},
        ${depth || 0},
        ${JSON.stringify(suggestedTitles || [])}
      )
      RETURNING *
    `;
    return NextResponse.json({ node: rows[0] });
  } catch (e: any) {
    console.error('[knowledge/nodes POST] エラー:', e);
    return NextResponse.json({ error: e?.message || '登録に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const userId = (session.user as any).id;
  await sql`DELETE FROM knowledge_nodes WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}`;
  return NextResponse.json({ success: true });
}
