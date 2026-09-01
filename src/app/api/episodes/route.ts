// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 281: 📔 エピソード記録 — 一覧・取得・作成・更新・削除（AI不使用）
//
// - 全項目任意（§4-1）: 空でも保存できる。バリデーションは長さとタグ数だけ
// - 記録段階では医療広告ガードをかけない（§3-3）。効果の数値化の**警告**はクライアント側の純関数
//   （detectEffectClaims）で出す＝保存は妨げない
// - §5-2: 本文をログに出さない。console には失敗の事実だけを出す
// - 所有者検証: すべて user_id で絞る（他人の記録は 404）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '@/lib/require-auth';
import { ensureEpisodeTables, fetchEpisodesByIds, normalizeEpisodeInput } from '@/lib/episodes-server';
import type { EpisodeRecord } from '@/lib/episodes';

export const runtime = 'nodejs';

const LIST_LIMIT_MAX = 100;

type Row = {
  id: number;
  title: string;
  period: string;
  situation: string;
  feelings: string;
  details: string;
  thoughts: string;
  reflection: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

function toRecord(r: Row): EpisodeRecord {
  return {
    id: Number(r.id),
    title: r.title ?? '',
    period: r.period ?? '',
    situation: r.situation ?? '',
    feelings: r.feelings ?? '',
    details: r.details ?? '',
    thoughts: r.thoughts ?? '',
    reflection: r.reflection ?? '',
    tags: Array.isArray(r.tags) ? r.tags : [],
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function GET(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureEpisodeTables(sql);
    const { searchParams } = new URL(req.url);

    const idParam = searchParams.get('id');
    if (idParam) {
      const id = Number(idParam);
      if (!Number.isInteger(id) || id <= 0) return fail(400, 'id が不正です');
      const [ep] = await fetchEpisodesByIds(sql, userId, [id]);
      if (!ep) return fail(404, '記録が見つかりません');
      return NextResponse.json({ item: ep });
    }

    const q = (searchParams.get('q') ?? '').trim();
    const tag = (searchParams.get('tag') ?? '').trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), LIST_LIMIT_MAX);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
    // 全文検索（§4-2）: 全欄を連結して ILIKE。専用の検索基盤は無いので、text_analysis 側と同じ ILIKE 方式
    const like = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

    const rows = (await sql`
      SELECT id, title, period, situation, feelings, details, thoughts, reflection, tags, created_at, updated_at
      FROM episode_records
      WHERE user_id = ${userId}
        AND (${like}::text IS NULL OR concat_ws(E'\\n', title, period, situation, feelings, details, thoughts, reflection, array_to_string(tags, ' ')) ILIKE ${like})
        AND (${tag || null}::text IS NULL OR ${tag || null}::text = ANY(tags))
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `) as Row[];
    const [{ count }] = (await sql`
      SELECT COUNT(*)::int AS count FROM episode_records
      WHERE user_id = ${userId}
        AND (${like}::text IS NULL OR concat_ws(E'\\n', title, period, situation, feelings, details, thoughts, reflection, array_to_string(tags, ' ')) ILIKE ${like})
        AND (${tag || null}::text IS NULL OR ${tag || null}::text = ANY(tags))
    `) as { count: number }[];
    // タグ一覧（絞り込みチップ用・付加情報＝失敗しても一覧は返す・R-39）
    let allTags: string[] = [];
    try {
      const tagRows = (await sql`
        SELECT DISTINCT unnest(tags) AS tag FROM episode_records WHERE user_id = ${userId} ORDER BY tag
      `) as { tag: string }[];
      allTags = tagRows.map((r) => r.tag).filter(Boolean);
    } catch {
      allTags = [];
    }

    return NextResponse.json({ items: rows.map(toRecord), total: Number(count) || 0, all_tags: allTags });
  } catch (e: unknown) {
    console.error('[episodes] 一覧の取得に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, '記録の取得に失敗しました');
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'リクエストの形式が不正です');
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureEpisodeTables(sql);
    const input = normalizeEpisodeInput(body ?? {});
    const [row] = (await sql`
      INSERT INTO episode_records (user_id, title, period, situation, feelings, details, thoughts, reflection, tags)
      VALUES (${userId}, ${input.title}, ${input.period}, ${input.situation}, ${input.feelings}, ${input.details}, ${input.thoughts}, ${input.reflection}, ${input.tags})
      RETURNING id, title, period, situation, feelings, details, thoughts, reflection, tags, created_at, updated_at
    `) as Row[];
    return NextResponse.json({ success: true, id: Number(row.id), item: toRecord(row) });
  } catch (e: unknown) {
    console.error('[episodes] 保存に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, '記録の保存に失敗しました');
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'リクエストの形式が不正です');
  }
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail(400, 'id が必要です');

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureEpisodeTables(sql);
    const input = normalizeEpisodeInput(body);
    const [row] = (await sql`
      UPDATE episode_records
      SET title = ${input.title}, period = ${input.period}, situation = ${input.situation}, feelings = ${input.feelings},
          details = ${input.details}, thoughts = ${input.thoughts}, reflection = ${input.reflection}, tags = ${input.tags},
          updated_at = now()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id, title, period, situation, feelings, details, thoughts, reflection, tags, created_at, updated_at
    `) as Row[];
    if (!row) return fail(404, '記録が見つかりません');
    return NextResponse.json({ success: true, item: toRecord(row) });
  } catch (e: unknown) {
    console.error('[episodes] 更新に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, '記録の更新に失敗しました');
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return fail(400, 'id が必要です');

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureEpisodeTables(sql);
    const rows = (await sql`
      DELETE FROM episode_records WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `) as { id: number }[];
    if (rows.length === 0) return fail(404, '記録が見つかりません');
    return NextResponse.json({ success: true, id });
  } catch (e: unknown) {
    console.error('[episodes] 削除に失敗:', e instanceof Error ? e.message : 'unknown');
    return fail(500, '記録の削除に失敗しました');
  }
}
