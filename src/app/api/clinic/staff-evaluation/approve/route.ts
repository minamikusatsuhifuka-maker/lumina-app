import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { evaluationId, staffName, approvedGrade } = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  await sql`
    UPDATE staff_evaluations SET
      promotion_approved = true,
      approved_at = NOW(),
      approved_grade = ${approvedGrade},
      updated_at = NOW()
    WHERE id = ${evaluationId}
  `;

  try {
    await sql`
      INSERT INTO grade_histories (staff_id, grade, changed_at, reason)
      SELECT s.id, ${approvedGrade}, NOW(), '評価による昇格承認'
      FROM staff s WHERE s.name = ${staffName} LIMIT 1
    `;
  } catch {}

  return NextResponse.json({ success: true });
}
