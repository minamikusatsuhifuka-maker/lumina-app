import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const rows = await sql`SELECT * FROM applicants WHERE id = ${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const a = rows[0];
  return NextResponse.json({
    ...a,
    extracted_data: typeof a.extracted_data === 'string' ? JSON.parse(a.extracted_data) : a.extracted_data,
    scores: typeof a.scores === 'string' ? JSON.parse(a.scores) : a.scores,
    interview_points: typeof a.interview_points === 'string' ? JSON.parse(a.interview_points) : a.interview_points,
    dominant_needs: typeof a.dominant_needs === 'string' ? JSON.parse(a.dominant_needs) : a.dominant_needs,
  });
}
