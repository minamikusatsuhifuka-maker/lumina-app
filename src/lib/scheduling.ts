import { randomBytes } from 'crypto';
import { neon } from '@neondatabase/serverless';

// 日程調整機能の共通基盤（DBスキーマ冪等作成・公開トークン生成・状態機械）
// 追加式。既存テーブルには一切触れない。

type Sql = ReturnType<typeof neon<false, false>>;

// ── 公開トークン ─────────────────────────────────────────────
// イベントID = URL に載る公開トークン。推測困難なランダム文字列（連番にしない）。
// base64url（記号 +/= を含まない）で 144bit のエントロピー。
export function generateEventToken(): string {
  return randomBytes(18).toString('base64url');
}

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

  ensured = true;
}
