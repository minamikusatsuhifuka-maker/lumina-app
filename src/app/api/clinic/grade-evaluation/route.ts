import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sql = neon(process.env.DATABASE_URL!);
  const { searchParams } = new URL(req.url);
  const gradeLevelId = searchParams.get('gradeLevelId');

  if (gradeLevelId) {
    const rows = await sql`SELECT * FROM grade_evaluation_framework WHERE grade_level_id = ${gradeLevelId} LIMIT 1`;
    return NextResponse.json(rows[0] || null);
  }

  const rows = await sql`SELECT * FROM grade_evaluation_framework ORDER BY grade_level ASC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { gradeLevelId, gradeLevel, knowledgeWeight, skillWeight, mindsetWeight, knowledgeCriteria, skillCriteria, mindsetCriteria, promotionRequirements, demotionRequirements, requiredLearning, requiredCertifications, promotionExam } = body;

  if (!gradeLevelId || gradeLevel === undefined) {
    return NextResponse.json({ error: 'gradeLevelId と gradeLevel は必須です' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // 既存があれば更新
  const existing = await sql`SELECT id FROM grade_evaluation_framework WHERE grade_level_id = ${gradeLevelId}`;
  if (existing.length > 0) {
    await sql`UPDATE grade_evaluation_framework SET
      knowledge_weight = ${knowledgeWeight ?? 25},
      skill_weight = ${skillWeight ?? 25},
      mindset_weight = ${mindsetWeight ?? 50},
      knowledge_criteria = ${JSON.stringify(knowledgeCriteria) ?? null},
      skill_criteria = ${JSON.stringify(skillCriteria) ?? null},
      mindset_criteria = ${JSON.stringify(mindsetCriteria) ?? null},
      promotion_requirements = ${JSON.stringify(promotionRequirements) ?? null},
      demotion_requirements = ${JSON.stringify(demotionRequirements) ?? null},
      required_learning = ${JSON.stringify(requiredLearning) ?? null},
      required_certifications = ${JSON.stringify(requiredCertifications) ?? null},
      promotion_exam = ${JSON.stringify(promotionExam) ?? null},
      updated_at = NOW()
    WHERE grade_level_id = ${gradeLevelId}`;
    return NextResponse.json({ success: true, id: existing[0].id });
  }

  const rows = await sql`INSERT INTO grade_evaluation_framework
    (grade_level_id, grade_level, knowledge_weight, skill_weight, mindset_weight, knowledge_criteria, skill_criteria, mindset_criteria, promotion_requirements, demotion_requirements, required_learning, required_certifications, promotion_exam)
    VALUES (${gradeLevelId}, ${gradeLevel}, ${knowledgeWeight ?? 25}, ${skillWeight ?? 25}, ${mindsetWeight ?? 50}, ${JSON.stringify(knowledgeCriteria) ?? null}, ${JSON.stringify(skillCriteria) ?? null}, ${JSON.stringify(mindsetCriteria) ?? null}, ${JSON.stringify(promotionRequirements) ?? null}, ${JSON.stringify(demotionRequirements) ?? null}, ${JSON.stringify(requiredLearning) ?? null}, ${JSON.stringify(requiredCertifications) ?? null}, ${JSON.stringify(promotionExam) ?? null})
    RETURNING id`;

  return NextResponse.json({ success: true, id: rows[0].id });
}
