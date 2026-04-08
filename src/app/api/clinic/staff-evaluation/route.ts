import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const staffName = searchParams.get('staff_name');

  if (staffName) {
    const evals = await sql`
      SELECT se.*,
        gl.name AS current_grade,
        s.current_grade_id
      FROM staff_evaluations se
      LEFT JOIN staff s ON s.name = se.staff_name
      LEFT JOIN grade_levels gl ON gl.id = s.current_grade_id
      WHERE se.staff_name = ${staffName}
      ORDER BY se.created_at DESC
    `;
    return NextResponse.json(evals);
  }

  const evals = await sql`
    SELECT se.*,
      gl.name AS current_grade,
      s.current_grade_id
    FROM staff_evaluations se
    LEFT JOIN staff s ON s.name = se.staff_name
    LEFT JOIN grade_levels gl ON gl.id = s.current_grade_id
    ORDER BY se.updated_at DESC LIMIT 100
  `;
  return NextResponse.json(evals);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staff_name, period } = await req.json();

  // 1on1からマインドスコアを集計
  let mindsetScore = 0;
  let mindsetDetails: any[] = [];
  try {
    const meetings = await sql`
      SELECT meeting_date, mindset_score, motivation_level, growth_stage, ai_analysis
      FROM one_on_one_meetings
      WHERE staff_name = ${staff_name} AND mindset_score IS NOT NULL
      ORDER BY meeting_date DESC LIMIT 5
    `;
    if (meetings.length > 0) {
      const avg = meetings.reduce((sum: number, m: any) =>
        sum + ((m.mindset_score + m.motivation_level) / 2), 0) / meetings.length;
      mindsetScore = Math.round(avg / 2);
      mindsetDetails = meetings.map((m: any) => ({
        date: m.meeting_date, score: m.mindset_score,
        motivation: m.motivation_level, stage: m.growth_stage,
      }));
    }
  } catch {}

  // 試験結果から知識スコアを集計
  let knowledgeScore = 0;
  let knowledgeDetails: any[] = [];
  try {
    const exams = await sql`
      SELECT e.title, ser.score, ser.created_at
      FROM staff_exam_results ser
      JOIN exams e ON e.id = ser.exam_id
      WHERE ser.staff_id IN (SELECT id FROM staff WHERE name = ${staff_name} LIMIT 1)
      ORDER BY ser.created_at DESC LIMIT 5
    `;
    if (exams.length > 0) {
      const avg = exams.reduce((sum: number, e: any) => sum + (e.score || 0), 0) / exams.length;
      knowledgeScore = Math.round(avg / 4);
      knowledgeDetails = exams;
    }
  } catch {}

  // アンケートからスキルスコアを集計
  let skillScore = 0;
  let skillDetails: any[] = [];
  try {
    const surveys = await sql`
      SELECT s.title, ssr.score, ssr.created_at
      FROM staff_survey_responses ssr
      JOIN surveys s ON s.id = ssr.survey_id
      WHERE ssr.staff_id IN (SELECT id FROM staff WHERE name = ${staff_name} LIMIT 1)
      ORDER BY ssr.created_at DESC LIMIT 5
    `;
    if (surveys.length > 0) {
      const avg = surveys.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / surveys.length;
      skillScore = Math.round(avg / 4);
      skillDetails = surveys;
    }
  } catch {}

  const totalScore = knowledgeScore + skillScore + mindsetScore;
  const recommendedGrade = totalScore >= 85 ? 'G5' :
                           totalScore >= 70 ? 'G4' :
                           totalScore >= 55 ? 'G3' :
                           totalScore >= 40 ? 'G2' : 'G1';
  const bonusRate = totalScore >= 90 ? 30 :
                    totalScore >= 80 ? 20 :
                    totalScore >= 70 ? 15 :
                    totalScore >= 55 ? 10 :
                    totalScore >= 40 ? 5 : 0;

  const existing = await sql`
    SELECT id FROM staff_evaluations
    WHERE staff_name = ${staff_name} AND period = ${period || '2026-Q2'}
    LIMIT 1
  `;

  let result;
  if (existing.length > 0) {
    result = await sql`
      UPDATE staff_evaluations SET
        knowledge_score = ${knowledgeScore}, knowledge_details = ${JSON.stringify(knowledgeDetails)},
        skill_score = ${skillScore}, skill_details = ${JSON.stringify(skillDetails)},
        mindset_score = ${mindsetScore}, mindset_details = ${JSON.stringify(mindsetDetails)},
        total_score = ${totalScore}, recommended_grade = ${recommendedGrade},
        bonus_rate = ${bonusRate},
        updated_at = NOW()
      WHERE id = ${existing[0].id}
      RETURNING *
    `;
  } else {
    result = await sql`
      INSERT INTO staff_evaluations (
        staff_name, period,
        knowledge_score, knowledge_details,
        skill_score, skill_details,
        mindset_score, mindset_details,
        total_score, recommended_grade, bonus_rate
      ) VALUES (
        ${staff_name}, ${period || '2026-Q2'},
        ${knowledgeScore}, ${JSON.stringify(knowledgeDetails)},
        ${skillScore}, ${JSON.stringify(skillDetails)},
        ${mindsetScore}, ${JSON.stringify(mindsetDetails)},
        ${totalScore}, ${recommendedGrade}, ${bonusRate}
      )
      RETURNING *
    `;
  }

  // staffテーブルから現在等級を取得して付与
  const staffRow = await sql`
    SELECT gl.name AS current_grade
    FROM staff s
    LEFT JOIN grade_levels gl ON gl.id = s.current_grade_id
    WHERE s.name = ${staff_name}
    LIMIT 1
  `;
  const currentGrade = staffRow[0]?.current_grade || null;

  return NextResponse.json({ ...result[0], current_grade: currentGrade });
}
