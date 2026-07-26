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

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});
