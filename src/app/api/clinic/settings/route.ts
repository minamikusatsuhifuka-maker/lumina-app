import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS clinic_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

// GET: 全設定を { key: value } 形式で返す
export async function GET() {
  await ensureTable();
  const rows = await sql`SELECT key, value FROM clinic_settings`;
  const result: Record<string, string> = {};
  for (const r of rows as any[]) result[r.key] = r.value;
  return NextResponse.json(result);
}

// POST: key/value を upsert
export async function POST(req: Request) {
  await ensureTable();
  const { key, value } = await req.json();
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 });
  await sql`
    INSERT INTO clinic_settings (key, value, updated_at)
    VALUES (${key}, ${value ?? ''}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return NextResponse.json({ ok: true });
}
