import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { neon } from '@neondatabase/serverless';

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();
    if (!email || !password || !name)
      return NextResponse.json({ error: '全項目を入力してください' }, { status: 400 });
    const sql = neon(process.env.DATABASE_URL!);
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0)
      return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 400 });
    const hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    await sql`INSERT INTO users (id, email, name, password_hash) VALUES (${id}, ${email}, ${name}, ${hash})`;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
