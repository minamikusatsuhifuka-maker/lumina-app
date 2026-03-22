import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// alertsテーブルを作成（初回のみ）
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    frequency TEXT DEFAULT 'weekly',
    last_run DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const alerts = db.prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC').all((session.user as any).id);
  return NextResponse.json(alerts);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { topic, frequency } = await req.json();
  const id = uuidv4();
  db.prepare('INSERT INTO alerts (id, user_id, topic, frequency) VALUES (?, ?, ?, ?)').run(id, (session.user as any).id, topic, frequency || 'weekly');
  return NextResponse.json({ success: true, id });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  db.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?').run(id, (session.user as any).id);
  return NextResponse.json({ success: true });
}
