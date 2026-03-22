import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();
    if (!email || !password || !name)
      return NextResponse.json({ error: '全項目を入力してください' }, { status: 400 });
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email))
      return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 400 });
    const hash = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').run(uuidv4(), email, name, hash);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
