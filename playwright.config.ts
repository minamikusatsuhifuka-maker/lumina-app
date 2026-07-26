import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// 認証情報の読み込み優先順位: .env.local（E2E_EMAIL/E2E_PASSWORD）→ .env.e2e（フォールバック）
// ※ .env.local は変更しない運用のため、専用アカウントの認証情報は .env.e2e（gitignore済み）に置く
for (const file of ['.env.local', '.env.e2e']) {
  const p = path.join(__dirname, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, '').replace(/\\n$/, '');
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

export const STORAGE_STATE = path.join(__dirname, 'playwright/.auth/user.json');

// 指示書は https://xlumina.jp 指定だが、apex→www へ 307 リダイレクトされるため正規の www を使う
export const BASE_URL = 'https://www.xlumina.jp';

export default defineConfig({
  testDir: './tests/e2e',
  // 本番に対する実行のため、テスト間の干渉（件数・フォルダ集計のズレ）を避けて直列実行
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // アプリはoffline対応のService Workerを登録しており、page.routeのモックが
    // 迂回されてしまうためテストでは無効化する
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'smoke',
      testMatch: /(smoke|gen)\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: STORAGE_STATE },
    },
  ],
});
