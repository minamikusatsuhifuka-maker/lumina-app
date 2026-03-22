import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    await sql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, plan TEXT DEFAULT 'free', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    await sql`CREATE TABLE IF NOT EXISTS library (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, content TEXT, metadata TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    await sql`CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT, mode TEXT DEFAULT 'blog', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    await sql`CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, topic TEXT NOT NULL, frequency TEXT DEFAULT 'weekly', last_run TIMESTAMP, is_active INTEGER DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    await sql`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, industry TEXT, role TEXT, system_prompt TEXT, is_active INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`;
    return NextResponse.json({ success: true, message: 'DB初期化完了' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
