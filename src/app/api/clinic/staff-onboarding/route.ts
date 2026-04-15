import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

const createTables = async () => {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    CREATE TABLE IF NOT EXISTS staff_onboarding (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      staff_id TEXT NOT NULL,
      staff_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      emergency_contact TEXT,
      chatwork_registered BOOLEAN DEFAULT FALSE,
      chatwork_note TEXT,
      freee_registered BOOLEAN DEFAULT FALSE,
      freee_note TEXT,
      qliolock_registered BOOLEAN DEFAULT FALSE,
      qliolock_note TEXT,
      attendance_card_handed BOOLEAN DEFAULT FALSE,
      attendance_card_note TEXT,
      security_card_handed BOOLEAN DEFAULT FALSE,
      security_card_note TEXT,
      key_type TEXT,
      key_handed BOOLEAN DEFAULT FALSE,
      key_note TEXT,
      tax_accountant_submitted BOOLEAN DEFAULT FALSE,
      tax_accountant_note TEXT,
      labor_consultant_submitted BOOLEAN DEFAULT FALSE,
      labor_consultant_note TEXT,
      todos JSONB DEFAULT '[]',
      trainings JSONB DEFAULT '[]',
      ai_summary TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
};

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await createTables();
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM staff_onboarding ORDER BY created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await createTables();
  const sql = neon(process.env.DATABASE_URL!);
  const body = await req.json();
  const { staffId, staffName } = body;
  if (!staffName) return NextResponse.json({ error: 'staffName required' }, { status: 400 });
  const row = await sql`
    INSERT INTO staff_onboarding (staff_id, staff_name)
    VALUES (${staffId || ''}, ${staffName})
    RETURNING *
  `;
  return NextResponse.json(row[0]);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  await sql`
    UPDATE staff_onboarding SET
      staff_name = COALESCE(${fields.staff_name ?? null}, staff_name),
      email = COALESCE(${fields.email ?? null}, email),
      phone = COALESCE(${fields.phone ?? null}, phone),
      emergency_contact = COALESCE(${fields.emergency_contact ?? null}, emergency_contact),
      chatwork_registered = COALESCE(${fields.chatwork_registered ?? null}, chatwork_registered),
      chatwork_note = COALESCE(${fields.chatwork_note ?? null}, chatwork_note),
      freee_registered = COALESCE(${fields.freee_registered ?? null}, freee_registered),
      freee_note = COALESCE(${fields.freee_note ?? null}, freee_note),
      qliolock_registered = COALESCE(${fields.qliolock_registered ?? null}, qliolock_registered),
      qliolock_note = COALESCE(${fields.qliolock_note ?? null}, qliolock_note),
      attendance_card_handed = COALESCE(${fields.attendance_card_handed ?? null}, attendance_card_handed),
      attendance_card_note = COALESCE(${fields.attendance_card_note ?? null}, attendance_card_note),
      security_card_handed = COALESCE(${fields.security_card_handed ?? null}, security_card_handed),
      security_card_note = COALESCE(${fields.security_card_note ?? null}, security_card_note),
      key_type = COALESCE(${fields.key_type ?? null}, key_type),
      key_handed = COALESCE(${fields.key_handed ?? null}, key_handed),
      key_note = COALESCE(${fields.key_note ?? null}, key_note),
      tax_accountant_submitted = COALESCE(${fields.tax_accountant_submitted ?? null}, tax_accountant_submitted),
      tax_accountant_note = COALESCE(${fields.tax_accountant_note ?? null}, tax_accountant_note),
      labor_consultant_submitted = COALESCE(${fields.labor_consultant_submitted ?? null}, labor_consultant_submitted),
      labor_consultant_note = COALESCE(${fields.labor_consultant_note ?? null}, labor_consultant_note),
      todos = COALESCE(${fields.todos ? JSON.stringify(fields.todos) : null}::jsonb, todos),
      trainings = COALESCE(${fields.trainings ? JSON.stringify(fields.trainings) : null}::jsonb, trainings),
      ai_summary = COALESCE(${fields.ai_summary ?? null}, ai_summary),
      notes = COALESCE(${fields.notes ?? null}, notes),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM staff_onboarding WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
