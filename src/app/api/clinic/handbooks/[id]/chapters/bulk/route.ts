import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { chapters } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  try {
    await sql`DELETE FROM handbook_chapters WHERE handbook_id = ${id}`;
    for (const ch of chapters) {
      await sql`INSERT INTO handbook_chapters (handbook_id, order_index, title, content) VALUES (${id}, ${ch.orderIndex}, ${ch.title}, ${ch.content})`;
    }
    await sql`UPDATE handbooks SET updated_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
