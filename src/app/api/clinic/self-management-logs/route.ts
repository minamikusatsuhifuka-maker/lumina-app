import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const staffId = req.nextUrl.searchParams.get('staffId');
  if (!staffId) return NextResponse.json({ error: 'staffId は必須です' }, { status: 400 });

  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  const sql = neon(process.env.DATABASE_URL!);

  if (from && to) {
    const rows = await sql`SELECT * FROM self_management_logs WHERE staff_id = ${staffId} AND log_date >= ${from} AND log_date <= ${to} ORDER BY log_date DESC`;
    return NextResponse.json(rows);
  } else if (from) {
    const rows = await sql`SELECT * FROM self_management_logs WHERE staff_id = ${staffId} AND log_date >= ${from} ORDER BY log_date DESC`;
    return NextResponse.json(rows);
  } else if (to) {
    const rows = await sql`SELECT * FROM self_management_logs WHERE staff_id = ${staffId} AND log_date <= ${to} ORDER BY log_date DESC`;
    return NextResponse.json(rows);
  }

  const rows = await sql`SELECT * FROM self_management_logs WHERE staff_id = ${staffId} ORDER BY log_date DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    staffId, logDate, dailyGoal, achievement, reflection,
    gratitude, tomorrowIntention, moodScore, growthScore,
  } = await req.json();
  if (!staffId || !logDate) return NextResponse.json({ error: 'staffId と logDate は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const id = uuidv4();

  await sql`INSERT INTO self_management_logs (id, staff_id, log_date, daily_goal, achievement, reflection, gratitude, tomorrow_intention, mood_score, growth_score)
    VALUES (${id}, ${staffId}, ${logDate}, ${dailyGoal}, ${achievement}, ${reflection}, ${gratitude}, ${tomorrowIntention}, ${moodScore}, ${growthScore})`;

  return NextResponse.json({ success: true, id });
}
