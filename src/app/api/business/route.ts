import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

interface ProjectPostBody {
  title?: string;
}

interface ProjectPatchBody {
  id: number;
  title?: string;
  phase?: string;
  messages?: unknown[];
  businessModel?: Record<string, unknown>;
  targetMarket?: Record<string, unknown>;
  marketingStrategy?: Record<string, unknown>;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  try {
    if (id) {
      const projectRows = await sql`
        SELECT * FROM business_projects
        WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
      `;
      const assetRows = await sql`
        SELECT * FROM business_assets
        WHERE project_id = ${parseInt(id, 10)} AND user_id = ${userId}
        ORDER BY created_at DESC
      `;
      return NextResponse.json({
        project: projectRows[0] ?? null,
        assets: assetRows,
      });
    }

    const projects = await sql`
      SELECT id, title, description, phase, status, created_at, updated_at
      FROM business_projects
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
      LIMIT 20
    `;
    return NextResponse.json({ projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = (await req.json()) as ProjectPostBody;
    const title = body.title ?? '新しい事業プロジェクト';

    const rows = await sql`
      INSERT INTO business_projects (title, user_id)
      VALUES (${title}, ${userId})
      RETURNING *
    `;
    return NextResponse.json({ project: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = (await req.json()) as ProjectPatchBody;
    const {
      id,
      title,
      phase,
      messages,
      businessModel,
      targetMarket,
      marketingStrategy,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'idは必須です' }, { status: 400 });
    }

    const messagesJson =
      messages !== undefined ? JSON.stringify(messages) : null;
    const bmJson =
      businessModel !== undefined ? JSON.stringify(businessModel) : null;
    const tmJson =
      targetMarket !== undefined ? JSON.stringify(targetMarket) : null;
    const msJson =
      marketingStrategy !== undefined
        ? JSON.stringify(marketingStrategy)
        : null;

    const rows = await sql`
      UPDATE business_projects SET
        title = COALESCE(${title ?? null}, title),
        phase = COALESCE(${phase ?? null}, phase),
        messages = COALESCE(${messagesJson}::jsonb, messages),
        business_model = COALESCE(${bmJson}::jsonb, business_model),
        target_market = COALESCE(${tmJson}::jsonb, target_market),
        marketing_strategy = COALESCE(${msJson}::jsonb, marketing_strategy),
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *
    `;
    return NextResponse.json({ project: rows[0] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'idは必須です' }, { status: 400 });
    }

    await sql`
      DELETE FROM business_projects
      WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
