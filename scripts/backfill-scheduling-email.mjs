// 109 ②: 参加者メールのバックフィルをローカルから実行する一回限りのスクリプト（冪等）。
// 使い方（どのディレクトリからでも可。Node 24 が .ts を型ストリップで直接読む）:
//   SCHEDULING_ENCRYPTION_KEY=<hex64> node <パス>/scripts/backfill-scheduling-email.mjs            # 実行
//   SCHEDULING_ENCRYPTION_KEY=<hex64> node <パス>/scripts/backfill-scheduling-email.mjs --dry-run  # 件数だけ
//   node <パス>/scripts/backfill-scheduling-email.mjs --status                                      # 進捗だけ（鍵不要）
//   ... --event <公開トークン>  # そのイベントの行だけ（検証用）
// DATABASE_URL は .env.local から読む。鍵は本番（Vercel）と同じ値を環境変数で渡す（.env.local には書かない）。
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { backfillParticipantEmails, getBackfillStatus } from '../src/lib/scheduling/backfill.ts';

// .env.local はスクリプトの位置（プロジェクト直下）基準で読む（cwd に依存しない）
config({ path: fileURLToPath(new URL('../.env.local', import.meta.url)), quiet: true });
config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const statusOnly = args.includes('--status');
const evIdx = args.indexOf('--event');
const eventId = evIdx >= 0 ? args[evIdx + 1] : undefined;

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('環境変数 DATABASE_URL が読み込めませんでした (.env.local を確認)');
  process.exit(1);
}
const sql = neon(dbUrl);

if (statusOnly) {
  const s = await getBackfillStatus(sql);
  console.log(JSON.stringify(s, null, 2));
  process.exit(0);
}

if (!process.env.SCHEDULING_ENCRYPTION_KEY) {
  console.warn('⚠ SCHEDULING_ENCRYPTION_KEY が未設定です。email_hash だけ埋め、email_enc は埋めません（鍵設定後に再実行で埋まります）');
}

const r = await backfillParticipantEmails(sql, { dryRun, eventId });
console.log(JSON.stringify(r, null, 2));
if (!r.columnsReady) {
  console.error('❌ email_enc / email_hash 列がありません。先に src/db/migrations/add_scheduling_email_encryption.sql を適用してください');
  process.exit(1);
}
console.log(dryRun ? `（dry-run）対象 ${r.updated} 件` : `✅ 更新 ${r.updated} 件 / 残り hash ${r.remainingHash} 件・enc ${r.remainingEnc} 件`);
