import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { staffId, answers } = body;
  if (!staffId || !answers) return NextResponse.json({ error: 'staffId と answers は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const responseId = uuidv4();
  await sql`INSERT INTO staff_survey_responses (id, survey_id, staff_id, answers)
    VALUES (${responseId}, ${id}, ${staffId}, ${JSON.stringify(answers)})`;

  return NextResponse.json({ success: true, id: responseId });
}
