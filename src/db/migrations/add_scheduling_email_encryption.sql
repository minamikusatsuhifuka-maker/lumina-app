-- 109 ②A: 日程調整 参加者メールの保存時暗号化（段階移行 ①〜③）
-- 冪等。手動適用（Neon SQL Editor）または `node scripts/run-migration.mjs src/db/migrations/add_scheduling_email_encryption.sql`。
-- 同じ DDL は src/lib/scheduling.ts の ensureSchedulingTables() にも入っており、API 初回アクセスでも自動適用される（R-10）。
-- 既存の平文 email 列・UNIQUE(event_id, email) はこのランでは触らない（④で別ゴーサイン後）。

ALTER TABLE scheduling_participants ADD COLUMN IF NOT EXISTS email_enc TEXT;
ALTER TABLE scheduling_participants ADD COLUMN IF NOT EXISTS email_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_scheduling_participants_event_hash ON scheduling_participants (event_id, email_hash);

-- scheduling_results 表は作らない: AI 算出結果は scheduling_events.compute_result（JSONB・⑤で追加済み）に既に永続化されている。
-- compute は collecting→ready の一度きりなので履歴は最大1件＝既存列で足りる。

-- ─────────────────────────────────────────────────────────────
-- ④ 平文 NULL 化（本ランでは実行しない・別ゴーサイン後）。以下はコメントのため run-migration.mjs では実行されない。
-- 前提: GET /api/admin/scheduling/backfill-email で remainingHash=0 かつ remainingEnc=0 を確認済み。
-- 手順案:
--   1) コード側を「平文を書かない／読まない」に切替（upsert の INSERT から email を外し、ON CONFLICT を (event_id, email_hash) へ）
--   2) 一意制約の付け替え（冪等・R-10 の順序）:
--        CREATE UNIQUE INDEX IF NOT EXISTS uq_scheduling_participants_event_hash ON scheduling_participants (event_id, email_hash);
--        ALTER TABLE scheduling_participants DROP CONSTRAINT IF EXISTS scheduling_participants_event_id_email_key;
--        ALTER TABLE scheduling_participants ALTER COLUMN email DROP NOT NULL;
--   3) 平文の消去（enc/hash が揃っている行だけ）:
--        UPDATE scheduling_participants SET email = NULL WHERE email IS NOT NULL AND email_enc IS NOT NULL AND email_hash IS NOT NULL;
--   4) 確認: SELECT COUNT(*) FROM scheduling_participants WHERE email IS NOT NULL;  → 0
--   5) 後日、列そのものの削除（任意）: ALTER TABLE scheduling_participants DROP COLUMN IF EXISTS email;
