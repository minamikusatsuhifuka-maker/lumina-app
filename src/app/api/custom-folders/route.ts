// 249: お気に入りのカスタムフォルダ分類 API（保存一覧 / AI参照素材で共用）。
//
// scope でフォルダ体系を分ける（'text_analysis' = 📁保存一覧 / 'context' = 🧠AI参照素材）。
// 既存の自動カテゴリ（folder / category カラム）には一切触らない＝別軸で併存する。
//
// GET    ?scope=...            フォルダ一覧（件数つき）＋お気に入りの総数/未分類件数
// POST   {scope, name}         フォルダ新規作成
// PATCH  {action, ...}         rename / reorder / assign
// DELETE ?scope=&id=           フォルダ削除（記事自体は消えず、分類だけ外れる＝CASCADE）

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';
import {
  ensureCustomFolderTables,
  getFavoriteSummary,
  isFolderScope,
  isUniqueViolation,
  listFoldersWithCounts,
  MAX_FOLDERS_PER_SCOPE,
  MAX_FOLDER_NAME_LENGTH,
  normalizeFolderName,
  setItemFolders,
} from '@/lib/custom-folders';

export const runtime = 'nodejs';

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  if (!session) return null;
  const userId = (session.user as { id?: string })?.id ?? '';
  return userId || null;
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = new URL(req.url).searchParams.get('scope');
  if (!isFolderScope(scope)) {
    return NextResponse.json({ error: 'scope が不正です' }, { status: 400 });
  }

  try {
    await ensureCustomFolderTables();
    const [folders, summary] = await Promise.all([
      listFoldersWithCounts(userId, scope),
      getFavoriteSummary(userId, scope),
    ]);
    return NextResponse.json({ folders, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : '取得に失敗しました';
    console.error('[custom-folders GET]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const scope = body?.scope;
    if (!isFolderScope(scope)) {
      return NextResponse.json({ error: 'scope が不正です' }, { status: 400 });
    }
    const name = normalizeFolderName(body?.name);
    if (!name) {
      return NextResponse.json({ error: 'フォルダ名を入力してください' }, { status: 400 });
    }

    await ensureCustomFolderTables();

    const countRows = (await sql`
      SELECT COUNT(*)::int AS n FROM custom_folders
      WHERE user_id = ${userId} AND scope = ${scope}
    `) as { n: number }[];
    if ((countRows[0]?.n ?? 0) >= MAX_FOLDERS_PER_SCOPE) {
      return NextResponse.json(
        { error: `フォルダは${MAX_FOLDERS_PER_SCOPE}個までです` },
        { status: 400 },
      );
    }

    // 末尾に追加（既存の並び順は変えない）
    const rows = (await sql`
      INSERT INTO custom_folders (user_id, scope, name, sort_order)
      VALUES (
        ${userId}, ${scope}, ${name},
        COALESCE((SELECT MAX(sort_order) + 1 FROM custom_folders
                   WHERE user_id = ${userId} AND scope = ${scope}), 0)
      )
      RETURNING id, name, sort_order
    `) as { id: number; name: string; sort_order: number }[];

    return NextResponse.json({ folder: { ...rows[0], count: 0 } });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: '同じ名前のフォルダがあります' }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : '作成に失敗しました';
    console.error('[custom-folders POST]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const scope = body?.scope;
    if (!isFolderScope(scope)) {
      return NextResponse.json({ error: 'scope が不正です' }, { status: 400 });
    }
    const action = body?.action;
    await ensureCustomFolderTables();

    // フォルダ名の変更（記事の所属はそのまま）
    if (action === 'rename') {
      const id = Number(body?.id);
      const name = normalizeFolderName(body?.name);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ error: 'id が不正です' }, { status: 400 });
      }
      if (!name) {
        return NextResponse.json(
          { error: `フォルダ名は1〜${MAX_FOLDER_NAME_LENGTH}文字で入力してください` },
          { status: 400 },
        );
      }
      const rows = (await sql`
        UPDATE custom_folders SET name = ${name}
        WHERE id = ${id} AND user_id = ${userId} AND scope = ${scope}
        RETURNING id, name, sort_order
      `) as { id: number; name: string }[];
      if (rows.length === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, folder: rows[0] });
    }

    // 並び替え（渡された順に sort_order を振り直す。部分適用を避けて1トランザクション）
    if (action === 'reorder') {
      const ids: number[] = Array.isArray(body?.ids)
        ? body.ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: 'ids が空です' }, { status: 400 });
      }
      await sql.transaction(
        ids.map(
          (id, i) => sql`
            UPDATE custom_folders SET sort_order = ${i}
            WHERE id = ${id} AND user_id = ${userId} AND scope = ${scope}
          `,
        ),
      );
      return NextResponse.json({ ok: true });
    }

    // 記事の分類を folderIds の内容に揃える（追加・変更・全解除を1本で表現）
    if (action === 'assign') {
      const itemId = Number(body?.itemId);
      if (!Number.isFinite(itemId)) {
        return NextResponse.json({ error: 'itemId が不正です' }, { status: 400 });
      }
      const folderIds: number[] = Array.isArray(body?.folderIds) ? body.folderIds : [];

      // 他人の記事に分類を付けられないよう、記事側の所有者を先に検証する
      const owned =
        scope === 'text_analysis'
          ? ((await sql`SELECT 1 FROM text_analysis_saves
                        WHERE id = ${itemId} AND user_id = ${userId}`) as unknown[])
          : ((await sql`SELECT 1 FROM context_saves
                        WHERE id = ${itemId} AND user_id = ${userId}`) as unknown[]);
      if (owned.length === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      await setItemFolders(userId, scope, itemId, folderIds);
      const [folders, summary] = await Promise.all([
        listFoldersWithCounts(userId, scope),
        getFavoriteSummary(userId, scope),
      ]);
      return NextResponse.json({ ok: true, folders, ...summary });
    }

    return NextResponse.json({ error: '不正なactionです' }, { status: 400 });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: '同じ名前のフォルダがあります' }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : '更新に失敗しました';
    console.error('[custom-folders PATCH]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// フォルダ削除。custom_folder_items は ON DELETE CASCADE で外れるだけで、
// 記事本体（text_analysis_saves / context_saves）には一切触らない。
export async function DELETE(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope');
    const id = Number(searchParams.get('id'));
    if (!isFolderScope(scope)) {
      return NextResponse.json({ error: 'scope が不正です' }, { status: 400 });
    }
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'id が不正です' }, { status: 400 });
    }
    await ensureCustomFolderTables();
    const rows = (await sql`
      DELETE FROM custom_folders
      WHERE id = ${id} AND user_id = ${userId} AND scope = ${scope}
      RETURNING id
    `) as { id: number }[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '削除に失敗しました';
    console.error('[custom-folders DELETE]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
