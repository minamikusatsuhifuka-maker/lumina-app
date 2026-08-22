// 253: マイフォルダの中身を**画面をまたいで**返すAPI。
//
// 252でフォルダ一覧は共有したが、絞り込みは各画面が自分のテーブルだけを見ていたため、
// 「件数は4なのに開くと2件」という食い違いが起きた。共有したフォルダは、どちらの画面から
// 開いても中身が全部見えるのが自然（R-58）。このAPIが両方（🗂保存一覧＝text_analysis /
// 📚リサーチ保存＝library）を1つの並びで返す。
//
// 🧠AI参照素材（context）は独立体系のままなので、このAPIの対象外
// （そもそも別のフォルダIDになるため、混ざりようがない）。
//
// GET /api/custom-folders/items?folderId=123        一覧（本文なし・メタのみ）
// GET /api/custom-folders/items?scope=..&id=..&full=1  単体の本文（全文表示・コピー・MD用）

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import {
  ensureCustomFolderTables,
  folderSystemOf,
  getFolderIdsForItems,
  isItemScope,
  type ItemScope,
} from '@/lib/custom-folders';

export const runtime = 'nodejs';

/** 1フォルダから返す最大件数。お気に入りの分類なので通常は数十件だが、上限は明示しておく */
const MAX_ITEMS = 500;

export interface CrossFolderItem {
  /** どの画面のアイテムか（出自バッジと操作の振り分けに使う） */
  scope: Exclude<ItemScope, 'context'>;
  /** 文字列化したID（library は uuid・保存一覧は integer） */
  id: string;
  title: string;
  /** 保存一覧なら分析ラベル、リサーチ保存なら type（カード上の種別表示） */
  label: string;
  /** 自動カテゴリ（保存一覧の folder / リサーチ保存の group_name）。別軸なのでそのまま出す */
  category: string | null;
  char_count: number;
  created_at: string;
  favorite: boolean;
  custom_folder_ids: number[];
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id?: string })?.id ?? '';
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);

  try {
    await ensureCustomFolderTables();

    // ── 単体の本文取得（横断ビューの「▼全文表示 / コピー / MD」用）──
    // 画面ごとにテーブルもカラム名も違うので、ここで1つの形に均して返す。
    const fullScope = searchParams.get('scope');
    const fullId = searchParams.get('id');
    if (searchParams.get('full') === '1' && fullId) {
      if (fullScope !== 'text_analysis' && fullScope !== 'library') {
        return NextResponse.json({ error: 'scope が不正です' }, { status: 400 });
      }
      const rows =
        fullScope === 'text_analysis'
          ? ((await sql`
              SELECT COALESCE(auto_title, file_name, '無題') AS title, content
              FROM text_analysis_saves
              WHERE id::text = ${fullId} AND user_id = ${userId}
            `) as { title: string; content: string }[])
          : ((await sql`
              SELECT COALESCE(title, '無題') AS title, content
              FROM library
              WHERE id::text = ${fullId} AND user_id = ${userId}
            `) as { title: string; content: string }[]);
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({
        scope: fullScope,
        id: fullId,
        title: rows[0].title ?? '無題',
        content: rows[0].content ?? '',
      });
    }

    // ── フォルダの中身（両画面ぶんを1つの並びで）──
    const folderId = Number(searchParams.get('folderId'));
    if (!Number.isFinite(folderId)) {
      return NextResponse.json({ error: 'folderId が不正です' }, { status: 400 });
    }

    // 自分の・共有体系（stock）のフォルダであることを先に確かめる。
    // 他人のフォルダIDやAI参照素材のフォルダIDでは中身を返さない。
    const owned = (await sql`
      SELECT id, name FROM custom_folders
      WHERE id = ${folderId} AND user_id = ${userId} AND scope = ${folderSystemOf('text_analysis')}
    `) as { id: number; name: string }[];
    if (owned.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // created_at は保存一覧が timestamptz、リサーチ保存が timestamp なので
    // UNION の前に揃える（揃えないと並び順が壊れる）
    const rows = (await sql`
      SELECT * FROM (
        SELECT 'text_analysis' AS scope,
               s.id::text AS id,
               COALESCE(NULLIF(s.auto_title, ''), NULLIF(s.file_name, ''), '無題') AS title,
               s.analysis_label AS label,
               NULLIF(s.folder, '') AS category,
               COALESCE(s.char_count, 0) AS char_count,
               s.created_at::timestamptz AS created_at,
               COALESCE(s.favorite, false) AS favorite
        FROM custom_folder_items i
        JOIN text_analysis_saves s ON s.id::text = i.item_key AND s.user_id = i.user_id
        WHERE i.folder_id = ${folderId} AND i.user_id = ${userId} AND i.scope = 'text_analysis'
        UNION ALL
        SELECT 'library' AS scope,
               l.id::text AS id,
               COALESCE(NULLIF(l.title, ''), '無題') AS title,
               COALESCE(NULLIF(l.type, ''), 'research') AS label,
               NULLIF(l.group_name, '') AS category,
               COALESCE(LENGTH(l.content), 0) AS char_count,
               l.created_at::timestamptz AS created_at,
               (l.is_favorite = 1) AS favorite
        FROM custom_folder_items i
        JOIN library l ON l.id::text = i.item_key AND l.user_id = i.user_id
        WHERE i.folder_id = ${folderId} AND i.user_id = ${userId} AND i.scope = 'library'
      ) t
      ORDER BY created_at DESC
      LIMIT ${MAX_ITEMS}
    `) as Omit<CrossFolderItem, 'custom_folder_ids'>[];

    // 所属フォルダのバッジ用に、各アイテムの全所属を引く（種類ごとに1クエリ）。
    // 失敗しても一覧は返す（付加情報の欠落で本体を壊さない・R-39）。
    let folderMap: Record<string, Record<string, number[]>> = {};
    try {
      const [ta, lib] = await Promise.all([
        getFolderIdsForItems(
          userId,
          'text_analysis',
          rows.filter((r) => r.scope === 'text_analysis').map((r) => r.id),
        ),
        getFolderIdsForItems(
          userId,
          'library',
          rows.filter((r) => r.scope === 'library').map((r) => r.id),
        ),
      ]);
      folderMap = { text_analysis: ta, library: lib };
    } catch (e) {
      console.error('[custom-folders/items badges]', e);
    }

    const items: CrossFolderItem[] = rows.map((r) => ({
      ...r,
      char_count: Number(r.char_count ?? 0),
      favorite: !!r.favorite,
      custom_folder_ids: folderMap[r.scope]?.[r.id] ?? [],
    }));

    return NextResponse.json({
      folder: { id: owned[0].id, name: owned[0].name },
      items,
      total: items.length,
      // 上限に達したことを画面に伝える（黙って切らない）
      truncated: items.length >= MAX_ITEMS,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '取得に失敗しました';
    console.error('[custom-folders/items GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
