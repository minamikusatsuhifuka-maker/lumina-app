import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);

  const [staffRows, meetingRows, evalRows] = await Promise.all([
    // スタッフ一覧（等級情報含む）
    sql`
      SELECT
        s.id, s.name, s.position, s.hired_at, s.status,
        COALESCE(gl.position, '') || ' G' || COALESCE(gl.level_number::text, '') AS current_grade_label,
        gl.level_number AS grade_level_number,
        gl.name AS grade_name
      FROM staff s
      LEFT JOIN grade_levels gl ON gl.id = s.current_grade_id
      WHERE s.status = 'active'
      ORDER BY gl.level_number DESC NULLS LAST, s.name ASC
    `,
    // 直近1on1（スタッフ別最新）
    sql`
      SELECT DISTINCT ON (staff_name)
        staff_name, meeting_date, mindset_score, motivation_level, growth_stage
      FROM one_on_one_meetings
      ORDER BY staff_name, meeting_date DESC
    `,
    // 最新評価（スタッフ別）
    sql`
      SELECT DISTINCT ON (staff_name)
        staff_name, total_score, knowledge_score, skill_score, mindset_score as eval_mindset,
        recommended_grade, promotion_approved
      FROM staff_evaluations
      ORDER BY staff_name, updated_at DESC
    `,
  ]);

  // スタッフごとにデータをマージ
  const summary = (staffRows as any[]).map(s => {
    const meeting = (meetingRows as any[]).find(m => m.staff_name === s.name);
    const eval_ = (evalRows as any[]).find(e => e.staff_name === s.name);

    // 在籍期間
    const hiredDays = s.hired_at
      ? Math.floor((Date.now() - new Date(s.hired_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // 最終1on1からの経過日数
    const lastMeetingDays = meeting?.meeting_date
      ? Math.floor((Date.now() - new Date(meeting.meeting_date).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      ...s,
      last_meeting_date: meeting?.meeting_date || null,
      last_meeting_days: lastMeetingDays,
      last_mindset_score: meeting?.mindset_score || null,
      last_motivation: meeting?.motivation_level || null,
      last_growth_stage: meeting?.growth_stage || null,
      total_score: eval_?.total_score || null,
      knowledge_score: eval_?.knowledge_score || null,
      skill_score: eval_?.skill_score || null,
      eval_mindset: eval_?.eval_mindset || null,
      recommended_grade: eval_?.recommended_grade || null,
      promotion_approved: eval_?.promotion_approved || false,
      hired_days: hiredDays,
    };
  });

  // 等級分布
  const gradeDistribution = [1, 2, 3, 4, 5].map(level => ({
    grade: `G${level}`,
    count: summary.filter(s => s.grade_level_number === level).length,
  }));

  // 要注意スタッフ（30日以上1on1なし）
  const needsAttention = summary.filter(s => s.last_meeting_days === null || s.last_meeting_days > 30);

  return NextResponse.json({ summary, gradeDistribution, needsAttention });
}
