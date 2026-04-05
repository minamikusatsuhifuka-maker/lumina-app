import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const staffId = req.nextUrl.searchParams.get('staffId');
  if (!staffId) return NextResponse.json({ error: 'staffId は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT * FROM personal_growth_plans WHERE staff_id = ${staffId} ORDER BY created_at DESC LIMIT 1`;
  return NextResponse.json(rows[0] || null);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    staffId, lifeVision, personalMission, coreValues, selfLoveNotes,
    strengthDiscovery, shortTermGoals, longTermGoals, organizationAlignment, powerPartners,
  } = await req.json();
  if (!staffId) return NextResponse.json({ error: 'staffId は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);

  // 既存レコードがあれば更新、なければ作成
  const existing = await sql`SELECT id FROM personal_growth_plans WHERE staff_id = ${staffId} LIMIT 1`;
  if (existing.length > 0) {
    await sql`UPDATE personal_growth_plans SET
      life_vision = ${lifeVision},
      personal_mission = ${personalMission},
      core_values = ${coreValues},
      self_love_notes = ${selfLoveNotes},
      strength_discovery = ${strengthDiscovery},
      short_term_goals = ${shortTermGoals},
      long_term_goals = ${longTermGoals},
      organization_alignment = ${organizationAlignment},
      power_partners = ${powerPartners},
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ${existing[0].id}`;
    return NextResponse.json({ success: true, id: existing[0].id });
  } else {
    const id = uuidv4();
    await sql`INSERT INTO personal_growth_plans (id, staff_id, life_vision, personal_mission, core_values, self_love_notes, strength_discovery, short_term_goals, long_term_goals, organization_alignment, power_partners)
      VALUES (${id}, ${staffId}, ${lifeVision}, ${personalMission}, ${coreValues}, ${selfLoveNotes}, ${strengthDiscovery}, ${shortTermGoals}, ${longTermGoals}, ${organizationAlignment}, ${powerPartners})`;
    return NextResponse.json({ success: true, id });
  }
}
