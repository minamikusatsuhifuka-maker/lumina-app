import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { PIPELINES } from '@/lib/pipelines';

export const runtime = 'nodejs';

interface OrchestratorPostBody {
  intent: string;
  pipelineType?: string;
  enabledStepIds?: string[];
}

const detectPipelineType = (intent: string): string => {
  for (const pipeline of PIPELINES) {
    if (pipeline.triggerKeywords.some((kw) => intent.includes(kw))) {
      return pipeline.id;
    }
  }
  return 'custom';
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = (await req.json()) as OrchestratorPostBody;
    const { intent, pipelineType: forcedType, enabledStepIds } = body;
    if (!intent?.trim()) {
      return NextResponse.json(
        { error: 'intentは必須です' },
        { status: 400 },
      );
    }

    const pipelineType = forcedType ?? detectPipelineType(intent);
    const pipeline = PIPELINES.find((p) => p.id === pipelineType);

    if (!pipeline) {
      return NextResponse.json(
        { error: '対応するパイプラインが見つかりません' },
        { status: 400 },
      );
    }

    // 有効ステップのフィルタリング（未指定なら全て有効）
    const filteredSteps =
      Array.isArray(enabledStepIds) && enabledStepIds.length > 0
        ? pipeline.steps.filter((s) => enabledStepIds.includes(s.id))
        : pipeline.steps;

    const initialSteps = filteredSteps.map((s) => ({
      id: s.id,
      label: s.label,
      status: 'pending' as const,
      result: null,
    }));

    const rows = await sql`
      INSERT INTO pipeline_jobs
        (user_id, intent, pipeline_type, status, steps, progress)
      VALUES (
        ${userId}, ${intent}, ${pipelineType}, 'planning',
        ${JSON.stringify(initialSteps)}::jsonb,
        0
      )
      RETURNING *
    `;

    return NextResponse.json({
      job: rows[0],
      pipeline: { ...pipeline, steps: filteredSteps },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const rows = await sql`
        SELECT * FROM pipeline_jobs
        WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
      `;
      return NextResponse.json({ job: rows[0] ?? null });
    }

    const jobs = await sql`
      SELECT * FROM pipeline_jobs
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 20
    `;
    return NextResponse.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
