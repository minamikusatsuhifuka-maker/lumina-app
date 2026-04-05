import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM growth_philosophy ORDER BY created_at DESC LIMIT 1`;
  return NextResponse.json(rows[0] || null);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { title, coreValues, growthModel, winWinVision, powerPartnerDefinition } = await req.json();
  if (!title) return NextResponse.json({ error: 'title は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);

  // 既存レコードがあれば更新、なければ作成
  const existing = await sql`SELECT id FROM growth_philosophy LIMIT 1`;
  if (existing.length > 0) {
    await sql`UPDATE growth_philosophy SET title = ${title}, core_values = ${coreValues}, growth_model = ${growthModel}, win_win_vision = ${winWinVision}, power_partner_definition = ${powerPartnerDefinition}, updated_at = CURRENT_TIMESTAMP WHERE id = ${existing[0].id}`;
    return NextResponse.json({ success: true, id: existing[0].id });
  } else {
    const id = uuidv4();
    await sql`INSERT INTO growth_philosophy (id, title, core_values, growth_model, win_win_vision, power_partner_definition) VALUES (${id}, ${title}, ${coreValues}, ${growthModel}, ${winWinVision}, ${powerPartnerDefinition})`;
    return NextResponse.json({ success: true, id });
  }
}
