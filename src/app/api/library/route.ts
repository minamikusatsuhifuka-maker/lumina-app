import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import db from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(db.prepare('SELECT * FROM library WHERE user_id = ? ORDER BY created_at DESC').all((session.user as any).id));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { type, title, content, metadata } = await req.json();
  const id = uuidv4();
  db.prepare('INSERT INTO library (id, user_id, type, title, content, metadata) VALUES (?, ?, ?, ?, ?, ?)').run(id, (session.user as any).id, type, title, content || '', JSON.stringify(metadata || {}));
  return NextResponse.json({ success: true, id });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  db.prepare('DELETE FROM library WHERE id = ? AND user_id = ?').run(id, (session.user as any).id);
  return NextResponse.json({ success: true });
}
