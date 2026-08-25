import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '@/lib/require-auth';
import { sanitizeForDb } from '@/lib/sanitize';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 261③: X投稿の保存と「どの記事のどの告知か」のペア管理（229Bの4キー方式の簡易版）。
// 1) library に type='x-post' で INSERT（metadata に articleId / drId / mode を持つ＝子→親リンク）
// 2) 連動元のnote記事（library type='note-article'）の metadata.xPostIds に追記（親→子リンク）
//    - metadata はTEXT列のJSON文字列なので JSON.parse → push → stringify（ベストエフォート。
//      失敗しても投稿の保存自体は成功扱い＝R-39）
// 保存はこのルートの明示操作のみ（生成APIは保存しない＝R-38と同方針）。

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const mode = body.mode === 'thread' ? 'thread' : 'single';
    const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : '';
    const drId = typeof body.drId === 'string' ? body.drId.trim() : '';
    if (!content) {
      return NextResponse.json({ error: '保存する投稿文（content）が必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // 連動元記事のowner検証（指定がある場合のみ。他人のIDを紐づけ先にできない）
    let articleTitle = '';
    if (articleId) {
      const [row] = (await sql`
        SELECT id, title FROM library
        WHERE id = ${articleId} AND user_id = ${userId} AND type = 'note-article'
      `) as { id: string; title: string }[];
      if (!row) return NextResponse.json({ error: '連動元のnote記事が見つかりません' }, { status: 404 });
      articleTitle = row.title || '';
    }

    const id = uuidv4();
    const metadata = {
      from: 'dr-hub-x',
      mode,
      articleId: articleId || null,
      articleTitle: articleTitle || null,
      sourceDrId: drId || null,
      savedAt: new Date().toISOString(),
    };
    const saveTitle = title || `X投稿（${mode === 'thread' ? 'スレッド' : '単発'}）: ${articleTitle || '無題'}`;

    await sql`INSERT INTO library (id, user_id, type, title, content, metadata, tags, group_name, is_favorite, folder_name)
      VALUES (${id}, ${userId}, ${'x-post'}, ${sanitizeForDb(saveTitle)}, ${sanitizeForDb(content)},
              ${JSON.stringify(metadata)}, ${'X投稿,発信ハブ'}, ${'X投稿'}, ${0}, ${null})`;

    // 親→子リンク: 記事側 metadata.xPostIds に追記（ベストエフォート・失敗しても保存は成功扱い）
    if (articleId) {
      try {
        const [row] = (await sql`
          SELECT metadata FROM library WHERE id = ${articleId} AND user_id = ${userId}
        `) as { metadata: string | null }[];
        let meta: Record<string, unknown> = {};
        try {
          meta = row?.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
        } catch {
          meta = {};
        }
        const ids = Array.isArray(meta.xPostIds) ? (meta.xPostIds as unknown[]).map(String) : [];
        if (!ids.includes(id)) ids.push(id);
        meta.xPostIds = ids;
        await sql`UPDATE library SET metadata = ${JSON.stringify(meta)} WHERE id = ${articleId} AND user_id = ${userId}`;
      } catch (e) {
        console.warn('[dr-hub/x-post/save] xPostIds link failed (non-fatal):', e);
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[dr-hub/x-post/save] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
