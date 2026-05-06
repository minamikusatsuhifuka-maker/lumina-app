// Neon経由でマイグレーションSQLを実行する一回限りのスクリプト
// 使い方: node scripts/run-migration.mjs <SQLファイルのパス>
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';

// .env.local を優先し、なければ .env を読み込む
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const target = process.argv[2];
if (!target) {
  console.error('使い方: node scripts/run-migration.mjs <SQLファイルのパス>');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('環境変数 DATABASE_URL が読み込めませんでした (.env.local を確認)');
  process.exit(1);
}

const sqlClient = neon(dbUrl);
const rawSql = readFileSync(resolve(target), 'utf8');

// 行ベースのコメント (-- ...) を除去してからセミコロンで分割
const sqlText = rawSql
  .split('\n')
  .map(line => {
    const idx = line.indexOf('--');
    return idx >= 0 ? line.slice(0, idx) : line;
  })
  .join('\n');

const statements = sqlText
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`実行: ${target}`);
console.log(`ステートメント数: ${statements.length}`);

for (const stmt of statements) {
  const head = stmt.slice(0, 80).replace(/\s+/g, ' ');
  console.log(`▶ ${head}${stmt.length > 80 ? '...' : ''}`);
  try {
    await sqlClient.query(stmt);
    console.log('  ✅ OK');
  } catch (err) {
    console.error(`  ❌ 失敗: ${err.message}`);
    process.exit(1);
  }
}

console.log('全ステートメント完了');
