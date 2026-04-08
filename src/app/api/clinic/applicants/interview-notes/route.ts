import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

const sql = neon(process.env.DATABASE_URL!);

// テーブルを自動作成
async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS applicant_interview_notes (
      id TEXT PRIMARY KEY,
      applicant_id TEXT NOT NULL,
      interview_date DATE,
      interviewer TEXT,
      note TEXT,
      ai_comment TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureTable();
  const { searchParams } = new URL(req.url);
  const applicantId = searchParams.get('applicantId');
  if (!applicantId) return NextResponse.json({ error: 'applicantId required' }, { status: 400 });

  const rows = await sql`
    SELECT * FROM applicant_interview_notes
    WHERE applicant_id = ${applicantId}
    ORDER BY interview_date DESC, created_at DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureTable();
  const { applicantId, interviewDate, interviewer, note } = await req.json();
  if (!applicantId || !note) return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });

  const id = uuidv4();
  await sql`
    INSERT INTO applicant_interview_notes (id, applicant_id, interview_date, interviewer, note)
    VALUES (${id}, ${applicantId}, ${interviewDate || null}, ${interviewer || ''}, ${note})
  `;
  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, aiComment } = await req.json();
  await sql`
    UPDATE applicant_interview_notes SET ai_comment = ${aiComment}, updated_at = NOW() WHERE id = ${id}
  `;
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await sql`DELETE FROM applicant_interview_notes WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
