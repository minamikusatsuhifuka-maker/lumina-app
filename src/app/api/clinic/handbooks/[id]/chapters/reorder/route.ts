import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await params;
  const { chapters } = await req.json();
  if (!Array.isArray(chapters)) return NextResponse.json({ error: 'chapters 配列は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  for (const ch of chapters) {
    await sql`UPDATE handbook_chapters SET order_index = ${ch.orderIndex} WHERE id = ${ch.id}`;
  }

  return NextResponse.json({ success: true });
}
