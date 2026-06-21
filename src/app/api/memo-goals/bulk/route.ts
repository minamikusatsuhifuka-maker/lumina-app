import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables } from '@/lib/memo-db';

export const runtime = 'nodejs';

// AIメモ: 目標・目的(memo_goals)の複数一括登録。
// owner はサーバ側セッションから付与（クライアント値を信用しない＝IDOR防止）。
// 既存の単一 POST/PATCH/DELETE（../route.ts）は無変更で維持。

const MAX_ITEMS = 50; // 過大入力の防止（1回の上限）

async function ctx() {
  const session = await auth();
  if (!session?.user) return null;
  const owner = (session.user as { id: string }).id;
  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);
  return { owner, sql };
}

export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const rawItems = Array.isArray(body.items) ? body.items : [];

  // 1. 正規化（title 必須・トリム、domain/detail は空→null）
  type Item = { title: string; domain: string | null; detail: string | null };
  const normalized: Item[] = [];
  for (const it of rawItems) {
    const title = typeof it?.title === 'string' ? it.title.trim() : '';
    if (!title) continue; // 空行・title 無しはスキップ
    const domain =
      typeof it?.domain === 'string' && it.domain.trim() ? it.domain.trim() : null;
    const detail =
      typeof it?.detail === 'string' && it.detail.trim() ? it.detail.trim() : null;
    normalized.push({ title, domain, detail });
  }

  if (normalized.length === 0) {
    return NextResponse.json({ error: '登録できる目標がありません' }, { status: 400 });
  }

  // 2. バッチ内の title 重複を排除（先勝ち）
  const batchSeen = new Set<string>();
  const batchUnique: Item[] = [];
  for (const it of normalized) {
    if (batchSeen.has(it.title)) continue;
    batchSeen.add(it.title);
    batchUnique.push(it);
  }

  // 3. 既存 memo_goals（owner内）と title 完全一致は除外
  const existingRows = await c.sql`SELECT title FROM memo_goals WHERE owner = ${c.owner}`;
  const existing = new Set(
    (existingRows as { title: string }[]).map((r) => r.title),
  );

  const toInsert = batchUnique
    .filter((it) => !existing.has(it.title))
    .slice(0, MAX_ITEMS); // 上限超過分は捨てる（下で truncated を返す）

  // 重複（バッチ内 + 既存）でスキップした件数
  const skipped = normalized.length - toInsert.length;
  // 上限超過で落とした件数（任意の通知用）
  const truncated =
    batchUnique.filter((it) => !existing.has(it.title)).length - toInsert.length;

  if (toInsert.length === 0) {
    return NextResponse.json({ goals: [], inserted: 0, skipped, truncated });
  }

  // 4. 一括 INSERT（owner はサーバ付与）。神経質な multi-statement を避け順次 INSERT。
  //    件数は MAX_ITEMS(50) 以下なので逐次でも軽量。
  const inserted: unknown[] = [];
  for (const it of toInsert) {
    const rows = await c.sql`
      INSERT INTO memo_goals (owner, title, domain, detail)
      VALUES (${c.owner}, ${it.title}, ${it.domain}, ${it.detail})
      RETURNING id, owner, title, domain, detail, created_at
    `;
    inserted.push(rows[0]);
  }

  return NextResponse.json({
    goals: inserted,
    inserted: inserted.length,
    skipped,
    truncated,
  });
}
