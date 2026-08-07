import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { STORAGE_STATE } from '../../playwright.config';

// ログインして storageState を保存する（以降の全テストが再利用）。
// 認証情報は .env.local の E2E_EMAIL / E2E_PASSWORD、無ければ .env.e2e（専用アカウント）。
setup('ログインして認証状態を保存', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL / E2E_PASSWORD が未設定です。.env.local か .env.e2e に設定してください。',
    );
  }

  await page.goto('/auth?tab=login');
  await page.getByPlaceholder('メールアドレス').fill(email);
  await page.getByPlaceholder('パスワード（6文字以上）').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard**', { timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  // flaky真因対策: オンボーディング（113）のウェルカムモーダルは localStorage
  // 'xlumina_onboarding_done' 不在時にページ読込1秒後、全画面バックドロップ（fixed inset-0 z-100）で
  // 開く。テストは毎回freshコンテキスト＝フラグ無しのため、遅いテストほど途中で全クリックが
  // 遮蔽され「<div> intercepts pointer events」の恒常タイムアウトになる（C19/C20/C22の長年の真因）。
  // storageState に完了フラグを焼き込み、全テストでモーダルを決定的に抑止する。
  await page.evaluate(() => localStorage.setItem('xlumina_onboarding_done', 'true'));

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
