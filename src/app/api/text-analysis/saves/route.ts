import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

// 一覧取得
export async function GET() {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const rows = await sql`
      SELECT id, user_id, file_name, auto_title, analysis_type, analysis_label,
             content, tags, folder, favorite, locked, char_count, created_at, updated_at
      FROM text_analysis_saves
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[text-analysis/saves GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 新規保存
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';
  if (!userId) {
    return NextResponse.json(
      { error: 'ユーザーIDが取得できません' },
      { status: 400 },
    );
  }

  try {
    const body = await req.json();
    // title/categoryは横断分析用、autoTitle/fileName/folderはレガシー互換
    const titleInput = body.title || body.autoTitle || body.fileName || '無題';
    const folder = body.category ?? body.folder ?? '';
    const content = body.content ?? '';
    const tags: string[] = Array.isArray(body.tags) ? body.tags : [];
    const isCross = body.isCrossAnalysis === true;
    const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds : [];
    const crossPrompt = body.crossPrompt ?? null;
    const analysisLabel = body.analysisLabel ?? (isCross ? '横断まとめ' : '概要・要約');

    const rows = await sql`
      INSERT INTO text_analysis_saves
        (user_id, file_name, auto_title, analysis_type, analysis_label,
         content, tags, folder, char_count,
         is_cross_analysis, source_ids, cross_prompt)
      VALUES
        (${userId}, ${titleInput}, ${titleInput},
         ${body.analysisType ?? 'summary'}, ${analysisLabel},
         ${content}, ${tags}, ${folder}, ${content.length},
         ${isCross}, ${JSON.stringify(sourceIds)}, ${crossPrompt})
      RETURNING *
    `;
    return NextResponse.json({ save: rows[0], ...rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[text-analysis/saves POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// カテゴリ操作・お気に入り・削除
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const body = await req.json();
    const { action, ids, id, folder } = body;

    if (action === 'bulk_folder') {
      const idsArray: number[] = Array.isArray(ids) ? ids.map(Number) : [];
      if (idsArray.length === 0) {
        return NextResponse.json({ error: 'idsが空です' }, { status: 400 });
      }
      await sql`
        UPDATE text_analysis_saves
        SET folder = ${folder ?? ''}, updated_at = NOW()
        WHERE id = ANY(${idsArray}) AND user_id = ${userId}
      `;
    } else if (action === 'toggle_favorite') {
      await sql`
        UPDATE text_analysis_saves
        SET favorite = NOT favorite, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
      `;
    } else if (action === 'delete') {
      await sql`
        DELETE FROM text_analysis_saves
        WHERE id = ${id} AND user_id = ${userId}
      `;
    } else if (action === 'rename') {
      await sql`
        UPDATE text_analysis_saves
        SET auto_title = ${body.title ?? ''}, file_name = ${body.title ?? ''}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
      `;
    } else {
      return NextResponse.json({ error: '不正なaction' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[text-analysis/saves PATCH]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 単一削除（DELETE /api/text-analysis/saves?id=123）
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'idが必要です' }, { status: 400 });

    await sql`
      DELETE FROM text_analysis_saves
      WHERE id = ${id} AND user_id = ${userId}
    `;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
