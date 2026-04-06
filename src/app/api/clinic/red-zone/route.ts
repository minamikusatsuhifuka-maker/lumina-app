import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM red_zone_rules ORDER BY zone_type ASC, category ASC, created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const title = body.title?.trim();
  const description = body.description?.trim() || title || '';
  const category = body.category?.trim() || 'attitude';
  const { severity, consequence, zone_type, improvement_period, legal_basis, official_statement } = body;

  if (!title) {
    return NextResponse.json({ error: 'title は必須です' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // CHECK制約があれば削除（一度だけ実行、エラーは無視）
  try { await sql`ALTER TABLE red_zone_rules DROP CONSTRAINT IF EXISTS red_zone_rules_zone_check`; } catch {}
  try { await sql`ALTER TABLE red_zone_rules DROP CONSTRAINT IF EXISTS red_zone_rules_zone_type_check`; } catch {}
  try { await sql`ALTER TABLE red_zone_rules DROP CONSTRAINT IF EXISTS red_zone_rules_category_check`; } catch {}

  const rows = await sql`INSERT INTO red_zone_rules
    (category, title, description, severity, consequence, zone_type, improvement_period, legal_basis, official_statement)
    VALUES (${category}, ${title}, ${description}, ${severity || 'critical'}, ${consequence || null},
            ${zone_type || 'red'}, ${improvement_period || null}, ${legal_basis || null}, ${official_statement || null})
    RETURNING id`;

  return NextResponse.json({ success: true, id: rows[0].id });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, title, description, consequence, official_statement, legal_basis, improvement_period } = body;
  if (!id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    UPDATE red_zone_rules SET
      title = ${title ?? null},
      description = ${description ?? null},
      consequence = ${consequence ?? null},
      official_statement = ${official_statement ?? null},
      legal_basis = ${legal_basis ?? null},
      improvement_period = ${improvement_period ?? null}
    WHERE id = ${id}
  `;
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM red_zone_rules WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
