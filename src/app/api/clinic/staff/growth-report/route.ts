import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const sql = neon(process.env.DATABASE_URL!);

  const startDate = `${month}-01`;
  const endDate = `${month}-31`;

  const [meetingRows, promotionRows, staffRows] = await Promise.all([
    // 今月の1on1
    sql`SELECT staff_name, meeting_date, mindset_score, motivation_level, growth_stage, achievements, challenges
        FROM one_on_one_meetings
        WHERE meeting_date BETWEEN ${startDate} AND ${endDate}
        ORDER BY staff_name, meeting_date ASC`.catch(() => []),
    // 今月の昇格
    sql`SELECT staff_name, approved_grade, updated_at
        FROM staff_evaluations
        WHERE promotion_approved = true
        AND updated_at::date BETWEEN ${startDate}::date AND ${endDate}::date`.catch(() => []),
    // 全スタッフ
    sql`SELECT name FROM staff WHERE status = 'active'`.catch(() => []),
  ]);

  // 成長ステージアップを検知（今月の最初と最後を比較）
  const stageOrder = ['Lv1知る', 'Lv2わかる', 'Lv3行う', 'Lv4できる', 'Lv5分かち合う'];
  const staffGroups: Record<string, any[]> = {};
  for (const m of (meetingRows as any[])) {
    if (!staffGroups[m.staff_name]) staffGroups[m.staff_name] = [];
    staffGroups[m.staff_name].push(m);
  }

  const stageUps: any[] = [];
  for (const [name, meetings] of Object.entries(staffGroups)) {
    const withStage = meetings.filter(m => m.growth_stage);
    if (withStage.length >= 2) {
      const first = withStage[0].growth_stage;
      const last = withStage[withStage.length - 1].growth_stage;
      if (first !== last && stageOrder.indexOf(last) > stageOrder.indexOf(first)) {
        stageUps.push({ name, from: first, to: last });
      }
    }
  }

  // 平均スコア計算
  const withMindset = (meetingRows as any[]).filter(m => m.mindset_score);
  const avgMindset = withMindset.length > 0
    ? Math.round(withMindset.reduce((s, m) => s + m.mindset_score, 0) / withMindset.length * 10) / 10
    : null;
  const withMotivation = (meetingRows as any[]).filter(m => m.motivation_level);
  const avgMotivation = withMotivation.length > 0
    ? Math.round(withMotivation.reduce((s, m) => s + m.motivation_level, 0) / withMotivation.length * 10) / 10
    : null;

  // スタッフ別ハイライト
  const highlights = Object.entries(staffGroups).map(([name, meetings]) => {
    const last = meetings[meetings.length - 1];
    return {
      name,
      summary: last.achievements ? last.achievements.slice(0, 60) + '...' : '記録あり',
    };
  }).slice(0, 5);

  return NextResponse.json({
    month,
    meetingCount: (meetingRows as any[]).length,
    staffWithMeeting: Object.keys(staffGroups).length,
    avgMindset,
    avgMotivation,
    stageUps,
    promotions: (promotionRows as any[]),
    highlights,
  });
}
