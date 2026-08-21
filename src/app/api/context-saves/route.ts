import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { sanitizeForDb } from '@/lib/sanitize';
import {
  detachItemFromFolders,
  ensureCustomFolderTables,
  getFolderIdsForItems,
} from '@/lib/custom-folders';

// AI背景情報コンテキストの保存・取得・削除・お気に入りAPI

// お気に入りカラムを冪等に用意（ADD COLUMN IF NOT EXISTS、既存データは非破壊）。
// ※テキスト分析(text_analysis_saves)のお気に入りとは別テーブル＝完全に独立管理。
// プロセス内で1回だけ実行（リクエスト毎の ALTER を避ける）。
let favoriteColumnReady: Promise<unknown> | null = null;
function ensureFavoriteColumn() {
  if (!favoriteColumnReady) {
    const sql = neon(process.env.DATABASE_URL!);
    favoriteColumnReady = (async () => {
      await sql`ALTER TABLE context_saves ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false`;
      await sql`ALTER TABLE context_saves ADD COLUMN IF NOT EXISTS favorited_at TIMESTAMPTZ`;
    })().catch((e) => {
      // 失敗時は次回再試行できるようリセット
      favoriteColumnReady = null;
      throw e;
    });
  }
  return favoriteColumnReady;
}

// カテゴリカラムを冪等に用意（既にAI背景情報保存 /api/context 側で使用中のカラムを流用。
// 未マイグレーション環境向けの保険として ADD COLUMN IF NOT EXISTS を用意）。
let categoryColumnReady: Promise<unknown> | null = null;
function ensureCategoryColumn() {
  if (!categoryColumnReady) {
    const sql = neon(process.env.DATABASE_URL!);
    categoryColumnReady = (async () => {
      await sql`ALTER TABLE context_saves ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'`;
    })().catch((e) => {
      categoryColumnReady = null;
      throw e;
    });
  }
  return categoryColumnReady;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { topic, contextText, researchText, tags } = await req.json();
    if (!topic || !contextText) {
      return NextResponse.json({ error: 'topic と contextText は必須です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;
    const tagArr: string[] = Array.isArray(tags) ? tags : [];

    const result = await sql`
      INSERT INTO context_saves (user_id, topic, context_text, research_text, tags)
      VALUES (${userId}, ${sanitizeForDb(topic)}, ${sanitizeForDb(contextText)}, ${researchText ? sanitizeForDb(researchText) : null}, ${tagArr})
      RETURNING id
    `;
    return NextResponse.json({ success: true, id: result[0].id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '保存に失敗しました' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const sql = neon(process.env.DATABASE_URL!);
    await ensureFavoriteColumn();
    await ensureCategoryColumn();
    // 249: カスタムフォルダ（お気に入りの手動分類）。一覧の絞り込みで参照するため先に用意する
    await ensureCustomFolderTables();
    const userId = (session.user as any).id;

    // 単一取得
    if (id) {
      const rows = await sql`
        SELECT id, topic, context_text, research_text, tags, created_at, is_favorite, favorited_at,
               COALESCE(category, 'general') AS category
        FROM context_saves
        WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}
      `;
      if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(rows[0]);
    }

    // タグフィルタ（バッチリサーチ結果取得用、created_at ASC で実行順）
    const tagFilter = searchParams.get('tag');
    if (tagFilter) {
      const rows = await sql`
        SELECT id, topic, context_text, research_text, tags, created_at, is_favorite, favorited_at,
               COALESCE(category, 'general') AS category
        FROM context_saves
        WHERE user_id = ${userId} AND ${tagFilter} = ANY(tags)
        ORDER BY created_at ASC
      `;
      return NextResponse.json(rows);
    }

    // 一覧取得（175: 全件到達可能なページング方式）
    // - 並び順は created_at DESC に統一（新規保存が必ず先頭に来る）
    // - 検索(q)・タグ(filterTag)・お気に入り(favorite=1)・カテゴリ(category)は全件を母数にサーバ側で絞る
    // - 一覧は本文(context_text/research_text)を返さず char_count のみ（開いた時に ?id= で単体取得）
    // - total_count: フィルタ条件での総件数 / all_total・categories・all_tags: 全件母数（カテゴリ概要・タグ一覧用）
    const qRaw = searchParams.get('q');
    const qLike = qRaw && qRaw.trim() ? `%${qRaw.trim()}%` : null;
    const tagV = searchParams.get('filterTag')?.trim() || null;
    const favV = searchParams.get('favorite') === '1' ? true : null;
    const catV = searchParams.get('category')?.trim() || null;

    // 192: タグの複数指定＋AND/OR。filterTags=a&filterTags=b（1タグ1パラメータ）& tagMode=and|or（既定 or）。
    // 旧 filterTag（単一）はそのまま互換維持。カテゴリは1件1つのためAND対象にしない
    // （カテゴリ×タグ×q は各条件のANDで組み合わせる）。
    const multiTags = searchParams
      .getAll('filterTags')
      .map((s) => s.trim())
      .filter(Boolean);
    const tagMode = searchParams.get('tagMode') === 'and' ? 'and' : 'or';
    // AND は tags @> 配列（すべて含む）、OR は tags && 配列（いずれか含む）。
    // 片方だけ非NULLにしてパラメータ化SQLの形を保つ。
    const tagsAnd = multiTags.length > 0 && tagMode === 'and' ? multiTags : null;
    const tagsOr = multiTags.length > 0 && tagMode === 'or' ? multiTags : null;

    // 249: カスタムフォルダでの絞り込み。cfolder=<id> でそのフォルダ、
    // cfolder=unfiled で「お気に入りだがどのフォルダにも入っていない」を表す。
    // 自動カテゴリ(category)とは独立した条件で、他のフィルタとはANDで組み合わさる。
    const cfolderRaw = searchParams.get('cfolder')?.trim() || '';
    const cfolderUnfiled = cfolderRaw === 'unfiled' ? true : null;
    const cfolderId =
      cfolderRaw && cfolderRaw !== 'unfiled' && Number.isFinite(Number(cfolderRaw))
        ? Number(cfolderRaw)
        : null;

    const [rows, countRows, catRows, tagRows] = await Promise.all([
      sql`
        SELECT id, topic, tags, created_at, is_favorite, favorited_at,
               COALESCE(category, 'general') AS category,
               LENGTH(context_text) AS char_count
        FROM context_saves
        WHERE user_id = ${userId}
          AND (${qLike}::text IS NULL OR topic ILIKE ${qLike} OR context_text ILIKE ${qLike})
          AND (${tagV}::text IS NULL OR ${tagV} = ANY(tags))
          AND (${tagsAnd}::text[] IS NULL OR tags @> ${tagsAnd})
          AND (${tagsOr}::text[] IS NULL OR tags && ${tagsOr})
          AND (${favV}::boolean IS NULL OR is_favorite = ${favV})
          AND (${catV}::text IS NULL OR COALESCE(category, 'general') = ${catV})
          AND (${cfolderId}::int IS NULL OR EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_id = context_saves.id
                   AND i.user_id = context_saves.user_id
                   AND i.scope = 'context'
                   AND i.folder_id = ${cfolderId}))
          AND (${cfolderUnfiled}::boolean IS NULL OR (is_favorite = true AND NOT EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_id = context_saves.id
                   AND i.user_id = context_saves.user_id
                   AND i.scope = 'context')))
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS n
        FROM context_saves
        WHERE user_id = ${userId}
          AND (${qLike}::text IS NULL OR topic ILIKE ${qLike} OR context_text ILIKE ${qLike})
          AND (${tagV}::text IS NULL OR ${tagV} = ANY(tags))
          AND (${tagsAnd}::text[] IS NULL OR tags @> ${tagsAnd})
          AND (${tagsOr}::text[] IS NULL OR tags && ${tagsOr})
          AND (${favV}::boolean IS NULL OR is_favorite = ${favV})
          AND (${catV}::text IS NULL OR COALESCE(category, 'general') = ${catV})
          AND (${cfolderId}::int IS NULL OR EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_id = context_saves.id
                   AND i.user_id = context_saves.user_id
                   AND i.scope = 'context'
                   AND i.folder_id = ${cfolderId}))
          AND (${cfolderUnfiled}::boolean IS NULL OR (is_favorite = true AND NOT EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_id = context_saves.id
                   AND i.user_id = context_saves.user_id
                   AND i.scope = 'context')))
      `,
      sql`
        SELECT COALESCE(category, 'general') AS category, COUNT(*)::int AS count
        FROM context_saves
        WHERE user_id = ${userId}
        GROUP BY 1
        ORDER BY 2 DESC
      `,
      sql`
        SELECT DISTINCT t.tag
        FROM context_saves, LATERAL unnest(tags) AS t(tag)
        WHERE user_id = ${userId}
        ORDER BY 1
      `,
    ]);

    // 249: 表示中の素材に所属フォルダIDを付与する（本体クエリは変えず別クエリで足す）。
    // ここが失敗しても一覧そのものは出す＝付加情報の欠落で本体を壊さない（R-39）。
    let customFolderMap: Record<number, number[]> = {};
    try {
      customFolderMap = await getFolderIdsForItems(
        userId,
        'context',
        (rows as { id: number }[]).map((r) => Number(r.id)),
      );
    } catch (e) {
      console.error('[context-saves GET custom folders]', e);
    }

    return NextResponse.json({
      items: (rows as Record<string, unknown>[]).map((r) => ({
        ...r,
        custom_folder_ids: customFolderMap[Number(r.id)] ?? [],
      })),
      total_count: countRows[0]?.n ?? 0,
      all_total: catRows.reduce((s: number, r: any) => s + Number(r.count), 0),
      categories: catRows,
      all_tags: tagRows.map((r: any) => r.tag),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '取得に失敗しました' }, { status: 500 });
  }
}

// お気に入りトグル（コンテキストライブラリ専用＝テキスト分析とは別管理）
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, id } = body;
    if (!id) return NextResponse.json({ error: 'id が必須です' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;

    // タイトル・本文の編集（コンテキストライブラリのカード編集。owner検証込み）。
    // テキスト分析(text_analysis_saves)の編集と同等動作を context_saves に対して行う。
    if (action === 'update') {
      const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
      const contextText = typeof body.contextText === 'string' ? body.contextText.trim() : '';
      if (!topic || !contextText) {
        return NextResponse.json({ error: 'topic と contextText は必須です' }, { status: 400 });
      }
      const rows = await sql`
        UPDATE context_saves
        SET topic = ${topic}, context_text = ${contextText}
        WHERE id = ${parseInt(String(id), 10)} AND user_id = ${userId}
        RETURNING id
      `;
      if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ success: true, id: rows[0].id });
    }

    // お気に入りトグル（コンテキストライブラリ専用＝テキスト分析とは別管理）。
    // owner検証込みでトグル。favorited_at は ON 時のみ現在時刻、OFF 時は NULL。
    if (action === 'toggle_favorite') {
      await ensureFavoriteColumn();
      const rows = await sql`
        UPDATE context_saves
        SET is_favorite = NOT is_favorite,
            favorited_at = CASE WHEN NOT is_favorite THEN NOW() ELSE NULL END
        WHERE id = ${parseInt(String(id), 10)} AND user_id = ${userId}
        RETURNING id, is_favorite, favorited_at
      `;
      if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ success: true, ...rows[0] });
    }

    return NextResponse.json({ error: '不正なactionです' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '更新に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id が必須です' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const userId = (session.user as any).id;
    await sql`DELETE FROM context_saves WHERE id = ${parseInt(id, 10)} AND user_id = ${userId}`;
    // 249: 分類（カスタムフォルダ）も外す。掃除の失敗で削除自体を失敗させない
    await detachItemFromFolders(userId, 'context', parseInt(id, 10)).catch((e) =>
      console.error('[context-saves DELETE detach]', e),
    );
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '削除に失敗しました' }, { status: 500 });
  }
}
