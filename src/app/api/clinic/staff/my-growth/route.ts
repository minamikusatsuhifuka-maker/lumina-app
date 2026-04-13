import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);
  const userName = session.user?.name || '';
  const userEmail = session.user?.email || '';

  // スタッフを特定（名前またはメールで）
  const staffRows = await sql`
    SELECT * FROM staff
    WHERE name = ${userName} OR email = ${userEmail}
    LIMIT 1
  `.catch(() => []);

  if (staffRows.length === 0) {
    return NextResponse.json({ meetings: [], evaluations: [], staff: null });
  }

  const staff = staffRows[0];

  const [meetings, evaluations] = await Promise.all([
    sql`
      SELECT meeting_date, mindset_score, motivation_level, growth_stage,
             achievements, challenges, next_agenda, ai_analysis
      FROM one_on_one_meetings
      WHERE staff_name = ${staff.name as string}
      ORDER BY meeting_date ASC
    `.catch(() => []),
    sql`
      SELECT period, total_score, knowledge_score, skill_score, mindset_score,
             recommended_grade, promotion_approved, approved_grade, ai_comment
      FROM staff_evaluations
      WHERE staff_name = ${staff.name as string}
      ORDER BY period ASC
    `.catch(() => []),
  ]);

  return NextResponse.json({ meetings, evaluations, staff });
}
