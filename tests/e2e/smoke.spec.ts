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
  // 249: マイフォルダ
  FOLDERS_API,
  CONTEXT_API,
  E2E_PREFIX,
  listFolders,
  createFolder,
  createContextSave,
  cleanupE2EContextSaves,
  // 250: 一括削除
  LIBRARY_API,
  createLibraryItem,
  cleanupE2ELibrary,
  // 253: フォルダの横断表示
  FOLDER_ITEMS_API,
  listFolderItems,
  assignFolders,
  deleteFolder,
  cleanupE2EFolders,
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
  // 250: AI参照素材・リサーチ保存側の残骸も掃除する（テスト中に落ちても次回実行で必ず消える）
  await cleanupE2EContextSaves(api);
  await cleanupE2ELibrary(api);
  // 249: テスト用フォルダも消す（フォルダを消しても記事は残るので、記事の掃除とは独立）
  await cleanupE2EFolders(api);
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
    // 244: Opus枠を現行世代に更新（Opus 4.7 → Opus 5）。4.8は世代差比較のため据え置き
    page.getByText('Claude Sonnet 5 vs Opus 5 vs Opus 4.8').first(),
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
  await expect(page.getByRole('heading', { name: '📕 Kindle本づくり' })).toBeVisible();
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

test('C24: 内容検証API（233②）の契約 — 認証必須・bookId検証・他人の本は404', async () => {
  // AI呼び出しゼロのルートなので本番に叩いても課金されない。実データを作らずに契約だけを検証する。
  // 1) 未認証は401（R-31: AI系・データ系ルートは既定で認証必須）
  // storageState を明示的に空にする（省略すると playwright.config の use.storageState を
  // 引き継いで認証済みになり、401の検証にならない）
  const anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
  const unauth = await anon.post('/api/kindle/wizard/verify', { data: { bookId: 1 } });
  expect(unauth.status()).toBe(401);
  await anon.dispose();

  // 2) bookId欠落は400（fail-closed: 曖昧な入力で成功を返さない）
  const noId = await api.post('/api/kindle/wizard/verify', { data: {} });
  expect(noId.status()).toBe(400);

  // 3) 存在しない/他ユーザーの書籍は404（owner検証が効いている）
  const notFound = await api.post('/api/kindle/wizard/verify', { data: { bookId: 999999999 } });
  expect(notFound.status()).toBe(404);
});

test('C25: note 2画面の相互導線（234【2】）— 新規画面に到達手段がある', async ({ page }) => {
  // 234で「⚡おまかせ投稿はページだけあって導線がない」状態が発覚したため、
  // 双方向のリンクが実在することをスモークで固定する（R-34）。
  await page.goto('/dashboard/note-article');
  const toQuick = page.getByRole('link', { name: /おまかせで作る（1クリック版）/ });
  await expect(toQuick).toBeVisible();
  await expect(toQuick).toHaveAttribute('href', '/dashboard/note-quick');

  await page.goto('/dashboard/note-quick');
  const toArticle = page.getByRole('link', { name: /詳細に設定して作る/ });
  await expect(toArticle).toBeVisible();
  await expect(toArticle).toHaveAttribute('href', '/dashboard/note-article');
});

test('C26: 文字サイズ切替（240）— 4段階が並び、選ぶと全体が拡大し、リロード後も維持される', async ({ page }) => {
  await page.goto('/dashboard');
  const group = page.getByRole('group', { name: '文字サイズ' });
  await expect(group).toBeVisible();
  await expect(group.getByRole('button')).toHaveCount(4);

  // 既定は100%＝zoomを当てない（既存表示を変えない）
  await expect(page.evaluate(() => document.documentElement.style.zoom || '')).resolves.toBe('');

  // 最大（140%）を選ぶと documentElement に zoom が当たる
  await group.getByRole('button').nth(3).click();
  await expect(page.evaluate(() => document.documentElement.style.zoom)).resolves.toBe('1.4');

  // リロードしても維持される（描画前スクリプトで適用）
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.evaluate(() => document.documentElement.style.zoom)).resolves.toBe('1.4');

  // 横方向にはみ出していない（レイアウトが破綻していない）
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, '140%でも横スクロールが出ないこと').toBeLessThanOrEqual(0);

  // 標準に戻すと zoom が外れる（後片付け）
  await group.getByRole('button').nth(0).click();
  await expect(page.evaluate(() => document.documentElement.style.zoom || '')).resolves.toBe('');
});

test('C27: 追従ボタンの個別on/off＋トップへ戻る（243）— 既定は全off・onにすると重ならず縦に並ぶ', async ({ page }) => {
  const FAB = { glossary: '📖', memo: '📝', assistant: '💬' };
  // 右下の追従ボタンだけを拾う（fixed かつ正円）。
  // 246で「↑ トップへ戻る」だけ 52px に大きくしたため、48px 固定ではなく幅の範囲で拾う
  const fabRects = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((b) => {
          const s = getComputedStyle(b);
          const r = b.getBoundingClientRect();
          return s.position === 'fixed' && Math.round(r.width) === Math.round(r.height) && r.width >= 44 && r.width <= 60;
        })
        .map((b) => ({
          text: (b.textContent || '').trim(),
          bottom: Math.round(window.innerHeight - b.getBoundingClientRect().bottom),
          size: Math.round(b.getBoundingClientRect().width),
        }))
        .sort((a, b) => a.bottom - b.bottom),
    );

  // ── ①全off（既定）: 3つとも出ない ──
  await page.goto('/dashboard');
  for (const icon of Object.values(FAB)) {
    expect((await fabRects()).some((r) => r.text === icon), `既定では ${icon} が出ないこと`).toBe(false);
  }

  // 設定はThemeProviderがマウント後にlocalStorageから読むため、描画が追いつくまで待つ
  const fabsOf = async () => (await fabRects()).filter((r) => Object.values(FAB).includes(r.text));
  const waitFabs = async (count: number) => {
    await expect.poll(async () => (await fabsOf()).length, { timeout: 10000 }).toBe(count);
    return await fabsOf();
  };

  // ── ②個別on: 📖だけ表示し、最下段に来る（offの分が空席にならない）──
  await page.evaluate(() => localStorage.setItem('lumina_floating_buttons', JSON.stringify({ assistant: false, memo: false, glossary: true })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const only = await waitFabs(1);
  expect(only.map((r) => r.text)).toEqual([FAB.glossary]);
  expect(only[0].bottom, '単独onなら最下段（24px）に来ること').toBeLessThan(40);

  // ── ③全on: 3つが縦に並び、互いに重ならない ──
  await page.evaluate(() => localStorage.setItem('lumina_floating_buttons', JSON.stringify({ assistant: true, memo: true, glossary: true })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const all = await waitFabs(3);
  expect(all.map((r) => r.text), '下から 💬→📝→📖 の順に並ぶこと').toEqual([FAB.assistant, FAB.memo, FAB.glossary]);
  for (let i = 1; i < all.length; i++) {
    expect(all[i].bottom - all[i - 1].bottom, '隣り合うボタンが重ならない（48pxより広い間隔）').toBeGreaterThanOrEqual(48);
  }

  // ── ④スクロール量: 最上部では ↑ が出ず、300px超で出る ──
  expect((await fabRects()).some((r) => r.text === '↑'), '最上部では出ないこと').toBe(false);
  // 画面の中身が短いとスクロール自体が起きないため、検証用の余白を足してから動かす
  const scrolled = await page.evaluate(() => {
    const m = document.querySelector('main');
    const spacer = document.createElement('div');
    spacer.id = 'e2e-spacer';
    spacer.style.height = '3000px';
    (m ?? document.body).appendChild(spacer);
    if (m) m.scrollTop = 800;
    window.scrollTo(0, 800);
    return Math.max(window.scrollY, m?.scrollTop ?? 0);
  });
  expect(scrolled, '検証の前提としてスクロールが発生していること').toBeGreaterThan(300);
  await expect.poll(async () => (await fabRects()).some((r) => r.text === '↑'), { timeout: 5000 }).toBe(true);

  // ↑ は表示中の浮遊ボタンより上（一番上の段）に置かれる
  const withTop = await fabRects();
  const topBtn = withTop.find((r) => r.text === '↑')!;
  expect(topBtn.bottom, '↑ が3つの浮遊ボタンより上にあること').toBeGreaterThan(Math.max(...all.map((r) => r.bottom)));
  // 246: 視認性のため他の浮遊ボタンより一回り大きい（ただし段の間隔56pxを超えない＝重ならない）
  expect(topBtn.size, '↑ が他の浮遊ボタン（48px）より大きいこと').toBeGreaterThan(48);
  expect(topBtn.size, '↑ が段の間隔56pxを超えないこと').toBeLessThan(56);
  // ブランド色の塗り（無彩色の背景ではない）で、白抜きの矢印になっている
  const topStyle = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '↑');
    const s = getComputedStyle(b!);
    return { bg: s.backgroundColor, color: s.color };
  });
  const rgb = topStyle.bg.match(/\d+/g)!.map(Number);
  expect(Math.max(...rgb.slice(0, 3)) - Math.min(...rgb.slice(0, 3)), '背景が無彩色ではない（色みがある）').toBeGreaterThan(30);
  expect(topStyle.color, '矢印が白抜き').toMatch(/rgb\(255,\s*255,\s*255\)/);

  // 押すと最上部へ戻る
  await page.getByRole('button', { name: 'ページの先頭へ戻る' }).click();
  await expect
    .poll(async () => page.evaluate(() => Math.max(window.scrollY, document.querySelector('main')?.scrollTop ?? 0)), { timeout: 5000 })
    .toBeLessThan(300);

  // 後片付け（既定=全offに戻す／検証用の余白も消す）
  await page.evaluate(() => {
    localStorage.removeItem('lumina_floating_buttons');
    document.getElementById('e2e-spacer')?.remove();
  });

  // ── ⑤遮蔽の解消: ボタンが密集するKindleウィザードで、右下に追従ボタンが被らない ──
  // 243の発端は「浮遊要素が本文や操作ボタンに重なる」ことなので、既定offで
  // 右下の座標を実際に叩いて、そこにあるのが追従ボタンでないことを機械判定する。
  await page.goto('/dashboard/kindle-wizard');
  await expect(page.getByRole('heading', { name: '📕 Kindle本づくり' })).toBeVisible();
  const blockedByFab = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth - 40, window.innerHeight - 48);
    for (let n = el as HTMLElement | null; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      if (s.position === 'fixed' && Math.round(r.width) === 48 && Math.round(r.height) === 48) return (n.textContent || '').trim();
    }
    return null;
  });
  expect(blockedByFab, '既定（全off・最上部）では右下に追従ボタンが無いこと').toBe(null);
});

/**
 * 248: 自動下書き（155-157・feature_result_drafts）を空に固定する。
 * この機構はマウント後に**非同期で**入力欄と復元バナー（「✕ クリア」を持つ）を出すため、
 * 前回実行分が残っていると「未入力の状態」も「✕ クリアが1つだけ」も成立せず flaky になる。
 * E2E自身も生成完走時に下書きを書くので、PUT/DELETEも本番DBに通さない（R-12）。
 */
async function stubFeatureDrafts(page: import('@playwright/test').Page) {
  await page.route('**/api/feature-drafts**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(route.request().method() === 'GET' ? { draft: null } : { ok: true }),
    }),
  );
}

/**
 * 248: 画面のハイドレーション完了を待つ。実行ボタンのキー併記（⌘↵）は
 * クライアントの effect（useShortcutHints）が動いて初めて出るため、
 * 「Reactのハンドラが付いた」ことの機械的な合図として使える。
 * これを待たずに fill/click すると、入力がstateに入らず実行ボタンが無効のままになる
 * （従来は自動下書きの復元が結果を出していたため、この取りこぼしが見えなかった・R-12）。
 */
async function waitForRunReady(page: import('@playwright/test').Page) {
  await expect(page.locator('button[data-kb-run]').first()).toHaveText(/(⌘↵|Ctrl\+↵)/, { timeout: 30000 });
}

test('C28: ディープリサーチの調査期間（245）— プリセット4パターンが排他で切り替わり、クリアが入力欄の上にある', async ({ page }) => {
  await stubFeatureDrafts(page);
  await page.goto('/dashboard/deepresearch');
  const preset = (label: string) => page.getByRole('button', { name: label, exact: true });
  const selected = async (label: string) => (await preset(label).getAttribute('aria-pressed')) === 'true';
  const dates = () =>
    page.evaluate(() => [...document.querySelectorAll<HTMLInputElement>('input[type="date"]')].map((i) => i.value));

  // 4つのプリセットが最初から並んでいる（開かないと出ない、ではない）
  for (const label of ['指定なし', '7日', '30日', '90日']) {
    await expect(preset(label), `${label} が最初から見えていること`).toBeVisible();
  }

  // ── 既定は「指定なし」だけが選択状態 ──
  expect(await selected('指定なし')).toBe(true);
  for (const label of ['7日', '30日', '90日']) expect(await selected(label), `${label} は未選択`).toBe(false);
  expect(await dates()).toEqual(['', '']);

  // ── 7日 / 30日 / 90日: 押した1つだけが選択され、日数がその通りになる ──
  for (const [label, days] of [['7日', 7], ['30日', 30], ['90日', 90]] as const) {
    await preset(label).click();
    expect(await selected(label), `${label} が選択される`).toBe(true);
    for (const other of ['指定なし', '7日', '30日', '90日'].filter((l) => l !== label)) {
      expect(await selected(other), `${label} 選択中に ${other} が同時選択されない（排他）`).toBe(false);
    }
    const [start, end] = await dates();
    expect(start, `${label} の開始日が入る`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end, `${label} の終了日が入る`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const span = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1; // 今日を含むN日間
    expect(span, `${label} は${days}日間になる`).toBe(days);
  }

  // ── カスタム: 折りたたみを開いて日付を手で変えるとプリセットの選択が外れる（排他）──
  await page.getByText('📅 日付で細かく指定する（任意）').click();
  await expect(page.locator('input[type="date"]').first()).toBeVisible();
  await page.locator('input[type="date"]').first().fill('2020-01-01');
  for (const label of ['指定なし', '7日', '30日', '90日']) {
    expect(await selected(label), `カスタム指定中は ${label} が選択されない`).toBe(false);
  }
  await expect(page.getByText(/✓ カスタム:/)).toBeVisible();

  // ── 「指定なし」に戻すと期間が消える ──
  await preset('指定なし').click();
  expect(await selected('指定なし')).toBe(true);
  expect(await dates()).toEqual(['', '']);

  // ── クリアはリサーチトピック入力欄の「上」にある（左下ではない）──
  const clear = page.getByRole('button', { name: '✕ クリア' });
  await expect(clear).toBeVisible();
  const textarea = page.locator('textarea').first();
  const [clearBox, taBox] = [await clear.boundingBox(), await textarea.boundingBox()];
  expect(clearBox!.y, 'クリアが入力欄より上にあること').toBeLessThan(taBox!.y);
  expect(clearBox!.x, 'クリアが入力欄の右側に寄っていること').toBeGreaterThan(taBox!.x + taBox!.width / 2);

  // 空のときは無効、入力すると押せてトピックが消える（動作は現状維持）
  await expect(clear).toBeDisabled();
  await textarea.fill('[E2E] 期間プリセットの確認');
  await expect(clear).toBeEnabled();
  await clear.click();
  await expect(textarea).toHaveValue('');
});


// ============================================================================
// 247: ショートカット（⌘Enter=実行 / ⌘⇧Backspace=クリア）と 生成結果の自動ストック保存
// AI課金を避けるため、生成API・タイトル生成APIはすべてモックする
// ============================================================================

const KB_TOKEN = `E2EKB${RUN_ID}`;
const AUTO_TOKEN = `E2EAUTO${RUN_ID}`;

/** 分析API（SSE）のモック。delayMs を入れると「実行中」の状態を作れる */
async function mockAnalyze(page: import('@playwright/test').Page, text: string, delayMs = 0) {
  let calls = 0;
  await page.route('**/api/text-analysis/analyze', async (route) => {
    calls++;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ type: 'delta', text })}\n\n`,
    });
  });
  return () => calls;
}

test('C29: 実行・クリアのショートカット（247）— 未入力/入力中/実行中/クリアの4パターン', async ({ page }) => {
  const analyzeCalls = await mockAnalyze(page, `[E2E] ${KB_TOKEN} モック分析結果`, 1200);

  // 248: 前回実行分の下書きが復元されると「未入力」の状態を作れず ②が揺れる
  // （実測でflaky: 未入力のはずが analyze が1回走った）
  await stubFeatureDrafts(page);

  await page.goto('/dashboard/text-analysis');
  // このテストは保存を対象にしないので自動ストック保存はOFFにする（DBに書かない）
  await page.evaluate(() => localStorage.setItem('lumina_auto_stock_save', '0'));
  await page.reload({ waitUntil: 'domcontentloaded' });

  const runBtn = page.locator('button[data-kb-run]');
  const textarea = page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...');
  await expect(runBtn).toBeVisible();

  // ── ①押し方が分かる: ボタンにキーが併記されている ──
  await expect(runBtn, '実行ボタンに実行キーが併記されていること').toHaveText(/(⌘↵|Ctrl\+↵)/);
  const clearBtn = page.getByRole('button', { name: /✕ クリア/ }).filter({ visible: true }).first();
  await expect(clearBtn, 'クリアボタンにクリアキーが併記されていること').toHaveText(/(⌘⌫|Ctrl\+⌫)/);

  // ── ②未入力（空）: 押しても実行されない（無効ボタンと同じ挙動） ──
  await textarea.click();
  await expect(textarea, '「未入力」の前提が成立していること').toHaveValue('');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.waitForTimeout(500);
  expect(analyzeCalls(), '未入力では実行されないこと').toBe(0);

  // ── ③入力中: テキスト入力欄にカーソルがあるまま実行できる ──
  const INPUT = `[E2E] ${KB_TOKEN} 分析対象テキスト`;
  await textarea.fill(INPUT);
  await expect(textarea).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(runBtn, '入力欄にカーソルがあっても実行されること').toHaveText(/分析中/);

  // ── ④実行中: もう一度押しても二重実行しない ──
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(runBtn).not.toHaveText(/分析中/, { timeout: 30000 });
  // 既定の分析タイプは2種＝1回の実行で2リクエスト。二重実行なら3以上になる
  expect(analyzeCalls(), '実行中に押しても二重実行しないこと').toBe(2);

  // ── ⑤クリア: キーで消せて、「↩ 元に戻す」で戻せる（破壊的操作のUndo） ──
  // 248: キーは ⌘⌫（2キー）。入力欄にカーソルがある状態で効くこと＋
  //      ブラウザの「戻る」を誘発しない（URLが変わらない）ことまで機械判定する
  const urlBeforeClear = page.url();
  await textarea.click();
  await expect(textarea, 'クリアキーは入力欄にカーソルがある状態で押す').toBeFocused();
  await page.keyboard.press('ControlOrMeta+Backspace');
  await expect(textarea, 'クリアキー（⌘⌫）で入力が消えること').toHaveValue('');
  expect(page.url(), 'クリアキーでブラウザの「戻る」が起きないこと').toBe(urlBeforeClear);
  const undo = page.getByRole('button', { name: '↩ 元に戻す' });
  await expect(undo, 'クリア直後はUndoが出ること').toBeVisible();
  await undo.click();
  await expect(textarea, 'Undoで元の入力に戻ること').toHaveValue(INPUT);
  await expect(undo, 'Undoは一度使うと消えること').toHaveCount(0);

  // ── ⑤-b 248: 247で覚えた旧キー ⌘⇧⌫ も引き続き効く（移行で押し方を無効にしない） ──
  await textarea.click();
  await page.keyboard.press('ControlOrMeta+Shift+Backspace');
  await expect(textarea, '旧キー ⌘⇧⌫ でも消せること').toHaveValue('');
  await page.getByRole('button', { name: '↩ 元に戻す' }).click();
  await expect(textarea).toHaveValue(INPUT);

  // ── ⑥ショートカット一覧（?小窓）に登録され、この画面では有効表示になっている ──
  await page.locator('button[title*="キーボードショートカット一覧"]').click();
  const palette = page.locator('[data-kb-palette]');
  await expect(palette).toBeVisible();
  const runSection = palette.getByText(/生成・実行画面/).first();
  await expect(runSection, '一覧に「生成・実行画面」のセクションがあること').toBeVisible();
  await expect(runSection, 'この画面では有効（淡色の「無効」表示にならない）').not.toContainText('この画面では無効');
  await expect(palette.getByText('実行する（Windowsは Ctrl+Enter）')).toBeVisible();
  await page.locator('button[title*="キーボードショートカット一覧"]').click();
  await expect(palette).toHaveCount(0);

  // ── ⑦別タブ（display:none）では効かない ──
  await page.getByRole('button', { name: /🗂 保存一覧/ }).click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.waitForTimeout(500);
  expect(analyzeCalls(), 'タブを切り替えたら実行キーは効かないこと').toBe(2);
});

test('C30: 生成結果の自動ストック保存（247・テキスト分析）— OFFで保存されず、ONで保存されて一覧に出る', async ({ page, request }) => {
  const AUTO_TITLE = `[E2E] ${AUTO_TOKEN} 自動保存`;
  await stubFeatureDrafts(page); // 248: 復元バナー・前回入力の混入を防ぐ（E2E自身の下書き書込みも止める）
  await mockAnalyze(page, `[E2E] ${AUTO_TOKEN} モック分析結果`);
  // タイトル生成はAI課金なのでモック（R-39: 落ちても保存自体は fallback で成立する）
  await page.route('**/api/text-analysis/generate-title', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: AUTO_TITLE }) }),
  );

  const runAnalysis = async () => {
    await waitForRunReady(page);
    await page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...').fill(`[E2E] ${AUTO_TOKEN} 入力`);
    await page.locator('button[data-kb-run]').click();
    await expect(page.locator('button[data-kb-run]')).not.toHaveText(/分析中/, { timeout: 30000 });
  };

  // ── ①OFF: 生成しても保存されない（従来どおり手動ボタンのまま） ──
  await page.goto('/dashboard/text-analysis');
  await page.evaluate(() => localStorage.setItem('lumina_auto_stock_save', '0'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await runAnalysis();
  await expect(page.getByRole('button', { name: '💾 ストック保存' }).first()).toBeVisible();
  await page.waitForTimeout(1500); // 保存が走るならこの間に走る
  expect(
    (await listSaves(request, { q: AUTO_TOKEN, limit: 100 })).total_count,
    'OFFのときは1件も保存されないこと',
  ).toBe(0);

  // ── ②🎛表示設定でONに戻せる（設定はこの画面にある） ──
  await page.goto('/dashboard/display-settings');
  const toggle = page.getByRole('checkbox', { name: '生成結果を自動でストックに保存する' });
  await expect(toggle).toBeVisible();
  await expect(toggle, '直前にOFFにしたので未チェック').not.toBeChecked();
  await toggle.check();
  expect(await page.evaluate(() => localStorage.getItem('lumina_auto_stock_save'))).toBe('1');

  // ── ③ON: 生成完了で自動保存され、ボタンが「✅ 保存済み」になる ──
  await page.goto('/dashboard/text-analysis');
  await runAnalysis();
  const savedBtns = page.getByRole('button', { name: '✅ 保存済み' });
  await expect(savedBtns.first(), '自動保存後は「✅ 保存済み」表示になること').toBeVisible({ timeout: 30000 });
  // 既定の分析タイプは2種＝2枚のカードとも保存済みになる
  await expect(savedBtns).toHaveCount(2);
  // 二重保存の防止: 保存済みのボタンは押せない
  await expect(savedBtns.first(), '保存済みのボタンは押せない（二重保存の防止）').toBeDisabled();

  // ── ④ストック一覧（保存API）に実際に出る ──
  await expect
    .poll(async () => (await listSaves(request, { q: AUTO_TOKEN, limit: 100 })).total_count, { timeout: 20000 })
    .toBe(2);
  const list = await listSaves(request, { q: AUTO_TOKEN, limit: 100 });
  expect(
    list.items.every((i) => String(i.auto_title ?? i.file_name ?? '').includes(AUTO_TOKEN)),
    '自動保存分のタイトルが入っていること',
  ).toBe(true);
  // 後片付けは afterAll の cleanupE2ESaves（[E2E]付き）が行う

  // 設定を既定（ON）に戻す
  await page.evaluate(() => localStorage.removeItem('lumina_auto_stock_save'));
});

test('C31: 生成結果の自動ストック保存（247・ディープリサーチ）— ⌘Enterで実行し、完走時に保存済みになる', async ({ page }) => {
  const REPORT = `# [E2E] ${AUTO_TOKEN} モックレポート\n\n本文です。`;
  await stubFeatureDrafts(page); // 248: 復元バナー・前回結果の混入を防ぐ（E2E自身の下書き書込みも止める）
  // 生成SSEをモック（AI課金なし）
  await page.route('**/api/deepresearch', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ type: 'text', content: REPORT })}\n\n`,
    }),
  );
  // 完了後に走る付随AI（タイトル案・用語抽出・インサイト）もモックして課金させない
  for (const pattern of ['**/api/knowledge/**', '**/api/glossary/research-extract', '**/api/deepresearch/insights']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  }
  // 保存先はモックして本番ライブラリに書かない（保存要求が飛んだこと自体を検証する）
  const libraryPosts: { title?: string; content?: string }[] = [];
  await page.route('**/api/library', async (route) => {
    if (route.request().method() === 'POST') {
      libraryPosts.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'e2e-mock' }) });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/library/auto-categorize', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/dashboard/deepresearch');
  const topic = page.getByPlaceholder(/調査したいテーマを詳しく入力してください/);
  await topic.fill(`[E2E] ${AUTO_TOKEN} モックのお題`);

  // ── ①⌘Enterで実行できる（入力欄にカーソルがあるまま） ──
  await expect(page.locator('button[data-kb-run]')).toHaveText(/(⌘↵|Ctrl\+↵)/);
  await page.keyboard.press('ControlOrMeta+Enter');

  // ── ②完走時に自動保存され、「✅ 保存済み」＝押せない状態になる ──
  const savedBtn = page.getByRole('button', { name: '✅ 保存済み' });
  await expect(savedBtn, '自動保存後は「✅ 保存済み」表示になること').toBeVisible({ timeout: 30000 });
  await expect(savedBtn, '保存済みのボタンは押せない（二重保存の防止）').toBeDisabled();
  expect(libraryPosts.length, '保存要求はちょうど1回であること').toBe(1);
  expect(libraryPosts[0].content, '生成本文がそのまま保存されること').toContain(AUTO_TOKEN);

  // ── ③クリアのUndo（トピック入力欄）。248: キーは ⌘⌫（2キー）で3画面とも統一 ──
  await topic.click();
  await expect(topic, '入力欄にカーソルがある状態で効くこと').toBeFocused();
  await page.keyboard.press('ControlOrMeta+Backspace');
  await expect(topic).toHaveValue('');
  const undo = page.getByRole('button', { name: '↩ 元に戻す' });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(topic).toHaveValue(`[E2E] ${AUTO_TOKEN} モックのお題`);

  // ── ④OFFにすると自動保存されない ──
  await page.evaluate(() => localStorage.setItem('lumina_auto_stock_save', '0'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  libraryPosts.length = 0;
  await waitForRunReady(page);
  await page.getByPlaceholder(/調査したいテーマを詳しく入力してください/).fill(`[E2E] ${AUTO_TOKEN} 2回目`);
  await page.locator('button[data-kb-run]').click();
  await expect(page.getByRole('button', { name: '📚 リサーチ保存に追加' })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1500);
  expect(libraryPosts.length, 'OFFのときは保存要求が飛ばないこと').toBe(0);

  await page.evaluate(() => localStorage.removeItem('lumina_auto_stock_save'));
});

// ============================================================================
// 249: マイフォルダ（お気に入りのカスタムフォルダ分類）
// - 検証はすべて [E2E] 印のフォルダ／記事だけを対象にする（院長の既存データは触らない）
// - 自動カテゴリ（folder / category）とは別軸であることも機械判定する
// ============================================================================

test('C32: マイフォルダの一連（作成→分類→絞り込み→リネーム→削除）と、削除しても記事が残ること', async ({
  request,
}) => {
  const name = `${E2E_PREFIX} 分類A ${RUN_ID}`;
  const folderId = await createFolder(request, 'text_analysis', name);

  // 作成直後は0件で一覧に載る
  const afterCreate = await listFolders(request, 'text_analysis');
  const created = afterCreate.folders.find((f) => f.id === folderId);
  expect(created, '作ったフォルダが一覧に出ること').toBeTruthy();
  expect(created!.name).toBe(name);
  expect(created!.count, '作成直後は0件であること').toBe(0);

  // 分類（1件入れる）→ 件数が1になる
  const targetId = seedIds[0];
  const assigned = await assignFolders(request, 'text_analysis', targetId, [folderId]);
  expect(assigned.status(), '分類の保存が200であること').toBe(200);
  const afterAssign = await listFolders(request, 'text_analysis');
  expect(
    afterAssign.folders.find((f) => f.id === folderId)!.count,
    '分類したら件数が1になること',
  ).toBe(1);

  // 絞り込み: そのフォルダの記事だけが返る
  const filtered = await listSaves(request, { cfolder: folderId, limit: 100 });
  expect(filtered.total_count, 'フォルダ絞り込みの件数が1であること').toBe(1);
  expect(filtered.items.map((i) => i.id)).toEqual([targetId]);
  expect(
    (filtered.items[0] as { custom_folder_ids?: number[] }).custom_folder_ids,
    '一覧itemsに所属フォルダIDが載ること',
  ).toContain(folderId);

  // 自動カテゴリ（folder）は変わっていない＝別軸で併存している
  expect(filtered.items[0].folder, '自動カテゴリが書き換わっていないこと').toBe(SEED_FOLDER);

  // リネーム（所属は保持される）
  const renamed = `${E2E_PREFIX} 分類A改 ${RUN_ID}`;
  const renameRes = await request.patch(FOLDERS_API, {
    data: { scope: 'text_analysis', action: 'rename', id: folderId, name: renamed },
  });
  expect(renameRes.status(), 'リネームが200であること').toBe(200);
  const afterRename = await listFolders(request, 'text_analysis');
  const renamedFolder = afterRename.folders.find((f) => f.id === folderId)!;
  expect(renamedFolder.name).toBe(renamed);
  expect(renamedFolder.count, 'リネームしても所属は保持されること').toBe(1);

  // 削除 → フォルダは消えるが、記事そのものは残る（分類が外れるだけ）
  const delRes = await deleteFolder(request, 'text_analysis', folderId);
  expect(delRes.status(), 'フォルダ削除が200であること').toBe(200);
  const afterDelete = await listFolders(request, 'text_analysis');
  expect(
    afterDelete.folders.find((f) => f.id === folderId),
    '削除したフォルダが一覧から消えること',
  ).toBeUndefined();
  const survived = await request.get(`${SAVES_API}?id=${targetId}`);
  expect(survived.status(), 'フォルダを消しても記事は残ること').toBe(200);
  const survivedJson = await survived.json();
  expect(String(survivedJson.content ?? '').length, '記事の本文も残っていること').toBeGreaterThan(0);
});

test('C33: 1記事の複数フォルダ所属と「お気に入り（未分類）」の絞り込み', async ({ request }) => {
  const f1 = await createFolder(request, 'text_analysis', `${E2E_PREFIX} 複数1 ${RUN_ID}`);
  const f2 = await createFolder(request, 'text_analysis', `${E2E_PREFIX} 複数2 ${RUN_ID}`);
  const both = seedIds[1]; // 2つのフォルダに入れる記事
  const onlyFav = seedIds[2]; // お気に入りだけ付けて未分類のままにする記事

  try {
    // 両方お気に入りにする（未分類の母数に入る）
    for (const id of [both, onlyFav]) {
      const res = await patchSaves(request, { action: 'toggle_favorite', id });
      expect(res.status()).toBe(200);
    }

    // 1記事を2フォルダへ
    expect((await assignFolders(request, 'text_analysis', both, [f1, f2])).status()).toBe(200);
    const list = await listFolders(request, 'text_analysis');
    expect(list.folders.find((f) => f.id === f1)!.count, 'フォルダ1に入ること').toBe(1);
    expect(list.folders.find((f) => f.id === f2)!.count, 'フォルダ2にも同時に入ること').toBe(1);

    // どちらのフォルダで絞り込んでも同じ記事が出る
    for (const fid of [f1, f2]) {
      const filtered = await listSaves(request, { cfolder: fid, limit: 100 });
      expect(filtered.items.map((i) => i.id)).toEqual([both]);
    }

    // 未分類の絞り込み: 分類済みは出ず、お気に入りだけの記事は出る
    const unfiled = await listSaves(request, { cfolder: 'unfiled', limit: 100 });
    const unfiledIds = unfiled.items.map((i) => i.id);
    expect(unfiledIds, '分類済みの記事は未分類に出ないこと').not.toContain(both);
    expect(unfiledIds, 'お気に入りだけの記事は未分類に出ること').toContain(onlyFav);

    // 全解除すると未分類に戻る
    expect((await assignFolders(request, 'text_analysis', both, [])).status()).toBe(200);
    const unfiled2 = await listSaves(request, { cfolder: 'unfiled', limit: 100 });
    expect(
      unfiled2.items.map((i) => i.id),
      '分類を全部外したら未分類に戻ること',
    ).toContain(both);
  } finally {
    await deleteFolder(request, 'text_analysis', f1);
    await deleteFolder(request, 'text_analysis', f2);
    for (const id of [both, onlyFav]) {
      await patchSaves(request, { action: 'toggle_favorite', id });
    }
  }
});

test('C34: 保存一覧とAI参照素材でフォルダ体系が混ざらない（同名OK・相手のフォルダには入らない）', async ({
  request,
}) => {
  const sameName = `${E2E_PREFIX} 同名 ${RUN_ID}`;
  const taFolder = await createFolder(request, 'text_analysis', sameName);
  const ctxFolder = await createFolder(request, 'context', sameName);
  expect(taFolder, '同じ名前でも別スコープなら別フォルダとして作れること').not.toBe(ctxFolder);

  // AI参照素材側にテスト素材を1件だけ作る（接頭辞はヘルパーが必ず付ける・検証後に削除）
  const ctxItemId = await createContextSave(request, {
    topic: `参照素材 ${RUN_ID}`,
    contextText: `マイフォルダ検証用の素材本文です（${RUN_ID}）。検証後に削除されます。`,
  });

  try {
    // 一覧が互いのフォルダを含まない
    const taList = await listFolders(request, 'text_analysis');
    const ctxList = await listFolders(request, 'context');
    expect(taList.folders.map((f) => f.id), '保存一覧にAI参照素材のフォルダが出ないこと').not.toContain(ctxFolder);
    expect(ctxList.folders.map((f) => f.id), 'AI参照素材に保存一覧のフォルダが出ないこと').not.toContain(taFolder);

    // 相手スコープのフォルダIDを渡しても分類されない（所有・スコープ検証）
    const cross = await assignFolders(request, 'context', ctxItemId, [taFolder]);
    expect(cross.status(), 'リクエスト自体は成功扱いになること').toBe(200);
    const afterCross = await listFolders(request, 'text_analysis');
    expect(
      afterCross.folders.find((f) => f.id === taFolder)!.count,
      '別スコープの記事は相手のフォルダに入らないこと',
    ).toBe(0);

    // 自スコープのフォルダには入る
    expect((await assignFolders(request, 'context', ctxItemId, [ctxFolder])).status()).toBe(200);
    const ctxAfter = await listFolders(request, 'context');
    expect(ctxAfter.folders.find((f) => f.id === ctxFolder)!.count).toBe(1);

    // AI参照素材の一覧を cfolder で絞ると、その素材だけが出る
    const ctxFiltered = await request.get(`${CONTEXT_API}?cfolder=${ctxFolder}&limit=100`);
    expect(ctxFiltered.status()).toBe(200);
    const ctxJson = await ctxFiltered.json();
    expect(ctxJson.items.map((i: { id: number }) => i.id)).toEqual([ctxItemId]);
    expect(ctxJson.items[0].custom_folder_ids).toContain(ctxFolder);
  } finally {
    await request.delete(`${CONTEXT_API}?id=${ctxItemId}`);
    await deleteFolder(request, 'text_analysis', taFolder);
    await deleteFolder(request, 'context', ctxFolder);
  }
});

test('C35: マイフォルダAPIの防御（未認証401・不正scope400・他人/不在フォルダ404・同名409）', async ({
  request,
}) => {
  const anon = await pwRequest.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    expect((await anon.get(`${FOLDERS_API}?scope=text_analysis`)).status()).toBe(401);
    expect(
      (await anon.post(FOLDERS_API, { data: { scope: 'text_analysis', name: 'x' } })).status(),
    ).toBe(401);
  } finally {
    await anon.dispose();
  }

  // scope は許可された2種のみ
  expect((await request.get(`${FOLDERS_API}?scope=other`)).status()).toBe(400);
  expect(
    (await request.post(FOLDERS_API, { data: { scope: 'other', name: 'x' } })).status(),
  ).toBe(400);
  // 空名は作れない
  expect(
    (await request.post(FOLDERS_API, { data: { scope: 'text_analysis', name: '   ' } })).status(),
  ).toBe(400);
  // 存在しないフォルダの操作は404（他人のフォルダも同じ扱い）
  expect(
    (
      await request.patch(FOLDERS_API, {
        data: { scope: 'text_analysis', action: 'rename', id: 999999999, name: 'x' },
      })
    ).status(),
  ).toBe(404);
  expect((await deleteFolder(request, 'text_analysis', 999999999)).status()).toBe(404);

  // 同名は作れない（409）
  const name = `${E2E_PREFIX} 重複 ${RUN_ID}`;
  const id = await createFolder(request, 'text_analysis', name);
  try {
    const dup = await request.post(FOLDERS_API, { data: { scope: 'text_analysis', name } });
    expect(dup.status(), '同名フォルダは409で拒否されること').toBe(409);
  } finally {
    await deleteFolder(request, 'text_analysis', id);
  }
});

test('C36: 保存一覧の画面でフォルダを作り、☆から分類してバッジが出る（249のUI一連）', async ({
  page,
  request,
}) => {
  const name = `${E2E_PREFIX} UI ${RUN_ID}`;
  // 一覧は created_at DESC の30件ページング。シード記事は他のテストの作成分に押し出されて
  // 1ページ目から外れるため、この検証専用の記事を直前に作って必ず先頭に来るようにする
  const itemId = await createSave(request, {
    title: `[E2E] UI検証 ${RUN_ID}`,
    content: `[E2E] マイフォルダのUI検証用の本文です（${RUN_ID}）。検証後に削除されます。`,
  });
  await page.goto('/dashboard/saved');
  // /dashboard/saved は 🗂テキスト分析 と 🧠AI参照素材 の両パネルを display:none で
  // 同時にマウントする。基点をパネルに固定しないと、非表示側の同名要素まで拾ってしまう
  const panel = page.locator('[data-saved-panel="text-analysis"]');
  const bar = panel.locator('[data-custom-folder-bar="text_analysis"]');
  await expect(bar, 'マイフォルダのバーが出ること').toBeVisible();

  // 「絞り込みなし」「お気に入り（未分類）」の2枚は常に出る
  await expect(bar.locator('[data-folder-filter="all-favorites"]')).toBeVisible();
  await expect(bar.locator('[data-folder-filter="unfiled"]')).toBeVisible();

  // 管理モードからフォルダを作る
  await bar.locator('[data-folder-manage-toggle]').click();
  await bar.locator('[data-folder-bar-new-name]').fill(name);
  await bar.locator('[data-folder-bar-create]').click();
  const card = bar.locator('[data-folder-card]').filter({ hasText: name });
  await expect(card, '作ったフォルダがカードとして出ること').toBeVisible();

  let folderId = 0;
  try {
    folderId = Number(await card.getAttribute('data-folder-card'));
    expect(folderId).toBeGreaterThan(0);

    // ☆ボタン → 分類パネル → チェックで即保存
    const favBtn = panel.locator(`[data-favorite-button="${itemId}"]`);
    await favBtn.scrollIntoViewIfNeeded();
    await favBtn.click();
    const picker = page.locator('[data-folder-picker]');
    await expect(picker, '☆から分類パネルが開くこと').toBeVisible();
    await picker.locator(`[data-folder-option="${folderId}"] input`).check();

    // サーバに保存されたことをAPIで確認（画面の見た目だけで判定しない）
    await expect
      .poll(async () => (await listFolders(request, 'text_analysis')).folders.find((f) => f.id === folderId)?.count)
      .toBe(1);

    // パネルを閉じるとカードに所属フォルダのバッジが出る
    await picker.getByRole('button', { name: '閉じる' }).click();
    await expect(
      panel.locator(`[data-folder-badge="${folderId}"]`).first(),
      'カードに所属フォルダのバッジが出ること',
    ).toBeVisible();

    // フォルダで絞り込むと、そのフォルダの中身が出る
    // （253でここは両画面をまとめた横断ビューに変わった。中身はこの1件だけ）
    await card.click();
    const cross = page.locator(`[data-folder-cross-view="${folderId}"]`);
    await expect(cross, 'フォルダを開くと横断ビューが出ること').toBeVisible();
    await expect(cross.locator('[data-cross-card]')).toHaveCount(1);
    await expect(cross.locator('[data-origin-badge="text_analysis"]')).toHaveCount(1);
  } finally {
    if (folderId) await deleteFolder(request, 'text_analysis', folderId);
    // 検証用の記事ごと消す（お気に入り状態の後始末も兼ねる）
    await deleteSave(request, itemId);
  }
});

// ============================================================================
// 250: 一括削除（🗂テキスト分析 / 🧠AI参照素材 / 📚リサーチ保存）
// - すべて当該テスト内で作った [E2E] 印のデータだけを消す（既存データには触れない）
// ============================================================================

test('C37: テキスト分析の一括削除（選択分だけ消える・249の分類も外れる・空idsは400）', async ({
  request,
}) => {
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) {
    ids.push(
      await createSave(request, {
        title: `一括削除 ${RUN_ID}-${i}`,
        content: `一括削除の検証用（${RUN_ID}-${i}）`,
      }),
    );
  }
  const keepId = ids[2]; // 選択しない1件＝消えてはいけない
  const targets = [ids[0], ids[1]];

  // 249のフォルダに入れておき、削除で分類も外れることを見る
  const folderId = await createFolder(request, 'text_analysis', `${E2E_PREFIX} 削除 ${RUN_ID}`);
  try {
    expect((await assignFolders(request, 'text_analysis', targets[0], [folderId])).status()).toBe(200);
    expect(
      (await listFolders(request, 'text_analysis')).folders.find((f) => f.id === folderId)!.count,
    ).toBe(1);

    // 空の ids は拒否される（誤って全件消す経路を作らない）
    const empty = await patchSaves(request, { action: 'bulk_delete', ids: [] });
    expect(empty.status(), '空のidsは400で拒否されること').toBe(400);

    // 一括削除
    const res = await patchSaves(request, { action: 'bulk_delete', ids: targets });
    expect(res.status()).toBe(200);
    expect((await res.json()).deleted, '選択した件数だけ削除されること').toBe(2);

    // 選択したものは消え、選択しなかったものは残る
    for (const id of targets) {
      expect((await request.get(`${SAVES_API}?id=${id}`)).status()).toBe(404);
    }
    expect(
      (await request.get(`${SAVES_API}?id=${keepId}`)).status(),
      '選択しなかった記事は残ること',
    ).toBe(200);

    // 249の分類も外れている（孤児が残らない）
    expect(
      (await listFolders(request, 'text_analysis')).folders.find((f) => f.id === folderId)!.count,
      '削除した記事の分類が外れること',
    ).toBe(0);
  } finally {
    await deleteFolder(request, 'text_analysis', folderId);
    await request.delete(`${SAVES_API}?id=${keepId}`);
  }
});

test('C38: AI参照素材の一括削除（選択分だけ消える・空idsは400・未認証401）', async ({ request }) => {
  const a = await createContextSave(request, { topic: `一括削除A ${RUN_ID}`, contextText: `本文A ${RUN_ID}` });
  const b = await createContextSave(request, { topic: `一括削除B ${RUN_ID}`, contextText: `本文B ${RUN_ID}` });
  const keep = await createContextSave(request, { topic: `残す ${RUN_ID}`, contextText: `本文C ${RUN_ID}` });

  try {
    const empty = await request.patch(CONTEXT_API, { data: { action: 'bulk_delete', ids: [] } });
    expect(empty.status(), '空のidsは400で拒否されること').toBe(400);

    const res = await request.patch(CONTEXT_API, { data: { action: 'bulk_delete', ids: [a, b] } });
    expect(res.status()).toBe(200);
    expect((await res.json()).deleted).toBe(2);

    expect((await request.get(`${CONTEXT_API}?id=${a}`)).status()).toBe(404);
    expect((await request.get(`${CONTEXT_API}?id=${b}`)).status()).toBe(404);
    expect(
      (await request.get(`${CONTEXT_API}?id=${keep}`)).status(),
      '選択しなかった素材は残ること',
    ).toBe(200);

    const anon = await pwRequest.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const res401 = await anon.patch(CONTEXT_API, { data: { action: 'bulk_delete', ids: [keep] } });
      expect(res401.status(), '未認証の一括削除は401であること').toBe(401);
    } finally {
      await anon.dispose();
    }
    expect(
      (await request.get(`${CONTEXT_API}?id=${keep}`)).status(),
      '未認証リクエストでデータが消えていないこと',
    ).toBe(200);
  } finally {
    await request.delete(`${CONTEXT_API}?id=${keep}`);
  }
});

test('C39: リサーチ保存の一括削除（選択分だけ消える・単体削除の従来経路も維持）', async ({
  request,
}) => {
  const a = await createLibraryItem(request, { title: `一括削除A ${RUN_ID}`, content: `本文A ${RUN_ID}` });
  const b = await createLibraryItem(request, { title: `一括削除B ${RUN_ID}`, content: `本文B ${RUN_ID}` });
  const single = await createLibraryItem(request, { title: `単体削除 ${RUN_ID}`, content: `本文C ${RUN_ID}` });

  const listMine = async () => {
    const res = await request.get(`${LIBRARY_API}?q=${encodeURIComponent(RUN_ID)}`);
    expect(res.status()).toBe(200);
    return ((await res.json()) as { id: string }[]).map((r) => r.id);
  };
  expect((await listMine()).sort()).toEqual([a, b, single].sort());

  // 一括削除（2件）
  const res = await request.delete(LIBRARY_API, { data: { ids: [a, b] } });
  expect(res.status()).toBe(200);
  expect((await res.json()).deleted).toBe(2);
  expect(await listMine(), '選択した2件だけが消えること').toEqual([single]);

  // 単体削除の従来経路（{ id }）が壊れていないこと
  const one = await request.delete(LIBRARY_API, { data: { id: single } });
  expect(one.status()).toBe(200);
  expect(await listMine()).toEqual([]);
});

test('C40: 保存一覧の画面から一括削除できる（確認ダイアログ必須・キャンセルでは消えない）', async ({
  page,
  request,
}) => {
  // 1ページ目の先頭に来るよう、この検証専用の記事を直前に作る
  const idA = await createSave(request, { title: `画面一括削除A ${RUN_ID}`, content: `本文A ${RUN_ID}` });
  const idB = await createSave(request, { title: `画面一括削除B ${RUN_ID}`, content: `本文B ${RUN_ID}` });

  await page.goto('/dashboard/saved');
  const panel = page.locator('[data-saved-panel="text-analysis"]');
  const cardA = panel.locator(`[data-favorite-button="${idA}"]`).locator('xpath=ancestor::*[@data-analysis-card][1]');

  // 対象2件を選択（カードのチェックボックス）
  for (const id of [idA, idB]) {
    const check = panel.locator(`[data-select-check="${id}"]`);
    await check.scrollIntoViewIfNeeded();
    await check.check();
  }
  const bulkBtn = panel.locator('[data-bulk-delete]');
  await expect(bulkBtn, '選択すると一括削除ボタンが出ること').toBeVisible();
  await expect(bulkBtn).toContainText('2件');

  // ① キャンセルすると1件も消えない（確認が実際に効いていることの検証）
  let dialogMessage = '';
  page.once('dialog', async (d) => {
    dialogMessage = d.message();
    await d.dismiss();
  });
  await bulkBtn.click();
  expect(dialogMessage, '件数を明示した確認ダイアログが出ること').toContain('2件');
  expect(dialogMessage, '元に戻せないことを伝えていること').toContain('元に戻せません');
  expect((await request.get(`${SAVES_API}?id=${idA}`)).status(), 'キャンセルなら消えないこと').toBe(200);

  // ② 承諾すると選択分が消える
  page.once('dialog', (d) => d.accept());
  await bulkBtn.click();
  await expect
    .poll(async () => (await request.get(`${SAVES_API}?id=${idA}`)).status())
    .toBe(404);
  expect((await request.get(`${SAVES_API}?id=${idB}`)).status()).toBe(404);
  await expect(cardA, '削除したカードが一覧から消えること').toHaveCount(0);
});

// ============================================================================
// 251: サイドバーのメニュー名の変更（🎛表示設定 → サイドバーへ反映 → 元に戻す）
// - 変えるのはサイドバーの表示だけ。URLとページ内の見出しは変わらないことも判定する
// - 保存は localStorage。テストのブラウザコンテキストは使い捨てなので既存設定に影響しない
// ============================================================================

test('C41: メニュー名の変更 — リネーム→サイドバー反映→リロードで維持→元に戻す', async ({ page }) => {
  const HREF = '/dashboard/context-library'; // 既定「🧠 AI参照素材」
  const CATEGORY = '情報収集・調査';

  await page.goto('/dashboard/display-settings');
  const settings = page.locator('[data-nav-label-settings]');
  await expect(settings, '🎛表示設定にメニュー名のセクションがあること').toBeVisible();

  const sidebarLink = page.locator(`[data-nav-href="${HREF}"]`);
  await expect(sidebarLink, '変更前は既定名で出ていること').toContainText('AI参照素材');

  // カテゴリを開いて、名前とアイコンを変える
  await settings.locator(`[data-nav-category-toggle="${CATEGORY}"]`).click();
  await settings.locator(`[data-nav-label-input="${HREF}"]`).fill('ネタ帳');
  await settings.locator(`[data-nav-icon-input="${HREF}"]`).fill('📦');

  // サイドバーに即反映される（保存ボタンを押さなくても効く）
  await expect(sidebarLink).toContainText('ネタ帳');
  await expect(sidebarLink).toContainText('📦');
  await expect(sidebarLink, '既定名がツールチップで分かること').toHaveAttribute(
    'title',
    '既定名: AI参照素材',
  );
  // URLは変えない（リンク先は既定のまま）
  await expect(sidebarLink).toHaveAttribute('href', HREF);

  // カテゴリ見出しも変えられる
  await settings.locator(`[data-nav-category-input="${CATEGORY}"]`).fill('調べもの');
  await expect(page.locator(`[data-nav-category="${CATEGORY}"]`)).toHaveText('調べもの');

  // 上限を超える名前は切り詰められる（サイドバーが折り返さない）
  await settings.locator(`[data-nav-label-input="${HREF}"]`).fill('あ'.repeat(30));
  const shown = (await sidebarLink.innerText()).replace(/\s/g, '');
  expect(shown.replace('📦', '').length, '12文字までに切り詰められること').toBeLessThanOrEqual(12);

  // リロードしても維持される（localStorageに保存されている）
  await settings.locator(`[data-nav-label-input="${HREF}"]`).fill('ネタ帳');
  await expect(sidebarLink).toContainText('ネタ帳');
  await page.reload();
  await expect(page.locator(`[data-nav-href="${HREF}"]`), 'リロード後も維持されること').toContainText('ネタ帳');

  // 名前を空にすると既定に戻る（空ラベルにならない）
  await page.locator('[data-nav-label-settings]').locator(`[data-nav-category-toggle="${CATEGORY}"]`).click();
  await page.locator(`[data-nav-label-input="${HREF}"]`).fill('');
  await expect(page.locator(`[data-nav-href="${HREF}"]`), '空文字なら既定名に戻ること').toContainText(
    'AI参照素材',
  );
  // アイコンだけの変更は残っている（片方を消してももう片方は保持）
  await expect(page.locator(`[data-nav-href="${HREF}"]`)).toContainText('📦');

  // 個別の「↩ 戻す」で完全に既定へ
  await page.locator(`[data-nav-reset="${HREF}"]`).click();
  await expect(page.locator(`[data-nav-href="${HREF}"]`)).toContainText('🧠');
  await expect(page.locator(`[data-nav-href="${HREF}"]`)).not.toHaveAttribute('title', /既定名/);

  // 「すべて既定に戻す」でカテゴリ名も戻る（確認ダイアログつき）
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-nav-reset-all]').click();
  await expect(page.locator(`[data-nav-category="${CATEGORY}"]`)).toHaveText(CATEGORY);

  // ページ内の見出し(h1)は最初から最後まで既定のまま（サイドバーだけを変える設計）
  await page.goto(HREF);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('AI参照素材');
});

// ============================================================================
// 252: リサーチ保存にマイフォルダを追加（🗂保存一覧と同じフォルダ一覧を共有）
// - 共有されるのはフォルダ一覧。AI参照素材は独立体系のまま
// ============================================================================

test('C42: 保存一覧とリサーチ保存でフォルダを共有する（作成が双方向に見え、1つに混在して入る）', async ({
  request,
}) => {
  // 保存一覧の側から作ったフォルダ
  const fromSaves = await createFolder(request, 'text_analysis', `${E2E_PREFIX} 共有A ${RUN_ID}`);
  // リサーチ保存の側から作ったフォルダ
  const fromLibrary = await createFolder(request, 'library', `${E2E_PREFIX} 共有B ${RUN_ID}`);
  // AI参照素材は独立体系（同名でも別物として作れる）
  const ctxFolder = await createFolder(request, 'context', `${E2E_PREFIX} 共有A ${RUN_ID}`);

  const savedId = await createSave(request, {
    title: `共有フォルダ検証 ${RUN_ID}`,
    content: `保存一覧側の記事（${RUN_ID}）`,
  });
  const libId = await createLibraryItem(request, {
    title: `共有フォルダ検証 ${RUN_ID}`,
    content: `リサーチ保存側の資料（${RUN_ID}）`,
  });

  try {
    // 1) どちらの画面から見ても、同じ2つのフォルダが並ぶ
    const savesView = await listFolders(request, 'text_analysis');
    const libraryView = await listFolders(request, 'library');
    for (const view of [savesView, libraryView]) {
      const ids = view.folders.map((f) => f.id);
      expect(ids, '保存一覧側で作ったフォルダが見えること').toContain(fromSaves);
      expect(ids, 'リサーチ保存側で作ったフォルダが見えること').toContain(fromLibrary);
      expect(ids, 'AI参照素材のフォルダは混ざらないこと').not.toContain(ctxFolder);
    }

    // 2) 1つのフォルダに、分析結果とDR結果が混在して入る
    expect((await assignFolders(request, 'text_analysis', savedId, [fromSaves])).status()).toBe(200);
    expect((await assignFolders(request, 'library', libId, [fromSaves])).status()).toBe(200);
    const merged = await listFolders(request, 'library');
    expect(
      merged.folders.find((f) => f.id === fromSaves)!.count,
      '両画面の記事が合算されて数えられること',
    ).toBe(2);

    // 3) 253: フォルダを開くと、どちらの画面から見ても中身が全部返る。
    // （252では自画面のぶんしか出ず、バッジの件数と表示件数が食い違っていた）
    const cross = await listFolderItems(request, fromSaves);
    expect(cross.total, 'フォルダの件数と中身の件数が一致すること').toBe(2);
    expect(
      cross.items.map((i) => i.scope).sort(),
      '保存一覧とリサーチ保存の両方が並ぶこと',
    ).toEqual(['library', 'text_analysis']);
    expect(cross.items.find((i) => i.scope === 'text_analysis')!.id).toBe(String(savedId));
    expect(cross.items.find((i) => i.scope === 'library')!.id).toBe(libId);

    // 各画面の一覧API（cfolder）は従来どおり自分のテーブルだけを返す。
    // 横断は /api/custom-folders/items が担う（役割を分けている）
    const savedFiltered = await listSaves(request, { cfolder: fromSaves, limit: 100 });
    expect(savedFiltered.items.map((i) => i.id)).toEqual([savedId]);
    const libFiltered = await request.get(`${LIBRARY_API}?q=${encodeURIComponent(RUN_ID)}`);
    expect(libFiltered.status()).toBe(200);
    const libRows = (await libFiltered.json()) as { id: string; custom_folder_ids?: number[] }[];
    const libRow = libRows.find((r) => r.id === libId)!;
    expect(libRow.custom_folder_ids, 'リサーチ保存の一覧に所属フォルダIDが載ること').toContain(fromSaves);

    // 4) AI参照素材の一覧には共有体系のフォルダが出ない
    const ctxView = await listFolders(request, 'context');
    const ctxIds = ctxView.folders.map((f) => f.id);
    expect(ctxIds).not.toContain(fromSaves);
    expect(ctxIds).not.toContain(fromLibrary);
    expect(ctxIds).toContain(ctxFolder);

    // 5) リネームは両画面に反映される（同じ1つのフォルダなので当然そうなる）
    const renamed = `${E2E_PREFIX} 共有A改 ${RUN_ID}`;
    const res = await request.patch(FOLDERS_API, {
      data: { scope: 'library', action: 'rename', id: fromSaves, name: renamed },
    });
    expect(res.status(), 'リサーチ保存側からリネームできること').toBe(200);
    expect(
      (await listFolders(request, 'text_analysis')).folders.find((f) => f.id === fromSaves)!.name,
      '保存一覧側にも反映されること',
    ).toBe(renamed);

    // 6) 250の一括削除と併用: リサーチ保存の記事を消すと、その分類だけが外れる
    const del = await request.delete(LIBRARY_API, { data: { ids: [libId] } });
    expect(del.status()).toBe(200);
    const afterDelete = await listFolders(request, 'text_analysis');
    expect(
      afterDelete.folders.find((f) => f.id === fromSaves)!.count,
      '削除した資料の分類が外れ、残った記事だけが数えられること',
    ).toBe(1);
    // 保存一覧側の記事は無傷
    expect((await request.get(`${SAVES_API}?id=${savedId}`)).status()).toBe(200);

    // 7) フォルダを消しても記事は消えない（249の方針維持）
    expect((await deleteFolder(request, 'library', fromSaves)).status()).toBe(200);
    expect(
      (await request.get(`${SAVES_API}?id=${savedId}`)).status(),
      'フォルダを消しても記事は残ること',
    ).toBe(200);
  } finally {
    await deleteFolder(request, 'text_analysis', fromSaves);
    await deleteFolder(request, 'text_analysis', fromLibrary);
    await deleteFolder(request, 'context', ctxFolder);
    await deleteSave(request, savedId);
    await request.delete(LIBRARY_API, { data: { ids: [libId] } });
  }
});

test('C43: リサーチ保存の画面で☆から分類し、バッジ表示とフォルダ絞り込みが効く（252のUI）', async ({
  page,
  request,
}) => {
  const name = `${E2E_PREFIX} UI252 ${RUN_ID}`;
  const itemId = await createLibraryItem(request, {
    title: `画面分類 ${RUN_ID}`,
    content: `リサーチ保存のマイフォルダUI検証（${RUN_ID}）`,
  });

  let folderId = 0;
  try {
    await page.goto('/dashboard/library');
    const bar = page.locator('[data-custom-folder-bar="library"]');
    await expect(bar, 'リサーチ保存にマイフォルダのバーが出ること').toBeVisible();

    // 管理モードからフォルダを作る
    await bar.locator('[data-folder-manage-toggle]').click();
    await bar.locator('[data-folder-bar-new-name]').fill(name);
    await bar.locator('[data-folder-bar-create]').click();
    const card = bar.locator('[data-folder-card]').filter({ hasText: name });
    await expect(card).toBeVisible();
    folderId = Number(await card.getAttribute('data-folder-card'));
    expect(folderId).toBeGreaterThan(0);

    // 検索で対象カードを1件に絞ってから☆を押す（876件の中から探さない）
    await page.locator('[data-library-search]').fill(RUN_ID);
    const favBtn = page.locator(`[data-favorite-button="${itemId}"]`);
    await favBtn.scrollIntoViewIfNeeded();
    await favBtn.click();
    const picker = page.locator('[data-folder-picker]');
    await expect(picker, '☆から分類パネルが開くこと').toBeVisible();
    await picker.locator(`[data-folder-option="${folderId}"] input`).check();

    // サーバに保存されたことをAPIで確認（見た目だけで判定しない）
    await expect
      .poll(async () => (await listFolders(request, 'library')).folders.find((f) => f.id === folderId)?.count)
      .toBe(1);

    // カードにバッジが出る
    await picker.getByRole('button', { name: '閉じる' }).click();
    await expect(
      page.locator(`[data-folder-badge="${folderId}"]`).first(),
      'コンパクトカードに所属フォルダのバッジが出ること',
    ).toBeVisible();

    // フォルダで絞り込むと、そのフォルダの中身が出る（253: 両画面をまとめた横断ビュー）
    await page.locator('[data-library-search]').fill('');
    await card.click();
    const cross = page.locator(`[data-folder-cross-view="${folderId}"]`);
    await expect(cross, 'フォルダを開くと横断ビューが出ること').toBeVisible();
    await expect(cross.locator('[data-cross-card]')).toHaveCount(1);
    await expect(cross.locator('[data-origin-badge="library"]')).toHaveCount(1);
  } finally {
    if (folderId) await deleteFolder(request, 'library', folderId);
    await request.delete(LIBRARY_API, { data: { ids: [itemId] } });
  }
});

// ============================================================================
// 253: マイフォルダを開いたら両画面のアイテムをまとめて表示する
// ============================================================================

test('C44: フォルダの中身API — 両画面が1つの並びで返り、出自と本文取得が種類ごとに正しい', async ({
  request,
}) => {
  const folderId = await createFolder(request, 'text_analysis', `${E2E_PREFIX} 横断 ${RUN_ID}`);
  const ctxFolder = await createFolder(request, 'context', `${E2E_PREFIX} 横断ctx ${RUN_ID}`);
  const savedId = await createSave(request, {
    title: `横断・分析 ${RUN_ID}`,
    content: `分析側の本文です（${RUN_ID}）`,
  });
  const libId = await createLibraryItem(request, {
    title: `横断・リサーチ ${RUN_ID}`,
    content: `リサーチ側の本文です（${RUN_ID}）`,
  });

  try {
    expect((await assignFolders(request, 'text_analysis', savedId, [folderId])).status()).toBe(200);
    expect((await assignFolders(request, 'library', libId, [folderId])).status()).toBe(200);

    const cross = await listFolderItems(request, folderId);
    expect(cross.total).toBe(2);
    expect(cross.folder.id).toBe(folderId);

    const ta = cross.items.find((i) => i.scope === 'text_analysis')!;
    const lib = cross.items.find((i) => i.scope === 'library')!;
    expect(ta.title).toContain('横断・分析');
    expect(lib.title).toContain('横断・リサーチ');
    // 一覧では本文を返さない（重くしない）が、文字数は出す
    expect(cross.items.every((i) => !('content' in i))).toBe(true);
    expect(ta.char_count).toBeGreaterThan(0);
    expect(lib.char_count).toBeGreaterThan(0);
    // 所属フォルダのバッジ用IDが載っている
    expect(ta.custom_folder_ids).toContain(folderId);
    expect(lib.custom_folder_ids).toContain(folderId);

    // 本文は種類ごとに取りに行ける（誤ったテーブルを引かない）
    for (const item of [ta, lib]) {
      const res = await request.get(
        `${FOLDER_ITEMS_API}?full=1&scope=${item.scope}&id=${encodeURIComponent(item.id)}`,
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.scope).toBe(item.scope);
      expect(String(body.content)).toContain(RUN_ID);
    }

    // 防御: AI参照素材のフォルダ（独立体系）の中身は返さない／不在IDも404
    expect((await request.get(`${FOLDER_ITEMS_API}?folderId=${ctxFolder}`)).status()).toBe(404);
    expect((await request.get(`${FOLDER_ITEMS_API}?folderId=999999999`)).status()).toBe(404);
    const anon = await pwRequest.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      expect((await anon.get(`${FOLDER_ITEMS_API}?folderId=${folderId}`)).status()).toBe(401);
    } finally {
      await anon.dispose();
    }
  } finally {
    await deleteFolder(request, 'text_analysis', folderId);
    await deleteFolder(request, 'context', ctxFolder);
    await deleteSave(request, savedId);
    await request.delete(LIBRARY_API, { data: { ids: [libId] } });
  }
});

test('C45: 横断表示のUI — 両画面から同じフォルダを開くと同じ件数・出自バッジが出る（253）', async ({
  page,
  request,
}) => {
  const folderId = await createFolder(request, 'text_analysis', `${E2E_PREFIX} 横断UI ${RUN_ID}`);
  const savedId = await createSave(request, {
    title: `横断UI・分析 ${RUN_ID}`,
    content: `分析側の本文（${RUN_ID}）`,
  });
  const libId = await createLibraryItem(request, {
    title: `横断UI・リサーチ ${RUN_ID}`,
    content: `リサーチ側の本文（${RUN_ID}）`,
  });

  try {
    expect((await assignFolders(request, 'text_analysis', savedId, [folderId])).status()).toBe(200);
    expect((await assignFolders(request, 'library', libId, [folderId])).status()).toBe(200);

    // 🗂保存一覧から開く
    for (const url of ['/dashboard/saved', '/dashboard/library']) {
      await page.goto(url);
      const scopeAttr = url.endsWith('/saved') ? 'text_analysis' : 'library';
      const bar = page.locator(`[data-custom-folder-bar="${scopeAttr}"]`);
      await expect(bar).toBeVisible();
      const card = bar.locator(`[data-folder-card="${folderId}"]`);
      await expect(card, 'フォルダのカードが出ること').toBeVisible();
      // バッジの件数が2（両画面の合算）
      await expect(card).toContainText('2');
      await card.click();

      const view = page.locator(`[data-folder-cross-view="${folderId}"]`);
      await expect(view, `${url} で横断ビューが出ること`).toBeVisible();
      await expect(view.locator('[data-cross-total]'), '件数がバッジと一致すること').toContainText('2件');
      // 両方の出自バッジが1つずつ出る
      await expect(view.locator('[data-origin-badge="text_analysis"]')).toHaveCount(1);
      await expect(view.locator('[data-origin-badge="library"]')).toHaveCount(1);
      await expect(view.locator('[data-cross-card]'), 'カードが2件並ぶこと').toHaveCount(2);
      // 相手画面のアイテムでも本文が開ける（誤ったAPIを叩いていない）
      await view
        .locator(`[data-cross-card="library:${libId}"]`)
        .getByRole('button', { name: '▼ 全文表示' })
        .click();
      await expect(view.locator(`[data-cross-card="library:${libId}"]`)).toContainText(RUN_ID);
      // 絞り込みを解除すると通常の一覧へ戻る
      await view.locator('[data-cross-exit]').click();
      await expect(page.locator(`[data-folder-cross-view="${folderId}"]`)).toHaveCount(0);
    }
  } finally {
    await deleteFolder(request, 'text_analysis', folderId);
    await deleteSave(request, savedId);
    await request.delete(LIBRARY_API, { data: { ids: [libId] } });
  }
});

// ============================================================================
// 254: 「📋 クリアして貼付」（ボタン＋⌘⇧V）
// - 検証4パターン: 貼り付け成功 / 権限拒否 / 空クリップボード / 実行中
// - 通常の ⌘V を壊していないこと・Undoで戻せることも判定する
// ============================================================================

test('C46: クリアして貼付 — 成功/空/実行中とUndo、⌘Vは壊さない（254）', async ({ page, context }) => {
  const analyzeCalls = await mockAnalyze(page, `[E2E] ${KB_TOKEN} モック分析結果`, 1500);
  await stubFeatureDrafts(page);
  // クリップボードの読み書きを許可（院長のブラウザで「許可」した状態に相当）
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });

  await page.goto('/dashboard/text-analysis');
  await page.evaluate(() => localStorage.setItem('lumina_auto_stock_save', '0'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  // R-12: reload直後はハイドレーション前で fill が state に入らない。操作の前に待つ
  await waitForRunReady(page);

  const textarea = page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...');
  const pasteBtn = page.locator('[data-clear-paste]').filter({ visible: true }).first();
  await expect(pasteBtn, 'ボタンが「✕ クリア」の隣に出ること').toBeVisible();
  await expect(pasteBtn, 'ボタンにキーが併記されていること').toHaveText(/(⌘⇧V|Ctrl\+⇧V)/);
  await expect(
    page.getByRole('button', { name: /✕ クリア/ }).filter({ visible: true }).first(),
    '既存の「✕ クリア」は残っていること',
  ).toBeVisible();

  const OLD = `[E2E] ${KB_TOKEN} もとの入力`;
  const CLIP = `[E2E] ${KB_TOKEN} クリップボードの内容`;

  // ── ① 貼り付け成功（ボタン）: 中身が置き換わり、カーソルは末尾 ──
  await page.evaluate((t) => navigator.clipboard.writeText(t), CLIP);
  await textarea.fill(OLD);
  await expect(textarea, '「入力がある」という前提が成立していること').toHaveValue(OLD);
  await pasteBtn.click();
  await expect(textarea, 'クリップボードの内容で置き換わること').toHaveValue(CLIP);
  await expect(textarea, '入力欄にフォーカスが戻ること').toBeFocused();
  expect(
    await textarea.evaluate((el: HTMLTextAreaElement) => el.selectionStart),
    'カーソルが末尾にあること',
  ).toBe(CLIP.length);

  // ── ② Undo: 消えた内容を戻せる ──
  const undo = page.getByRole('button', { name: '↩ 元に戻す' });
  await expect(undo, '直後はUndoが出ること').toBeVisible();
  await undo.click();
  await expect(textarea, 'Undoで元の入力に戻ること').toHaveValue(OLD);

  // ── ③ ショートカット（⌘⇧V）でも同じ経路 ──
  const CLIP2 = `[E2E] ${KB_TOKEN} キーで貼った内容`;
  await page.evaluate((t) => navigator.clipboard.writeText(t), CLIP2);
  await textarea.click();
  await page.keyboard.press('ControlOrMeta+Shift+v');
  await expect(textarea, 'キーでもクリア＋貼付ができること').toHaveValue(CLIP2);
  await expect(page.getByRole('button', { name: '↩ 元に戻す' })).toBeVisible();

  // ── ④ 通常の ⌘V を壊していない（カーソル位置に追記される＝全消しにならない）──
  await textarea.fill('AB');
  await textarea.click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(textarea, '⌘Vは従来どおりカーソル位置への貼り付けであること').toHaveValue(
    `AB${CLIP2}`,
  );

  // ── ⑤ 空クリップボード: クリアだけ行い、内容はUndoで戻せる ──
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await textarea.fill(OLD);
  await pasteBtn.click();
  await expect(textarea, 'クリップボードが空ならクリアだけ行うこと').toHaveValue('');
  await expect(page.getByText('クリップボードが空でした')).toBeVisible();
  await page.getByRole('button', { name: '↩ 元に戻す' }).click();
  await expect(textarea, '空クリップボードでも内容を戻せること').toHaveValue(OLD);

  // ── ⑥ 実行中は押せない（生成の途中で入力を差し替えさせない）──
  await page.evaluate((t) => navigator.clipboard.writeText(t), CLIP);
  await page.locator('button[data-kb-run]').click();
  await expect(page.locator('button[data-kb-run]')).toHaveText(/分析中/);
  await expect(pasteBtn, '実行中はボタンが無効であること').toBeDisabled();
  await page.keyboard.press('ControlOrMeta+Shift+v');
  await expect(textarea, '実行中はキーでも入力が変わらないこと').toHaveValue(OLD);
  await expect(page.locator('button[data-kb-run]')).not.toHaveText(/分析中/, { timeout: 30000 });
  expect(analyzeCalls(), '想定どおり1回だけ実行されたこと').toBe(2);

  // ── ⑦ ショートカット一覧に登録されている ──
  await page.locator('button[title*="キーボードショートカット一覧"]').click();
  const palette = page.locator('[data-kb-palette]');
  await expect(palette.getByText('クリアして貼り付け（Windowsは Ctrl+Shift+V）')).toBeVisible();
  await page.locator('button[title*="キーボードショートカット一覧"]').click();
});

test('C47: クリップボードを読めないときは、クリアして⌘Vで貼れる状態にする（254・権限拒否）', async ({
  browser,
}) => {
  // 権限を与えないコンテキスト＝院長が読み取りを許可していない状態
  const ctx = await browser.newContext({ storageState: STORAGE_STATE, baseURL: BASE_URL });
  const page = await ctx.newPage();
  try {
    await stubFeatureDrafts(page);
    await page.goto('/dashboard/text-analysis');
    await page.evaluate(() => localStorage.setItem('lumina_auto_stock_save', '0'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    // R-12: ハイドレーション前に fill すると state に入らず「入力が空」のまま押すことになり、
    // 何もしない（noop）経路に落ちて案内が出ない。実際にこれで一度落とした
    await waitForRunReady(page);

    const textarea = page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...');
    const OLD = `[E2E] ${KB_TOKEN} 権限なしのときの入力`;
    await textarea.fill(OLD);
    await expect(textarea, '「入力がある」という前提が成立していること').toHaveValue(OLD);
    await page.locator('[data-clear-paste]').filter({ visible: true }).first().click();

    // クリアまで済ませ、あとは⌘Vを押せばよい状態にする（案A）
    await expect(textarea, 'クリアは実行されること').toHaveValue('');
    await expect(textarea, '入力欄にフォーカスが当たっていること').toBeFocused();
    await expect(page.getByText(/⌘V（Ctrl\+V）で貼り付けてください/)).toBeVisible();
    // 消えた内容は失われていない
    await page.getByRole('button', { name: '↩ 元に戻す' }).click();
    await expect(textarea, '権限が無くても内容は戻せること').toHaveValue(OLD);
  } finally {
    await ctx.close();
  }
});
