import { test, expect, request as pwRequest, webkit, APIRequestContext } from '@playwright/test';
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

test('C46: クリアして貼付 — 成功/空/実行中とUndo、⌘Vは壊さない（254/270）', async ({ page, context }) => {
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

  // ── ⑤ 空クリップボード: 貼るものが無いので**入力欄に触らない**（270で変更・R-76）──
  // 254は「クリアだけ行う」だったが、貼るものが手に入っていないのに消すのは破壊的操作の先行。
  // iOSではキャンセルのたびにこの経路へ落ちるため、消さない側へ倒した
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await textarea.fill(OLD);
  await pasteBtn.click();
  await expect(page.getByText('クリップボードが空でした')).toBeVisible();
  await expect(textarea, 'クリップボードが空なら入力はそのままであること').toHaveValue(OLD);
  await expect(
    page.getByRole('button', { name: '↩ 元に戻す' }),
    '何も消していないのでUndoは出ないこと',
  ).toHaveCount(0);

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

test('C47: クリップボードを読めないときは入力を一切変更しない（270・権限拒否／iOSのキャンセル相当）', async ({
  browser,
}) => {
  // 権限を与えないコンテキスト＝院長が読み取りを許可していない状態。
  // iPhoneで確認ポップアップを「許可しない」で閉じたときと同じ経路（readText が失敗する）
  const ctx = await browser.newContext({ storageState: STORAGE_STATE, baseURL: BASE_URL });
  const page = await ctx.newPage();
  try {
    await stubFeatureDrafts(page);
    await page.goto('/dashboard/text-analysis');
    await page.evaluate(() => localStorage.setItem('lumina_auto_stock_save', '0'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    // R-12: ハイドレーション前に fill すると state に入らず「入力が空」のまま押すことになり、
    // 守りたい前提（入力がある状態でキャンセルする）が崩れる。実際にこれで一度落とした
    await waitForRunReady(page);

    const textarea = page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...');
    const OLD = `[E2E] ${KB_TOKEN} 権限なしのときの入力`;
    await textarea.fill(OLD);
    await expect(textarea, '「入力がある」という前提が成立していること').toHaveValue(OLD);
    await page.locator('[data-clear-paste]').filter({ visible: true }).first().click();

    // 270の最重要要件: 読めなかったら**何もしない**（254はここでクリアまで実行していた）
    await expect(
      page.getByText('クリップボードを読み取れませんでした').first(),
      '読めなかったことを知らせ、代わりの操作を案内すること（黙って終わらせない）',
    ).toBeVisible();
    await expect(textarea, '読めなくても入力が消えないこと').toHaveValue(OLD);
    await expect(
      page.getByRole('button', { name: '↩ 元に戻す' }),
      '何も消していないのでUndoは出ないこと',
    ).toHaveCount(0);

    // キー（⌘⇧V）でも同じ結末になる（ボタンとキーで挙動が分かれない）
    await textarea.click();
    await page.keyboard.press('ControlOrMeta+Shift+v');
    await expect(textarea, 'キーでも入力が消えないこと').toHaveValue(OLD);
  } finally {
    await ctx.close();
  }
});

// ============================================================================
// 255/270: 「貼り付けで置き換える」（設定ON時のみ・対象は🔭ディープリサーチだけ）
// - 設定ONのとき、DRのトピック欄では普段どおりの貼り付けが「置き換え」になる
// - 270: 📝テキスト分析は**対象外**（3ボタンと役割が重なるため）。設定値は保持する
// ============================================================================

test('C48: 貼り付けで置き換える — DRだけが対象。テキスト分析は3ボタン化で対象外（255/270）', async ({
  page,
  context,
}) => {
  await stubFeatureDrafts(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });

  // 既定はOFF＝これまでどおり追記であることから確認する
  await page.goto('/dashboard/text-analysis');
  await page.evaluate(() => {
    localStorage.setItem('lumina_auto_stock_save', '0');
    localStorage.removeItem('lumina_paste_replace');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForRunReady(page);

  const textarea = page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...');
  const CLIP = `[E2E] ${KB_TOKEN} 貼り付ける内容`;
  await page.evaluate((t) => navigator.clipboard.writeText(t), CLIP);

  // ── ① 既定（OFF）: 貼り付けは従来どおり追記 ──
  await textarea.fill('AB');
  await expect(textarea, '前提: 入力がある').toHaveValue('AB');
  await textarea.click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(textarea, '既定では貼り付けの意味が変わらないこと').toHaveValue(`AB${CLIP}`);

  // ── ② 設定をONにする（🎛表示設定から。設定そのものは270でも残す） ──
  await page.goto('/dashboard/display-settings');
  const toggle = page.locator('[data-paste-replace-toggle] input[type="checkbox"]');
  await expect(toggle, '表示設定にトグルがあること').toBeVisible();
  await expect(toggle, '既定はオフであること').not.toBeChecked();
  await toggle.check();
  await expect(page.locator('[data-paste-replace-toggle]')).toContainText('オン');
  // 270: 対象画面の案内が実装と一致していること（テキスト分析を対象と書かない）
  await expect(
    page.getByText('📝 テキスト分析は対象外です'),
    '3ボタンの画面が対象外であることを設定画面に書くこと',
  ).toBeVisible();

  // ── ③ 270: ONでも📝テキスト分析の貼り付けは**変わらない**（3ボタンと二重化させない） ──
  await page.goto('/dashboard/text-analysis');
  await waitForRunReady(page);
  const ta2 = page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...');
  await ta2.fill('前からあった本文');
  await expect(ta2).toHaveValue('前からあった本文');
  await ta2.click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(ta2, 'テキスト分析では設定ONでも追記のままであること').toHaveValue(
    `前からあった本文${CLIP}`,
  );

  // ── ④ 🔭ディープリサーチ（2ボタン構成）では従来どおり置き換わる ──
  await page.goto('/dashboard/deepresearch');
  const topic = page.getByPlaceholder(/調査したいテーマを詳しく入力してください/);
  await expect(topic).toBeVisible({ timeout: 30000 });
  await topic.fill('前からあったトピック');
  await expect(topic).toHaveValue('前からあったトピック');
  await topic.click();
  await page.keyboard.press('End');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(topic, 'DRでは貼り付けだけで置き換わること').toHaveValue(CLIP);

  // ── ⑤ Undoで戻せる（誤って置き換えても本文を失わない） ──
  const undo = page.getByRole('button', { name: '↩ 元に戻す' });
  await expect(undo, '置き換えた直後はUndoが出ること').toBeVisible();
  await undo.click();
  await expect(topic, 'Undoで元のトピックに戻ること').toHaveValue('前からあったトピック');

  // ── ⑥ 入力が空のときは素通し（置き換えるものが無い） ──
  await topic.fill('');
  await topic.click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(topic, '空の入力欄には普通に貼り付くこと').toHaveValue(CLIP);
  await expect(
    page.getByRole('button', { name: '↩ 元に戻す' }),
    '置き換えていないのでUndoは出ないこと',
  ).toHaveCount(0);

  // ── ⑦ 254のボタンは設定に関係なく従来どおり効く（テキスト分析） ──
  await page.goto('/dashboard/text-analysis');
  await waitForRunReady(page);
  const ta3 = page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...');
  const OLD = `[E2E] ${KB_TOKEN} ボタン検証`;
  await ta3.fill(OLD);
  await expect(ta3).toHaveValue(OLD);
  await page.locator('[data-clear-paste]').filter({ visible: true }).first().click();
  await expect(ta3, '「📋 クリアして貼付」は従来どおり動くこと').toHaveValue(CLIP);

  // 後片付け（このブラウザコンテキストは使い捨てだが、設定を戻して終わる）
  await page.goto('/dashboard/display-settings');
  await page.locator('[data-paste-replace-toggle] input[type="checkbox"]').uncheck();
});

// ============================================================================
// 256: カードにカーソルを当てると本文の冒頭が出るプレビュー
// - 3画面すべてで出ること・整形されていること・設定でOFFにできること
// - タッチ端末（ホバーなし）では出ないこと＝操作を妨げないこと
// ============================================================================

// 257: プレビューの矩形がカードの矩形に**隣接**していることを座標で判定する。
// 256の不具合（カーソル基準＋端での反転で266px離れる）を再発させないための機械判定。
async function assertPreviewAdjacent(
  page: import('@playwright/test').Page,
  card: import('@playwright/test').Locator,
  label: string,
) {
  const cb = await card.boundingBox();
  const pb = await page.locator('[data-hover-preview]').boundingBox();
  expect(cb, `${label}: カードの矩形が取れること`).not.toBeNull();
  expect(pb, `${label}: プレビューの矩形が取れること`).not.toBeNull();
  if (!cb || !pb) return;
  // 2つの矩形の最短距離（重なっていれば0）。隙間は GAP(10px) + 三角/丸めの余裕
  const dx = Math.max(0, Math.max(cb.x - (pb.x + pb.width), pb.x - (cb.x + cb.width)));
  const dy = Math.max(0, Math.max(cb.y - (pb.y + pb.height), pb.y - (cb.y + cb.height)));
  const distance = Math.hypot(dx, dy);
  expect(
    distance,
    `${label}: プレビューがカードに隣接していること（実測 ${Math.round(distance)}px）`,
  ).toBeLessThanOrEqual(14);
  // 画面外にはみ出していないこと
  const vp = page.viewportSize();
  if (vp) {
    expect(pb.x, `${label}: 左にはみ出さない`).toBeGreaterThanOrEqual(0);
    expect(pb.y, `${label}: 上にはみ出さない`).toBeGreaterThanOrEqual(0);
    expect(pb.x + pb.width, `${label}: 右にはみ出さない`).toBeLessThanOrEqual(vp.width + 1);
    expect(pb.y + pb.height, `${label}: 下にはみ出さない`).toBeLessThanOrEqual(vp.height + 1);
  }
}

test('C49: ホバープレビュー — 3画面で出て、Markdown記号が出ず、設定でOFFにできる（256）', async ({
  page,
}) => {
  // この検証専用の資料を作る（一覧の先頭に来る＝探し回らない）
  const marker = `HOVERTEST${RUN_ID}`;
  const md = `## ${marker} の見出し\n\n**強調**した本文です。${'あ'.repeat(500)}`;
  const savedId = await (async () => {
    const res = await page.request.post(SAVES_API, {
      data: { title: `プレビュー検証 ${marker}`, content: md, category: SEED_FOLDER },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    return (j.save?.id ?? j.id) as number;
  })();
  const libId = await (async () => {
    const res = await page.request.post(LIBRARY_API, {
      data: { title: `[E2E] プレビュー検証 ${marker}`, content: md, type: 'research', tags: '', group_name: '' },
    });
    expect(res.status()).toBe(200);
    return (await res.json()).id as string;
  })();
  const ctxId = await (async () => {
    const res = await page.request.post(CONTEXT_API, {
      data: { topic: `[E2E] プレビュー検証 ${marker}`, contextText: md, tags: [] },
    });
    expect(res.status()).toBe(200);
    return (await res.json()).id as number;
  })();

  const preview = page.locator('[data-hover-preview]');

  // 検索のデバウンス後に一覧が再描画されるため、カーソルが乗った状態が
  // 崩れることがある。実際の操作と同じく「少し待って当て直す」形で確かめる
  const hoverUntilPreview = async (
    target: import('@playwright/test').Locator,
    label: string,
  ) => {
    await expect(async () => {
      await target.hover();
      await expect(preview, label).toBeVisible({ timeout: 2500 });
    }).toPass({ timeout: 20000 });
  };

  try {
    // ── ⓪ 273: 既定はOFF。この検証は🎛でONにしてから始める ──
    await page.goto('/dashboard/display-settings');
    const initToggle = page.locator('[data-hover-preview-toggle] input[type="checkbox"]');
    await expect(initToggle, '273: 既定はオフであること').not.toBeChecked();
    await initToggle.check();

    // ── ① 🗂保存一覧（本文は一覧に載っていない＝ホバー時に取得する画面）──
    await page.goto('/dashboard/saved');
    const panel = page.locator('[data-saved-panel="text-analysis"]');
    const card = panel.locator(`[data-analysis-card="${savedId}"]`);
    await expect(card).toBeVisible();
    await hoverUntilPreview(card, '保存一覧でプレビューが出ること');
    await expect(preview, '本文の冒頭が出ること').toContainText(marker);
    await expect(preview, 'Markdownの見出し記号が出ないこと').not.toContainText('##');
    await expect(preview, '強調記号が出ないこと').not.toContainText('**');
    await expect(preview, '長い本文は…で切られること').toContainText('…');
    // ── ①-b 位置がカードに隣接していること（257・座標で機械判定）──
    // 256はカーソル座標を基準にしていたため、画面端では箱ごと反転して
    // カードから266px離れた位置に出ていた（本番実測）。ここを座標で固定する。
    await assertPreviewAdjacent(page, page.locator(`[data-hover-card="${savedId}"]`), '保存一覧');

    // カードから外れたら消える
    await page.locator('h1').first().hover();
    await expect(preview, 'カードから外れたら消えること').toHaveCount(0);

    // ── ② 📚リサーチ保存（本文が手元にある＝追加リクエストなしの画面）──
    await page.goto('/dashboard/library');
    await page.locator('[data-library-search]').fill(marker);
    const libCard = page.locator(`[data-favorite-button="${libId}"]`);
    await expect(libCard).toBeVisible();
    await hoverUntilPreview(libCard, 'リサーチ保存でプレビューが出ること');
    await expect(preview).toContainText(marker);
    await expect(preview).not.toContainText('##');
    // 1〜4列のグリッドでも隣接すること（右端の列は左側へ回る）
    // ※ libCard は行内のお気に入りボタン。位置の基準はホバー対象そのもの（ラッパー）
    const libHoverCard = page.locator(`[data-hover-card="${libId}"]`);
    await assertPreviewAdjacent(page, libHoverCard, 'リサーチ保存');

    // ── ②-b スクロールしたあとの位置でも隣接すること（257）──
    // スクロール中はいったん消える仕様（R-62(3)）。動きが止まってから当て直す
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(600);
    await page.locator('h1').first().hover();
    await hoverUntilPreview(libCard, 'スクロール後もプレビューが出ること');
    await assertPreviewAdjacent(page, libHoverCard, 'リサーチ保存（スクロール後）');

    // ── ③ 🧠AI参照素材 ──
    // 検索で絞ってから掴むと、デバウンス後の再描画とホバーが競合して不安定だった。
    // 作成直後の素材は created_at DESC の先頭に来るので、そのまま待って当てる
    await page.goto('/dashboard/context-library');
    const ctxCard = page.locator(`[data-bundle-key="ctx-${ctxId}"]`);
    await expect(ctxCard).toBeVisible({ timeout: 30000 });
    await hoverUntilPreview(ctxCard, 'AI参照素材でプレビューが出ること');
    await expect(preview).toContainText(marker);
    await assertPreviewAdjacent(page, page.locator(`[data-hover-card="${ctxId}"]`), 'AI参照素材');

    // ── ④ 🎛表示設定でOFFにすると出なくなる ──
    await page.goto('/dashboard/display-settings');
    const toggle = page.locator('[data-hover-preview-toggle] input[type="checkbox"]');
    await expect(toggle, '⓪でONにした値が保たれていること（273）').toBeChecked();
    await toggle.uncheck();
    await page.goto('/dashboard/saved');
    const card2 = page.locator('[data-saved-panel="text-analysis"]').locator(`[data-analysis-card="${savedId}"]`);
    await card2.hover();
    await page.waitForTimeout(1200); // 遅延(280ms・257)より十分長く待つ
    await expect(preview, 'OFFにしたら出ないこと').toHaveCount(0);

    // 273: 既定はOFFになったので、OFFのまま終える（④で外したところが最終状態）
  } finally {
    await page.request.delete(`${SAVES_API}?id=${savedId}`);
    await page.request.delete(LIBRARY_API, { data: { ids: [libId] } });
    await page.request.delete(`${CONTEXT_API}?id=${ctxId}`);
  }
});

test('C50: タッチ端末ではプレビューを出さない（256・操作を妨げない）', async ({ browser }) => {
  // hasTouch + ホバーなしの端末として扱わせる（iPhone相当のビューポート）
  const ctx = await browser.newContext({
    storageState: STORAGE_STATE,
    baseURL: BASE_URL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  try {
    await page.goto('/dashboard/saved');
    const card = page.locator('[data-analysis-card]').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    // タップ相当の操作をしてもプレビューは出ない
    await card.tap();
    await page.waitForTimeout(1200);
    await expect(
      page.locator('[data-hover-preview]'),
      'カーソルの無い端末ではプレビューを出さないこと',
    ).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

// ============================================================================
// 258【1】: 分析タイプの折りたたみ
// - よく使う2つ（概要・要約／詳細にまとめる）は常時表示
// - 残りと「目的・コンテキスト」は「▶ その他の分析タイプ」に畳む（既定は閉じる）
// - 畳んだ側に選択が残っていたら、閉じていてもバッジで分かる（要件2）
// ============================================================================

test('C51: 分析タイプの折りたたみ — 既定は閉じ、畳んだ側の選択はバッジで分かる（258）', async ({
  page,
}) => {
  await stubFeatureDrafts(page);
  await page.goto('/dashboard/text-analysis');
  await waitForRunReady(page);

  const panel = page.locator('[data-kb-run]').first();
  await expect(panel).toBeVisible();

  const primary = page.getByRole('checkbox', { name: '概要・要約' });
  const primary2 = page.getByRole('checkbox', { name: '詳細にまとめる' });
  const secondary = page.getByRole('checkbox', { name: '全文書き起こし' });
  const toggle = page.locator('[data-analysis-more-toggle]');
  const body = page.locator('[data-analysis-more-body]');
  const badge = page.locator('[data-analysis-more-badge]');

  // ── ① 既定: よく使う2つだけが見えていて、残りは畳まれている ──
  await expect(primary, '概要・要約は常時表示').toBeVisible();
  await expect(primary2, '詳細にまとめるは常時表示').toBeVisible();
  await expect(secondary, '全文書き起こしは畳まれていること').toHaveCount(0);
  await expect(page.locator('[data-analysis-purpose]'), '目的も畳まれていること').toHaveCount(0);
  await expect(toggle, '開くための入口があること').toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(badge, '何も選んでいなければバッジは出ないこと').toHaveCount(0);

  // ── ② 開くと残りが出る ──
  await toggle.click();
  await expect(body).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(secondary, '開けば選べること').toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Gensparkスライド資料用まとめ' })).toBeVisible();
  await expect(page.locator('[data-analysis-purpose]'), '目的も開けば出ること').toBeVisible();

  // ── ③ 畳んだ側を選んで閉じても、選択中だと分かる（要件2）──
  await secondary.check();
  await toggle.click();
  await expect(body, '閉じたら中身は消えること').toHaveCount(0);
  await expect(badge, '閉じていても選択中が分かること').toBeVisible();
  await expect(badge).toContainText('選択中 1');
  await expect(badge, '何が選ばれているか名前まで分かること').toContainText('全文書き起こし');
  // 実行ボタンの件数と一致している（見えている数と食い違わない）
  await expect(page.locator('[data-kb-run]').first(), '選択数が実行ボタンと一致すること').toContainText('3件を分析');

  // ── ④ 目的を入れて閉じても分かる ──
  await toggle.click();
  await page.locator('[data-analysis-purpose]').fill('[E2E] 258の検証');
  await toggle.click();
  await expect(page.locator('[data-analysis-purpose-badge]'), '目的が入っていることが分かること').toBeVisible();

  // ── ⑤ 開閉は保存しない（再訪すると閉じている＝「すっきり」の既定に戻る）──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForRunReady(page);
  await expect(page.locator('[data-analysis-more-toggle]'), '再訪時は閉じていること').toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

// ============================================================================
// 270: iPhone（WebKit）でも📝テキスト分析は3ボタン（✕クリア／📋ペースト／📋クリアして貼付）
// - 258の「iOSでは📋クリアして貼付を出さない」は院長判断で撤回（デスクトップと操作を揃える）
// - 読み取りに失敗したら**入力欄に触らない**ことを、iOSと同じエンジン（WebKit）で実測する
//   （R-64: Chromiumだけで測らない。WebKit は clipboard-read の権限付与に対応していないため、
//    この文脈の readText() は必ず失敗する＝「キャンセルした」経路をそのまま再現できる）
// - 260で撤去した「編集可能な貼り付け欄」は復活させない
//
// 判定は UA ではなく (hover: hover) and (pointer: fine) で行っているので、
// hasTouch/isMobile の WebKit コンテキストで実機と同じ分岐に入る。
// ============================================================================

test('C52: iPhone相当（WebKit）— 3ボタンが並び、読めないときも本文を壊さない（260/270）', async () => {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    storageState: STORAGE_STATE,
    baseURL: BASE_URL,
    // 実機と同じ分岐に入れるための条件（UA判定はしていないので hasTouch/isMobile で足りる）
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    // アプリのService Workerが page.route を迂回するため、他のテストと同じく無効化する
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  try {
    await stubFeatureDrafts(page);
    await page.goto('/dashboard/text-analysis');

    const textarea = page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...');
    await expect(textarea).toBeVisible({ timeout: 30000 });
    // ハイドレーション完了の合図。このボタンはクライアントの effect（端末判定）が済んで
    // 初めて出るため、キー併記の代わりに使える
    // （モバイルではキー併記を出さない仕様なので waitForRunReady は使えない・R-12）
    const pasteButton = page.locator('[data-paste-button]');
    await expect(pasteButton, '📋 ペーストが出ていること').toBeVisible({ timeout: 30000 });

    // ── ① 270: iOSにも「📋 クリアして貼付」を出す（258の出し分けを撤回）──
    const clearPaste = page.locator('[data-clear-paste]');
    await expect(clearPaste, 'iOSでも「📋 クリアして貼付」が出ること').toBeVisible();
    // 押せないキーを案内しない（キーボードの無い端末にキー併記を出さない）
    await expect(clearPaste, 'iPhoneではキー併記を出さないこと').not.toHaveText(/(⌘⇧V|Ctrl\+⇧V)/);

    // ── ② 260: 編集可能な貼り付け欄を置いていない ──
    // 259の「長押し貼り付け欄」は実機でタップするとキーボードが立ち上がり、
    // 欄の位置がずれて押し直しになった。**編集可能な要素を使わない**ことが260の要点なので、
    // 入力欄（本文）以外に編集可能な要素が増えていないことまで数える
    await expect(
      page.locator('[data-long-press-paste]'),
      'キーボードを呼ぶ編集可能な貼り付け欄を置いていないこと',
    ).toHaveCount(0);
    // 「長押し」を促す編集可能な要素が1つも無いこと（総数で数えると本文欄や目的欄まで
    // 拾ってしまい、何を守っているのか分からない判定になるため、目印で数える）
    const pasteFields = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          'input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]',
        ),
      ].filter((el) =>
        `${el.getAttribute('placeholder') ?? ''}${el.getAttribute('aria-label') ?? ''}`.includes(
          '長押し',
        ),
      ).length,
    );
    expect(pasteFields, '長押しを促す編集可能な欄が復活していないこと').toBe(0);

    // ── ③ 270: 3ボタンが「✕ クリア → 📋 ペースト → 📋 クリアして貼付」の順に並ぶ ──
    const clearBtn = page.getByRole('button', { name: /✕ クリア/ });
    await expect(clearBtn, '✕ クリアが出ていること').toBeVisible();
    const xs = await Promise.all(
      [clearBtn, pasteButton, clearPaste].map(async (b) => {
        const box = await b.first().boundingBox();
        return box!;
      }),
    );
    // 折り返した場合は行（y）で、同じ行なら x で並び順を見る（375px級では2行になり得る）
    const orderKey = (b: { x: number; y: number }) => b.y * 10000 + b.x;
    expect(orderKey(xs[0]), '✕ クリアが📋 ペーストより前にあること').toBeLessThan(orderKey(xs[1]));
    expect(orderKey(xs[1]), '📋 ペーストが📋 クリアして貼付より前にあること').toBeLessThan(
      orderKey(xs[2]),
    );
    // 3つとも画面幅に収まっていること（押せない位置に押し出されていない）
    const width = page.viewportSize()!.width;
    for (const box of xs) {
      expect(box.x, 'ボタンが画面の左外に出ていないこと').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'ボタンが画面の右外に出ていないこと').toBeLessThanOrEqual(width);
    }

    // ── ④ 「貼り付けで置き換える」は全端末で既定OFF（259で258の端末別既定を取り下げ）──
    const stored = await page.evaluate(() => localStorage.getItem('lumina_paste_replace'));
    expect(stored, '保存値が無い状態で検証していること').toBeNull();

    // ── ⑤ クリップボードを読めないとき（実機で「許可しない」を選んだ場合に相当）──
    // WebKit は clipboard-read の権限付与に対応していないため、この文脈の readText() は
    // 必ず失敗する＝**拒否された経路をそのまま検証できる**。
    // 大事なのは「黙って終わらない」「本文を壊さない」こと（R-59）
    const OLD = `[E2E] ${RUN_ID} 前からあった本文`;
    await textarea.fill(OLD);
    await pasteButton.click();
    await expect(
      page.getByText('クリップボードを読めませんでした').first(),
      '読めなかったことを知らせ、代わりの操作を案内すること',
    ).toBeVisible({ timeout: 10000 });
    await expect(textarea, '読めなくても本文は無傷であること').toHaveValue(OLD);

    // ── ⑤-2【270の最重要】「📋 クリアして貼付」でも本文が消えないこと ──
    // 実機で確認ポップアップを「キャンセル」したときと同じ経路（readText が失敗する）。
    // 254は**ここでクリアまで実行していた**ので、長文を書いた後にキャンセルすると全部消えた
    await clearPaste.click();
    await expect(
      page.getByText('クリップボードを読み取れませんでした').first(),
      '読めなかったことを知らせること（黙って終わらせない）',
    ).toBeVisible({ timeout: 10000 });
    await expect(textarea, 'キャンセル相当でも本文が消えないこと').toHaveValue(OLD);
    await expect(
      page.getByRole('button', { name: '↩ 元に戻す' }),
      '何も消していないのでUndoは出ないこと',
    ).toHaveCount(0);

    // ── ⑥ クリアはUndoで戻せる（消しても取り返しがつく）──
    await page.getByRole('button', { name: /✕ クリア/ }).click();
    await expect(textarea, 'クリアで空になること').toHaveValue('');
    const undo = page.getByRole('button', { name: '↩ 元に戻す' });
    await expect(undo, 'クリア直後はUndoが出ること').toBeVisible();
    await undo.click();
    await expect(textarea, 'Undoで元の本文に戻ること').toHaveValue(OLD);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

// 260: 「📋 ペースト」が実際に貼り付けるところの検証。
// WebKit は clipboard-read の権限付与に対応していない（Playwrightの制約）ため、
// **貼り付けが成功する側**はタッチ端末として扱った Chromium で確かめる。
// 端末の出し分けは C52（WebKit）で押さえてあるので、ここは貼り付けの中身だけを見る。
test('C54: タッチ端末で「✕ クリア」→「📋 ペースト」の2操作で置き換わる（259/260）', async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    storageState: STORAGE_STATE,
    baseURL: BASE_URL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  // 実機で確認に「許可」を押した後に相当する状態
  // （確認そのものはOSが描くUIで、ヘッドレスからは操作も観測もできない）
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  const page = await ctx.newPage();
  try {
    await stubFeatureDrafts(page);
    await page.goto('/dashboard/text-analysis');
    const textarea = page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...');
    await expect(textarea).toBeVisible({ timeout: 30000 });
    const pasteButton = page.locator('[data-paste-button]');
    await expect(pasteButton, 'タッチ端末では📋 ペーストが出ること').toBeVisible({ timeout: 30000 });

    const OLD = `[E2E] ${RUN_ID} 前からあった本文`;
    const CLIP = `[E2E] ${RUN_ID} 貼り付ける内容`;
    await page.evaluate((t) => navigator.clipboard.writeText(t), CLIP);

    // ── ① 「📋 ペースト」は**入れるだけ**（消さない）＝カーソル位置に足される ──
    await textarea.fill(OLD);
    await textarea.click();
    await page.keyboard.press('End');
    await pasteButton.click();
    await expect(textarea, '貼り付けは追記であること（黙って消さない）').toHaveValue(`${OLD}${CLIP}`);

    // ── ② 「✕ クリア」→「📋 ペースト」の2操作で置き換えが完了する（259/260の主目的）──
    await page.getByRole('button', { name: /✕ クリア/ }).click();
    await expect(textarea, 'クリアで空になること').toHaveValue('');
    await pasteButton.click();
    await expect(textarea, '2操作で置き換わること').toHaveValue(CLIP);
  } finally {
    await ctx.close();
  }
});

// 270: デスクトップの📝テキスト分析も3ボタンにする（iOSと操作を揃える＝環境で出し分けない）。
// 🔭ディープリサーチは対象外＝従来どおり（デスクトップに📋ペーストを出さない）。
test('C53: デスクトップ — テキスト分析は3ボタン、DRは従来どおり2ボタン（259/270）', async ({ page }) => {
  await stubFeatureDrafts(page);
  await page.goto('/dashboard/text-analysis');
  await waitForRunReady(page);

  await expect(
    page.locator('[data-long-press-paste]'),
    '260で撤去した編集可能な貼り付け欄が復活していないこと',
  ).toHaveCount(0);
  await expect(
    page.locator('[data-paste-button]').filter({ visible: true }).first(),
    '270: デスクトップにも「📋 ペースト」を出すこと（iOSと同じ3ボタン）',
  ).toBeVisible();
  await expect(
    page.locator('[data-clear-paste]').filter({ visible: true }).first(),
    'デスクトップでは「📋 クリアして貼付」が従来どおり出ること',
  ).toBeVisible();

  // ディープリサーチ側は270の対象外＝259/260のまま（デスクトップに📋ペーストは出さない）
  await page.goto('/dashboard/deepresearch');
  await expect(page.locator('[data-clear-paste]').first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('[data-long-press-paste]')).toHaveCount(0);
  await expect(
    page.locator('[data-paste-button]'),
    'DRは2ボタンのまま（本便の対象はテキスト分析だけ）',
  ).toHaveCount(0);
});

// ============================================================================
// 270: 📝テキスト分析の3ボタン（デスクトップ側の並び順・ラベル・クリア動作・設定の非表示）
// ※ 実際に貼り付くか／iOSの確認をキャンセルしたときの挙動は C52（WebKit）と実機確認で見る
// ============================================================================

test('C67: テキスト分析の3ボタン — 順序・ラベル・⌘⌫クリア・「貼り付けで置き換える」を出さない（270）', async ({
  page,
}) => {
  await stubFeatureDrafts(page);
  await page.goto('/dashboard/text-analysis');
  await page.evaluate(() => localStorage.setItem('lumina_auto_stock_save', '0'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForRunReady(page);

  const textarea = page.getByPlaceholder('ここに分析したいテキストを貼り付けてください...');
  const clearBtn = page.getByRole('button', { name: /✕ クリア/ }).filter({ visible: true }).first();
  const pasteBtn = page.locator('[data-paste-button]').filter({ visible: true }).first();
  const clearPasteBtn = page.locator('[data-clear-paste]').filter({ visible: true }).first();

  // ── ① 3つとも出ていて、ラベルが指示書§3-1の表どおり ──
  await expect(clearBtn).toBeVisible();
  await expect(pasteBtn).toBeVisible();
  await expect(clearPasteBtn).toBeVisible();
  await expect(pasteBtn).toHaveText(/^📋 ペースト$/);
  await expect(clearPasteBtn).toHaveText(/^📋 クリアして貼付/);

  // ── ② 並び順は ✕クリア → 📋ペースト → 📋クリアして貼付 ──
  const boxes = await Promise.all([clearBtn, pasteBtn, clearPasteBtn].map((b) => b.boundingBox()));
  const orderKey = (b: { x: number; y: number }) => b.y * 10000 + b.x;
  expect(orderKey(boxes[0]!), '✕ クリアが先頭').toBeLessThan(orderKey(boxes[1]!));
  expect(orderKey(boxes[1]!), '📋 ペーストが2番目').toBeLessThan(orderKey(boxes[2]!));

  // ── ③ キー併記（デスクトップのみ）が実装と一致する ──
  await expect(clearBtn, 'クリアに⌘⌫が併記されること').toHaveText(/(⌘⌫|Ctrl\+⌫)/);
  await expect(clearPasteBtn, 'クリアして貼付に⌘⇧Vが併記されること').toHaveText(/(⌘⇧V|Ctrl\+⇧V)/);

  // ── ④ ⌘⌫ でクリアでき、Undoで戻せる（248/247の退行防止）──
  const OLD = `[E2E] ${KB_TOKEN} 3ボタンのクリア検証`;
  await textarea.fill(OLD);
  await textarea.click();
  await page.keyboard.press('ControlOrMeta+Backspace');
  await expect(textarea, '⌘⌫ で入力が消えること').toHaveValue('');
  const undo = page.getByRole('button', { name: '↩ 元に戻す' });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(textarea, 'Undoで戻ること').toHaveValue(OLD);

  // ── ⑤ 3ボタンの画面には「貼り付けで置き換える」設定を出さない（機能が重複するため）──
  await expect(
    page.getByText('貼り付けで置き換える'),
    'テキスト分析にこの設定を出さないこと',
  ).toHaveCount(0);
  await expect(
    page.getByText('貼り付けたら前の内容を置き換える'),
    'テキスト分析にこの設定のトグルを出さないこと',
  ).toHaveCount(0);
  const mentions = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[title]')].filter((el) =>
      (el.getAttribute('title') ?? '').includes('貼り付けで置き換える'),
    ).length,
  );
  expect(mentions, 'ツールチップからも設定への案内を消していること').toBe(0);

  // ── ⑥ 設定値そのものは消していない（🔭ディープリサーチでは引き続き使う）──
  await page.goto('/dashboard/display-settings');
  await expect(
    page.locator('[data-paste-replace-toggle]'),
    '設定は表示設定に残っていること（値も削除しない）',
  ).toBeVisible();
});

test('C55: 発信ハブ（261a）— 画面到達・ペルソナ選択の前提・導線・API契約', async ({ page }) => {
  // 261aで新設した🚀発信ハブのスモーク。AI呼び出しに到達しない検証のみ（課金なし）。
  await stubFeatureDrafts(page); // R-12: 前回結果の復元でペルソナ選択が埋まると「押せない」前提が崩れる

  // 1) 画面が開き、ペルソナカード（既定6種＋Claude推奨3種の代表）が並ぶ
  await page.goto('/dashboard/dr-hub');
  await expect(page.getByRole('heading', { name: '発信ハブ' })).toBeVisible();
  await expect(page.getByText('専門家向け')).toBeVisible();
  await expect(page.getByText('子育て中のママ向け')).toBeVisible();

  // 2) サンプル生成はDR記事＋2〜4ペルソナを選ぶまで押せない（前提が崩れた実行を作らない）
  const genBtn = page.getByRole('button', { name: /サンプルを生成して読み比べる/ });
  await expect(genBtn).toBeDisabled();

  // 3) R-34: 📚リサーチ保存に常時表示の導線がある（DR画面側の導線はレポート表示後にのみ出るためこちらで固定）。
  //    サイドバーにも同名リンク（data-nav-href付き）があるため、ページ内の導線だけに絞って判定する
  await page.goto('/dashboard/library');
  const toHub = page.locator('a[href="/dashboard/dr-hub"]:not([data-nav-href])');
  await expect(toHub).toBeVisible();
  await expect(toHub).toContainText('発信ハブ');

  // 4) API契約: 未認証401（R-31）→ drId欠落400 → 存在しないIDは404（owner検証）
  const anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
  const unauth = await anon.post('/api/dr-hub/persona', { data: { drId: 'x' } });
  expect(unauth.status()).toBe(401);
  await anon.dispose();

  const noId = await api.post('/api/dr-hub/persona', { data: {} });
  expect(noId.status()).toBe(400);

  const notFound = await api.post('/api/dr-hub/persona', {
    data: { drId: '00000000-0000-0000-0000-000000000000', mode: 'samples', personaKeys: ['expert', 'teen'] },
  });
  expect(notFound.status()).toBe(404);
});

test('C56: 発信ハブ ②分割記事化（261b）— タブ切替・前提・API契約', async ({ page }) => {
  // 261bで追加した🧩分割記事化のスモーク。AI呼び出しに到達しない検証のみ（課金なし）。
  await stubFeatureDrafts(page); // R-12: 前回結果の復元でプランが埋まると前提が崩れる

  // 1) タブが並び、切り替えると②の設定UIが出る
  await page.goto('/dashboard/dr-hub');
  const splitTab = page.getByRole('button', { name: /分割記事化/ });
  await expect(splitTab).toBeVisible();
  await splitTab.click();
  // ※ <option> はPlaywright上hidden扱いになるため、セクション見出しで判定する
  await expect(page.getByText('分割記事化（DR記事1本 → note記事シリーズ）')).toBeVisible();

  // 2) プラン提案はDR記事を選ぶまで押せない
  const planBtn = page.getByRole('button', { name: /分割プランを提案してもらう/ });
  await expect(planBtn).toBeDisabled();

  // 3) API契約: 未認証401（R-31）→ drId欠落400 → 存在しないIDは404（owner検証）
  const anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
  const unauth = await anon.post('/api/dr-hub/split', { data: { drId: 'x' } });
  expect(unauth.status()).toBe(401);
  await anon.dispose();

  const noId = await api.post('/api/dr-hub/split', { data: {} });
  expect(noId.status()).toBe(400);

  const notFound = await api.post('/api/dr-hub/split', {
    data: { drId: '00000000-0000-0000-0000-000000000000', mode: 'plan', count: 3 },
  });
  expect(notFound.status()).toBe(404);
});

test('C57: 発信ハブ ③X投稿連動（261c）— タブ・前提・生成/保存APIの契約', async ({ page }) => {
  // 261cで追加した🐦X投稿連動のスモーク。AI呼び出しに到達しない検証のみ（課金なし）。
  await stubFeatureDrafts(page); // R-12: 前回結果の復元で生成結果が埋まると前提が崩れる

  // 1) タブ切替で③の設定UIが出て、自動投稿しない方針が明記されている
  await page.goto('/dashboard/dr-hub');
  const xTab = page.getByRole('button', { name: /X投稿連動/ });
  await expect(xTab).toBeVisible();
  await xTab.click();
  await expect(page.getByText('Xへの自動投稿は行いません')).toBeVisible();

  // 2) 生成は連動元の記事を選ぶまで押せない
  const genBtn = page.getByRole('button', { name: /X投稿を生成する/ });
  await expect(genBtn).toBeDisabled();

  // 3) 生成API契約: 未認証401 → 記事なし400 → 存在しないarticleIdは404（owner検証）
  const anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
  const unauth = await anon.post('/api/dr-hub/x-post', { data: {} });
  expect(unauth.status()).toBe(401);
  const unauthSave = await anon.post('/api/dr-hub/x-post/save', { data: { content: 'x' } });
  expect(unauthSave.status()).toBe(401);
  await anon.dispose();

  const noSource = await api.post('/api/dr-hub/x-post', { data: { threadCount: 3 } });
  expect(noSource.status()).toBe(400);

  const notFound = await api.post('/api/dr-hub/x-post', {
    data: { articleId: '00000000-0000-0000-0000-000000000000', threadCount: 3 },
  });
  expect(notFound.status()).toBe(404);

  // 4) 保存API契約: content欠落は400／存在しない連動元記事は404（誤った紐づけを作らない）
  const saveNoContent = await api.post('/api/dr-hub/x-post/save', { data: {} });
  expect(saveNoContent.status()).toBe(400);
  const saveBadArticle = await api.post('/api/dr-hub/x-post/save', {
    data: { content: '[E2E] 契約検証用（保存されない）', articleId: '00000000-0000-0000-0000-000000000000' },
  });
  expect(saveBadArticle.status()).toBe(404);
});

test('C58: 発信ハブ ④発信戦略＋⑥Kindle導線（261e）— タブ・前提・API契約', async ({ page }) => {
  // 261eで追加した📈発信戦略と📕Kindle handoffのスモーク。AI呼び出しに到達しない検証のみ（課金なし）。
  await stubFeatureDrafts(page); // R-12: 前回結果の復元で戦略ドキュメントが埋まると前提が崩れる

  await page.goto('/dashboard/dr-hub');

  // 1) ⑥ Kindle導線はDR記事を選ぶまで押せない（存在と前提の両方を固定）
  const kindleBtn = page.getByRole('button', { name: /Kindle本づくりへ/ });
  await expect(kindleBtn).toBeVisible();
  await expect(kindleBtn).toBeDisabled();

  // 2) ④ タブ切替で戦略の設定UIが出て、「提案であり成果を保証しない」方針が明記されている
  await page.getByRole('button', { name: /発信戦略/ }).click();
  await expect(page.getByText('発信戦略の策定（AIの提案）')).toBeVisible();
  await expect(page.getByText('成果を保証するものではありません')).toBeVisible();

  // 3) 策定はDR記事を1件以上選ぶまで押せない
  const genBtn = page.getByRole('button', { name: /発信戦略を策定してもらう/ });
  await expect(genBtn).toBeDisabled();

  // 4) API契約: 未認証401 → drIds欠落400 → 存在しないIDは404（owner検証）
  const anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
  const unauth = await anon.post('/api/dr-hub/strategy', { data: { drIds: ['x'] } });
  expect(unauth.status()).toBe(401);
  await anon.dispose();

  const noIds = await api.post('/api/dr-hub/strategy', { data: {} });
  expect(noIds.status()).toBe(400);

  const notFound = await api.post('/api/dr-hub/strategy', {
    data: { drIds: ['00000000-0000-0000-0000-000000000000'] },
  });
  expect(notFound.status()).toBe(404);
});

test('C59: 🎛メニュー名設定の並びがサイドバーの実表示と一致する（262）', async ({ page }) => {
  // 262: 設定UIが定義順で表示していて、ホームのカスタマイズ（並び替え・追加・削除）と
  // 食い違っていた。「設定画面を上から見ていけばサイドバーと同じ景色」を機械判定で固定する。
  const order = ['/dashboard/deepresearch', '/dashboard', '/dashboard/text-analysis'];
  await page.addInitScript((o) => {
    localStorage.setItem('sidebar_home_items', JSON.stringify(o));
  }, order);
  await page.goto('/dashboard/display-settings');

  // 1) サイドバーのホーム（先頭N件のリンク）が注入した並びで出ている
  const sidebarHrefs = await page
    .locator('a[data-nav-href]')
    .evaluateAll((els) =>
      els.filter((el) => (el as HTMLElement).checkVisibility()).map((el) => el.getAttribute('data-nav-href')),
    );
  expect(sidebarHrefs.slice(0, order.length), 'サイドバー側の実並び').toEqual(order);

  // 2) 設定画面のホームカテゴリを開くと、同じ並びで行が出る（＝ラベル配列が同一）
  await page.locator('[data-nav-category-toggle="ホーム"]').click();
  const block = page.locator('[data-nav-category-block="ホーム"]');
  const rows = await block
    .locator('[data-nav-row]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-nav-row')));
  expect(rows.slice(0, order.length), '設定画面の並びがサイドバーと一致').toEqual(order);

  // 3) 非表示中（ホームから外した定義上の項目）は末尾にまとまり、実並びと混ざらない
  const hidden = await block
    .locator('[data-nav-hidden-row]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-nav-hidden-row')));
  expect(hidden.length, '既定ホーム6件のうち残していない5件が非表示中').toBe(5);
  expect(hidden).toContain('/dashboard/orchestrator');
  expect(rows, '行の順序 = 表示中の実並び → 非表示中').toEqual([...order, ...hidden]);
  await expect(block.locator('[data-nav-hidden-separator]')).toBeVisible();

  // 4) 非表示中の項目もリネームはできる（入力欄が出る＝251の機能を失っていない）
  await expect(block.locator('[data-nav-label-input="/dashboard/orchestrator"]')).toBeVisible();
});

test('C60: バッチリサーチ（263）— 新規トピックの既定5000字・自動保存フラグがジョブに載る', async ({ page }) => {
  // 263【2】【3】のスモーク。AIは呼ばず、ジョブの登録→フラグ確認→削除の自己完結型（R-55）。
  await stubFeatureDrafts(page); // R-12: 下書き復元で画面状態が変わる前提を固定

  // 1) バッチタブの新規トピック行の既定が「🔭 ディープ(5000字)」
  await page.goto('/dashboard/deepresearch');
  await page.getByRole('button', { name: '⚡ バッチリサーチ' }).click();
  await expect(page.locator('[data-batch-mode="0"]')).toHaveValue('deep');
  // 行を追加しても既定は5000字（既存行は変えず、新規行の既定だけ）
  await page.getByRole('button', { name: /トピックを追加/ }).click();
  await expect(page.locator('[data-batch-mode="1"]')).toHaveValue('deep');

  // 2) ジョブ登録API: autoSave の値が auto_save_library としてジョブに確定する
  //    scheduleType='browser'＋実行時刻なし＝絶対に走らない（AI課金なし）。検証後に削除
  const mk = async (autoSave: boolean | undefined) => {
    const res = await api.post('/api/batch-research', {
      data: {
        groupName: `[E2E] ${RUN_ID} 263自動保存フラグ検証`,
        topics: [{ topic: '[E2E] 検証用（実行されない）', mode: 'deep' }],
        scheduleType: 'browser',
        ...(autoSave === undefined ? {} : { autoSave }),
      },
    });
    expect(res.status()).toBe(200);
    return (await res.json()).job;
  };
  const jobOn = await mk(undefined); // 省略＝既定on
  const jobOff = await mk(false); // 🎛でoffにした状態
  try {
    expect(jobOn.auto_save_library, '省略時は既定で自動保存on').toBe(true);
    expect(jobOff.auto_save_library, 'off指定がジョブに確定する').toBe(false);
  } finally {
    for (const j of [jobOn, jobOff]) {
      const del = await api.delete(`/api/batch-research?id=${j.id}`);
      expect(del.status()).toBe(200);
    }
  }
});

test('C61: ペルソナ別note記事の体裁（264）— タイトル分離・整形表示・2種コピー（APIモック）', async ({
  page,
  context,
}) => {
  // 264のUI経路をAPIモックで固定（AI課金なし）。AI出力の実構造は @gen B16 側で検証する。
  await stubFeatureDrafts(page); // R-12
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });

  const BODY_MD = `リード文です。段落の間に空行があります。

## 保湿の基本を見直す

**大切なのは順番**です。

## まとめ

- 今日からできること`;

  await page.route('**/api/library?type=deepresearch', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'e2e-dr-1', title: '[E2E] モックDR記事', content: 'モック本文', created_at: '2026-08-25' },
      ]),
    }),
  );
  await page.route('**/api/dr-hub/persona', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string };
    const payload =
      body.mode === 'samples'
        ? {
            success: true,
            samples: {
              expert: '## 専門家向けの視点\n\n**機序**から説明します。E2EMARKER_EXPERT',
              teen: 'むずかしい言葉を使わずに説明します。E2EMARKER_TEEN',
            },
          }
        : {
            success: true,
            content: BODY_MD,
            titles: ['タイトル案その1', 'タイトル案その2', 'タイトル案その3'],
            ad_check: { status: 'ok', findings: [] },
            personaKey: 'expert',
            personaLabel: '専門家向け',
          };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  await page.goto('/dashboard/dr-hub');
  await page.getByText('[E2E] モックDR記事').click();
  await page.getByText('専門家向け', { exact: false }).first().click();
  await page.getByText('中学生でも分かる').click();
  await page.getByRole('button', { name: /サンプルを生成して読み比べる/ }).click();

  // 1) サンプルカードは整形表示＝生の ## / ** が露出しない
  await expect(page.getByText('E2EMARKER_EXPERT')).toBeVisible();
  const sampleHtml = await page.locator('.markdown-body').first().innerText();
  expect(sampleHtml, 'サンプルに生の##が出ない').not.toContain('##');
  expect(sampleHtml, 'サンプルに生の**が出ない').not.toContain('**');

  // 2) 全文生成 → タイトル案が本文と分離して出て、1本ずつコピーできる
  await page.getByRole('button', { name: 'このペルソナで記事全文を生成' }).first().click();
  const titlesBox = page.locator('[data-title-suggestions]');
  await expect(titlesBox).toBeVisible();
  await expect(titlesBox.getByText('タイトル案その1')).toBeVisible();
  await titlesBox.getByRole('button', { name: /コピー/ }).first().click();
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('タイトル案その1');

  // 3) 本文は整形表示（見出しタグが2本以上・生の記法が出ない）
  //    ※ renderMarkdown は ## を <h3> に割り当てる（# → h2 の1段ずらし）ためタグ幅で数える
  const articleBody = page.locator('.markdown-body').last();
  await expect(articleBody.getByText('リード文です。', { exact: false })).toBeVisible();
  const headingCount = await articleBody.locator('h2, h3, h4').count();
  expect(headingCount, '大見出しがレンダリングされている').toBeGreaterThanOrEqual(2);
  const bodyText = await articleBody.innerText();
  expect(bodyText).not.toContain('##');
  expect(bodyText).not.toContain('**');

  // 4) 2種コピー: note用＝text/htmlを含むリッチ形式／Markdown＝生MD
  //    書き込みは非同期＝「✅ コピー済み」表示を待ってから読む（クリック直後に読むと前の内容が返る）
  await page.locator('[data-copy-note]').click();
  await expect(page.locator('[data-copy-note]')).toHaveText(/コピー済み/);
  const richHtml = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      if (it.types.includes('text/html')) return await (await it.getType('text/html')).text();
    }
    return '';
  });
  // 266【1】: noteはh2=大見出し。note用コピーは見出しが1段繰り上がり、大見出し(h2)が2本以上立つこと
  expect((richHtml.match(/<h2\b/g) ?? []).length, 'note用コピーは大見出し(h2)が2本以上').toBeGreaterThanOrEqual(2);
  expect(richHtml, '繰り上げ後もh1は作らない').not.toMatch(/<h1\b/);

  await page.locator('[data-copy-md]').click();
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('## 保湿の基本を見直す');
});

test('C62: X投稿連動のv2対応（265c）— 既定ミニ講義・警告表示・URLは2通目・媒体別時間帯（APIモック）', async ({
  page,
}) => {
  // 265cのUI経路をAPIモックで固定（AI課金なし）。実AIの出力（1,000字以上等）は @gen B17 側で検証。
  await stubFeatureDrafts(page); // R-12

  await page.route('**/api/library?type=note-article', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'e2e-note-1', title: '[E2E] モックnote記事', content: '本文', created_at: '2026-08-26' }]),
    }),
  );
  await page.route('**/api/library?type=deepresearch', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/dr-hub/x-post', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        single: '本文ポストです。URLは入っていません。\n\n・要点1\n・要点2',
        thread: ['1本目フック https://bad.example.com', '2本目です'],
        urlReplyLeadin: '本文で触れた記事の全文はこちらです',
        warnings: {
          single: [],
          'thread-0': [{ code: 'url-in-body', message: '本文にURLが入っています。露出低下を避けるため、URLは1つ目のリプライへ移してください' }],
          'thread-1': [],
        },
        xLength: 'mini',
        charLimit: 25000,
      }),
    }),
  );

  await page.goto('/dashboard/dr-hub');
  await page.getByRole('button', { name: /X投稿連動/ }).click();

  // 1) v2既定: 長さ=ミニ講義（1,000〜2,000字）・型=ノウハウ体系化型
  await expect(page.locator('[data-x-length]')).toHaveValue('mini');
  await expect(page.locator('[data-x-type]')).toHaveValue('knowhow');

  // 2) 生成 → 結果表示
  await page.locator('select').filter({ hasText: '連動元のnote記事を選ぶ' }).selectOption('e2e-note-1');
  await page.getByRole('button', { name: /X投稿を生成する/ }).click();

  // 3) 媒体別の投稿時間帯が両方（noteとXでズレて）表示される（§5-2）
  const times = page.locator('[data-posting-times]');
  await expect(times).toBeVisible();
  await expect(times).toContainText('20:00〜22:30');
  await expect(times).toContainText('18:00〜21:00');

  // 4) URLは2通目（リプライ）カードに分離される（X-03/C-02）
  const urlReply = page.locator('[data-url-reply]');
  await expect(urlReply).toBeVisible();
  await expect(urlReply).toContainText('1つ目のリプライ');

  // 5) 機械検証の警告が該当ポストにだけ出る（自動修正しない＝R-26）
  await expect(page.locator('[data-x-warnings="thread-0"]')).toBeVisible();
  await expect(page.locator('[data-x-warnings="thread-0"]')).toContainText('URLは1つ目のリプライへ');
  await expect(page.locator('[data-x-warnings="single"]')).toHaveCount(0);
});

test('C63: 予約投稿カレンダー（266【3】NP-02）— 平日割り当て・note夜帯の提示・行ごとの時間帯変更', async ({ page }) => {
  // AI不使用の純ロジック画面。一覧APIだけモックして表の導出を検証する。
  await stubFeatureDrafts(page); // R-12
  await page.route('**/api/library?type=note-article', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'e2e-n1', title: '[E2E] 記事A', content: 'a', created_at: '2026-08-26' },
        { id: 'e2e-n2', title: '[E2E] 記事B', content: 'b', created_at: '2026-08-26' },
      ]),
    }),
  );
  await page.route('**/api/library?type=deepresearch', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );

  await page.goto('/dashboard/dr-hub');
  await page.getByRole('button', { name: /予約投稿カレンダー/ }).click();

  // 自動投稿しない方針の明記
  await expect(page.getByText('自動投稿・note連携はしません')).toBeVisible();

  // 記事2本を選び、開始日を金曜(2026-09-04)に設定 → 金→月の平日連続で割り当たる
  await page.getByText('[E2E] 記事A').click();
  await page.getByText('[E2E] 記事B').click();
  await page.locator('[data-sched-start]').fill('2026-09-04');

  const table = page.locator('[data-schedule-table]');
  await expect(table).toBeVisible();
  await expect(table).toContainText('2026-09-04');
  await expect(table).toContainText('2026-09-07'); // 土日を飛ばして月曜
  // 既定は夜20:30（NP-02）で、note夜帯（20:00〜22:30）とX夜帯のズレが明記される（R-70）
  await expect(table.locator('tbody select').first()).toHaveValue('night');
  await expect(table).toContainText('20:00〜22:30');
  await expect(table).toContainText('18:00〜21:00');
  // 夜公開のX告知は翌朝
  await expect(table).toContainText('翌朝 7:00〜8:30');

  // 行ごとの時間帯変更: 1行目を朝に → X告知が当日の夜帯に変わる
  await table.locator('tbody select').first().selectOption('morning');
  await expect(table.locator('tbody tr').first()).toContainText('当日 18:00〜21:00');

  // 表のコピー導線がある
  await expect(page.getByRole('button', { name: /表をコピー/ })).toBeVisible();
});

test('C64: まとめ画像のタイトル折り返し（267§3）— 3形式とも長いタイトルでキャンバスが追随する', async () => {
  // satori描画のみ＝AI課金なし。院長実地確認の実例（31字タイトル）で、キャンバス高さが
  // タイトルの折り返し分だけ伸びることを本番APIで判定する（伸びない＝2行目が切れる旧挙動）。
  const groups = [
    { points: ['要点1の本文です', '要点2の本文です', '要点3の本文です', '要点4の本文です', '要点5の本文です', '要点6の本文です', '要点7の本文です', '要点8の本文です'] },
  ];
  const LONG_TITLE = '【肌と細胞の科学】肌荒れと関係するミトコンドリアの秘密｜まとめ';

  for (const template of ['card', 'table', 'poster'] as const) {
    const render = async (title: string) => {
      const res = await api.post('/api/note-enhance/summary-image', {
        data: { title, groups, template },
      });
      expect(res.status(), `${template} が描画できること`).toBe(200);
      const json = await res.json();
      expect(String(json.imageBase64 ?? '').length).toBeGreaterThan(1000);
      return Number(json.height);
    };
    const hShort = await render('短いタイトル');
    const hLong = await render(LONG_TITLE);
    const expected = template === 'poster' ? 62 : 56;
    expect(hLong - hShort, `${template}: 2行タイトルでキャンバスが+${expected}px`).toBe(expected);
  }
});

test('C65: 収益化ロードマップ（268）— 現在地の決定的表示・フェーズ3の警告・断定なしの注意書き', async ({ page }) => {
  // フェーズ判定・タスク導出はAI不使用＝一覧APIとドラフトをモックするだけで全経路を検証できる。
  await stubFeatureDrafts(page); // R-12: 保存済みの手入力値の復元を固定（未入力状態から始める）
  await page.route('**/api/library?type=note-article', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/library?type=deepresearch', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );

  await page.goto('/dashboard/dr-hub');
  await page.getByRole('button', { name: /収益化ロードマップ/ }).click();

  // 1) 記事0本・有料0本 → フェーズ0（現在地カードに根拠つき）
  const phaseCard = page.locator('[data-rm-phase]');
  await expect(phaseCard).toBeVisible();
  await expect(phaseCard).toHaveAttribute('data-rm-phase', '0');
  await expect(phaseCard).toContainText('土台づくり');
  await expect(phaseCard).toContainText('有料記事がまだない');

  // 2) 有料4本を入力 → フェーズ2に決定的に切り替わり、Kindle導線が出る
  await page.locator('[data-rm-input="paidArticleCount"]').fill('4');
  await expect(phaseCard).toHaveAttribute('data-rm-phase', '2');
  await expect(phaseCard).toContainText('マガジン化 ／ Kindle出版');
  await expect(page.locator('[data-rm-kindle]')).toBeVisible();
  await expect(page.getByRole('link', { name: /Kindleウィザードへ/ })).toHaveAttribute('href', '/dashboard/kindle-wizard');

  // 3) フェーズ2以下では警告なし → メンバーシップ開設済みでフェーズ3＋継続負荷の警告（§6-1）
  await expect(page.locator('[data-continuity-warning]')).toHaveCount(0);
  await page.locator('[data-rm-membership]').check();
  await expect(phaseCard).toHaveAttribute('data-rm-phase', '3');
  const warning = page.locator('[data-continuity-warning]');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('毎月の更新が必須');
  await expect(warning).toContainText('撤退手順');

  // 4) 成果を約束しない注意書きが常時表示される（§1-4）
  await expect(page.locator('[data-roadmap-disclaimer]')).toContainText('約束するものではありません');
});

test('C66: Kindle→note多軸展開（269）— 3軸の選択肢・警告表示・目視確認UI（APIモック）', async ({ page }) => {
  await stubFeatureDrafts(page); // R-12
  await page.route('**/api/library?type=deepresearch', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route('**/api/kindle', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ books: [] }) }),
  );
  await page.route('**/api/kindle/note-remix', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        content: 'リード文です。\n\n## なぜ起きるのか\n\n本文。\n\n## まとめ\n\n前章で述べた内容も参考に。',
        titles: ['タイトル案1', 'タイトル案2', 'タイトル案3'],
        ad_check: { status: 'ok', findings: [] },
        contextHits: [{ label: '前章への参照', matched: '前章', excerpt: 'まとめ 前章で述べた内容も参考に' }],
        overlapRatio: 0.12,
        overlapWarn: false,
        personaKey: 'homemaker',
        angleKey: 'mechanism',
        chapterTitle: '',
      }),
    }),
  );

  await page.goto('/dashboard/dr-hub');
  await page.getByRole('button', { name: /Kindle→note展開/ }).click();

  // 「生成は多く、公開は選抜」方針の明記・「全部公開」を推奨する文言が無い
  await expect(page.getByText('生成は多く、公開は選抜')).toBeVisible();
  await expect(page.getByText(/全部公開しましょう|すべて公開する/)).toHaveCount(0);

  // 軸2: 9ペルソナ／軸3: 7切り口がすべて選択肢に出る
  expect(await page.locator('[data-remix-persona] option').count()).toBe(9);
  expect(await page.locator('[data-remix-angle] option').count()).toBe(7);

  // 手動貼り付けで生成（モック）→ 候補カードが出る
  await page.getByRole('button', { name: /手動で章を貼り付け/ }).click();
  await page.locator('[data-remix-manual-title]').fill('[E2E] 保湿の章');
  await page.locator('[data-remix-manual-text]').fill('角層は水分を保つバリアの役割を持つ。入浴後は早めの保湿が基本。');
  await page.getByRole('button', { name: /この組み合わせで1本書き下ろす/ }).click();

  const card = page.locator('[data-remix-candidate]');
  await expect(card).toBeVisible();

  // §7: 書籍文脈の残存が警告としてハイライト表示される
  const warn = page.locator('[data-remix-warnings]');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('書籍文脈の残存');
  await expect(warn).toContainText('前章で述べた内容');

  // §4: 元の章と並べた目視確認UI（促し文言つき）。生成直後の候補は**自動で開く**＝促しが最初から見える
  await expect(page.getByRole('button', { name: /▲ 閉じる/ })).toBeVisible();
  await expect(page.locator('[data-fact-check-note]')).toContainText('事実関係が元の章と同一か');
  await expect(page.getByText('📕 元の章（素材）')).toBeVisible();
  await expect(page.getByText('📰 書き下ろした記事')).toBeVisible();

  // note用リッチコピー（266の専用ラッパー経路）ボタンがある
  await expect(page.getByRole('button', { name: /note用にコピー/ })).toBeVisible();
});

test('C68: バッチリサーチの文字数を一括変更（272）— 全行に効く・追加行にも継承・個別変更は残る・確認なし', async ({ page }) => {
  // 272のUIスモーク。AIは呼ばずジョブも作らないので課金・残骸なし（R-55の対象データを作らない）。
  await stubFeatureDrafts(page); // R-12: 下書き復元で画面状態が変わる前提を固定

  // 確認ダイアログを実装していないこと（§2-4）を機械判定するため、出たら記録して落とす
  let dialogMessage = '';
  page.on('dialog', async (d) => {
    dialogMessage = d.message();
    await d.dismiss();
  });

  await page.goto('/dashboard/deepresearch');
  await page.getByRole('button', { name: '⚡ バッチリサーチ' }).click();

  // 1) 初期状態は263の既定＝5000字（deep）のまま
  await expect(page.locator('[data-batch-mode="0"]')).toHaveValue('deep');
  await expect(page.locator('[data-batch-bulk-mode="deep"]')).toHaveAttribute('aria-pressed', 'true');

  // 3行にしてから、行ごとにばらばらの値を入れる
  const addBtn = page.getByRole('button', { name: /トピックを追加/ });
  await addBtn.click();
  await addBtn.click();
  await page.locator('[data-batch-mode="1"]').selectOption('quick');
  await page.locator('[data-batch-mode="2"]').selectOption('standard');

  // 2) 一括設定を押すと、空行も含む既存の全行が変わる
  await page.locator('[data-batch-bulk-mode="quick"]').click();
  for (const i of [0, 1, 2]) {
    await expect(page.locator(`[data-batch-mode="${i}"]`)).toHaveValue('quick');
  }

  // 3) その後に追加した行も同じ値で入る（＝既定値として保持されている）
  await addBtn.click();
  await expect(page.locator('[data-batch-mode="3"]')).toHaveValue('quick');

  // 4) 個別のドロップダウンは引き続き使え、次に一括設定を押すまで値を保つ
  await page.locator('[data-batch-mode="2"]').selectOption('deep');
  await expect(page.locator('[data-batch-mode="2"]')).toHaveValue('deep');
  await expect(page.locator('[data-batch-mode="0"]'), '個別変更は他行に波及しない').toHaveValue('quick');
  await addBtn.click(); // 追加しても既定は一括設定の値のまま
  await expect(page.locator('[data-batch-mode="4"]')).toHaveValue('quick');
  await expect(page.locator('[data-batch-mode="2"]'), '個別変更した行は保たれる').toHaveValue('deep');

  // 5) もう一度一括設定を押すと、個別変更した行も含めて揃う
  await page.locator('[data-batch-bulk-mode="standard"]').click();
  for (const i of [0, 1, 2, 3, 4]) {
    await expect(page.locator(`[data-batch-mode="${i}"]`)).toHaveValue('standard');
  }

  // 6) ここまで確認ダイアログが一度も出ていないこと（§2-4・非破壊なのでR-56は適用外）
  expect(dialogMessage, '文字数の一括変更で確認ダイアログを出さない').toBe('');

  // 7) プリセットは3つ＝ボタン並び（4つ以上ならドロップダウンに切り替わる実装）
  await expect(page.locator('[data-batch-bulk-mode]')).toHaveCount(3);
  await expect(page.locator('[data-batch-bulk-select]')).toHaveCount(0);

  // 8) 実行導線に退行がないこと（登録ボタンが押せる状態で残っている）
  await page.locator('[data-batch-topic="0"]').fill('[E2E] 表示確認のみ（実行しない）');
  await expect(page.getByRole('button', { name: '⚡ 今すぐ一括実行' })).toBeEnabled();
});

// ============================================================================
// 271: バッチリサーチ結果の横並び比較（最大3列・本文/要約・同期スクロール・sticky）
// - AIは呼ばず、ジョブ一覧と結果本文をモックして固定（課金なし・本番データを触らない）
// ============================================================================

const COMPARE_JOB_ID = 987654321; // 実在しないID（モック専用）

/** 271のモック: バッチジョブ履歴1件＋その結果4件（本文と263③の要約セクション付き） */
async function stubBatchCompare(page: import('@playwright/test').Page) {
  const topics = ['[E2E] 比較A', '[E2E] 比較B', '[E2E] 比較C', '[E2E] 比較D'];
  const body = (i: number) =>
    `## 見出し${i}\n\n${`本文${i}のダミー行です。`.repeat(60)}\n\n### 小見出し${i}\n\n${`さらに本文${i}が続きます。`.repeat(60)}`;
  const context = (i: number) =>
    `## 📋 要約（1000字以内）\n\n**要約${i}** のダミーです。\n\n---\n\n## 📚 詳細コンテキスト\n\n詳細${i}の本文。`;

  // クエリ付きURLはグロブだと曖昧になるため述語で判定する
  await page.route((url) => url.pathname === '/api/batch-research' && url.searchParams.get('limit') === '10', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jobs: [
          {
            id: COMPARE_JOB_ID,
            group_name: '[E2E] 271比較用（モック）',
            topics: topics.map((t) => ({ topic: t, mode: 'deep', status: 'completed' })),
            schedule_type: 'immediate',
            scheduled_at: null,
            status: 'completed',
            created_at: '2026-08-27T01:00:00.000Z',
          },
        ],
      }),
    }),
  );
  await page.route((url) => url.pathname === '/api/context-saves' && url.searchParams.get('tag') === `batch:${COMPARE_JOB_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        topics.map((t, i) => ({
          id: 900000 + i,
          topic: t,
          context_text: context(i),
          research_text: body(i),
          created_at: '2026-08-27T01:00:00.000Z',
        })),
      ),
    }),
  );
}

/** バッチタブを開いて履歴から比較パネルを開く */
async function openBatchCompare(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/deepresearch');
  await page.getByRole('button', { name: '⚡ バッチリサーチ' }).click();
  await page.locator(`[data-batch-compare-open="${COMPARE_JOB_ID}"]`).click();
  await expect(page.locator('[data-batch-compare]')).toBeVisible();
}

test('C69: バッチ結果の横並び比較（271）— 3列・4件目は選べない・本文既定・同期スクロール・sticky', async ({ page }) => {
  await stubFeatureDrafts(page);
  await stubBatchCompare(page);
  await page.setViewportSize({ width: 1600, height: 900 }); // 3列が出る幅（xl以上）
  // モードの保持を素の状態から確かめるため、保存済みの選択を消してから開く
  await page.goto('/dashboard/deepresearch');
  await page.evaluate(() => localStorage.removeItem('lumina_batch_compare_mode'));
  await openBatchCompare(page);

  // 1) 既定で3件が選ばれ、3列で出る（横スクロールを出さない＝grid）
  await expect(page.locator('[data-compare-col]')).toHaveCount(3);
  await expect(page.locator('[data-compare-cols="3"]')).toHaveCount(1);
  await expect(page.locator('[data-compare-count]')).toContainText('選択中: 3/3件');

  // 2) 4件目は選べない（上限3件・押しても増えない）
  const fourth = page.locator('[data-compare-pick="900003"]');
  await expect(fourth).toBeDisabled();
  await expect(page.locator('[data-compare-col]')).toHaveCount(3);

  // 3) 初回の既定は本文（要約ではない）
  await expect(page.locator('[data-compare-mode="research"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-compare-col="0"]')).toContainText('本文0のダミー行です。');

  // 4) 整形表示（R-45）— 生MD記法が出ず、見出しがタグになっている
  const col0 = page.locator('[data-compare-col="0"]');
  await expect(col0, 'Markdown記号がそのまま出ていないこと').not.toContainText('## 見出し0');
  expect(await col0.locator('h2, h3, h4').count(), '見出しがHTMLタグで描かれていること').toBeGreaterThan(0);

  // 5) 列ヘッダーがsticky固定（§3-2）
  const header0 = page.locator('[data-compare-header="0"]');
  expect(await header0.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
  // 本文を送ってもヘッダーは列の上端に残る
  await col0.evaluate((el) => { el.scrollTop = 800; });
  const colBox = await col0.boundingBox();
  const headBox = await header0.boundingBox();
  expect(colBox && headBox && headBox.y - colBox.y, 'スクロール後もヘッダーが列の上端に居ること').toBeLessThan(4);

  // 6) 同期スクロールが既定ONで、他の列も追随する（§3-1・割合ベース）
  await expect(page.locator('[data-compare-sync]')).toBeChecked();
  await col0.evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
  await expect
    .poll(async () => page.locator('[data-compare-col="1"]').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);

  // 7) OFFにできる（OFF後は他列が動かない）
  await page.locator('[data-compare-sync]').uncheck();
  await page.locator('[data-compare-col="1"]').evaluate((el) => { el.scrollTop = 0; });
  await col0.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(300);
  await col0.evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(300);
  expect(await page.locator('[data-compare-col="1"]').evaluate((el) => el.scrollTop), '同期OFFなら他列は動かない').toBe(0);

  // 8) 本文／要約の一括切り替え（全列が同時に変わる）
  await page.locator('[data-compare-mode="summary"]').click();
  for (const i of [0, 1, 2]) {
    await expect(page.locator(`[data-compare-col="${i}"]`)).toContainText(`要約${i}`);
  }
  await expect(page.locator('[data-compare-col="0"]')).not.toContainText('本文0のダミー行です。');

  // 9) 選んだモードは次回も保持される（§2-1）
  await openBatchCompare(page);
  await expect(page.locator('[data-compare-mode="summary"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-compare-col="0"]')).toContainText('要約0');

  // 10) 選択を外すと列も減る（個別に選び直せる）
  await page.locator('[data-compare-pick="900002"]').click();
  await expect(page.locator('[data-compare-col]')).toHaveCount(2);
  await expect(page.locator('[data-compare-cols="2"]')).toHaveCount(1);
});

test('C70: 横並び比較はタッチ端末では1列（271§4-2・既存の端末判定を再利用）', async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: STORAGE_STATE,
    baseURL: BASE_URL,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  try {
    await stubFeatureDrafts(page);
    await stubBatchCompare(page);
    await openBatchCompare(page);
    // 3件選ばれていても、カーソルの無い端末では1列だけ描く（横スクロールを出さない）
    await expect(page.locator('[data-compare-count]')).toContainText('選択中: 3/3件');
    await expect(page.locator('[data-compare-cols="1"]')).toHaveCount(1);
    // 横スクロールが出ていないこと（本文はカード内で折り返す）
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'ページに横スクロールが出ていないこと').toBeLessThanOrEqual(1);
  } finally {
    await ctx.close();
  }
});

// ============================================================================
// 273: ホバープレビューの既定をOFFへ
// - 初期状態（設定を一度も触っていない）では3画面とも出ない
// - 🎛でONにすれば従来どおり出る／明示的に設定した値は次に開いても保たれる
// - §3の調査で見つかった「文字サイズ（ルートのzoom）で座標がずれる」件も座標で判定する
// ============================================================================

test('C71: ホバープレビューの既定OFF（273）— 3画面で出ない・🎛でONに戻せる・明示値は保たれる', async ({ page }) => {
  const marker = `HOVEROFF${RUN_ID}`;
  const md = `## ${marker} の見出し\n\n**強調**した本文です。${'あ'.repeat(500)}`;
  const savedId = await (async () => {
    const res = await page.request.post(SAVES_API, {
      data: { title: `既定OFF検証 ${marker}`, content: md, category: SEED_FOLDER },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    return (j.save?.id ?? j.id) as number;
  })();
  const libId = await (async () => {
    const res = await page.request.post(LIBRARY_API, {
      data: { title: `[E2E] 既定OFF検証 ${marker}`, content: md, type: 'research', tags: '', group_name: '' },
    });
    expect(res.status()).toBe(200);
    return (await res.json()).id as string;
  })();
  const ctxId = await (async () => {
    const res = await page.request.post(CONTEXT_API, {
      data: { topic: `[E2E] 既定OFF検証 ${marker}`, contextText: md, tags: [] },
    });
    expect(res.status()).toBe(200);
    return (await res.json()).id as number;
  })();

  const preview = page.locator('[data-hover-preview]');
  /** 設定を「一度も触っていない状態」に戻す（既定の判定を素で確かめるため） */
  const resetSetting = async (url: string) => {
    await page.goto(url);
    await page.evaluate(() => localStorage.removeItem('lumina_hover_preview'));
    await page.reload({ waitUntil: 'domcontentloaded' });
  };

  try {
    // ── ① 初期状態では3画面とも出ない ──
    await resetSetting('/dashboard/saved');
    const savedCard = page.locator('[data-saved-panel="text-analysis"]').locator(`[data-analysis-card="${savedId}"]`);
    await expect(savedCard).toBeVisible({ timeout: 30000 });
    await savedCard.hover();
    await page.waitForTimeout(1200); // 表示遅延(280ms)より十分長く待つ
    await expect(preview, '🗂保存一覧: 既定では出ないこと').toHaveCount(0);

    await resetSetting('/dashboard/library');
    await page.locator('[data-library-search]').fill(marker);
    const libCard = page.locator(`[data-hover-card="${libId}"]`);
    await expect(libCard).toBeVisible({ timeout: 30000 });
    await libCard.hover();
    await page.waitForTimeout(1200);
    await expect(preview, '📚リサーチ保存: 既定では出ないこと').toHaveCount(0);

    await resetSetting('/dashboard/context-library');
    const ctxCard = page.locator(`[data-hover-card="${ctxId}"]`);
    await expect(ctxCard).toBeVisible({ timeout: 30000 });
    await ctxCard.hover();
    await page.waitForTimeout(1200);
    await expect(preview, '🧠AI参照素材: 既定では出ないこと').toHaveCount(0);

    // ── ② 🎛表示設定は「オフ」と表示され、ONに戻せる ──
    await page.goto('/dashboard/display-settings');
    await page.evaluate(() => localStorage.removeItem('lumina_hover_preview'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    const toggle = page.locator('[data-hover-preview-toggle] input[type="checkbox"]');
    await expect(toggle, '既定はオフであること').not.toBeChecked();
    await toggle.check();

    await page.goto('/dashboard/saved');
    const savedCard2 = page.locator('[data-saved-panel="text-analysis"]').locator(`[data-analysis-card="${savedId}"]`);
    await expect(async () => {
      await savedCard2.hover();
      await expect(preview, 'ONにしたら出ること').toBeVisible({ timeout: 2500 });
    }).toPass({ timeout: 20000 });

    // ── ③ 273§3: 文字サイズ（ルートのzoom）を上げても、カードの隣に出る ──
    await page.evaluate(() => localStorage.setItem('lumina_text_scale', '140'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    const savedCard3 = page.locator('[data-saved-panel="text-analysis"]').locator(`[data-analysis-card="${savedId}"]`);
    await expect(savedCard3).toBeVisible({ timeout: 30000 });
    await expect(async () => {
      await savedCard3.hover();
      await expect(preview).toBeVisible({ timeout: 2500 });
    }).toPass({ timeout: 20000 });
    await assertPreviewAdjacent(page, page.locator(`[data-hover-card="${savedId}"]`), '文字サイズ最大(zoom1.4)');
    await page.evaluate(() => localStorage.setItem('lumina_text_scale', '100'));

    // ── ④ 明示的に設定した値は、開き直しても保たれる（上書きしない） ──
    await page.goto('/dashboard/display-settings');
    await expect(page.locator('[data-hover-preview-toggle] input[type="checkbox"]'), 'ONにした値が保たれること').toBeChecked();
    await page.locator('[data-hover-preview-toggle] input[type="checkbox"]').uncheck();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-hover-preview-toggle] input[type="checkbox"]'), 'OFFにした値も保たれること').not.toBeChecked();
  } finally {
    await page.request.delete(`${SAVES_API}?id=${savedId}`);
    await page.request.delete(LIBRARY_API, { data: { ids: [libId] } });
    await page.request.delete(`${CONTEXT_API}?id=${ctxId}`);
  }
});

// ============================================================================
// 274: 🧠AI参照素材のカードをクリックで本文展開
// - 展開領域はタイトル・生成元・日付/文字数/タグに限定（ボタンでは展開が走らない）
// - 「▼全文表示」は残す／複数同時に開ける／キーボードでも開ける
// ============================================================================

test('C72: カードのクリックで本文を展開（274）— 領域限定・ボタンで走らない・複数同時・キーボード', async ({ page }) => {
  const marker = `CLICKOPEN${RUN_ID}`;
  const mk = async (suffix: string) => {
    const res = await page.request.post(CONTEXT_API, {
      data: { topic: `[E2E] クリック展開 ${suffix} ${marker}`, contextText: `## ${marker}${suffix}\n\n本文${suffix}です。${'あ'.repeat(200)}`, tags: [] },
    });
    expect(res.status()).toBe(200);
    return (await res.json()).id as number;
  };
  const idB = await mk('B'); // 先に作った方が一覧では下（created_at DESC）
  const idA = await mk('A');

  const zone = (id: number) => page.locator(`[data-ctx-expand-zone="${id}"]`);
  const body = (id: number) => page.locator(`[data-ctx-expanded-body="${id}"]`);
  const card = (id: number) => page.locator(`[data-bundle-key="ctx-${id}"]`);

  try {
    await page.goto('/dashboard/context-library');
    await page.evaluate(() => localStorage.removeItem('lumina_hover_preview')); // 273の既定OFFで始める
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(zone(idA)).toBeVisible({ timeout: 30000 });

    // 1) タイトルのクリックで開く（既定は閉じている）
    await expect(body(idA)).toHaveCount(0);
    await zone(idA).getByText(`[E2E] クリック展開 A ${marker}`).click();
    await expect(body(idA), 'タイトルのクリックで本文が開くこと').toBeVisible();
    await expect(zone(idA)).toHaveAttribute('aria-expanded', 'true');

    // 2) 展開後の本文をクリックしても閉じない（コピーのための選択を妨げない）
    await body(idA).click();
    await expect(body(idA), '本文のクリックで閉じないこと').toBeVisible();

    // 3) メタ情報行（日付・文字数）のクリックでも切り替わる
    await zone(idA).getByText(/📅/).first().click();
    await expect(body(idA), 'メタ情報のクリックで閉じること').toHaveCount(0);
    await zone(idA).getByText(/📅/).first().click();
    await expect(body(idA), 'メタ情報のクリックで開くこと').toBeVisible();

    // 4) カード内のボタンでは展開状態が変わらない
    await card(idA).getByRole('button', { name: /コピー/ }).click();
    await expect(body(idA), '📋コピーで展開状態が変わらないこと').toBeVisible();
    await card(idA).getByRole('button', { name: /活用する/ }).click();
    await expect(body(idA), '▼活用するで展開状態が変わらないこと').toBeVisible();
    await expect(card(idA).getByRole('button', { name: '✍️ 文章作成へ' }), '活用するの中身が開くこと').toBeVisible();

    // 5) 「▼ 全文表示」ボタンは残っていて、同じ状態をトグルする
    await page.locator(`[data-ctx-expand-button="${idA}"]`).click();
    await expect(body(idA), '▲閉じるで閉じること').toHaveCount(0);
    await page.locator(`[data-ctx-expand-button="${idA}"]`).click();
    await expect(body(idA), '▼全文表示で開くこと').toBeVisible();

    // 6) 複数カードを同時に展開できる（排他にしない）
    await zone(idB).getByText(`[E2E] クリック展開 B ${marker}`).click();
    await expect(body(idB)).toBeVisible();
    await expect(body(idA), '他のカードは開いたままであること').toBeVisible();

    // 7) キーボード（Enter／Space）で開閉できる
    await zone(idB).press('Enter');
    await expect(body(idB), 'Enterで閉じること').toHaveCount(0);
    await zone(idB).press(' ');
    await expect(body(idB), 'Spaceで開くこと').toBeVisible();

    // 8) ☆お気に入りボタンでも展開状態が変わらない
    await card(idA).getByRole('button', { name: /お気に入り|分類/ }).click();
    await expect(body(idA), '☆お気に入りで展開状態が変わらないこと').toBeVisible();
    await page.keyboard.press('Escape');

    // 9) 273のホバープレビューをONに戻しても競合しない
    //    （ふきだしが出ている状態でクリックすると、ふきだしは閉じて本文が開く）
    await page.evaluate(() => localStorage.setItem('lumina_hover_preview', '1'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(zone(idA)).toBeVisible({ timeout: 30000 });
    const preview = page.locator('[data-hover-preview]');
    await expect(async () => {
      await card(idA).hover();
      await expect(preview).toBeVisible({ timeout: 2500 });
    }).toPass({ timeout: 20000 });
    await zone(idA).getByText(`[E2E] クリック展開 A ${marker}`).click();
    await expect(body(idA), 'プレビューが出ていてもクリックで開くこと').toBeVisible();
    await expect(preview, 'プレビューは本文の上に残らないこと').toHaveCount(0);
  } finally {
    await page.evaluate(() => localStorage.removeItem('lumina_hover_preview')).catch(() => {});
    for (const id of [idA, idB]) {
      await page.request.delete(`${CONTEXT_API}?id=${id}`);
    }
  }
});


// ============================================================================
// 275: 🎤 プレゼン発表原稿（第1段階: PDF・画像）
// - 複数ファイルを一度に読み込む／PDFは全ページに展開／順序の入れ替え
// - 生成は**1ページ1リクエスト**（§2-4）・1枚の失敗で他を巻き添えにしない（R-39）
// - 用途4種と既定（院内勉強会）／ページ単位の再生成／スライドと原稿の並列表示（§4-1）
// - リッチコピー／保存一覧への保存
// AIは呼ばずAPIをモックするため課金なし。保存物は [E2E] 印を付けて最後に削除する（R-55）
// ============================================================================

/** ページ数ぶんの空PDF（xref付き・全ASCII＝文字長がそのままバイトオフセット） */
function buildBlankPdf(pageCount: number): Buffer {
  const kids = Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(' ');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`,
    ...Array.from({ length: pageCount }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 240] /Resources << >> >>'),
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((body, idx) => {
    offsets.push(out.length);
    out += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startxref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** 1x1の透明PNG（画像レーンの検証用。中身は問わない） */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('C73: プレゼン発表原稿（275）— 複数同時読み込み・PDF展開・並び替え・1ページ1リクエスト・失敗の局所化・再生成・並列表示（APIモック）', async ({
  page,
  context,
}) => {
  const marker = `PRES${RUN_ID}`;
  const inferredTheme = `${E2E_PREFIX} 推定テーマ ${marker}`;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });

  // 生成APIをモック（AI課金なし）。呼ばれたリクエストを全部ためて、1ページ1リクエストを機械判定する
  const calls: Record<string, unknown>[] = [];
  let failPage2Once = true;
  await page.route('**/api/presentation/page-script', async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    calls.push(body);
    const n = Number(body.pageNumber);
    if (n === 2 && failPage2Once) {
      failPage2Once = false; // 再生成では成功させる
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: '[E2E] 想定内の失敗' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        slideTitle: `見出し${n}`,
        sections: { connect: `つなぎ${n}`, main: `ほんだい${n}`, supplement: `ほそく${n}`, handoff: `おくり${n}` },
        summaryForNext: `ようてん${n}`,
        inferredTheme,
        adCheck: { status: 'ok', findings: [] },
        _ai: { provider: 'gemini', modelLabel: 'Gemini 3.7 Flash' },
      }),
    });
  });

  const savedIds: number[] = [];
  try {
    await page.goto('/dashboard/presentation');
    await expect(page.getByRole('heading', { name: /プレゼン発表原稿/ })).toBeVisible({ timeout: 30000 });

    // §2-3: ファイル自体を保存しないことが画面に明記されている／§2-1: pptxは第2段階の案内
    await expect(page.getByText('ファイル自体は保存されません')).toBeVisible();
    await expect(page.getByText(/pptx.*第2段階/)).toBeVisible();

    // §3-4: 用途は4種・既定は院内勉強会
    const audience = page.locator('[data-pres-audience]');
    expect(await audience.locator('option').count(), '用途は4種').toBe(4);
    await expect(audience).toHaveValue('staff');
    await expect(audience.locator('option[value="staff"]')).toHaveText(/院内勉強会/);
    for (const label of ['学会発表', '患者向け講演', '一般向けセミナー']) {
      await expect(audience.locator('option', { hasText: label })).toHaveCount(1);
    }

    // §3-1: PDF（2ページ）と画像を**一度に**読み込む → PDFは全ページに展開される
    await page.locator('[data-pres-file-input]').setInputFiles([
      { name: '資料.pdf', mimeType: 'application/pdf', buffer: buildBlankPdf(2) },
      { name: 'スライド.png', mimeType: 'image/png', buffer: TINY_PNG },
    ]);
    const rows = page.locator('[data-pres-page]');
    await expect(rows, 'PDF2ページ＋画像1枚＝3ページに展開される').toHaveCount(3, { timeout: 30000 });
    const labels = async () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-pres-page-label')));
    expect(await labels()).toEqual(['資料.pdf p.1', '資料.pdf p.2', 'スライド.png']);

    // §3-1: 順序を入れ替えられる（↑で1つ前へ／↓で戻る）
    await rows.nth(2).locator('[data-pres-move-up]').click();
    expect(await labels(), '↑でページ順が入れ替わる').toEqual(['資料.pdf p.1', 'スライド.png', '資料.pdf p.2']);
    await rows.nth(1).locator('[data-pres-move-down]').click();
    expect(await labels(), '↓で元に戻る').toEqual(['資料.pdf p.1', '資料.pdf p.2', 'スライド.png']);

    // 実行（テーマは空欄＝1枚目から推定させる）
    await page.locator('[data-pres-run]').click();

    // §3-7: 進捗が出る／失敗ページが分かる（2枚目だけ失敗させている）
    await expect(page.locator('[data-pres-failed]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-pres-progress]')).toContainText('進捗: 2 / 3 ページ');

    // §2-4: 全ページを1リクエストで処理しない＝3ページなら3回、ページ番号は1,2,3の逐次
    expect(calls.length, '1ページ1リクエスト（3ページ＝3回）').toBe(3);
    expect(calls.map((c) => c.pageNumber)).toEqual([1, 2, 3]);
    // §3-3: 渡すのは「前ページの要点」「次ページのタイトル」「全体のテーマ」だけ。全ページは渡さない
    expect(calls[0].prevSummary, '1枚目に前ページの要点は無い').toBe('');
    expect(calls[2].prevSummary, '前ページの要点が次の生成に渡る').toBe('ようてん2');
    expect(calls[2].theme, '1枚目から推定したテーマが以降へ引き継がれる').toBe(inferredTheme);
    for (const c of calls) {
      expect(Object.keys(c), '全ページの束を送っていない').not.toContain('pages');
      expect(typeof c.imageDataUrl, 'ページ画像を送っている').toBe('string');
    }

    // R-39: 2枚目の失敗が他ページを巻き添えにしない
    const resultPage = (n: number) => page.locator(`[data-pres-result-page="${n}"]`);
    await expect(resultPage(2).locator('[data-pres-page-error]')).toBeVisible();
    await expect(resultPage(1)).toContainText('ほんだい1');
    await expect(resultPage(3)).toContainText('ほんだい3');

    // §4-1: スライドと原稿が**並んで**表示される（左にスライド・右に原稿）
    const slide = resultPage(1).locator('[data-pres-slide-image]');
    const script = resultPage(1).locator('[data-pres-script]');
    await expect(slide).toBeVisible();
    await expect(script).toBeVisible();
    const slideBox = await slide.boundingBox();
    const scriptBox = await script.boundingBox();
    expect(slideBox && scriptBox).toBeTruthy();
    expect(scriptBox!.x, '原稿はスライドの右側に並ぶ').toBeGreaterThan(slideBox!.x);
    await expect(page.locator('[data-pres-fact-note]')).toContainText('スライドに書かれていない事実');
    // §3-5: 原稿の型（4要素）が見える
    for (const label of ['繋ぎ', '本題', '補足', '送り']) {
      await expect(resultPage(1).getByText(label, { exact: true })).toBeVisible();
    }

    // §3-6: ページ単位で作り直せる（この1枚だけ再生成＝リクエストは1回だけ増える）
    await resultPage(2).locator('[data-pres-regenerate]').click();
    await expect(resultPage(2)).toContainText('ほんだい2', { timeout: 60000 });
    expect(calls.length, '再生成は該当ページの1リクエストだけ').toBe(4);
    await expect(page.locator('[data-pres-progress]')).toContainText('進捗: 3 / 3 ページ');

    // §3-6: リッチコピー（通し原稿）
    await page.locator('[data-pres-copy-all]').click();
    await expect(page.locator('[data-pres-copy-all]')).toHaveText(/コピーしました/);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('## 1. 見出し1');
    expect(clip).toContain('**繋ぎ**');
    expect(clip).toContain(inferredTheme);

    // §3-6: 保存一覧（text_analysis_saves）へ保存できる
    await page.locator('[data-pres-save]').click();
    await expect(page.locator('[data-pres-save]')).toHaveText(/保存済み/, { timeout: 30000 });
    const list = await listSaves(api, { q: marker, limit: 100 });
    const mine = list.items.filter((it) => String(it.auto_title ?? '').includes(marker));
    expect(mine.length, '保存一覧に原稿が1件入る').toBe(1);
    savedIds.push(...mine.map((it) => it.id as number));
    expect(String(mine[0].auto_title)).toContain('プレゼン原稿:');
    expect(String(mine[0].analysis_label)).toBe('プレゼン原稿');

    // 通し表示に切り替えると整形表示になる（生のMarkdown記法が出ない）
    await page.locator('[data-pres-view="full"]').click();
    const full = page.locator('[data-pres-full]');
    await expect(full).toBeVisible();
    const fullText = await full.innerText();
    expect(fullText).toContain('つなぎ1');
    expect(fullText).not.toContain('##');
  } finally {
    for (const id of savedIds) await api.delete(`${SAVES_API}?id=${id}`);
  }
});
