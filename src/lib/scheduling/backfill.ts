import type { neon } from '@neondatabase/serverless';
import { encryptString, hashEmail, isEncryptionConfigured, normalizeEmail } from '../crypto.ts';

// 参加者メールのバックフィル（109 ②）。既存行の email → email_enc / email_hash を埋める。
// 鍵（SCHEDULING_ENCRYPTION_KEY）が必要なので生 SQL では不可。
// 管理者API（/api/admin/scheduling/backfill-email）と scripts/backfill-scheduling-email.mjs の両方から使うため、
// このファイルは 'server-only' と '@/…' エイリアスを使わない（Node の型ストリップで直接 import できる形にする）。
//
// 冪等: 既に値がある列は COALESCE で触らない。再実行すると updated=0 になる。

type Sql = ReturnType<typeof neon<false, false>>;

export interface BackfillStatus {
  columnsReady: boolean;
  keyConfigured: boolean;
  total: number;
  withHash: number;
  withEnc: number;
  remainingHash: number;
  remainingEnc: number;
}

export interface BackfillResult extends BackfillStatus {
  dryRun: boolean;
  scanned: number;
  updated: number;
}

async function columnsReady(sql: Sql): Promise<boolean> {
  const rows = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'scheduling_participants' AND column_name IN ('email_enc', 'email_hash')
  `;
  const names = new Set(rows.map((r) => String((r as { column_name: string }).column_name)));
  return names.has('email_enc') && names.has('email_hash');
}

export async function getBackfillStatus(sql: Sql): Promise<BackfillStatus> {
  const keyConfigured = isEncryptionConfigured();
  const ready = await columnsReady(sql);
  if (!ready) {
    const t = await sql`SELECT COUNT(*)::int AS c FROM scheduling_participants`;
    const total = Number((t[0] as { c: number }).c ?? 0);
    return { columnsReady: false, keyConfigured, total, withHash: 0, withEnc: 0, remainingHash: total, remainingEnc: total };
  }
  const rows = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(email_hash)::int AS with_hash,
           COUNT(email_enc)::int AS with_enc
    FROM scheduling_participants
  `;
  const r = rows[0] as { total: number; with_hash: number; with_enc: number };
  const total = Number(r.total ?? 0);
  const withHash = Number(r.with_hash ?? 0);
  const withEnc = Number(r.with_enc ?? 0);
  return {
    columnsReady: true,
    keyConfigured,
    total,
    withHash,
    withEnc,
    remainingHash: total - withHash,
    remainingEnc: total - withEnc,
  };
}

// eventId を渡すとそのイベントの行だけ（ローカル検証用）。省略で全行。
export async function backfillParticipantEmails(
  sql: Sql,
  opts: { dryRun?: boolean; batch?: number; eventId?: string } = {}
): Promise<BackfillResult> {
  const dryRun = !!opts.dryRun;
  const batch = Math.max(1, Math.min(500, opts.batch ?? 200));
  const before = await getBackfillStatus(sql);
  if (!before.columnsReady) {
    return { ...before, dryRun, scanned: 0, updated: 0 };
  }
  const keyConfigured = before.keyConfigured;

  let scanned = 0;
  let updated = 0;
  let lastId = 0;
  // enc は鍵があるときだけ対象。hash は常に対象。
  for (;;) {
    const rows = opts.eventId
      ? await sql`
          SELECT id, email, email_enc, email_hash FROM scheduling_participants
          WHERE id > ${lastId} AND event_id = ${opts.eventId}
            AND (email_hash IS NULL OR (${keyConfigured} AND email_enc IS NULL))
          ORDER BY id ASC LIMIT ${batch}
        `
      : await sql`
          SELECT id, email, email_enc, email_hash FROM scheduling_participants
          WHERE id > ${lastId}
            AND (email_hash IS NULL OR (${keyConfigured} AND email_enc IS NULL))
          ORDER BY id ASC LIMIT ${batch}
        `;
    if (rows.length === 0) break;
    for (const raw of rows) {
      const r = raw as { id: number; email: string | null; email_enc: string | null; email_hash: string | null };
      lastId = Number(r.id);
      scanned++;
      const email = normalizeEmail(r.email);
      if (!email) continue; // 平文が空の行は対象外（④以降の行）
      const hash = r.email_hash ?? hashEmail(email);
      const enc = r.email_enc ?? (keyConfigured ? encryptString(email) : null);
      if (dryRun) {
        updated++;
        continue;
      }
      await sql`
        UPDATE scheduling_participants
        SET email_hash = COALESCE(email_hash, ${hash}),
            email_enc = COALESCE(email_enc, ${enc})
        WHERE id = ${r.id}
      `;
      updated++;
    }
    if (rows.length < batch) break;
  }

  const after = dryRun ? before : await getBackfillStatus(sql);
  return { ...after, dryRun, scanned, updated };
}
