import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const histories = await sql`
    SELECT id, goal, workflow_plan, completed_at
    FROM workflow_histories
    WHERE user_id = ${userId}
    ORDER BY completed_at DESC
    LIMIT 10
  `;

  return NextResponse.json(histories);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as any).id;
  const sql = neon(process.env.DATABASE_URL!);

  const { goal, workflowPlan, stepResults } = await req.json();

  await sql`
    INSERT INTO workflow_histories (user_id, goal, workflow_plan, step_results)
    VALUES (${userId}, ${goal}, ${JSON.stringify(workflowPlan)}, ${JSON.stringify(stepResults)})
  `;

  return NextResponse.json({ ok: true });
}
