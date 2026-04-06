import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const applicants = await sql`
    SELECT id, name, position, status, total_score, recommendation,
           dominant_needs, personality_summary, created_at
    FROM applicants
    ORDER BY created_at DESC
  `;
  return NextResponse.json(applicants);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, status } = body;
  await sql`UPDATE applicants SET status = ${status}, updated_at = NOW() WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  await sql`DELETE FROM applicants WHERE id = ${id}`;
  return NextResponse.json({ success: true });
}
