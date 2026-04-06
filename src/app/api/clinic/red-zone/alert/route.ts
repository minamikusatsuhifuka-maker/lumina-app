import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { staff_id, zone, rule_id, incident_description, occurred_at } = body;
  if (!staff_id || !zone || !incident_description) {
    return NextResponse.json({ error: 'staff_id, zone, incident_description は必須です' }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();
  const noteType = zone === 'red' ? 'red_zone_incident' : 'yellow_zone_incident';
  const title = zone === 'red' ? '🔴 レッドゾーン該当事案' : '🟡 イエローゾーン該当事案';

  await sql`
    INSERT INTO staff_notes (id, staff_id, type, title, content, author_name)
    VALUES (
      ${id},
      ${staff_id},
      ${noteType},
      ${title},
      ${JSON.stringify({ rule_id, incident_description, occurred_at: occurred_at || new Date().toISOString(), zone })},
      ${(session as any).user?.name || '管理者'}
    )
  `;

  return NextResponse.json({ success: true, id });
}
