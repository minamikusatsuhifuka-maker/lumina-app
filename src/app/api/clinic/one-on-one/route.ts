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
    const meetings = await sql`
      SELECT * FROM one_on_one_meetings
      WHERE staff_name = ${staffName}
      ORDER BY meeting_date DESC
    `;
    return NextResponse.json(meetings);
  }

  const meetings = await sql`
    SELECT * FROM one_on_one_meetings
    ORDER BY meeting_date DESC
    LIMIT 50
  `;
  return NextResponse.json(meetings);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    staff_name, staff_id, meeting_date,
    goals, discussion, achievements, challenges, action_items,
    next_meeting_date,
  } = body;

  const result = await sql`
    INSERT INTO one_on_one_meetings (
      staff_name, staff_id, meeting_date,
      goals, discussion, achievements, challenges, action_items,
      next_meeting_date
    ) VALUES (
      ${staff_name}, ${staff_id || null}, ${meeting_date},
      ${goals || ''}, ${discussion || ''}, ${achievements || ''},
      ${challenges || ''}, ${action_items || ''},
      ${next_meeting_date || null}
    )
    RETURNING *
  `;
  return NextResponse.json(result[0]);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  await sql`DELETE FROM one_on_one_meetings WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
