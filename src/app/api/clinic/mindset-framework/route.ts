import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sql = neon(process.env.DATABASE_URL!);

  const gradeLevel = req.nextUrl.searchParams.get('gradeLevel');
  const position = req.nextUrl.searchParams.get('position');

  if (gradeLevel && position) {
    const rows = await sql`SELECT * FROM mindset_growth_framework WHERE grade_level = ${gradeLevel} AND position = ${position} ORDER BY grade_level, core_value`;
    return NextResponse.json(rows);
  } else if (gradeLevel) {
    const rows = await sql`SELECT * FROM mindset_growth_framework WHERE grade_level = ${gradeLevel} ORDER BY grade_level, core_value`;
    return NextResponse.json(rows);
  } else if (position) {
    const rows = await sql`SELECT * FROM mindset_growth_framework WHERE position = ${position} ORDER BY grade_level, core_value`;
    return NextResponse.json(rows);
  }

  const rows = await sql`SELECT * FROM mindset_growth_framework ORDER BY grade_level, core_value`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const sql = neon(process.env.DATABASE_URL!);

  // バルクインサート対応
  if (body.items && Array.isArray(body.items)) {
    const ids: string[] = [];
    for (const item of body.items) {
      const id = uuidv4();
      await sql`INSERT INTO mindset_growth_framework (id, grade_level, position, core_value, stage_description, behavioral_indicators, growth_actions, assessment_criteria)
        VALUES (${id}, ${item.gradeLevel}, ${item.position || null}, ${item.coreValue}, ${item.stageDescription || null}, ${item.behavioralIndicators || null}, ${item.growthActions || null}, ${item.assessmentCriteria || null})`;
      ids.push(id);
    }
    return NextResponse.json({ success: true, ids });
  }

  const { gradeLevel, position, coreValue, stageDescription, behavioralIndicators, growthActions, assessmentCriteria } = body;
  if (!gradeLevel || !coreValue) return NextResponse.json({ error: 'gradeLevel と coreValue は必須です' }, { status: 400 });

  const id = uuidv4();
  await sql`INSERT INTO mindset_growth_framework (id, grade_level, position, core_value, stage_description, behavioral_indicators, growth_actions, assessment_criteria)
    VALUES (${id}, ${gradeLevel}, ${position || null}, ${coreValue}, ${stageDescription || null}, ${behavioralIndicators || null}, ${growthActions || null}, ${assessmentCriteria || null})`;

  return NextResponse.json({ success: true, id });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, stageDescription, behavioralIndicators, growthActions } = await req.json();
  if (!id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    UPDATE mindset_growth_framework
    SET
      stage_description = ${stageDescription},
      behavioral_indicators = ${behavioralIndicators},
      growth_actions = ${growthActions},
      updated_at = NOW()
    WHERE id = ${id}
  `;
  return NextResponse.json({ success: true });
}
