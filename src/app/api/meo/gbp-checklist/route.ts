import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import {
  ensureGbpSchema,
  loadChecklist,
  loadThresholds,
  normalizeThresholds,
  MANUAL_ITEMS,
} from '@/lib/gbp-audit';

export const runtime = 'nodejs';

// 手入力チェックの状態としきい値を owner スコープで保存・取得（IDOR防止）

function getOwner(session: { user?: { id?: string } } | null): string | null {
  return session?.user?.id ?? null;
}

const ALLOWED_STATUS = ['done', 'todo', 'na'];
const ALLOWED_KEYS = MANUAL_ITEMS.map((m) => m.key);

// 現在の保存状態を返す
export async function GET() {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    await ensureGbpSchema(sql);
    const [checklist, thresholds] = await Promise.all([
      loadChecklist(sql, owner),
      loadThresholds(sql, owner),
    ]);
    return NextResponse.json({ checklist, thresholds });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/gbp-checklist] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// チェック1項目の更新、またはしきい値の保存
export async function POST(req: Request) {
  const session = await auth();
  const owner = getOwner(session);
  if (!owner) return new Response('Unauthorized', { status: 401 });

  try {
    const body = await req.json();
    const sql = neon(process.env.DATABASE_URL!);
    await ensureGbpSchema(sql);

    // しきい値の保存
    if (body.thresholds !== undefined) {
      const t = normalizeThresholds(body.thresholds);
      await sql`
        INSERT INTO gbp_settings (owner, thresholds, updated_at)
        VALUES (${owner}, ${JSON.stringify(t)}, NOW())
        ON CONFLICT (owner) DO UPDATE SET thresholds = EXCLUDED.thresholds, updated_at = NOW()
      `;
      return NextResponse.json({ success: true, thresholds: t });
    }

    // チェック項目の更新
    const { itemKey, status, note } = body as {
      itemKey?: string;
      status?: string;
      note?: string;
    };
    if (!itemKey || !ALLOWED_KEYS.includes(itemKey)) {
      return NextResponse.json({ error: 'itemKey が不正です' }, { status: 400 });
    }
    const nextStatus = ALLOWED_STATUS.includes(status ?? '') ? status : 'todo';
    await sql`
      INSERT INTO gbp_checklist (owner, item_key, status, note, updated_at)
      VALUES (${owner}, ${itemKey}, ${nextStatus}, ${note ?? null}, NOW())
      ON CONFLICT (owner, item_key) DO UPDATE SET
        status = EXCLUDED.status, note = EXCLUDED.note, updated_at = NOW()
    `;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[meo/gbp-checklist] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
