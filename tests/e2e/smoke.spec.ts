import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';
import { BASE_URL, STORAGE_STATE } from '../../playwright.config';
import {
  SAVES_API,
  RUN_ID,
  SEED_TOKEN,
  BODY_TOKEN,
  SEED_FOLDER,
  listSaves,
  createSave,
  patchSaves,
  deleteSave,
  cleanupE2ESaves,
} from './helpers';

// ============================================================================
// スモークテスト（残E2Eチェックリスト C系＋B表示系）
// - 本番 https://www.xlumina.jp に対して実行。既存データは参照のみで変更しない
// - 書き込みを伴う検証は「[E2E] + 実行毎トークン」付きレコードを作成→検証→削除の自己完結型
// - AI課金なし（note素材選択はplan APIをモックしてプラン画面到達のみ検証）
// ============================================================================

const SEED_TOTAL = 32; // 30件ページングの2ページ目を確実に検証するため 30+2 件
const CROSS_TOKEN = `E2ECROSS${RUN_ID}`;
const CROSS_BODY_TOKEN = `E2ECROSSBODY${RUN_ID}`;

let api: APIRequestContext;
const seedIds: number[] = [];
let bodyTokenId = 0; // 本文にのみ BODY_TOKEN を含むレコード
let taggedId = 0; // tags: ['e2e-smoke-tag']
let inputId = 0; // inputText 付き
let crossIds: number[] = []; // 横断分析/note素材選択のUI検証用（2件）

const seedTitle = (i: number) => `[E2E] ${SEED_TOKEN} 記事${String(i).padStart(2, '0')}`;
const seedContent = (i: number) =>
  `[E2E] スモークテスト用の本文です（${SEED_TOKEN} / ${i}番）。この本文は検証後に削除されます。`;

test.beforeAll(async () => {
  api = await pwRequest.newContext({ baseURL: BASE_URL, storageState: STORAGE_STATE });
  // 過去実行の残骸を掃除してから、今回の実行分をシード
  await cleanupE2ESaves(api);
  for (let i = 0; i < SEED_TOTAL; i++) {
    const id = await createSave(api, {
      title: seedTitle(i),
      content:
        i === 0
          ? `${seedContent(i)} この語はタイトルに存在しない: ${BODY_TOKEN}`
          : seedContent(i),
      folder: SEED_FOLDER,
      tags: i === 1 ? ['e2e-smoke-tag'] : [],
      inputText: i === 2 ? `[E2E] 入力テキスト ${SEED_TOKEN}` : undefined,
    });
    seedIds.push(id);
    if (i === 0) bodyTokenId = id;
    if (i === 1) taggedId = id;
    if (i === 2) inputId = id;
  }
  // UI検証用（横断分析handoff・note素材選択）: 本文先頭80字に必ずトークンが入るようにする
  for (const label of ['A', 'B']) {
    const id = await createSave(api, {
      title: `[E2E] ${CROSS_TOKEN} 横断${label}`,
      content: `${CROSS_BODY_TOKEN} 横断分析handoff検証用の本文（${label}）です。本文が横断分析タブへ渡ることを先頭80文字の表示で確認します。`,
      folder: SEED_FOLDER,
    });
    crossIds.push(id);
  }
});

test.afterAll(async () => {
  await cleanupE2ESaves(api);
  await api.dispose();
});

// ============================================================================
// C系: 一覧応答
// ============================================================================

test('C1/C2: 一覧APIの応答形（items/total_count/all_total/folders/all_tags・本文非返却・30件以下）', async ({ request }) => {
  const list = await listSaves(request);
  expect(Array.isArray(list.items)).toBe(true);
  expect(list.items.length).toBeGreaterThan(0);
  expect(list.items.length).toBeLessThanOrEqual(30);
  expect(typeof list.total_count).toBe('number');
  expect(typeof list.all_total).toBe('number');
  expect(Array.isArray(list.folders)).toBe(true);
  expect(Array.isArray(list.all_tags)).toBe(true);
  // 絞り込みなしでは total_count === all_total
  expect(list.total_count).toBe(list.all_total);
  expect(list.all_total).toBeGreaterThanOrEqual(SEED_TOTAL);
  for (const item of list.items) {
    expect(item, '一覧itemsに本文(content)が含まれないこと').not.toHaveProperty('content');
    expect(item, '一覧itemsに入力(input_text)が含まれないこと').not.toHaveProperty('input_text');
    expect(typeof item.id).toBe('number');
  }
  for (const f of list.folders) {
    expect(typeof f.folder).toBe('string');
    expect(typeof f.count).toBe('number');
  }
});

test('C3: 30件ページング＋検索×ページング維持（qを保ったまま2ページ目・件数不変・重複なし）', async ({ request }) => {
  const page1 = await listSaves(request, { q: SEED_TOKEN, limit: 30, offset: 0 });
  expect(page1.total_count).toBe(SEED_TOTAL);
  expect(page1.items.length).toBe(30);

  const page2 = await listSaves(request, { q: SEED_TOKEN, limit: 30, offset: 30 });
  expect(page2.total_count, '2ページ目でも検索絞り込みの件数が維持されること').toBe(SEED_TOTAL);
  expect(page2.items.length).toBe(SEED_TOTAL - 30);

  const ids1 = new Set(page1.items.map((i) => i.id));
  for (const item of page2.items) {
    expect(ids1.has(item.id as number), 'ページ間でレコードが重複しないこと').toBe(false);
  }
});

// ============================================================================
// C系: 検索
// ============================================================================

test('C4: タイトル語検索（単一ヒット）', async ({ request }) => {
  const list = await listSaves(request, { q: `${SEED_TOKEN} 記事31` });
  expect(list.total_count).toBe(1);
  expect(list.items[0].auto_title).toBe(seedTitle(31));
});

test('C5: 本文にしかない語でq検索がヒットする（本文は返さない）', async ({ request }) => {
  const list = await listSaves(request, { q: BODY_TOKEN });
  expect(list.total_count).toBe(1);
  expect(list.items[0].id).toBe(bodyTokenId);
  expect(list.items[0], 'ヒットしても本文は一覧に含まれないこと').not.toHaveProperty('content');
});

test('C6: フォルダ絞り込みとフォルダ集計', async ({ request }) => {
  const list = await listSaves(request, { q: SEED_TOKEN, folder: SEED_FOLDER });
  expect(list.total_count).toBe(SEED_TOTAL);
  for (const item of list.items) {
    expect(item.folder).toBe(SEED_FOLDER);
  }
  const all = await listSaves(request);
  const agg = all.folders.find((f) => f.folder === SEED_FOLDER);
  expect(agg, 'フォルダ集計にシードフォルダが載ること').toBeTruthy();
  expect(agg!.count).toBeGreaterThanOrEqual(SEED_TOTAL);
});

test('C7: お気に入り絞り込み（toggle_favoriteの往復）', async ({ request }) => {
  const target = seedIds[3];
  const on = await patchSaves(request, { action: 'toggle_favorite', id: target });
  expect(on.status()).toBe(200);

  const favList = await listSaves(request, { q: SEED_TOKEN, favorite: 1 });
  expect(favList.total_count).toBe(1);
  expect(favList.items[0].id).toBe(target);
  expect(favList.items[0].favorite).toBeTruthy();

  const off = await patchSaves(request, { action: 'toggle_favorite', id: target });
  expect(off.status()).toBe(200);
  const favList2 = await listSaves(request, { q: SEED_TOKEN, favorite: 1 });
  expect(favList2.total_count, '解除後はお気に入り0件に戻ること').toBe(0);
});

test('C8: 入力付き（hasInput=1）絞り込み', async ({ request }) => {
  const list = await listSaves(request, { q: SEED_TOKEN, hasInput: 1 });
  expect(list.total_count).toBe(1);
  expect(list.items[0].id).toBe(inputId);
  expect(list.items[0].has_input).toBeTruthy();
  expect(Number(list.items[0].input_char_count)).toBeGreaterThan(0);
});

test('C9: タグが保存され一覧集計（all_tags）に載る', async ({ request }) => {
  const list = await listSaves(request, { q: SEED_TOKEN });
  expect(list.all_tags).toContain('e2e-smoke-tag');
  const single = await request.get(`${SAVES_API}?id=${taggedId}`);
  expect(single.status()).toBe(200);
  const json = await single.json();
  expect(json.tags).toContain('e2e-smoke-tag');
});

// ============================================================================
// C系: 本文遅延取得（全文表示・コピー・MD/TXT/Word/ZIPのデータ供給）
// ============================================================================

test('C10: 単体取得（?id=）で本文が非空で返る（全文表示・コピー相当）', async ({ request }) => {
  const res = await request.get(`${SAVES_API}?id=${seedIds[5]}`);
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.content).toBe(seedContent(5));
  expect(String(json.content).length).toBeGreaterThan(0);
  expect(json.auto_title).toBe(seedTitle(5));
});

test('C11: 一括取得（?ids=）で全件の本文が非空（MD/TXT/Word/ZIPダウンロードのデータ供給）', async ({ request }) => {
  // MD/TXT/Word/ZIP はクライアント側生成のため、供給元である ?id=/?ids= の本文非空で機械判定する
  const pick = [seedIds[6], seedIds[7], seedIds[8]];
  const res = await request.get(`${SAVES_API}?ids=${pick.join(',')}`);
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.items.length).toBe(3);
  for (const item of json.items) {
    expect(pick).toContain(item.id);
    expect(String(item.content).length, '各レコードの本文が空でないこと').toBeGreaterThan(0);
  }
});

test('C12: 入力テキストの遅延取得（?id=&withInput=1）', async ({ request }) => {
  const res = await request.get(`${SAVES_API}?id=${inputId}&withInput=1`);
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.input_text).toBe(`[E2E] 入力テキスト ${SEED_TOKEN}`);
});

// ============================================================================
// C系: owner検証・認証
// ============================================================================

test('C13: 不正ID・他人ID相当は拒否される（owner検証）', async ({ request }) => {
  // 存在しないID／他ユーザーのIDはどちらも WHERE user_id 条件で弾かれ 404 になる（同一コードパス）
  const res = await request.get(`${SAVES_API}?id=999999999`);
  expect(res.status()).toBe(404);

  const idsRes = await request.get(`${SAVES_API}?ids=999999999`);
  expect(idsRes.status()).toBe(200);
  const idsJson = await idsRes.json();
  expect(idsJson.items.length, '?ids= でも他人/不正IDは返らないこと').toBe(0);
});

test('C14: 未認証リクエストは401', async () => {
  // 注: テストランナー内の request.newContext() は config の storageState を引き継ぐため、
  // 空の storageState を明示して「未認証」を保証する
  const anon = await pwRequest.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const list = await anon.get(SAVES_API);
    expect(list.status()).toBe(401);
    const single = await anon.get(`${SAVES_API}?id=${seedIds[0]}`);
    expect(single.status(), '実在IDでも未認証なら本文が漏れないこと').toBe(401);
  } finally {
    await anon.dispose();
  }
});

// ============================================================================
// C系: 編集（テスト専用レコードで自己完結）・一括移動
// ============================================================================

test('C15: ✏編集の空content上書き防止＋正常編集（作成→編集→検証→削除の自己完結）', async ({ request }) => {
  const id = await createSave(request, {
    title: `[E2E] 編集検証 ${RUN_ID}`,
    content: '[E2E] 編集前の本文',
  });
  try {
    // 空contentは400で拒否され、本文が保持されること
    for (const emptyContent of ['', '   ']) {
      const res = await patchSaves(request, {
        action: 'update',
        id,
        title: `[E2E] 編集検証 ${RUN_ID}`,
        content: emptyContent,
      });
      expect(res.status(), '空contentでの上書きは400で拒否されること').toBe(400);
      const err = await res.json();
      expect(String(err.error)).toContain('空にできません');
    }
    let current = await (await request.get(`${SAVES_API}?id=${id}`)).json();
    expect(current.content, '拒否後も本文が変わっていないこと').toBe('[E2E] 編集前の本文');

    // 正常な編集は反映され、contentが空になっていないこと
    const ok = await patchSaves(request, {
      action: 'update',
      id,
      title: `[E2E] 編集検証 ${RUN_ID} 改`,
      content: '[E2E] 編集後の本文',
    });
    expect(ok.status()).toBe(200);
    current = await (await request.get(`${SAVES_API}?id=${id}`)).json();
    expect(current.content).toBe('[E2E] 編集後の本文');
    expect(String(current.content).length).toBeGreaterThan(0);
    expect(current.auto_title).toBe(`[E2E] 編集検証 ${RUN_ID} 改`);
  } finally {
    await deleteSave(request, id);
  }
  const after = await request.get(`${SAVES_API}?id=${id}`);
  expect(after.status(), '削除後は404になること').toBe(404);
});

test('C16: リネーム（action:rename）', async ({ request }) => {
  const id = await createSave(request, {
    title: `[E2E] リネーム前 ${RUN_ID}`,
    content: '[E2E] リネーム検証用本文',
  });
  try {
    const res = await patchSaves(request, {
      action: 'rename',
      id,
      title: `[E2E] リネーム後 ${RUN_ID}`,
    });
    expect(res.status()).toBe(200);
    const current = await (await request.get(`${SAVES_API}?id=${id}`)).json();
    expect(current.auto_title).toBe(`[E2E] リネーム後 ${RUN_ID}`);
    expect(current.content, 'リネームで本文が消えないこと').toBe('[E2E] リネーム検証用本文');
  } finally {
    await deleteSave(request, id);
  }
});

test('C17: 一括フォルダ移動（action:bulk_folder）', async ({ request }) => {
  const moveFolder = `E2E移動先${RUN_ID}`;
  const ids = [
    await createSave(request, { title: `[E2E] 一括移動1 ${RUN_ID}`, content: '[E2E] 移動検証1' }),
    await createSave(request, { title: `[E2E] 一括移動2 ${RUN_ID}`, content: '[E2E] 移動検証2' }),
  ];
  try {
    const res = await patchSaves(request, { action: 'bulk_folder', ids, folder: moveFolder });
    expect(res.status()).toBe(200);
    for (const id of ids) {
      const row = await (await request.get(`${SAVES_API}?id=${id}`)).json();
      expect(row.folder).toBe(moveFolder);
    }
    const list = await listSaves(request);
    const agg = list.folders.find((f) => f.folder === moveFolder);
    expect(agg?.count, '移動先フォルダが集計に2件で載ること').toBe(2);
  } finally {
    for (const id of ids) await deleteSave(request, id);
  }
});

// ============================================================================
// C系: 横断分析 handoff（2経路・本文が渡ること）
// ============================================================================

async function selectTwoCrossCards(page: import('@playwright/test').Page) {
  const search = page.getByPlaceholder('🔍 タイトル・本文で検索').filter({ visible: true });
  await search.fill(CROSS_TOKEN);
  // C19/C20安定化: ポインタクリックは浮遊要素（追従ボタン等）の一時的な重なりで
  // 「<div> intercepts pointer events」の恒常タイムアウトになることがある（repeat-each 3で再現）。
  // 実input[type=checkbox]のため focus＋Space のキーボード操作で決定的にトグルする
  // （onChange発火・実ユーザーのキーボード操作と同経路）。
  for (const id of crossIds) {
    const cb = page.locator(`[data-bundle-key="ana-${id}"]`).getByRole('checkbox').first();
    await expect(cb).toBeVisible();
    await cb.focus();
    await page.keyboard.press(' ');
    await expect(cb).toBeChecked();
  }
  await page.getByRole('button', { name: '🔀 選択した2件を横断分析する' }).click();
}

test('C18: 横断分析handoff 経路A（テキスト分析ページのタブ内）で本文が渡る', async ({ page }) => {
  await page.goto('/dashboard/text-analysis?tab=saved');
  await selectTwoCrossCards(page);
  await expect(page.getByText('2件選択中')).toBeVisible();
  // 選択カードに本文先頭が表示される＝本文が渡っている
  // （タイトルは非表示タブの一覧カードにも存在するため visible で絞る）
  await expect(page.getByText(new RegExp(CROSS_BODY_TOKEN)).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(`[E2E] ${CROSS_TOKEN} 横断A`).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(`[E2E] ${CROSS_TOKEN} 横断B`).filter({ visible: true })).toBeVisible();
});

test('C19: 横断分析handoff 経路B（保存一覧ページ→sessionStorage経由）で本文が渡る', async ({ page }) => {
  await page.goto('/dashboard/saved');
  await selectTwoCrossCards(page);
  await page.waitForURL('**/dashboard/text-analysis?tab=cross');
  await expect(page.getByText('2件選択中')).toBeVisible();
  await expect(page.getByText(new RegExp(CROSS_BODY_TOKEN)).filter({ visible: true }).first()).toBeVisible();
});

// ============================================================================
// C系: note素材選択（180）→ プラン画面到達
// ============================================================================

test('C20: note素材選択（180）でプラン画面に到達し、選択した資料がplan APIへ渡る', async ({ page }) => {
  // plan APIはAI課金が発生するためモックし、「選択→次へ→プラン画面到達」とhandoffペイロードを検証する
  // （実AIでの完走は gen.spec.ts（@gen）側で検証）
  const planPayloads: { sources?: { source: string; id: number }[] }[] = [];
  await page.route('**/api/note-bundle/plan', async (route) => {
    planPayloads.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        articles: [
          {
            title: '[E2E] モックプラン記事',
            sources: crossIds.map((id) => `ana-${id}`),
            points: ['要点1'],
            style: 'balanced',
            patterns: [],
          },
        ],
        materials: crossIds.map((id, i) => ({
          key: `ana-${id}`,
          source: 'analysis',
          id,
          topic: `[E2E] ${CROSS_TOKEN} 横断${i === 0 ? 'A' : 'B'}`,
        })),
        patternOptions: [],
      }),
    });
  });

  await page.goto('/dashboard/saved');
  const search = page.getByPlaceholder('🔍 タイトル・本文で検索').filter({ visible: true });
  await search.fill(CROSS_TOKEN);
  await expect(page.locator(`[data-bundle-key="ana-${crossIds[0]}"]`)).toBeVisible();

  // 選択モードに入り、2件をnote素材として選択
  await page
    .getByRole('button', { name: '📝 記事にまとめる資料を選ぶ' })
    .filter({ visible: true })
    .click();
  // 187の「→次へ」追従ボタン等の浮遊要素がチェックボックスを覆うことがある（flaky要因）。
  // selectTwoCrossCards と同じく focus＋Space のキーボード操作で決定的にトグルする
  for (const id of crossIds) {
    const cb = page.locator(`[data-bundle-key="ana-${id}"]`).getByRole('checkbox').first();
    await expect(cb).toBeVisible();
    await cb.focus();
    await page.keyboard.press(' ');
    await expect(cb).toBeChecked();
  }

  // 追従ボタン → 確認モーダル → 生成モーダル（プラン画面）
  await page.getByRole('button', { name: /2件選択中 → 次へ/ }).click();
  await expect(page.getByText(/🗂テキスト分析 2件/)).toBeVisible();
  await page.getByRole('button', { name: '📝 note記事にまとめる' }).click();

  // プラン画面到達の判定
  await expect(page.getByText('選択した資料から note 記事群を生成')).toBeVisible();
  await expect(page.getByText(/💡 AIの提案です/)).toBeVisible();
  await expect(page.getByRole('button', { name: /🚀 この構成で生成/ })).toBeVisible();

  // 選択した2件（ana-キー）がplan APIへ渡っていること
  expect(planPayloads.length).toBeGreaterThanOrEqual(1);
  const sources = planPayloads[0].sources ?? [];
  expect(sources.length).toBe(2);
  for (const id of crossIds) {
    expect(
      sources.some((s) => s.source === 'analysis' && Number(s.id) === id),
      `選択した資料 ana-${id} がplanリクエストに含まれること`,
    ).toBe(true);
  }
});

// ============================================================================
// B系: 表示確認
// ============================================================================

test('B2: writeページの見出しに「Claude Sonnet 5」が表示される', async ({ page }) => {
  await page.goto('/dashboard/write');
  await expect(page.getByText('✍️ AI文章作成')).toBeVisible();
  await expect(page.getByText(/Claude Sonnet 5/).filter({ visible: true }).first()).toBeVisible();
});

test('B12: api-usageページに単価（$3/$15）の表記が表示される', async ({ page }) => {
  // 注: $5/$25（Opus単価）はサーバ側の単価テーブルのみで画面表示は無いため、表示検証は $3/$15 が対象
  await page.goto('/dashboard/api-usage');
  await expect(page.getByText(/料金計算について/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/\$3\/1Mトークン/)).toBeVisible();
  await expect(page.getByText(/\$15\/1Mトークン/)).toBeVisible();
  await expect(page.getByText(/Claude Sonnet 5/).filter({ visible: true }).first()).toBeVisible();
});

test('B8: ハンドブック比較の3列ラベル', async ({ page, request }) => {
  // 197: E2Eアカウントに users.is_admin=TRUE を付与済み（院長承認・2026/7/26）。
  // /admin へ到達できない場合はskipせず失敗させる（権限退行の検知）
  const handbooks = await request.get('/api/clinic/handbooks');
  expect(handbooks.status()).toBe(200);
  const rows = await handbooks.json();
  test.skip(!Array.isArray(rows) || rows.length === 0, 'ハンドブックが存在しないためスキップ');

  // 章のあるハンドブックを優先（比較セクションは本文表示部に付随するため）
  const target = rows.find((r: { chapter_count?: number }) => Number(r.chapter_count) > 0) ?? rows[0];
  await page.goto(`/admin/handbook/${target.id}`);
  expect(
    page.url(),
    'E2Eアカウントの管理者権限（users.is_admin）で/adminに到達できること',
  ).toContain('/admin/handbook/');
  // モデル比較ヘッダーのバッジに3モデルのラベルが並ぶ（クライアントfetch完了を待つ）
  await expect(
    page.getByText('Claude Sonnet 5 vs Opus 4.7 vs Opus 4.8').first(),
  ).toBeVisible({ timeout: 30_000 });
  // セクションを開くと3モデル同時比較の実行ボタンが出る（実行はしない＝課金なし）
  await page.getByRole('button', { name: /🔬 モデル比較/ }).click();
  await expect(page.getByText('3モデルで同時生成・比較')).toBeVisible();
});

test('C21: ショートカット小窓（204改訂v2）の開閉・スクロール追従・非モーダル', async ({ page }) => {
  await page.goto('/dashboard/text-analysis?tab=saved');
  const palette = page.locator('[data-kb-palette]');
  await expect(palette).toHaveCount(0);

  // ⌨ボタンで開く（トグル）
  await page.locator('button[title*="キーボードショートカット一覧"]').click();
  await expect(palette).toBeVisible();
  await expect(palette.getByText('⌨ キーボードショートカット')).toBeVisible();

  // position:fixed＝ページをスクロールしても画面上の同位置に追従（viewport座標が不変）
  const before = await palette.boundingBox();
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(200);
  const after = await palette.boundingBox();
  expect(after?.y).toBeCloseTo(before?.y ?? -1, 0);

  // 非モーダル: 小窓表示中も背面の検索ボックスを操作できる
  const box = page.locator('input[data-kb-search]').first();
  await box.click();
  await page.keyboard.type('abc');
  await expect(box).toHaveValue('abc');
  await expect(palette).toBeVisible();

  // Escで閉じる（入力中はまずblur→もう一度Escでクローズ）
  await page.keyboard.press('Escape'); // blur
  await page.keyboard.press('Escape'); // close
  await expect(palette).toHaveCount(0);

  // ⌨ボタン再押下でも開閉（トグル）
  await page.locator('button[title*="キーボードショートカット一覧"]').click();
  await expect(palette).toBeVisible();
  await page.locator('button[title*="キーボードショートカット一覧"]').click();
  await expect(palette).toHaveCount(0);
});

test('C22: note選択モード中の干渉（214）— 案内表示＋カートから横断分析へ渡せる', async ({ page }) => {
  // 208導線バグの再発防止: bundleSelectMode ON中はカードのチェックがnote専用カートに
  // 切り替わり横断分析のselectedIdsに入らない（180の仕様）。
  // 案③=モード中の案内表示、案④=カートの確認モーダルから横断分析へ流せることを検証する
  await page.goto('/dashboard/saved');
  const search = page.getByPlaceholder(/🔍 タイトル・本文で検索/).filter({ visible: true });
  await search.fill(CROSS_TOKEN);
  await expect(page.locator(`[data-bundle-key="ana-${crossIds[0]}"]`)).toBeVisible();

  // note選択モードON → 案③の案内が出る
  await page
    .getByRole('button', { name: '📝 記事にまとめる資料を選ぶ' })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByText(/note素材の選択モード中です。横断分析の選択は/).filter({ visible: true }).first(),
  ).toBeVisible();

  // 2件をカートに入れる（浮遊要素の遮蔽を避けるためC18〜C20と同じ focus＋Space 方式）
  for (const id of crossIds) {
    const cb = page.locator(`[data-bundle-key="ana-${id}"]`).getByRole('checkbox').first();
    await expect(cb).toBeVisible();
    await cb.focus();
    await page.keyboard.press(' ');
    await expect(cb).toBeChecked();
  }

  // 確認モーダルに案④の「🔀 この選択で横断分析する」が出る → 押すと横断分析タブへ本文が渡る
  await page.getByRole('button', { name: /2件選択中 → 次へ/ }).click();
  await page.getByRole('button', { name: /🔀 この選択で横断分析する（🗂2件）/ }).click();
  await page.waitForURL('**/dashboard/text-analysis?tab=cross');
  // noteカートは選択維持のためDockの「☑ 2件選択中 → 次へ」も残る＝exact指定でパネル側だけを見る
  await expect(page.getByText('2件選択中', { exact: true })).toBeVisible();
  await expect(page.getByText(`[E2E] ${CROSS_TOKEN} 横断A`).filter({ visible: true }).first()).toBeVisible();
});

test('C23: Kindle本づくりウィザード（223）の開通 — ①素材選択と上限表示が出る', async ({ page }) => {
  // AI生成（目次・本文）はコスト・所要時間のためE2E対象外。画面開通と初期表示のみ検証する
  await page.goto('/dashboard/kindle-wizard');
  await expect(page.getByRole('heading', { name: '📖 Kindle本づくり' })).toBeVisible();
  // ステップ①の上限表示（10件・150,000字）
  await expect(page.locator('[data-kw-limits]')).toBeVisible();
  await expect(page.locator('[data-kw-limits]')).toContainText('0/10件');
  await expect(page.locator('[data-kw-limits]')).toContainText('上限150,000字');
  // 231: ①素材タブ3種（DR/note/テキスト分析）が並ぶ
  await expect(page.getByRole('button', { name: /📊 テキスト分析（\d+）/ })).toBeVisible();
  // ステップインジケーターに6ステップが並ぶ
  for (const label of ['1. 素材', '2. 目的', '3. 分量・文体', '4. 目次', '5. 本文生成', '6. 出力']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});
