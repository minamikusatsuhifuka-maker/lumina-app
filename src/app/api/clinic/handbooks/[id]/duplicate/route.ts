import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const sql = neon(process.env.DATABASE_URL!);

  const origRows = await sql`SELECT * FROM handbooks WHERE id = ${id}`;
  if (!origRows[0]) return NextResponse.json({ error: '見つかりません' }, { status: 404 });

  const newId = uuidv4();
  await sql`INSERT INTO handbooks (id, title, description, status) VALUES (${newId}, ${origRows[0].title + ' のコピー'}, ${origRows[0].description || ''}, 'draft')`;

  const chapters = await sql`SELECT * FROM handbook_chapters WHERE handbook_id = ${id} ORDER BY order_index`;
  for (const ch of chapters) {
    const chId = uuidv4();
    await sql`INSERT INTO handbook_chapters (id, handbook_id, order_index, title, content) VALUES (${chId}, ${newId}, ${ch.order_index}, ${ch.title}, ${ch.content})`;
  }

  return NextResponse.json({ success: true, id: newId });
}
