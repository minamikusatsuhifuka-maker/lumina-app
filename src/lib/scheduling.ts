import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { neon } from '@neondatabase/serverless';

// 日程調整機能の共通基盤（DBスキーマ冪等作成・公開トークン生成・状態機械・OTP）
// 追加式。既存テーブルには一切触れない。

type Sql = ReturnType<typeof neon<false, false>>;

// ── 公開トークン ─────────────────────────────────────────────
// イベントID = URL に載る公開トークン。推測困難なランダム文字列（連番にしない）。
// base64url（記号 +/= を含まない）で 144bit のエントロピー。
export function generateEventToken(): string {
  return randomBytes(18).toString('base64url');
}

// ── OTP（本人確認コード）────────────────────────────────────
// 6桁の確認コードを生成（先頭ゼロ保持）。
export function generateOtpCode(): string {
  // 000000〜999999 を一様に
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, '0');
}

// OTPはハッシュで保存（平文保存しない）。pepper に AUTH/NEXTAUTH_SECRET を混ぜる。
export function hashOtp(code: string): string {
  const pepper = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';
  return createHash('sha256').update(`${code}:${pepper}`).digest('hex');
}

// 定数時間でハッシュ比較
export function verifyOtp(code: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashOtp(code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const OTP_TTL_MS = 10 * 60 * 1000; // 有効期限10分
export const OTP_MAX_ATTEMPTS = 5; // 5回失敗でロック

// ── 状態機械（scheduling_events.status）───────────────────────
export type SchedulingStatus =
  | 'draft'
  | 'collecting'
  | 'ready'
  | 'finalized'
  | 'notified'
  | 'cancelled';

export const SCHEDULING_STATUSES: SchedulingStatus[] = [
  'draft',
  'collecting',
  'ready',
  'finalized',
  'notified',
  'cancelled',
];

// 許可遷移。cancelled へは（notified/cancelled 以外の）どの状態からでも可。
const ALLOWED_TRANSITIONS: Record<SchedulingStatus, SchedulingStatus[]> = {
  draft: ['collecting', 'finalized', 'cancelled'], // 1対1は collecting/ready を飛ばして finalized へ短縮可
  collecting: ['ready', 'finalized', 'cancelled'],
  ready: ['finalized', 'cancelled'],
  finalized: ['notified', 'cancelled'],
  notified: [],
  cancelled: [],
};

export function canTransition(from: SchedulingStatus, to: SchedulingStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── スキーマ冪等作成 ─────────────────────────────────────────
// 各APIの先頭で呼ぶ。初回アクセス時に冪等作成（既存データ破壊なし）。
let ensured = false;
export async function ensureSchedulingTables(sql: Sql): Promise<void> {
  if (ensured) return;

  // 調整イベント本体（id = 公開トークン）
  await sql`CREATE TABLE IF NOT EXISTS scheduling_events (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'multi',
    status TEXT NOT NULL DEFAULT 'draft',
    candidate_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
    finalized_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_scheduling_events_owner ON scheduling_events (owner_user_id)`;

  // 参加者
  await sql`CREATE TABLE IF NOT EXISTS scheduling_participants (
    id SERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    email_verified_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(event_id, email)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_scheduling_participants_event ON scheduling_participants (event_id)`;

  // OTP（本人確認）用カラムを冪等に追加（フェーズ④。既存行は NULL で非破壊）。
  // ハッシュのみ保存・期限・試行回数・最終送信時刻（送信間隔制限用）。
  await sql`ALTER TABLE scheduling_participants ADD COLUMN IF NOT EXISTS otp_hash TEXT`;
  await sql`ALTER TABLE scheduling_participants ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ`;
  await sql`ALTER TABLE scheduling_participants ADD COLUMN IF NOT EXISTS otp_attempts INT NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE scheduling_participants ADD COLUMN IF NOT EXISTS otp_last_sent_at TIMESTAMPTZ`;

  // ⑤の算出結果（ランク・理由など）を保持（フェーズ⑤。既存行は NULL で非破壊）
  await sql`ALTER TABLE scheduling_events ADD COLUMN IF NOT EXISTS compute_result JSONB`;

  // ③-1（1対1 手動スロット）。time_slots=[{start,end}] のJSONB。既存行は NULL で非破壊。
  // candidate_dates（複数名用・日付のみ）とは別カラムで、日付検証を壊さない。
  await sql`ALTER TABLE scheduling_events ADD COLUMN IF NOT EXISTS time_slots JSONB`;
  await sql`ALTER TABLE scheduling_participants ADD COLUMN IF NOT EXISTS selected_slot JSONB`;

  // 参加者ごとのNG日
  await sql`CREATE TABLE IF NOT EXISTS scheduling_ng_dates (
    id SERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    participant_id INT NOT NULL,
    ng_date DATE NOT NULL,
    UNIQUE(participant_id, ng_date)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_scheduling_ng_event ON scheduling_ng_dates (event_id)`;

  // 通知ログ（確定通知等の送信記録。送信自体はフェーズ⑥）
  await sql`CREATE TABLE IF NOT EXISTS scheduling_notifications (
    id SERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    participant_id INT,
    kind TEXT NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'sent'
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_scheduling_notifications_event ON scheduling_notifications (event_id)`;

  // 説明文テンプレート（機能109）。作成者単位。既存行は無く非破壊。
  await sql`CREATE TABLE IF NOT EXISTS scheduling_description_templates (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    created_by TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_sched_desc_tmpl_owner ON scheduling_description_templates (created_by, updated_at DESC)`;

  ensured = true;
}

// ── 入力検証ヘルパー ─────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}

// 簡易メール形式チェック（厳密すぎない実用判定）
export function isValidEmail(s: unknown): s is string {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

// ── 1対1 時間スロット（③-1）──────────────────────────────
// 壁時計のJST想定で 'YYYY-MM-DDTHH:MM' 形式（日付検証 DATE_RE とは別系統）。
const SLOT_DT_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

export interface TimeSlot {
  start: string;
  end: string;
}

export function isValidSlotDateTime(s: unknown): s is string {
  return typeof s === 'string' && SLOT_DT_RE.test(s);
}

export function isValidSlot(slot: unknown): slot is TimeSlot {
  if (!slot || typeof slot !== 'object') return false;
  const s = slot as Record<string, unknown>;
  return (
    isValidSlotDateTime(s.start) &&
    isValidSlotDateTime(s.end) &&
    (s.start as string) < (s.end as string) // 固定長フォーマットゆえ文字列比較で時系列比較が成立
  );
}

// time_slots（JSONB）を正規化：不正除去・start<end・重複除去・start昇順
export function parseTimeSlots(raw: unknown): TimeSlot[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: TimeSlot[] = [];
  for (const item of arr) {
    if (!isValidSlot(item)) continue;
    const key = `${item.start}|${item.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ start: item.start, end: item.end });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

// candidate_dates（JSONB）を 'YYYY-MM-DD' の配列へ正規化（不正値は除去）
export function parseCandidateDates(raw: unknown): string[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return Array.from(new Set(arr.filter(isValidDateStr))).sort();
}

// ── 公開フロー用ローダ ───────────────────────────────────────
export interface SchedulingEventRow {
  id: string;
  owner_user_id: string;
  title: string;
  description: string | null;
  type: string;
  status: SchedulingStatus;
  candidate_dates: unknown;
  time_slots: unknown;
}

// token（=id）でイベントを取得（公開情報のみ。存在しなければ null）
export async function loadEventByToken(
  sql: Sql,
  token: string
): Promise<SchedulingEventRow | null> {
  const rows = await sql`
    SELECT id, owner_user_id, title, description, type, status, candidate_dates, time_slots
    FROM scheduling_events
    WHERE id = ${token}
  `;
  return (rows[0] as SchedulingEventRow) ?? null;
}

export interface ParticipantRow {
  id: number;
  email: string;
  email_verified_at: string | null;
  responded_at: string | null;
  otp_hash: string | null;
  otp_expires_at: string | null;
  otp_attempts: number;
  otp_last_sent_at: string | null;
}

// event_id + email で参加者を取得（本人のみ。存在しなければ null）
export async function loadParticipant(
  sql: Sql,
  eventId: string,
  email: string
): Promise<ParticipantRow | null> {
  const rows = await sql`
    SELECT id, email, email_verified_at, responded_at,
           otp_hash, otp_expires_at, otp_attempts, otp_last_sent_at
    FROM scheduling_participants
    WHERE event_id = ${eventId} AND email = ${email}
  `;
  return (rows[0] as ParticipantRow) ?? null;
}
