import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import db from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(db.prepare('SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC').all((session.user as any).id));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { title, content, mode } = await req.json();
  const id = uuidv4();
  db.prepare('INSERT INTO drafts (id, user_id, title, content, mode) VALUES (?, ?, ?, ?, ?)').run(id, (session.user as any).id, title, content || '', mode || 'blog');
  return NextResponse.json({ success: true, id });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, title, content } = await req.json();
  db.prepare('UPDATE drafts SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').run(title, content, id, (session.user as any).id);
  return NextResponse.json({ success: true });
}
