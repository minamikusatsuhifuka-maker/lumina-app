import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ model: 'claude' });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT content FROM clinic_decision_criteria
      WHERE title = 'ai_model_preference'
      LIMIT 1
    `;
    return NextResponse.json({ model: rows[0]?.content || 'claude' });
  } catch {
    return NextResponse.json({ model: 'claude' });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { model } = await req.json();

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      INSERT INTO clinic_decision_criteria (title, content, is_active)
      VALUES ('ai_model_preference', ${model}, true)
      ON CONFLICT (title) DO UPDATE SET content = ${model}, updated_at = NOW()
    `;
  } catch {}

  return NextResponse.json({ success: true, model });
}
