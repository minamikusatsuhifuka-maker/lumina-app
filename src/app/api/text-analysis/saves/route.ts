import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import { sanitizeForDb } from '@/lib/sanitize';
import {
  detachItemFromFolders,
  detachItemsFromFolders,
  ensureCustomFolderTables,
  getFolderIdsForItems,
} from '@/lib/custom-folders';
// 297: 🎯用途カテゴリ（マイフォルダとは別テーブル・別体系）
import { detachItemFromPurposes, detachItemsFromPurposes, ensurePurposeTables, getPurposeIdsForItems } from '@/lib/purpose-categories';

export const runtime = 'nodejs';

// 250: 一括削除の1リクエストあたりの上限。一覧は30件ページングで「表示中を全選択」でも
// 高々100件程度だが、巨大な配列でDBを長時間ロックしないための安全弁。
const BULK_DELETE_LIMIT = 500;

// input_text カラムを冪等に用意（ADD COLUMN IF NOT EXISTS、既存データは非破壊・NULL）
// プロセス内で1回だけ実行（リクエスト毎の ALTER を避ける）
let inputTextColumnReady: Promise<unknown> | null = null;
function ensureInputTextColumn() {
  if (!inputTextColumnReady) {
    inputTextColumnReady = sql`
      ALTER TABLE text_analysis_saves ADD COLUMN IF NOT EXISTS input_text TEXT
    `.catch((e) => {
      // 失敗時は次回再試行できるようリセット
      inputTextColumnReady = null;
      throw e;
    });
  }
  return inputTextColumnReady;
}

// 一覧取得（v2: 本文非返却＋サーバ側フィルタ＋ページング）/ 単体取得 / 複数ID一括取得
// 194: context_saves の175改修と同方式。一覧は content を返さず、本文が必要な操作は
// ?id=（単体・本文込み）または ?ids=（ZIP・横断分析用の一括）で都度取得する。
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';

  try {
    await ensureInputTextColumn();
    // 249: カスタムフォルダ（お気に入りの手動分類）。一覧の絞り込みで参照するため先に用意する
    await ensureCustomFolderTables();
    await ensurePurposeTables(); // 297: 一覧SQLが purpose_category_items を参照するため先に用意する
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const withInput = searchParams.get('withInput');
    const idsParam = searchParams.get('ids');

    // 展開時の単体取得（案a・v33互換）: input_text だけを返す軽量レスポンス
    if (id && withInput) {
      const rows = await sql`
        SELECT id, input_text
        FROM text_analysis_saves
        WHERE id = ${id} AND user_id = ${userId}
      `;
      return NextResponse.json(rows[0] ?? { id: Number(id), input_text: null });
    }

    // 194: 単体取得（本文込み・owner検証。input_text は withInput=1 の既存導線に分離）
    if (id) {
      const rows = await sql`
        SELECT id, user_id, file_name, auto_title, analysis_type, analysis_label,
               content, tags, folder, favorite, locked, char_count, created_at, updated_at,
               (input_text IS NOT NULL) AS has_input,
               COALESCE(LENGTH(input_text), 0) AS input_char_count
        FROM text_analysis_saves
        WHERE id = ${id} AND user_id = ${userId}
      `;
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json(rows[0]);
    }

    // 194: 複数ID一括取得（ZIP一括DL・横断分析handoff用。owner検証・上限100件）
    if (idsParam) {
      const ids = idsParam
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n))
        .slice(0, 100);
      if (ids.length === 0) return NextResponse.json({ items: [] });
      const rows = await sql`
        SELECT id, file_name, auto_title, analysis_type, analysis_label,
               content, folder, favorite, char_count, created_at
        FROM text_analysis_saves
        WHERE id = ANY(${ids}) AND user_id = ${userId}
      `;
      return NextResponse.json({ items: rows });
    }

    // 194: 一覧v2 — 本文（content/input_text）非返却。検索 q はタイトル＋本文を対象に
    // サーバ側で適用（従来のクライアント本文検索と等価性を維持）。全件を母数に絞り込み、
    // created_at DESC + LIMIT/OFFSET で全件到達可能なページング（175と同型）。
    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const qRaw = searchParams.get('q');
    const qLike = qRaw && qRaw.trim() ? `%${qRaw.trim()}%` : null;
    const folderV = searchParams.get('folder'); // null=全カテゴリ
    // 293 §4-2: 種別（analysis_type）で絞る。null=すべて。
    const typeV = searchParams.get('analysisType')?.trim() || null;
    // 293 §3-1: qScope=title で本文を検索対象から外す（既定は従来どおりタイトル・ファイル名・本文）
    const searchBody = searchParams.get('qScope') !== 'title';
    const favV = searchParams.get('favorite') === '1' ? true : null;
    const inputV = searchParams.get('hasInput') === '1' ? true : null; // 「📥入力付き」仮想フィルタ

    // 192: タグの複数指定＋AND/OR（context-saves と同型のサーバ側対応）。
    // filterTags=a&filterTags=b（1タグ1パラメータ）& tagMode=and|or（既定 or）。
    // カテゴリ(folder)は1件1つのためAND対象にしない。
    const multiTags = searchParams
      .getAll('filterTags')
      .map((s) => s.trim())
      .filter(Boolean);
    const tagMode = searchParams.get('tagMode') === 'and' ? 'and' : 'or';
    const tagsAnd = multiTags.length > 0 && tagMode === 'and' ? multiTags : null;
    const tagsOr = multiTags.length > 0 && tagMode === 'or' ? multiTags : null;

    // 249: カスタムフォルダでの絞り込み。cfolder=<id> でそのフォルダ、
    // cfolder=unfiled で「お気に入りだがどのフォルダにも入っていない」を表す。
    // 自動カテゴリ(folder)とは独立した条件で、他のフィルタとはANDで組み合わさる。
    const cfolderRaw = searchParams.get('cfolder')?.trim() || '';
    const cfolderUnfiled = cfolderRaw === 'unfiled' ? true : null;
    const cfolderId =
      cfolderRaw && cfolderRaw !== 'unfiled' && Number.isFinite(Number(cfolderRaw))
        ? Number(cfolderRaw)
        : null;
    // 297: 用途カテゴリでの絞り込み（pcat=<id>）。マイフォルダ・AIカテゴリ・検索と AND で重なる
    const pcatRaw = searchParams.get('pcat')?.trim() || '';
    const pcatId = pcatRaw && Number.isFinite(Number(pcatRaw)) ? Number(pcatRaw) : null;

    const [rows, countRows, allRows, folderRows, tagRows, typeRows] = await Promise.all([
      sql`
        SELECT id, user_id, file_name, auto_title, analysis_type, analysis_label,
               tags, folder, favorite, locked, char_count, created_at, updated_at,
               (input_text IS NOT NULL) AS has_input,
               COALESCE(LENGTH(input_text), 0) AS input_char_count
        FROM text_analysis_saves
        WHERE user_id = ${userId}
          AND (${qLike}::text IS NULL OR auto_title ILIKE ${qLike} OR file_name ILIKE ${qLike} OR (${searchBody}::boolean AND content ILIKE ${qLike}))
          AND (${folderV}::text IS NULL OR COALESCE(folder, '') = ${folderV})
          AND (${typeV}::text IS NULL OR analysis_type = ${typeV})
          AND (${tagsAnd}::text[] IS NULL OR tags @> ${tagsAnd})
          AND (${tagsOr}::text[] IS NULL OR tags && ${tagsOr})
          AND (${favV}::boolean IS NULL OR favorite = ${favV})
          AND (${inputV}::boolean IS NULL OR input_text IS NOT NULL)
          AND (${cfolderId}::int IS NULL OR EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_key = text_analysis_saves.id::text
                   AND i.user_id = text_analysis_saves.user_id
                   AND i.scope = 'text_analysis'
                   AND i.folder_id = ${cfolderId}))
          AND (${cfolderUnfiled}::boolean IS NULL OR (favorite = true AND NOT EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_key = text_analysis_saves.id::text
                   AND i.user_id = text_analysis_saves.user_id
                   AND i.scope = 'text_analysis')))
          AND (${pcatId}::int IS NULL OR EXISTS (
                SELECT 1 FROM purpose_category_items pc
                 WHERE pc.item_key = text_analysis_saves.id::text
                   AND pc.user_id = text_analysis_saves.user_id
                   AND pc.scope = 'text_analysis'
                   AND pc.category_id = ${pcatId}))
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS n
        FROM text_analysis_saves
        WHERE user_id = ${userId}
          AND (${qLike}::text IS NULL OR auto_title ILIKE ${qLike} OR file_name ILIKE ${qLike} OR (${searchBody}::boolean AND content ILIKE ${qLike}))
          AND (${folderV}::text IS NULL OR COALESCE(folder, '') = ${folderV})
          AND (${typeV}::text IS NULL OR analysis_type = ${typeV})
          AND (${tagsAnd}::text[] IS NULL OR tags @> ${tagsAnd})
          AND (${tagsOr}::text[] IS NULL OR tags && ${tagsOr})
          AND (${favV}::boolean IS NULL OR favorite = ${favV})
          AND (${inputV}::boolean IS NULL OR input_text IS NOT NULL)
          AND (${cfolderId}::int IS NULL OR EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_key = text_analysis_saves.id::text
                   AND i.user_id = text_analysis_saves.user_id
                   AND i.scope = 'text_analysis'
                   AND i.folder_id = ${cfolderId}))
          AND (${cfolderUnfiled}::boolean IS NULL OR (favorite = true AND NOT EXISTS (
                SELECT 1 FROM custom_folder_items i
                 WHERE i.item_key = text_analysis_saves.id::text
                   AND i.user_id = text_analysis_saves.user_id
                   AND i.scope = 'text_analysis')))
          AND (${pcatId}::int IS NULL OR EXISTS (
                SELECT 1 FROM purpose_category_items pc
                 WHERE pc.item_key = text_analysis_saves.id::text
                   AND pc.user_id = text_analysis_saves.user_id
                   AND pc.scope = 'text_analysis'
                   AND pc.category_id = ${pcatId}))
      `,
      sql`SELECT COUNT(*)::int AS n FROM text_analysis_saves WHERE user_id = ${userId}`,
      sql`
        SELECT folder, COUNT(*)::int AS count
        FROM text_analysis_saves
        WHERE user_id = ${userId} AND COALESCE(folder, '') <> ''
        GROUP BY 1
        ORDER BY 2 DESC
      `,
      sql`
        SELECT DISTINCT t.tag
        FROM text_analysis_saves, LATERAL unnest(tags) AS t(tag)
        WHERE user_id = ${userId}
        ORDER BY 1
      `,
      // 293 §4-3: 種別ごとの件数（全件母数・folders と同じ考え方）。ラベルは保存値の代表（MIN）＝決定的
      sql`
        SELECT analysis_type, MIN(analysis_label) AS label, COUNT(*)::int AS count
        FROM text_analysis_saves
        WHERE user_id = ${userId}
        GROUP BY 1
        ORDER BY 3 DESC, 1
      `,
    ]);

    // 249: 表示中の記事に所属フォルダIDを付与する（本体クエリは変えず別クエリで足す）。
    // ここが失敗しても一覧そのものは出す＝付加情報の欠落で本体を壊さない（R-39）。
    let customFolderMap: Record<string, number[]> = {};
    try {
      customFolderMap = await getFolderIdsForItems(
        userId,
        'text_analysis',
        (rows as { id: number }[]).map((r) => Number(r.id)),
      );
    } catch (e) {
      console.error('[text-analysis/saves GET custom folders]', e);
    }
    // 297: 所属用途カテゴリIDも同じ流儀で付与（失敗しても一覧は出す）
    let purposeMap: Record<string, number[]> = {};
    try {
      await ensurePurposeTables();
      purposeMap = await getPurposeIdsForItems(userId, 'text_analysis', (rows as { id: number }[]).map((r) => Number(r.id)));
    } catch (e) {
      console.error('[text-analysis/saves GET purposes]', e);
    }

    return NextResponse.json({
      items: (rows as Record<string, unknown>[]).map((r) => ({
        ...r,
        custom_folder_ids: customFolderMap[String(r.id)] ?? [],
        purpose_category_ids: purposeMap[String(r.id)] ?? [],
      })),
      total_count: countRows[0]?.n ?? 0,
      all_total: allRows[0]?.n ?? 0,
      folders: folderRows,
      all_tags: tagRows.map((r) => (r as { tag: string }).tag),
      // 293: 種別ごとの件数（analysis_type / label / count）
      types: typeRows,
    });
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
    await ensureInputTextColumn();
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
    // 元の入力テキスト（任意項目。空・未指定なら NULL。他producerは無改修で動く）
    const inputText =
      typeof body.inputText === 'string' && body.inputText.trim()
        ? body.inputText
        : null;

    const rows = await sql`
      INSERT INTO text_analysis_saves
        (user_id, file_name, auto_title, analysis_type, analysis_label,
         content, tags, folder, char_count,
         is_cross_analysis, source_ids, cross_prompt, input_text)
      VALUES
        (${userId}, ${sanitizeForDb(titleInput)}, ${sanitizeForDb(titleInput)},
         ${body.analysisType ?? 'summary'}, ${analysisLabel},
         ${sanitizeForDb(content)}, ${tags}, ${folder}, ${content.length},
         ${isCross}, ${JSON.stringify(sourceIds)}, ${crossPrompt}, ${inputText === null ? null : sanitizeForDb(inputText)})
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
      // 249: 分類（カスタムフォルダ）も外す。掃除の失敗で削除自体を失敗させない
      await detachItemFromFolders(userId, 'text_analysis', String(id)).catch((e) =>
        console.error('[text-analysis/saves PATCH detach]', e),
      );
      await detachItemFromPurposes(userId, 'text_analysis', String(id)).catch((e) =>
        console.error('[text-analysis/saves PATCH detach purposes]', e),
      );
    } else if (action === 'bulk_delete') {
      // 250: 選択中をまとめて削除。owner検証つきで、自分の行だけが消える（他人のIDが
      // 混ざっていても無視されるだけ）。削除は不可逆なので確認はUI側で必須にしている。
      const idsArray: number[] = Array.isArray(ids)
        ? ids.map(Number).filter((n: number) => Number.isFinite(n)).slice(0, BULK_DELETE_LIMIT)
        : [];
      if (idsArray.length === 0) {
        return NextResponse.json({ error: 'idsが空です' }, { status: 400 });
      }
      const deleted = (await sql`
        DELETE FROM text_analysis_saves
        WHERE id = ANY(${idsArray}) AND user_id = ${userId}
        RETURNING id
      `) as { id: number }[];
      // 249: 分類（カスタムフォルダ）も外す。掃除の失敗で削除自体を失敗させない
      await detachItemsFromFolders(userId, 'text_analysis', idsArray).catch((e) =>
        console.error('[text-analysis/saves bulk_delete detach]', e),
      );
      await detachItemsFromPurposes(userId, 'text_analysis', idsArray).catch((e) =>
        console.error('[text-analysis/saves bulk_delete detach purposes]', e),
      );
      return NextResponse.json({ ok: true, deleted: deleted.length });
    } else if (action === 'rename') {
      await sql`
        UPDATE text_analysis_saves
        SET auto_title = ${body.title ?? ''}, file_name = ${body.title ?? ''}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
      `;
    } else if (action === 'update') {
      // タイトル + 本文の編集（input_text は対象外＝元入力は記録のため改変しない）
      const title = (body.title ?? '').trim();
      const content = (body.content ?? '').trim();
      if (!title || !content) {
        return NextResponse.json(
          { error: 'タイトルと本文は空にできません' },
          { status: 400 },
        );
      }
      await sql`
        UPDATE text_analysis_saves
        SET auto_title = ${title}, file_name = ${title},
            content = ${content}, char_count = ${content.length},
            updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
      `;
    } else if (action === 'rename_folder') {
      const oldName = (body.oldName ?? '').trim();
      const newName = (body.newName ?? '').trim();
      if (!oldName || !newName) {
        return NextResponse.json({ error: '変更前後の名前が必要です' }, { status: 400 });
      }
      if (oldName === newName) {
        return NextResponse.json({ error: '同じ名前です' }, { status: 400 });
      }
      if (oldName === '横断まとめ') {
        return NextResponse.json({ error: 'このカテゴリは変更できません' }, { status: 403 });
      }
      await sql`
        UPDATE text_analysis_saves
        SET folder = ${newName}, updated_at = NOW()
        WHERE folder = ${oldName} AND user_id = ${userId}
      `;
      return NextResponse.json({ ok: true, oldName, newName });
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
    // 249: 分類（カスタムフォルダ）も外す。掃除の失敗で削除自体を失敗させない
    await detachItemFromFolders(userId, 'text_analysis', String(id)).catch((e) =>
      console.error('[text-analysis/saves DELETE detach]', e),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
