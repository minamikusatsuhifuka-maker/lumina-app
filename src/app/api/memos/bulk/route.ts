import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/lib/auth';
import { ensureMemoTables } from '@/lib/memo-db';

export const runtime = 'nodejs';

// AIメモ: メモ(raw_text)の複数一括追加（1行=1メモ）。118の memo-goals/bulk と同方式。
// owner はサーバ側セッションから付与（クライアント値を信用しない＝IDOR防止）。
// status='inbox' で作成し、triage は既存の単一/triage-all に委ねる（自動triageしない）。
// 既存の単一 POST / triage / triage-all / PATCH / DELETE は無変更。

const MAX_ITEMS = 100; // 過大入力の防止（1回の上限）

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const owner = (session.user as { id: string }).id;

  const body = await req.json().catch(() => ({}));

  // texts:["..."] または items:[{raw_text}] の両形式を受ける
  const rawList: unknown[] = Array.isArray(body.texts)
    ? body.texts
    : Array.isArray(body.items)
      ? body.items.map((it: { raw_text?: unknown }) => it?.raw_text)
      : [];

  // 1. 正規化（トリム・空行スキップ）
  const normalized: string[] = [];
  for (const t of rawList) {
    const text = typeof t === 'string' ? t.trim() : '';
    if (text) normalized.push(text);
  }

  if (normalized.length === 0) {
    return NextResponse.json({ error: '追加できるメモがありません' }, { status: 400 });
  }

  // 2. 同一貼り付け内の完全重複行のみスキップ（二重貼りの保険）。
  //    メモは目標と違い重複が正当な場合もあるため、既存メモとの重複除外はしない。
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const text of normalized) {
    if (seen.has(text)) continue;
    seen.add(text);
    unique.push(text);
  }

  const toInsert = unique.slice(0, MAX_ITEMS);
  const skipped = normalized.length - unique.length; // バッチ内重複でスキップ
  const truncated = unique.length - toInsert.length; // 上限超過で落とした件数

  const sql = neon(process.env.DATABASE_URL!);
  await ensureMemoTables(sql);

  // 3. status='inbox' でまとめて INSERT（件数は MAX_ITEMS 以下なので逐次でも軽量）。
  //    新しい順に一覧へ積めるよう、挿入順は入力順のまま返す。
  const inserted: unknown[] = [];
  for (const text of toInsert) {
    const rows = await sql`
      INSERT INTO memos (owner, raw_text, status) VALUES (${owner}, ${text}, 'inbox')
      RETURNING *
    `;
    inserted.push(rows[0]);
  }

  return NextResponse.json({
    memos: inserted,
    inserted: inserted.length,
    skipped,
    truncated,
  });
}
