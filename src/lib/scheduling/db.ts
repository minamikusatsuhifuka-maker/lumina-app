import 'server-only';
import type { neon } from '@neondatabase/serverless';
import {
  canTransition,
  isValidDateStr,
  parseCandidateDates,
  type SchedulingStatus,
  type TimeSlot,
} from '@/lib/scheduling';
import {
  decryptString,
  encryptString,
  hashEmail,
  isEncryptionConfigured,
  looksEncrypted,
  normalizeEmail,
} from '@/lib/crypto';

// 日程調整のデータアクセス層（109・server-only・全て parameterized）。
// 既存テーブル scheduling_events / scheduling_participants / scheduling_ng_dates / scheduling_notifications を
// そのまま包む。テーブル名・id＝公開トークン・状態名は変えない。
//
// 参加者メールの扱い（段階移行）:
//   ① 二重書き … upsertParticipant は平文 email と email_enc / email_hash の両方を書く
//      （列が無い／鍵が無いときは enc/hash を除外して従来どおり平文だけ書く＝起動を壊さない）
//   ② バックフィル … ./backfill.ts（管理者API / ローカルスクリプト）
//   ③ 読み替え … 検索・重複判定は email_hash、所有者向け一覧・通知の宛先は email_enc を復号。
//      email_enc が無い行・復号できない行は平文にフォールバック（バックフィル完了までの安全弁）
//   ④ 平文の NULL 化 … 別ゴーサイン（本ランでは行わない）
//
// AI へ渡すデータは listResponsesAnonymized のみ（メール・氏名を含まない）。

type Sql = ReturnType<typeof neon<false, false>>;

// ── 列の有無（information_schema で1回だけ確認・プロセス内キャッシュ）─────────
let piiColumnsCache: boolean | null = null;

export async function hasParticipantPiiColumns(sql: Sql): Promise<boolean> {
  if (piiColumnsCache !== null) return piiColumnsCache;
  try {
    const rows = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'scheduling_participants' AND column_name IN ('email_enc', 'email_hash')
    `;
    const names = new Set(rows.map((r) => String((r as { column_name: string }).column_name)));
    piiColumnsCache = names.has('email_enc') && names.has('email_hash');
  } catch (e) {
    console.warn('[scheduling/db] 暗号化列の確認に失敗（平文のみで続行）', e);
    piiColumnsCache = false;
  }
  return piiColumnsCache;
}

// テスト・バックフィル後の再判定用
export function resetPiiColumnsCache(): void {
  piiColumnsCache = null;
}

// 保存用の enc/hash を作る。鍵が無ければ enc は null（平文へは倒さず「書かない」）
export function buildEmailColumns(email: string): { email: string; email_hash: string; email_enc: string | null } {
  const normalized = normalizeEmail(email);
  const encrypted = isEncryptionConfigured() ? encryptString(normalized) : null;
  return { email: normalized, email_hash: hashEmail(normalized), email_enc: encrypted };
}

// 行の email を決める（enc を復号 → できなければ平文）。所有者向け・通知用。
let warnedNoKey = false;
export function resolveEmail(row: { email: string | null; email_enc?: string | null }): string {
  const enc = row.email_enc;
  if (looksEncrypted(enc)) {
    if (isEncryptionConfigured()) {
      try {
        return decryptString(enc);
      } catch (e) {
        console.warn('[scheduling/db] email_enc の復号に失敗（平文へフォールバック）', e instanceof Error ? e.message : e);
      }
    } else if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn('[scheduling/db] SCHEDULING_ENCRYPTION_KEY 未設定のため email_enc を復号できません（平文へフォールバック）');
    }
  }
  return row.email ?? '';
}

// ── イベント ─────────────────────────────────────────────────
// 公開ページ・公開API 用（オーナー情報・他参加者の PII を含まない）
export interface PublicEvent {
  id: string;
  title: string;
  description: string | null;
  type: string;
  status: SchedulingStatus;
  candidate_dates: unknown;
  time_slots: unknown;
}

export async function getEventByPublicToken(sql: Sql, token: string): Promise<PublicEvent | null> {
  if (!token) return null;
  const rows = await sql`
    SELECT id, title, description, type, status, candidate_dates, time_slots
    FROM scheduling_events
    WHERE id = ${token}
  `;
  return (rows[0] as PublicEvent) ?? null;
}

// オーナーへの通知など、公開レスポンスに載せない用途でだけ使う
export async function getEventOwnerUserId(sql: Sql, eventId: string): Promise<string | null> {
  const rows = await sql`SELECT owner_user_id FROM scheduling_events WHERE id = ${eventId}`;
  const v = (rows[0] as { owner_user_id?: string } | undefined)?.owner_user_id;
  return typeof v === 'string' ? v : null;
}

// ── 参加者 ────────────────────────────────────────────────────
export interface ParticipantAuthRow {
  id: number;
  email: string;
  email_verified_at: string | null;
  responded_at: string | null;
  otp_hash: string | null;
  otp_expires_at: string | null;
  otp_attempts: number;
  otp_last_sent_at: string | null;
}

// event × 本人メール で参加者を取得（本人確認・回答用）。
// 検索は email_hash を優先し、hash 未設定の行（バックフィル前）は平文で拾う。
export async function findParticipantByEmail(
  sql: Sql,
  eventId: string,
  rawEmail: string
): Promise<ParticipantAuthRow | null> {
  const email = normalizeEmail(rawEmail);
  if (!eventId || !email) return null;
  const hasPii = await hasParticipantPiiColumns(sql);
  const rows = hasPii
    ? await sql`
        SELECT id, email, email_verified_at, responded_at,
               otp_hash, otp_expires_at, otp_attempts, otp_last_sent_at
        FROM scheduling_participants
        WHERE event_id = ${eventId}
          AND (email_hash = ${hashEmail(email)} OR (email_hash IS NULL AND email = ${email}))
        ORDER BY (email_hash IS NOT NULL) DESC, id ASC
        LIMIT 1
      `
    : await sql`
        SELECT id, email, email_verified_at, responded_at,
               otp_hash, otp_expires_at, otp_attempts, otp_last_sent_at
        FROM scheduling_participants
        WHERE event_id = ${eventId} AND email = ${email}
        LIMIT 1
      `;
  return (rows[0] as ParticipantAuthRow) ?? null;
}

// 参加登録の UPSERT（二重書き）。UNIQUE(event_id, email) はこのランでは平文のまま。
// 既存行に enc/hash が無ければ埋める（COALESCE で既存値は上書きしない）。
export async function upsertParticipant(sql: Sql, eventId: string, rawEmail: string): Promise<{ id: number }> {
  const cols = buildEmailColumns(rawEmail);
  const hasPii = await hasParticipantPiiColumns(sql);
  if (hasPii) {
    await sql`
      INSERT INTO scheduling_participants (event_id, email, email_enc, email_hash)
      VALUES (${eventId}, ${cols.email}, ${cols.email_enc}, ${cols.email_hash})
      ON CONFLICT (event_id, email) DO UPDATE
        SET email_enc = COALESCE(scheduling_participants.email_enc, EXCLUDED.email_enc),
            email_hash = COALESCE(scheduling_participants.email_hash, EXCLUDED.email_hash)
    `;
  } else {
    await sql`
      INSERT INTO scheduling_participants (event_id, email)
      VALUES (${eventId}, ${cols.email})
      ON CONFLICT (event_id, email) DO NOTHING
    `;
  }
  const rows = await sql`
    SELECT id FROM scheduling_participants WHERE event_id = ${eventId} AND email = ${cols.email} LIMIT 1
  `;
  const id = Number((rows[0] as { id?: number } | undefined)?.id);
  if (!Number.isFinite(id)) throw new Error('participant upsert failed');
  return { id };
}

// OTP を保存（ハッシュのみ）・期限・試行回数リセット
export async function setParticipantOtp(
  sql: Sql,
  participantId: number,
  otpHash: string,
  expiresAtIso: string
): Promise<void> {
  await sql`
    UPDATE scheduling_participants
    SET otp_hash = ${otpHash}, otp_expires_at = ${expiresAtIso}, otp_attempts = 0, otp_last_sent_at = now()
    WHERE id = ${participantId}
  `;
}

export async function bumpOtpAttempts(sql: Sql, participantId: number): Promise<void> {
  await sql`UPDATE scheduling_participants SET otp_attempts = otp_attempts + 1 WHERE id = ${participantId}`;
}

// 本人確認済みにし、OTP を使い捨てにする
export async function markParticipantVerified(sql: Sql, participantId: number): Promise<void> {
  await sql`
    UPDATE scheduling_participants
    SET email_verified_at = COALESCE(email_verified_at, now()),
        otp_hash = NULL, otp_expires_at = NULL, otp_attempts = 0
    WHERE id = ${participantId}
  `;
}

// 本人の NG 日（'YYYY-MM-DD'）
export async function listOwnNgDates(sql: Sql, participantId: number): Promise<string[]> {
  const rows = await sql`
    SELECT ng_date::text AS ng_date FROM scheduling_ng_dates WHERE participant_id = ${participantId} ORDER BY ng_date ASC
  `;
  return rows.map((r) => toDateStr((r as { ng_date: unknown }).ng_date));
}

// NG 日回答の保存（本人分を全削除→再INSERT・responded_at セット）。候補日の検証は呼び出し側。
export async function saveResponse(
  sql: Sql,
  eventId: string,
  participantId: number,
  dates: string[]
): Promise<number> {
  const clean = Array.from(new Set(dates.filter(isValidDateStr)));
  await sql`DELETE FROM scheduling_ng_dates WHERE participant_id = ${participantId}`;
  for (const d of clean) {
    await sql`
      INSERT INTO scheduling_ng_dates (event_id, participant_id, ng_date)
      VALUES (${eventId}, ${participantId}, ${d})
      ON CONFLICT (participant_id, ng_date) DO NOTHING
    `;
  }
  await sql`UPDATE scheduling_participants SET responded_at = now() WHERE id = ${participantId}`;
  return clean.length;
}

// 1対1の枠選択（③-1）
export async function saveSlotResponse(sql: Sql, participantId: number, slot: TimeSlot): Promise<void> {
  await sql`
    UPDATE scheduling_participants
    SET selected_slot = ${JSON.stringify(slot)}::jsonb, responded_at = now()
    WHERE id = ${participantId}
  `;
}

// ── 所有者向け（復号して返す）────────────────────────────────
export interface OwnerParticipant {
  id: number;
  email: string;
  name: string | null;
  email_verified_at: string | null;
  responded_at: string | null;
  selected_slot: unknown;
  created_at: string;
  ng_dates: string[];
}

export async function listParticipantsForOwner(sql: Sql, eventId: string): Promise<OwnerParticipant[]> {
  const hasPii = await hasParticipantPiiColumns(sql);
  const rows = hasPii
    ? await sql`
        SELECT
          p.id, p.email, p.email_enc, p.name, p.email_verified_at, p.responded_at, p.selected_slot, p.created_at,
          COALESCE(ARRAY_AGG(n.ng_date::text ORDER BY n.ng_date) FILTER (WHERE n.ng_date IS NOT NULL), ARRAY[]::text[]) AS ng_dates
        FROM scheduling_participants p
        LEFT JOIN scheduling_ng_dates n ON n.participant_id = p.id
        WHERE p.event_id = ${eventId}
        GROUP BY p.id
        ORDER BY p.created_at ASC
      `
    : await sql`
        SELECT
          p.id, p.email, NULL::text AS email_enc, p.name, p.email_verified_at, p.responded_at, p.selected_slot, p.created_at,
          COALESCE(ARRAY_AGG(n.ng_date::text ORDER BY n.ng_date) FILTER (WHERE n.ng_date IS NOT NULL), ARRAY[]::text[]) AS ng_dates
        FROM scheduling_participants p
        LEFT JOIN scheduling_ng_dates n ON n.participant_id = p.id
        WHERE p.event_id = ${eventId}
        GROUP BY p.id
        ORDER BY p.created_at ASC
      `;
  return rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: Number(r.id),
      email: resolveEmail({ email: r.email as string | null, email_enc: r.email_enc as string | null }),
      name: (r.name as string | null) ?? null,
      email_verified_at: (r.email_verified_at as string | null) ?? null,
      responded_at: (r.responded_at as string | null) ?? null,
      selected_slot: r.selected_slot ?? null,
      created_at: String(r.created_at ?? ''),
      ng_dates: Array.isArray(r.ng_dates) ? (r.ng_dates as unknown[]).map(toDateStr) : [],
    };
  });
}

// 通知の宛先＝本人確認済みの参加者（復号済み email）。外部入力は使わない。
export async function listVerifiedRecipients(sql: Sql, eventId: string): Promise<{ id: number; email: string }[]> {
  const hasPii = await hasParticipantPiiColumns(sql);
  const rows = hasPii
    ? await sql`
        SELECT id, email, email_enc FROM scheduling_participants
        WHERE event_id = ${eventId} AND email_verified_at IS NOT NULL
        ORDER BY id ASC
      `
    : await sql`
        SELECT id, email, NULL::text AS email_enc FROM scheduling_participants
        WHERE event_id = ${eventId} AND email_verified_at IS NOT NULL
        ORDER BY id ASC
      `;
  return rows.map((raw) => {
    const r = raw as { id: number; email: string | null; email_enc: string | null };
    return { id: Number(r.id), email: resolveEmail(r) };
  });
}

// ── AI 用（PII なし）────────────────────────────────────────
// 本人確認済み参加者の「匿名ID と NG 日」だけを返す。メール・氏名・DB の id は含めない。
export interface AnonymizedResponses {
  verifiedCount: number;
  responses: { key: string; ngDates: string[] }[];
}

export async function listResponsesAnonymized(sql: Sql, eventId: string): Promise<AnonymizedResponses> {
  const rows = await sql`
    SELECT p.id AS pid,
           COALESCE(ARRAY_AGG(n.ng_date::text ORDER BY n.ng_date) FILTER (WHERE n.ng_date IS NOT NULL), ARRAY[]::text[]) AS ng_dates
    FROM scheduling_participants p
    LEFT JOIN scheduling_ng_dates n ON n.participant_id = p.id AND n.event_id = ${eventId}
    WHERE p.event_id = ${eventId} AND p.email_verified_at IS NOT NULL
    GROUP BY p.id
    ORDER BY p.id ASC
  `;
  const responses = rows.map((raw, i) => {
    const r = raw as { ng_dates: unknown };
    return {
      key: `p${i + 1}`,
      ngDates: Array.isArray(r.ng_dates) ? (r.ng_dates as unknown[]).map(toDateStr) : [],
    };
  });
  return { verifiedCount: responses.length, responses };
}

// 候補日ごとの NG 人数（匿名集計）
export function aggregateNgCounts(responses: AnonymizedResponses['responses']): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of responses) {
    for (const d of new Set(r.ngDates)) m.set(d, (m.get(d) ?? 0) + 1);
  }
  return m;
}

// ── 算出結果・確定 ─────────────────────────────────────────
// 算出結果は scheduling_events.compute_result（既存 JSONB）に保存（既に永続化済みのため results 表は作らない）。
export async function saveResult(
  sql: Sql,
  args: { eventId: string; ownerUserId: string; result: unknown; orderedDates: string[] }
): Promise<boolean> {
  const dates = parseCandidateDates(args.orderedDates);
  const rows = await sql`
    UPDATE scheduling_events
    SET compute_result = ${JSON.stringify(args.result)}::jsonb,
        candidate_dates = ${JSON.stringify(dates)}::jsonb,
        updated_at = now()
    WHERE id = ${args.eventId} AND owner_user_id = ${args.ownerUserId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function setChosenDate(
  sql: Sql,
  args: { eventId: string; ownerUserId: string; finalizedTs: string }
): Promise<boolean> {
  const rows = await sql`
    UPDATE scheduling_events
    SET finalized_date = ${args.finalizedTs}, updated_at = now()
    WHERE id = ${args.eventId} AND owner_user_id = ${args.ownerUserId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function recordNotification(
  sql: Sql,
  args: { eventId: string; participantId: number | null; kind: string; ok: boolean }
): Promise<void> {
  await sql`
    INSERT INTO scheduling_notifications (event_id, participant_id, kind, status)
    VALUES (${args.eventId}, ${args.participantId}, ${args.kind}, ${args.ok ? 'sent' : 'failed'})
  `;
}

// ── 状態機械 ──────────────────────────────────────────────
export type TransitionResult =
  | { ok: true; status: SchedulingStatus }
  | { ok: false; reason: 'invalid_transition' | 'not_found_or_stale' };

// 既存の状態名で許可遷移のみ。不正遷移は DB に触れず拒否。
// WHERE status = from を条件にするので、並行更新で状態が変わっていたら not_found_or_stale。
export async function transitionStatus(
  sql: Sql,
  args: { eventId: string; from: SchedulingStatus; to: SchedulingStatus; ownerUserId?: string }
): Promise<TransitionResult> {
  if (!canTransition(args.from, args.to)) return { ok: false, reason: 'invalid_transition' };
  const rows = args.ownerUserId
    ? await sql`
        UPDATE scheduling_events SET status = ${args.to}, updated_at = now()
        WHERE id = ${args.eventId} AND status = ${args.from} AND owner_user_id = ${args.ownerUserId}
        RETURNING status
      `
    : await sql`
        UPDATE scheduling_events SET status = ${args.to}, updated_at = now()
        WHERE id = ${args.eventId} AND status = ${args.from}
        RETURNING status
      `;
  if (rows.length === 0) return { ok: false, reason: 'not_found_or_stale' };
  return { ok: true, status: args.to };
}

// ── 共通 ──────────────────────────────────────────────────
// DATE 列は SQL 側で ::text にして文字列で受ける。万一 Date で来たら **ローカル日付**で組む
// （ドライバは DATE をローカル深夜の Date にするため、toISOString だと JST では前日にずれる。Vercel=UTC では出ない差）
function toDateStr(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v instanceof Date ? v : new Date(String(v));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
