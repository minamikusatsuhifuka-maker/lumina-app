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
  withE2EPrefix,
  // 253: フォルダの横断表示
  FOLDER_ITEMS_API,
  listFolderItems,
  assignFolders,
  deleteFolder,
  cleanupE2EFolders,
  // 281: エピソード記録
  EPISODES_API,
  createEpisode,
  cleanupE2EEpisodes,
  // 288: 生MD露出の共通判定
  expectNoRawMarkdown,
  // 208: 追従カテゴリメモ
  createMemoCategory,
  createMemo,
  cleanupE2EMemos,
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
  // 281: エピソード記録の残骸も掃除する
  await cleanupE2EEpisodes(api);
  // 208: カテゴリメモ（memos / memo_categories）の残骸も掃除する
  await cleanupE2EMemos(api);
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
  // 285: 5件（5件目は選べないことの確認用）。比較E は要約セクションの無い古いデータ（フォールバックのラベル確認用）
  const topics = ['[E2E] 比較A', '[E2E] 比較B', '[E2E] 比較C', '[E2E] 比較D', '[E2E] 比較E'];
  const body = (i: number) =>
    `## 見出し${i}\n\n${`本文${i}のダミー行です。`.repeat(60)}\n\n### 小見出し${i}\n\n${`さらに本文${i}が続きます。`.repeat(60)}`;
  const context = (i: number) =>
    i === 4
      ? `要約セクションのない古い素材${i}。`
      : `## 📋 要約（1000字以内）\n\n**要約${i}** のダミーです。\n\n---\n\n## 📚 詳細コンテキスト\n\n詳細${i}の本文。`;

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

test('C69: バッチ結果の横並び比較（271/285）— 4件選択・5件目は選べない・本文既定・同期スクロール・sticky', async ({ page }) => {
  await stubFeatureDrafts(page);
  await stubBatchCompare(page);
  await page.setViewportSize({ width: 1920, height: 900 }); // 4列が出る幅（2xl以上）
  // モードの保持を素の状態から確かめるため、保存済みの選択を消してから開く
  await page.goto('/dashboard/deepresearch');
  await page.evaluate(() => localStorage.removeItem('lumina_batch_compare_mode'));
  await openBatchCompare(page);

  // 1) 既定で4件が選ばれ、4列で出る（横スクロールを出さない＝grid）
  await expect(page.locator('[data-compare-col]')).toHaveCount(4);
  await expect(page.locator('[data-compare-cols="4"]')).toHaveCount(1);
  await expect(page.locator('[data-compare-count]')).toContainText('選択中: 4/4件');

  // 2) 5件目は選べない（上限4件・押しても増えない）
  const fifth = page.locator('[data-compare-pick="900004"]');
  await expect(fifth).toBeDisabled();
  await expect(page.locator('[data-compare-col]')).toHaveCount(4);

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
  for (const i of [0, 1, 2, 3]) {
    await expect(page.locator(`[data-compare-col="${i}"]`)).toContainText(`要約${i}`);
  }
  await expect(page.locator('[data-compare-col="0"]')).not.toContainText('本文0のダミー行です。');

  // 9) 選んだモードは次回も保持される（§2-1）
  await openBatchCompare(page);
  await expect(page.locator('[data-compare-mode="summary"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-compare-col="0"]')).toContainText('要約0');

  // 10) 選択を外すと列も減る（個別に選び直せる）
  await page.locator('[data-compare-pick="900002"]').click();
  await expect(page.locator('[data-compare-col]')).toHaveCount(3);
  await expect(page.locator('[data-compare-cols="3"]')).toHaveCount(1);
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
    // 4件選ばれていても、カーソルの無い端末では1列だけ描く（横スクロールを出さない）
    await expect(page.locator('[data-compare-count]')).toContainText('選択中: 4/4件');
    await expect(page.locator('[data-compare-cols="1"]')).toHaveCount(1);
    // 289 §3-3: タッチ端末では列数の切り替えUIを出さない（高さは出してよい）
    await expect(page.locator('[data-compare-cols-picker]')).toHaveCount(0);
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
  // R-12: 自動下書き（R-20の復元）を止めてから本題を判定する。
  // 止めないと、前回実行ぶんのページが復元された上に読み込みが積まれて枚数が合わない（実測）
  await stubFeatureDrafts(page);

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
        // 288: 本題にMarkdown（太字）を混ぜ、スライド別表示が整形されること（R-45）も同時に判定する
        sections: { connect: `つなぎ${n}`, main: `ほんだい${n} **強調${n}**`, supplement: `ほそく${n}`, handoff: `おくり${n}` },
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
    // 2枚目は失敗させているため、3枚目には**最も近い生成済み**の1枚目の要点が渡る（R-39）
    expect(calls[1].prevSummary, '前ページの要点が次の生成に渡る').toBe('ようてん1');
    expect(calls[2].prevSummary, '失敗ページを飛ばして直近の要点が渡る').toBe('ようてん1');
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
    // 288/R-45: スライド別表示は整形（太字がstrong・** が文字として出ない）
    await expect(resultPage(1).locator('[data-md-view] strong').filter({ hasText: '強調1' })).toBeVisible();
    await expectNoRawMarkdown(resultPage(1).locator('[data-pres-script]'), 'プレゼン原稿（スライド別）');

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
    // 下書きはモックで書かれないが、モック前の実行で残った分があれば消しておく
    await api.delete('/api/feature-drafts?feature=presentation').catch(() => {});
  }
});


// ============================================================================
// 276: 🔗 喩え話・比喩表現（汎用・中学生に伝わる水準）
// - 分野の既定は医療・健康／一般では医療特化の層が消える（§2-3・§4-2）
// - 層は最大3つ・既定は中学生／列数は選択数どおり（§4-3・§8-3）
// - 各比喩に「当てはまる範囲／当てはまらない点」・3軸は該当なしでも明示（§5-2・§6-2）
// - 抽象語の機械検証（§3-4）／1層の失敗が他を巻き添えにしない（R-39）
// - 入力欄は270の3ボタン／サイドバー・🎛メニュー名設定への登録（§9）
// AIは呼ばずAPIをモックするため課金なし。保存物は [E2E] 印で作り、最後に削除する（R-55）
// ============================================================================

/** 1層ぶんのモック応答。axes を絞ると「該当なし」の埋めも検証できる */
function metaphorMockItems(audience: string, opts: { abstract?: boolean; skipScale?: boolean } = {}) {
  const items = [
    {
      axis: 'structure',
      metaphor: opts.abstract
        ? `${audience}向け: これは一種のパラダイムシフトのようなものです。`
        : `${audience}向け: 心臓は水をくみ上げるポンプのようなものです。`,
      appliesTo: '押し出して送り出すという役割の点。',
      doesNotApply: 'ポンプと違い、自分で休むことはできません。',
    },
    {
      axis: 'process',
      metaphor: `${audience}向け: 部活の朝練のように、毎日少しずつ続きます。`,
      appliesTo: '積み重ねで変わっていく点。',
      doesNotApply: '練習と違い、休んだ分を取り返すことはできません。',
    },
  ];
  if (!opts.skipScale) {
    items.push({
      axis: 'scale',
      metaphor: `${audience}向け: 教室の人数くらいの数があります。`,
      appliesTo: '数の多さの実感。',
      doesNotApply: '正確な個数を表すものではありません。',
    });
  }
  return items;
}

test('C74: 喩え話・比喩（276）— 分野の既定と出し分け・上限3つ・列数・限界の併記・失敗の局所化・3ボタン（APIモック）', async ({
  page,
  context,
}) => {
  const marker = `META${RUN_ID}`;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  await stubFeatureDrafts(page); // R-12: 自動下書きの復元を止めてから判定する

  const calls: Record<string, unknown>[] = [];
  let failSenior = true;
  await page.route('**/api/metaphor', async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    calls.push(body);
    const audience = String(body.audience);
    if (audience === 'senior' && failSenior) {
      failSenior = false; // 再生成では成功させる
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
        audience,
        field: body.field,
        // 中学生の列だけ抽象語入り＋scale欠けにして、機械検証と「該当なし」の埋めを見る
        items: metaphorMockItems(audience, {
          abstract: audience === 'junior',
          skipScale: audience === 'junior',
        }),
        adCheck: { status: 'ok', findings: [] },
        _ai: { provider: 'gemini', modelLabel: 'Gemini 3.7 Flash' },
      }),
    });
  });

  const savedIds: number[] = [];
  try {
    // §9-1: サイドバーからメニューに到達できる（URL直打ちでしか行けない状態にしない）
    await page.goto('/dashboard');
    const navLink = page.locator('a[data-nav-href="/dashboard/metaphor"]');
    await expect(navLink, 'サイドバーに🔗喩え話・比喩のリンクがある').toBeVisible({ timeout: 30000 });
    await navLink.click();
    await expect(page.getByRole('heading', { name: /喩え話・比喩表現/ })).toBeVisible({ timeout: 30000 });

    // §2-3: 分野の既定は「医療・健康」
    await expect(page.locator('[data-metaphor-field="medical"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-metaphor-field="general"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('分野は自動で判定しません', { exact: false })).toBeVisible();

    // §4-1/§4-2: 汎用7層＋医療特化3層。既定は「中学生でも分かる」が選択済み
    await expect(page.locator('[data-metaphor-target]')).toHaveCount(10);
    await expect(page.locator('[data-metaphor-target="junior"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-metaphor-count]')).toContainText('選択中: 1/3件');
    for (const key of ['beauty', 'family', 'parenting']) {
      await expect(page.locator(`[data-metaphor-target="${key}"]`), '医療分野では医療特化層が出る').toBeVisible();
    }

    // 分野を「一般」にすると医療特化の3層が消える（選択済みでも外れる）
    await page.locator('[data-metaphor-target="beauty"]').click();
    await expect(page.locator('[data-metaphor-count]')).toContainText('選択中: 2/3件');
    await page.locator('[data-metaphor-field="general"]').click();
    await expect(page.locator('[data-metaphor-target]')).toHaveCount(7);
    for (const key of ['beauty', 'family', 'parenting']) {
      await expect(page.locator(`[data-metaphor-target="${key}"]`), '一般分野では医療特化層が出ない').toHaveCount(0);
    }
    await expect(page.locator('[data-metaphor-count]'), '外れた層は選択からも落ちる').toContainText('選択中: 1/3件');
    // 医療へ戻すと再び追加される
    await page.locator('[data-metaphor-field="medical"]').click();
    await expect(page.locator('[data-metaphor-target]')).toHaveCount(10);

    // §4-3: 3つまで。4つ目は押せない（disabled）
    await page.locator('[data-metaphor-target="senior"]').click();
    await page.locator('[data-metaphor-target="worker"]').click();
    await expect(page.locator('[data-metaphor-count]')).toContainText('選択中: 3/3件');
    await expect(page.locator('[data-metaphor-target="expert"]'), '4つ目は選べない').toBeDisabled();

    // §8-1: 270の3ボタン（✕クリア → ↩元に戻す／📋ペースト／📋クリアして貼付）が揃って動く
    const input = page.locator('[data-metaphor-input]');
    await input.fill(`[E2E] ${marker} 心臓は全身に血液を送り出すポンプの役割を持つ臓器です。`);
    await page.locator('[data-metaphor-clear]').click();
    await expect(input, '✕クリアで入力が空になる').toHaveValue('');
    await page.getByRole('button', { name: '↩ 元に戻す' }).click();
    await expect(input, '↩元に戻すで入力が戻る').toHaveValue(new RegExp(marker));
    await expect(page.locator('[data-paste-button]'), '📋ペーストがある').toBeVisible();
    await expect(page.locator('[data-clear-paste]'), '📋クリアして貼付がある').toBeVisible();

    // ── 実行（3層）: 1層1リクエスト・senior だけ失敗させる ──
    await page.locator('[data-metaphor-run]').click();
    await expect(page.locator('[data-metaphor-col-error]')).toBeVisible({ timeout: 60000 });
    expect(calls.length, '1ターゲット層 = 1リクエスト（3層＝3回）').toBe(3);
    expect(calls.map((c) => c.audience)).toEqual(['junior', 'senior', 'worker']);
    for (const c of calls) {
      expect(c.field, '分野はサーバーへ明示的に渡す（自動判定させない）').toBe('medical');
    }

    // §8-3: 列数は選んだ数どおり（3列）
    await expect(page.locator('[data-metaphor-cols="3"]')).toHaveCount(1);

    // R-39: seniorの失敗が他の層を巻き添えにしない（junior列は抽象語入りのモック＝別の文言で確認）
    await expect(page.locator('[data-metaphor-col="junior"]')).toContainText('部活の朝練');
    await expect(page.locator('[data-metaphor-col="worker"]')).toContainText('ポンプのようなもの');

    // §5-2: 各比喩に「当てはまる範囲／当てはまらない点」が併記される
    const workerCol = page.locator('[data-metaphor-col="worker"]');
    await expect(workerCol.locator('[data-metaphor-applies]').first()).toContainText('当てはまる範囲');
    await expect(workerCol.locator('[data-metaphor-not-applies]').first()).toContainText('当てはまらない点');

    // §6-2: 3軸が固定で並び、欠けた軸は「該当なし」と明示される（空欄にしない）
    const juniorCol = page.locator('[data-metaphor-col="junior"]');
    await expect(juniorCol.locator('[data-metaphor-item]')).toHaveCount(3);
    await expect(juniorCol.locator('[data-metaphor-item="scale"]')).toContainText('該当なし');
    await expect(workerCol.locator('[data-metaphor-item="scale"]')).not.toContainText('該当なし');

    // §3-4: 抽象語（パラダイム）の機械検証が効く。素直な列では鳴らない
    await expect(juniorCol.locator('[data-metaphor-plain-warn]')).toContainText('パラダイム');
    await expect(workerCol.locator('[data-metaphor-plain-warn]')).toHaveCount(0);

    // §8-4: 列ごとの再生成（この層だけ作り直す＝リクエストは1回だけ増える）
    await page.locator('[data-metaphor-regenerate="senior"]').click();
    await expect(page.locator('[data-metaphor-col="senior"]')).toContainText('ポンプのようなもの', { timeout: 60000 });
    expect(calls.length, '再生成は該当層の1リクエストだけ').toBe(4);
    await expect(page.locator('[data-metaphor-col-error]')).toHaveCount(0);

    // 列ヘッダーは sticky（271と同じ・スクロールしてもどの層か分かる）
    const headerPosition = await page
      .locator('[data-metaphor-header="worker"]')
      .evaluate((el) => getComputedStyle(el).position);
    expect(headerPosition).toBe('sticky');

    // §8-4: リッチコピー（全部）
    await page.locator('[data-metaphor-copy-all]').click();
    await expect(page.locator('[data-metaphor-copy-all]')).toHaveText(/コピーしました/);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('# 喩え話・比喩表現');
    expect(clip).toContain('【当てはまらない点】');

    // §8-4: 保存一覧への保存
    await page.locator('[data-metaphor-save]').click();
    await expect(page.locator('[data-metaphor-save]')).toHaveText(/保存済み/, { timeout: 30000 });
    const list = await listSaves(api, { q: marker, limit: 100 });
    const mine = list.items.filter((it) => String(it.auto_title ?? '').includes(marker));
    expect(mine.length, '保存一覧に比喩が1件入る').toBe(1);
    savedIds.push(...mine.map((it) => it.id as number));
    expect(String(mine[0].analysis_label)).toBe('喩え話・比喩');

    // §8-3: 選択を減らすと列数も減る（3→2→1・空トラックを出さない）
    await page.locator('[data-metaphor-target="worker"]').click();
    await page.locator('[data-metaphor-run]').click();
    await expect(page.locator('[data-metaphor-cols="2"]')).toHaveCount(1, { timeout: 60000 });
    await page.locator('[data-metaphor-target="senior"]').click();
    await page.locator('[data-metaphor-run]').click();
    await expect(page.locator('[data-metaphor-cols="1"]')).toHaveCount(1, { timeout: 60000 });

    // §9-1/§9-2: 🎛メニュー名設定に 276 と 275 の項目が載っている（登録漏れの再発防止）。
    // 262に従い、設定画面の並びはサイドバーの実表示と同じ正本（nav-items.ts）から出る
    await page.goto('/dashboard/display-settings');
    await page.locator('[data-nav-category-toggle="コンテンツ作成"]').click();
    const block = page.locator('[data-nav-category-block="コンテンツ作成"]');
    await expect(block.locator('[data-nav-row="/dashboard/metaphor"]'), '276がメニュー名設定に載る').toHaveCount(1);
    await expect(block.locator('[data-nav-row="/dashboard/presentation"]'), '275がメニュー名設定に載る').toHaveCount(1);
    await expect(block.locator('[data-nav-label-input="/dashboard/metaphor"]'), '276もリネームできる').toBeVisible();
    // サイドバーの「コンテンツ作成」区画と設定画面の並びが同じ順（262）。
    // ホームはユーザーが並べ替えるため、比較対象はこのカテゴリの区画だけに限定する
    const sidebarSection = page.locator('div:has(> [data-nav-category="コンテンツ作成"])');
    const sidebarOrder = await sidebarSection
      .locator('a[data-nav-href]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-nav-href')));
    const rows = await block
      .locator('[data-nav-row]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-nav-row')));
    expect(rows, '🎛設定の並びがサイドバーの実表示と一致する').toEqual(sidebarOrder);
  } finally {
    for (const id of savedIds) await api.delete(`${SAVES_API}?id=${id}`);
    await api.delete('/api/feature-drafts?feature=metaphor').catch(() => {});
  }
});

test('C75: 275のプレゼン原稿にサイドバーから到達できる（276§9-2の確認）', async ({ page }) => {
  await page.goto('/dashboard');
  const link = page.locator('a[data-nav-href="/dashboard/presentation"]');
  await expect(link, 'サイドバーに🎤プレゼン原稿のリンクがある').toBeVisible({ timeout: 30000 });
  await link.click();
  await expect(page.getByRole('heading', { name: /プレゼン発表原稿/ })).toBeVisible({ timeout: 30000 });
});

test('C76: 比喩の読み比べはタッチ端末では1列（276§8-3・271の端末判定を再利用）', async ({ browser }) => {
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
    await page.route('**/api/metaphor', (route) => {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          audience: body.audience,
          field: body.field,
          items: metaphorMockItems(String(body.audience)),
          adCheck: null,
          _ai: { provider: 'gemini', modelLabel: 'Gemini 3.7 Flash' },
        }),
      });
    });
    await page.goto('/dashboard/metaphor');
    await expect(page.locator('[data-metaphor-input]')).toBeVisible({ timeout: 30000 });
    await page.locator('[data-metaphor-input]').fill('[E2E] 心臓は血液を送り出す臓器です。');
    await page.locator('[data-metaphor-target="senior"]').click();
    await page.locator('[data-metaphor-target="worker"]').click();
    await expect(page.locator('[data-metaphor-count]')).toContainText('選択中: 3/3件');
    await page.locator('[data-metaphor-run]').click();
    // 3層選んでいても、カーソルの無い端末では1列だけ描く（横スクロールを出さない）
    await expect(page.locator('[data-metaphor-cols="1"]')).toHaveCount(1, { timeout: 60000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'ページに横スクロールが出ていないこと').toBeLessThanOrEqual(1);
  } finally {
    await ctx.close();
  }
});


// ============================================================================
// 277: バッチジョブのタイトル付与・タイムゾーン是正・二重発火の遮断
// - タイトルはグループ名 → トピック名の連結（時刻は使わない・§2-2）
// - 同一内容の連続登録はサーバー側でも遮断（§3）
// - 改名は `group:` タグに波及しない（§2-4）
// - 表示日時は端末のタイムゾーンに関わらずJST（§2-3）
// AIは呼ばない（POST=登録のみ／run は叩かない）。作ったジョブは最後に削除する（R-55）
// ============================================================================

const BATCH_API = '/api/batch-research';

test('C77: バッチジョブのタイトルと二重登録の遮断（277 §2-2/§2-4/§3）', async () => {
  const marker = `BATCH${RUN_ID}`;
  const jobIds: number[] = [];
  const contextIds: number[] = [];

  const createJob = async (data: Record<string, unknown>) => {
    const res = await api.post(BATCH_API, { data });
    expect(res.status(), 'ジョブ登録が200であること').toBe(200);
    const json = await res.json();
    const job = json.job;
    expect(typeof job?.id).toBe('number');
    if (!jobIds.includes(job.id)) jobIds.push(job.id);
    return { job, deduplicated: json.deduplicated === true };
  };

  try {
    // 1) グループ名があればそれがタイトルになる
    const named = await createJob({
      groupName: `${E2E_PREFIX} ザクロ美容効果 ${marker}`,
      topics: [{ topic: `${E2E_PREFIX} トピックA ${marker}`, mode: 'quick' }],
      scheduleType: 'cron',
      scheduledAt: '2030-01-01T00:00:00.000Z',
    });
    expect(named.job.group_name).toBe(`${E2E_PREFIX} ザクロ美容効果 ${marker}`);

    // 2) グループ名が空 × トピック1件 → トピック名そのもの（「他n件」を付けない）
    const single = await createJob({
      topics: [{ topic: `${E2E_PREFIX} 単独トピック ${marker}`, mode: 'quick' }],
      scheduleType: 'cron',
      scheduledAt: '2030-01-01T00:00:00.000Z',
    });
    expect(single.job.group_name).toBe(`${E2E_PREFIX} 単独トピック ${marker}`);

    // 3) グループ名が空 × 3件 → 「先頭 他2件」
    const multi = await createJob({
      topics: [
        { topic: `${E2E_PREFIX} 先頭トピック ${marker}`, mode: 'quick' },
        { topic: `${E2E_PREFIX} 2件目 ${marker}`, mode: 'quick' },
        { topic: `${E2E_PREFIX} 3件目 ${marker}`, mode: 'quick' },
      ],
      scheduleType: 'cron',
      scheduledAt: '2030-01-01T00:00:00.000Z',
    });
    expect(multi.job.group_name).toBe(`${E2E_PREFIX} 先頭トピック ${marker} 他2件`);

    // 4) **どのタイトルにも日付・時刻が入らない**（UTCのタイムスタンプ名を作らない）
    const timeLike = /\d{1,4}\/\d{1,2}\/\d{1,2}|\d{1,2}:\d{2}/;
    for (const job of [named.job, single.job, multi.job]) {
      expect(String(job.group_name), `タイトルに時刻が無い: ${job.group_name}`).not.toMatch(timeLike);
    }

    // 5) §3: 同一内容をもう一度登録しても**新しい行を作らない**（同じジョブが返る）
    const again = await createJob({
      topics: [
        { topic: `${E2E_PREFIX} 先頭トピック ${marker}`, mode: 'quick' },
        { topic: `${E2E_PREFIX} 2件目 ${marker}`, mode: 'quick' },
        { topic: `${E2E_PREFIX} 3件目 ${marker}`, mode: 'quick' },
      ],
      scheduleType: 'cron',
      scheduledAt: '2030-01-01T00:00:00.000Z',
    });
    expect(again.job.id, '直近の同一内容ジョブが返る').toBe(multi.job.id);
    expect(again.deduplicated, '重複として扱われたことが分かる').toBe(true);

    // 内容が違えば当然そのまま作られる（遮断が効きすぎていないこと）
    const other = await createJob({
      topics: [{ topic: `${E2E_PREFIX} 別トピック ${marker}`, mode: 'quick' }],
      scheduleType: 'cron',
      scheduledAt: '2030-01-01T00:00:00.000Z',
    });
    expect(other.job.id).not.toBe(multi.job.id);

    // 一覧でも件数が増えていない（同一内容は1件のまま）
    const listRes = await api.get(`${BATCH_API}?limit=100`);
    expect(listRes.status()).toBe(200);
    const jobs = ((await listRes.json()).jobs ?? []) as { id: number; group_name: string }[];
    const mine = jobs.filter((j) => String(j.group_name).includes(marker));
    expect(mine.length, `[E2E]印のジョブは4件（重複登録は増えない）`).toBe(4);

    // 6) §2-4: 改名できる。既存の保存記事の `group:` タグには波及しない
    const oldName = named.job.group_name;
    const tagged = await api.post(CONTEXT_API, {
      data: {
        topic: `${E2E_PREFIX} タグ確認 ${marker}`,
        contextText: `${E2E_PREFIX} 本文`,
        tags: [`batch:${named.job.id}`, `group:${oldName}`],
      },
    });
    expect(tagged.status()).toBe(200);
    contextIds.push((await tagged.json()).id as number);

    const newName = `${E2E_PREFIX} 改名後 ${marker}`;
    const patched = await api.patch(BATCH_API, { data: { id: named.job.id, groupName: newName } });
    expect(patched.status(), '改名が200であること').toBe(200);
    expect((await patched.json()).job.group_name).toBe(newName);

    const savedRes = await api.get(`${CONTEXT_API}?id=${contextIds[0]}`);
    expect(savedRes.status()).toBe(200);
    const saved = await savedRes.json();
    const savedTags: string[] = saved.item?.tags ?? saved.tags ?? [];
    expect(savedTags, '保存記事のタグは改名前のまま（既存の絞り込みを壊さない）').toContain(`group:${oldName}`);
    expect(savedTags).not.toContain(`group:${newName}`);

    // 空のタイトルには改名できない（無題のジョブを作らない）
    const empty = await api.patch(BATCH_API, { data: { id: named.job.id, groupName: '   ' } });
    expect(empty.status()).toBe(400);

    // 他人・存在しないジョブは404（所有者チェック）
    const missing = await api.patch(BATCH_API, { data: { id: 999999999, groupName: 'x' } });
    expect(missing.status()).toBe(404);
  } finally {
    for (const id of jobIds) await api.delete(`${BATCH_API}?id=${id}`);
    for (const id of contextIds) await api.delete(`${CONTEXT_API}?id=${id}`);
  }
});

test('C78: 実行ボタンの二重発火でジョブが増えない・表示日時はJST（277 §3-5/§2-3）', async ({ browser }) => {
  // 端末のタイムゾーンをUTCにしても、表示はJSTでなければならない（§2-3）
  const ctx = await browser.newContext({
    storageState: STORAGE_STATE,
    baseURL: BASE_URL,
    timezoneId: 'UTC',
  });
  const page = await ctx.newPage();
  const JOB_ID = 987654322; // 実在しないID（モック専用）
  let postCount = 0;
  let patchBody: Record<string, unknown> | null = null;
  let jobTitle = `${E2E_PREFIX} 277モック`;

  try {
    await stubFeatureDrafts(page);
    // 一覧・登録・改名・実行をすべてモック（AIも実データも触らない）
    await page.route((url) => url.pathname === '/api/batch-research', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jobs: [
              {
                id: JOB_ID,
                group_name: jobTitle,
                topics: [{ topic: '[E2E] モックトピック', mode: 'quick', status: 'completed' }],
                schedule_type: 'immediate',
                scheduled_at: null,
                status: 'completed',
                // 実際にずれていた瞬間（UTC 5:41:17 = JST 14:41:17）
                created_at: '2026-08-31T05:41:17.000Z',
              },
            ],
          }),
        });
      }
      if (method === 'PATCH') {
        patchBody = route.request().postDataJSON();
        jobTitle = String((patchBody as { groupName?: string }).groupName ?? jobTitle);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ job: { id: JOB_ID, group_name: jobTitle } }),
        });
      }
      // POST: 登録。二重発火の検出のため回数を数え、わざと遅らせる
      postCount++;
      await new Promise((r) => setTimeout(r, 800));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job: { id: JOB_ID, group_name: jobTitle } }),
      });
    });
    await page.route(`**/api/batch-research/${JOB_ID}/run`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"all_done"}\n\n',
      }),
    );

    await page.goto('/dashboard/deepresearch');
    await page.getByRole('button', { name: '⚡ バッチリサーチ' }).click();

    // §2-3: ブラウザがUTCでも履歴の日時はJST（9時間ずれた表示を出さない）
    await expect(page.locator(`[data-batch-job-created="${JOB_ID}"]`)).toHaveText('2026/8/31 14:41:17');

    // §3-5: 実行ボタンを続けて2回押しても登録は1回だけ
    await page.locator('[data-batch-topic="0"]').fill(`${E2E_PREFIX} 二重発火の確認`);
    const submit = page.locator('[data-batch-submit]');
    await submit.click();
    await submit.click({ force: true, timeout: 3000 }).catch(() => { /* disabled なら押せなくて正しい */ });
    await expect(submit).toBeDisabled(); // 登録中は押せない
    await page.waitForTimeout(2000);
    expect(postCount, '二重発火してもジョブ登録は1回').toBe(1);

    // §2-4: 履歴から改名できる（保存記事のタグへは波及しない＝PATCHはジョブだけを更新する）
    await page.locator(`[data-batch-rename="${JOB_ID}"]`).click();
    const input = page.locator(`[data-batch-rename-input="${JOB_ID}"]`);
    await input.fill(`${E2E_PREFIX} 改名テスト`);
    await page.locator(`[data-batch-rename-save="${JOB_ID}"]`).click();
    await expect(page.locator(`[data-batch-job-title="${JOB_ID}"]`)).toHaveText(`${E2E_PREFIX} 改名テスト`);
    expect(patchBody, '改名はジョブのタイトルだけを送る（タグは送らない）').toEqual({
      id: JOB_ID,
      groupName: `${E2E_PREFIX} 改名テスト`,
    });
  } finally {
    await ctx.close();
  }
});

// ============================================================================
// 278: 📆 記事→X時間差展開（発信ハブの新規タブ・③の単発生成は不変）
// - 5型を1型1リクエストで生成／一部だけ選べる／1型の失敗・該当なしが他を巻き添えにしない
// - 類似度の警告／URLは既定2件で③④なし／型別の時間帯と行ごとの変更／同日に載らない
// - 「全件を投稿する」を勧める文言が出ない
// AIは呼ばずAPIをモック（課金なし・保存物なし）
// ============================================================================

test('C79: 記事→X時間差展開（278）— 1型1リクエスト・失敗/該当なしの局所化・被り警告・URL既定2件・時間帯・同日禁止（APIモック）', async ({ page }) => {
  await stubFeatureDrafts(page); // R-12
  const ARTICLE_ID = 'e2e-fanout-article';
  // クエリ付きURLはグロブだと曖昧になるため述語で判定する（stubBatchCompare と同じ）
  await page.route((url) => url.pathname === '/api/library' && url.searchParams.get('type') === 'deepresearch', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route((url) => url.pathname === '/api/library' && url.searchParams.get('type') === 'note-article', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: ARTICLE_ID, title: '[E2E] 保湿の基本', content: '保湿の順番と量の話。' }]),
    }),
  );
  const calls: Record<string, unknown>[] = [];
  const base = '朝の保湿は洗顔のあと3分以内に。\n\n順番は化粧水→乳液→クリームの3手順で、量は指先1関節ぶんが目安です。\n\n※後で見返せるようにブックマークを';
  await page.route('**/api/dr-hub/x-post', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    calls.push(body);
    const t = String(body.postType);
    if (t === 'debate') {
      return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '[E2E] 想定内の失敗' }) });
    }
    if (t === 'infographic') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, notApplicable: true, reason: '図解にする項目が記事にない', postType: t }) });
    }
    // story は knowhow とほぼ同文＝被り警告の対象
    const single = t === 'knowhow' ? base
      : t === 'story' ? `${base}\n\n私はこの順番を最初に習いました。`
      : '私は「保湿は高い化粧品ほど効く」と思っていました。\n\n実際に大事なのは量と順番と続けやすさでした。\n\n今日は洗面所に化粧水を置くところから。';
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, single, thread: [single, 'まとめ'], urlReplyLeadin: '本文で触れた記事の全文はこちらです', warnings: { single: [] }, xLength: 'mini', postType: t, charLimit: 25000 }),
    });
  });

  await page.goto('/dashboard/dr-hub');
  await page.getByRole('button', { name: /記事→X時間差展開/ }).click();
  await expect(page.locator('[data-fanout-root]')).toBeVisible();

  // §2-3: 既定は全5型が選択済み
  for (const t of ['knowhow', 'story', 'debate', 'insight', 'infographic']) {
    await expect(page.locator(`[data-fanout-type="${t}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  // 「全件を投稿する」を勧める文言が無い（§3-2②）
  await expect(page.locator('[data-fanout-root]')).not.toContainText(/全件を投稿|すべて投稿しましょう|全部投稿/);

  await page.locator('[data-fanout-article]').selectOption(ARTICLE_ID);
  await page.locator('[data-fanout-run]').click();
  await expect(page.locator('[data-fanout-card="infographic"]')).toHaveAttribute('data-fanout-status', 'na', { timeout: 60000 });

  // §2-4: 1型1リクエスト（5型＝5回・型の順）・全て fanout フラグ付きで③のAPIを呼ぶ
  expect(calls.length).toBe(5);
  expect(calls.map((c) => c.postType)).toEqual(['knowhow', 'story', 'debate', 'insight', 'infographic']);
  expect(calls.every((c) => c.fanout === true && c.articleId === ARTICLE_ID)).toBe(true);

  // R-39: ③の失敗・⑤の該当なしが他を巻き添えにしない
  await expect(page.locator('[data-fanout-card="debate"] [data-fanout-error]')).toBeVisible();
  await expect(page.locator('[data-fanout-card="infographic"] [data-fanout-na]')).toContainText('該当なし');
  for (const t of ['knowhow', 'story', 'insight']) {
    await expect(page.locator(`[data-fanout-card="${t}"]`)).toHaveAttribute('data-fanout-status', 'done');
  }

  // §3-2①: 被り警告（knowhow×story）。insight には出ない
  await expect(page.locator('[data-fanout-similar]')).toContainText('ノウハウ体系化型 × Before/After逆転ストーリー型');
  await expect(page.locator('[data-fanout-card="story"] [data-fanout-card-similar]')).toBeVisible();
  await expect(page.locator('[data-fanout-card="insight"] [data-fanout-card-similar]')).toHaveCount(0);

  // §5-2: URLは既定2件（先頭=knowhow・最後の候補=infographic。生成できた中では knowhow のみON）、③④はOFF
  await expect(page.locator('[data-fanout-url="knowhow"]')).toBeChecked();
  await expect(page.locator('[data-fanout-url="story"]')).not.toBeChecked();
  await expect(page.locator('[data-fanout-url="insight"]')).not.toBeChecked();
  await expect(page.locator('[data-fanout-copy-url="knowhow"]'), 'URLありの投稿だけ2通目コピーが出る').toBeVisible();
  await expect(page.locator('[data-fanout-copy-url="insight"]')).toHaveCount(0);

  // §4-2: 型ごとの既定時間帯（①②夜・④朝）
  await expect(page.locator('[data-fanout-slot="knowhow"]')).toHaveValue('night');
  await expect(page.locator('[data-fanout-slot="insight"]')).toHaveValue('morning');

  // §3-2②: 既定では日程に何も載らない（選んだものだけ）
  await expect(page.locator('[data-fanout-row]')).toHaveCount(0);
  for (const t of ['knowhow', 'story', 'insight']) await page.locator(`[data-fanout-pick="${t}"]`).check();
  await page.locator('[data-fanout-start]').fill('2026-09-02'); // 水曜
  await page.locator('[data-fanout-interval]').fill('3');
  await expect(page.locator('[data-fanout-row]')).toHaveCount(3);
  const dates = await page.locator('[data-fanout-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-fanout-row-date')));
  expect(dates, '3日おき・土曜は翌月曜へ（266と同じ）').toEqual(['2026-09-02', '2026-09-07', '2026-09-10']);
  expect(new Set(dates).size, '同一記事由来の投稿が同じ日に入らない').toBe(3);
  await expect(page.locator('[data-fanout-row="insight"]')).toContainText('朝 7:30');
  // 行ごとの時間帯変更が表に反映される
  await page.locator('[data-fanout-slot="insight"]').selectOption('noon');
  await expect(page.locator('[data-fanout-row="insight"]')).toContainText('昼 12:30');
  // 間隔を1日にしても同日には寄らない
  await page.locator('[data-fanout-interval]').fill('1');
  const tight = await page.locator('[data-fanout-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-fanout-row-date')));
  expect(new Set(tight).size).toBe(3);

  // 型を一部だけ選んで生成できる（2型＝2リクエスト増）
  for (const t of ['story', 'debate', 'infographic']) await page.locator(`[data-fanout-type="${t}"]`).click();
  await expect(page.locator('[data-fanout-run]')).toContainText('2型');
  await page.locator('[data-fanout-run]').click();
  await expect(page.locator('[data-fanout-card="insight"]')).toHaveAttribute('data-fanout-status', 'done', { timeout: 60000 });
  await expect(page.locator('[data-fanout-card]')).toHaveCount(2);
  expect(calls.length).toBe(7);

  // ③X投稿連動の単発生成UIは無傷（タブ・型セレクト・生成ボタンが残る）
  await page.getByRole('button', { name: '🐦 X投稿連動' }).click();
  await expect(page.locator('[data-x-type]')).toBeVisible();
  await expect(page.getByRole('button', { name: /X投稿を生成する（単発＋スレッド）/ })).toBeVisible();
});

// ============================================================================
// 279: 🔍 分かりやすさ診断（新規ページ）
// - 機械検出は決定的（2回診断で一致）／AI判定は「参考」で別枠／一括変換ボタンなし／本文は書き換えない
// - 元の文↔言い換え後の並列差分／読者の既定=中学生・分野の既定=医療／1箇所の失敗が他に波及しない
// - サイドバー到達・🎛設定の行（R-84）／270の3ボタン
// AIは呼ばずAPIをモック（課金なし）。保存物は作らない
// ============================================================================

test('C80: 分かりやすさ診断（279）— 決定的な機械検出・参考のAI判定・提案のみ・並列差分・既定・失敗の局所化・R-84（APIモック）', async ({ page }) => {
  await stubFeatureDrafts(page); // R-12
  const rephraseCalls: Record<string, unknown>[] = [];
  await page.route('**/api/plain-check/rephrase', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    rephraseCalls.push(body);
    if (body.kind === 'abstract') {
      return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '[E2E] 想定内の失敗' }) });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        candidates: [
          { text: '肌のいちばん外側の層（角層）が弱ると、塗った薬が中に入りやすくなる。', note: '玄関の鍵' },
          { text: '肌の外側の層が弱ると、薬が入りやすくなる。', note: '' },
        ],
        reason: '', adCheck: { status: 'ok', findings: [] },
      }),
    });
  });
  await page.route('**/api/plain-check/review', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ kind: 'premise', excerpt: '短い文です。', note: '何が短いのか前提が書かれていない' }] }) }),
  );

  // R-84: サイドバーから到達
  await page.goto('/dashboard');
  const navLink = page.locator('a[data-nav-href="/dashboard/plain-check"]');
  await expect(navLink, 'サイドバーに🔍分かりやすさ診断がある').toBeVisible({ timeout: 30000 });
  await navLink.click();
  await expect(page.getByRole('heading', { name: /分かりやすさ診断/ })).toBeVisible({ timeout: 30000 });

  // 既定: 読者=中学生・分野=医療（R-85）。一括変換ボタンは存在しない（§3-2）
  await expect(page.locator('[data-plain-audience]')).toHaveValue('junior');
  await expect(page.locator('[data-plain-field="medical"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /全部まとめて|一括で変換|すべて変換/ })).toHaveCount(0);
  // 270の3ボタン
  await expect(page.locator('[data-plain-clear]')).toBeVisible();
  await expect(page.locator('[data-paste-button]')).toBeVisible();
  await expect(page.locator('[data-clear-paste]')).toBeVisible();

  const text = '角層のバリア機能が低下すると経皮吸収が亢進し、外用薬のアドヒアランスがQOLに与えるインパクトはエビデンスベースで多角的かつ継続的に検討されるべきパラダイムであると考えられている。\n短い文です。';
  const input = page.locator('[data-plain-input]');
  await input.fill(text);
  await page.locator('[data-plain-diagnose]').click();
  await expect(page.locator('[data-plain-machine]')).toBeVisible();

  // 1文80字超・抽象語（パラダイム）が検出される
  await expect(page.locator('[data-plain-kind="long"]')).toHaveCount(1);
  await expect(page.locator('[data-plain-kind="abstract"]')).toContainText('パラダイム');
  const first = await page.locator('[data-plain-issue]').evaluateAll((els) => els.map((e) => e.getAttribute('data-plain-issue')));
  expect(first.length).toBeGreaterThan(3);

  // 決定的: もう一度診断しても同じ指摘IDの並び
  await page.locator('[data-plain-diagnose]').click();
  const second = await page.locator('[data-plain-issue]').evaluateAll((els) => els.map((e) => e.getAttribute('data-plain-issue')));
  expect(second, '同じ文章を2回診断すると機械検出が一致する').toEqual(first);

  // 機械検出とAI判定が視覚的に別枠（確定バッジ／参考ラベル）。AI判定は別ボタンで、結果に「参考」が付く
  await expect(page.locator('[data-plain-machine]')).toContainText('確定');
  await expect(page.locator('[data-plain-ai] [data-plain-ai-label]')).toContainText('参考');
  await expect(page.locator('[data-plain-ai-issue]')).toHaveCount(0);
  await page.locator('[data-plain-ai-run]').click();
  await expect(page.locator('[data-plain-ai-issue]')).toHaveCount(1);
  await expect(page.locator('[data-plain-ai-issue]')).toContainText('参考 ／ 前提の省略');
  await expect(page.locator('[data-plain-machine] [data-plain-ai-issue]'), 'AI判定は機械検出の枠に混ざらない').toHaveCount(0);

  // 言い換え: 指摘ごとのボタン → 1箇所1リクエスト → 候補が元の文と並んで差分表示。本文は変わらない
  const termIssue = page.locator('[data-plain-kind="term"]').first();
  const termId = await termIssue.getAttribute('data-plain-issue');
  await page.locator(`[data-plain-rephrase="${termId}"]`).click();
  await expect(termIssue.locator('[data-plain-candidate]')).toHaveCount(2, { timeout: 30000 });
  expect(rephraseCalls.length).toBe(1);
  expect(rephraseCalls[0].sentence, '送るのは指摘対象の1文だけ').toBe(text.split('\n')[0]);
  expect(rephraseCalls[0].field).toBe('medical');
  await expect(termIssue.locator('[data-plain-diff-left]').first()).toContainText('元の文');
  await expect(termIssue.locator('[data-plain-diff-right]').first()).toContainText('言い換え後');
  await expect(termIssue.locator('[data-plain-diff-right]').first()).toContainText('塗った薬が中に入りやすくなる');
  await expect(termIssue.locator('[data-plain-candidate]').first(), '候補の注記（使った場面）が出る').toContainText('玄関の鍵');
  await expect(termIssue.locator('[data-plain-diff-right] mark').first(), '追加箇所が色分けされる').toBeVisible();
  await expect(input, '本文は自動で書き換わらない').toHaveValue(text);
  await expect(page.locator('[data-plain-stale]')).toHaveCount(0);

  // R-39: 抽象語の箇所は失敗させる → その箇所だけエラー、上の候補は残る
  const absIssue = page.locator('[data-plain-kind="abstract"]').first();
  const absId = await absIssue.getAttribute('data-plain-issue');
  await page.locator(`[data-plain-rephrase="${absId}"]`).click();
  await expect(absIssue.locator('[data-plain-rephrase-error]')).toBeVisible({ timeout: 30000 });
  await expect(termIssue.locator('[data-plain-candidate]')).toHaveCount(2);
  expect(rephraseCalls.length).toBe(2);

  // 診断結果のコピーボタンがある（一括変換ではない）
  await expect(page.locator('[data-plain-copy-report]')).toBeVisible();

  // R-84: 🎛メニュー名設定に行がある（サイドバーと同じ正本）
  await page.goto('/dashboard/display-settings');
  await page.locator('[data-nav-category-toggle="コンテンツ作成"]').click();
  await expect(page.locator('[data-nav-category-block="コンテンツ作成"] [data-nav-row="/dashboard/plain-check"]')).toHaveCount(1);
});


// ============================================================================
// 281: 📔 エピソード記録（一次情報の貯蔵）
// ============================================================================

test('C81: エピソード記録（281）— 参考例と記録欄の分離・コピー/流し込み経路なし・行動の数字は警告しない・効果の数値化に警告・空でも保存・タグ絞り込み・R-39・3ボタン・R-84（参考例APIモック）', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const marker = `EP${RUN_ID}`;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  await stubFeatureDrafts(page); // R-12: 自動下書きの復元を止めてから判定する

  // 参考例API: 1回目は失敗（R-39の判定）、2回目以降は問いかけ6件
  let exampleCalls = 0;
  await page.route('**/api/episodes/examples', async (route) => {
    exampleCalls += 1;
    if (exampleCalls === 1) {
      return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '[E2E] 想定内の失敗' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          `[E2E] ${marker} 朝は何時ごろに起きていましたか？`,
          '机の上にいつも置いていたものはありましたか？',
          '一番つらかった時間帯はいつでしたか？',
          '誰かに言われて覚えている言葉はありますか？',
          '休憩のときに決まってしていたことはありましたか？',
          'やめたくなった場面はどんなときでしたか？',
        ],
        _ai: { provider: 'gemini', modelLabel: 'Gemini 3.7 Flash' },
      }),
    });
  });

  // 事前データ: タグ絞り込み用に2件（[E2E]付き）
  const tagA = `[E2E]${marker}A`;
  const tagB = `[E2E]${marker}B`;
  const idA = await createEpisode(api, { title: `${marker} タグA`, details: '朝5時起床。', tags: [tagA] });
  const idB = await createEpisode(api, { title: `${marker} タグB`, details: '1日10時間。', tags: [tagB] });
  const createdIds: number[] = [idA, idB];

  try {
    // R-84: サイドバーから到達できる
    await page.goto('/dashboard');
    const navLink = page.locator('a[data-nav-href="/dashboard/episodes"]');
    await expect(navLink, 'サイドバーに📔エピソード記録のリンクがある').toBeVisible({ timeout: 30000 });
    await navLink.click();
    await expect(page.getByRole('heading', { name: /エピソード記録/ })).toBeVisible({ timeout: 30000 });

    // §2-2: 参考例と記録欄が別枠。注意書きは生成前から常時表示
    const examplesFrame = page.locator('[data-ep-examples-frame]');
    const recordFrame = page.locator('[data-ep-record-frame]');
    await expect(examplesFrame).toHaveCount(1);
    await expect(recordFrame).toHaveCount(1);
    await expect(examplesFrame.locator('[data-ep-example-notice]'), '参考例の注意書きが常時表示される').toContainText('思い出すためのきっかけ');
    // 参考例の枠の中に記録欄（textarea）が無い＝流し込み先が枠内に存在しない
    await expect(examplesFrame.locator('textarea')).toHaveCount(0);

    // R-39: 参考例の生成失敗が記録の入力を妨げない
    await page.locator('[data-ep-theme]').fill('浪人時代');
    await page.locator('[data-ep-examples-run]').click();
    await expect(page.locator('[data-ep-examples-error]'), '失敗が枠内に局所化される').toBeVisible({ timeout: 15000 });
    const details = page.locator('[data-ep-field="details"]');
    await details.fill('1日10時間勉強した。毎朝5時に起きた。3年続けた。');
    await expect(details).toHaveValue(/1日10時間/);
    // §3-2: 自分の行動の数字は警告されない
    await expect(page.locator('[data-ep-effect-warn]'), '行動の数字（1日10時間・毎朝5時・3年）に警告が出ない').toHaveCount(0);

    // 2回目: 参考例6件が問いかけの形で出る。コピー・挿入・採用ボタンが**存在しない**
    await page.locator('[data-ep-examples-run]').click();
    const examples = page.locator('[data-ep-example]');
    await expect(examples).toHaveCount(6, { timeout: 15000 });
    for (const text of await examples.allTextContents()) {
      expect(text.trim(), '参考例は問いかけの形').toMatch(/(か|？|\?)$/);
    }
    await expect(examplesFrame.locator('[data-ep-example] button, [data-ep-example] a, [data-ep-example] input'), '参考例の各行に操作要素が無い').toHaveCount(0);
    await expect(examplesFrame.locator('button'), '参考例の枠のボタンは生成ボタン1つだけ').toHaveCount(1);
    await expect(examplesFrame.locator('button:has-text("コピー"), button:has-text("挿入"), button:has-text("採用"), button:has-text("記録欄へ")')).toHaveCount(0);
    await expect(examplesFrame.locator('[data-ep-example-notice]'), '生成後も注意書きが残る').toBeVisible();
    // 参考例を出しても記録欄の値は変わらない（自動流し込みが無い）
    await expect(details).toHaveValue('1日10時間勉強した。毎朝5時に起きた。3年続けた。');

    // §3-2: 効果を数値化した記述には警告が出る。保存ボタンは無効にならない
    const feelings = page.locator('[data-ep-field="feelings"]');
    await feelings.fill('この方法で痛みが8割減った。');
    await expect(page.locator('[data-ep-effect-warn]')).toHaveCount(1);
    await expect(page.locator('[data-ep-effect-claim]')).toHaveCount(1);
    await expect(page.locator('[data-ep-save]')).toBeEnabled();
    // 警告があっても保存できる（判断は院長）
    await page.locator('[data-ep-field="title"]').fill(`[E2E] ${marker} 警告あり`);
    await page.locator('[data-ep-save]').click();
    await expect(page.locator(`[data-ep-card]:has-text("${marker} 警告あり")`), '警告つきでも保存され一覧に出る').toHaveCount(1, { timeout: 15000 });
    await expect(page.locator('[data-ep-field="title"]'), '保存後はフォームが空になる').toHaveValue('');

    // 270の3ボタン（details 欄で判定）: ✕クリア→↩元に戻す／📋ペースト／📋クリアして貼付
    await details.fill('消える前の内容');
    await page.locator('[data-ep-clear="details"]').click();
    await expect(details).toHaveValue('');
    await page.locator('[data-ep-undo="details"]').click();
    await expect(details).toHaveValue('消える前の内容');
    await page.evaluate((t) => navigator.clipboard.writeText(t), `貼付${marker}`);
    await page.locator('[data-ep-field-row="details"] [data-paste-button]').click();
    await expect(details).toHaveValue(new RegExp(`貼付${marker}`));
    await page.locator('[data-clear-paste="details"]').click();
    await expect(details, 'クリアして貼付＝クリップボードの内容だけになる').toHaveValue(`貼付${marker}`);

    // §4-1: 全項目が空でも保存できる（UIはタグだけ・APIは完全に空）
    await page.locator('[data-ep-reset]').click();
    await expect(details).toHaveValue('');
    await page.locator('[data-ep-tag-input]').fill(`[E2E]${marker}empty`);
    await page.locator('[data-ep-tag-input]').press('Enter');
    await page.locator('[data-ep-save]').click();
    await expect(page.locator(`[data-ep-card]:has-text("#[E2E]${marker}empty")`), '本文が全部空でも保存される').toHaveCount(1, { timeout: 15000 });
    const emptyRes = await api.post(EPISODES_API, { data: {} });
    expect(emptyRes.status(), 'APIも全項目空で200').toBe(200);
    createdIds.push((await emptyRes.json()).id as number);

    // §4-2: タグで絞り込める
    await page.locator(`[data-ep-tag-filter="${tagA}"]`).click();
    await expect(page.locator(`[data-ep-card="${idA}"]`)).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator(`[data-ep-card="${idB}"]`)).toHaveCount(0);
    await page.locator(`[data-ep-tag-filter="${tagA}"]`).click(); // 解除
    await expect(page.locator(`[data-ep-card="${idB}"]`)).toHaveCount(1, { timeout: 15000 });

    // 274/R-81: 読む領域のクリックで開く・操作ボタンでは開閉しない
    await page.locator(`[data-ep-expand-zone="${idA}"]`).click();
    await expect(page.locator(`[data-ep-expanded-body="${idA}"]`)).toBeVisible();
    await page.locator(`[data-ep-edit="${idA}"]`).click();
    await expect(page.locator(`[data-ep-expanded-body="${idA}"]`), '編集ボタンで展開状態が変わらない').toBeVisible();
    await expect(page.locator('[data-ep-editing]')).toContainText(`#${idA}`);

    // R-84: 🎛メニュー名設定に行があり、並びがサイドバーと一致する
    await page.goto('/dashboard/display-settings');
    await page.locator('[data-nav-category-toggle="情報収集・調査"]').click();
    const block = page.locator('[data-nav-category-block="情報収集・調査"]');
    await expect(block.locator('[data-nav-row="/dashboard/episodes"]'), '281がメニュー名設定に載る').toHaveCount(1);
    const sidebarSection = page.locator('div:has(> [data-nav-category="情報収集・調査"])');
    const sidebarOrder = await sidebarSection.locator('a[data-nav-href]').evaluateAll((els) => els.map((el) => el.getAttribute('data-nav-href')));
    const rows = await block.locator('[data-nav-row]').evaluateAll((els) => els.map((el) => el.getAttribute('data-nav-row')));
    expect(rows, '🎛設定の並びがサイドバーの実表示と一致する').toEqual(sidebarOrder);
  } finally {
    for (const id of createdIds) await api.delete(`${EPISODES_API}?id=${id}`).catch(() => {});
    await cleanupE2EEpisodes(api);
    await api.delete('/api/feature-drafts?feature=episodes').catch(() => {});
  }
});

test('C82: エピソードを素材として選べる（281 §6-1）— 発信ハブ①②・269 Kindle→note（episodeIds送信）・Kindleウィザード①の📔タブ', async ({ page }) => {
  test.setTimeout(120_000);
  const marker = `EPS${RUN_ID}`;
  await stubFeatureDrafts(page);
  const epId = await createEpisode(api, { title: `${marker} 素材`, details: '毎朝5時に起きて2時間書いた。', tags: ['[E2E]素材'] });

  const remixCalls: Record<string, unknown>[] = [];
  await page.route('**/api/kindle/note-remix', async (route) => {
    remixCalls.push((route.request().postDataJSON() ?? {}) as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        content: `# [E2E] ${marker}\n\n本文`,
        titles: [`[E2E] ${marker}`],
        ad_check: { status: 'ok', findings: [] },
        contextHits: [], overlapRatio: 0.1, overlapWarn: false, kdpSelect: false,
        personaKey: 'beginner', personaLabel: '初心者', angleKey: 'why', angleLabel: 'Why', chapterTitle: 'x',
        episodeCount: 1,
      }),
    });
  });

  try {
    await page.goto('/dashboard/dr-hub');
    await expect(page.getByRole('heading', { name: /発信ハブ/ })).toBeVisible({ timeout: 30000 });
    // ①ペルソナ別（既定タブ）: 選択部品がある・手動で選べる
    const personaPicker = page.locator('[data-episode-picker="persona"]');
    await expect(personaPicker).toHaveCount(1);
    await personaPicker.locator('[data-episode-picker-toggle]').click();
    await personaPicker.locator(`[data-episode-picker-item="${epId}"] input[type="checkbox"]`).check();
    await expect(personaPicker.locator('[data-episode-picker-count]')).toContainText('1件');
    // ②分割記事化にもある
    await page.getByRole('button', { name: /分割記事化/ }).first().click();
    await expect(page.locator('[data-episode-picker="split"]')).toHaveCount(1);

    // 269 Kindle→note: 手動章＋エピソード選択で生成→リクエストに episodeIds が載る
    await page.getByRole('button', { name: /Kindle→note展開/ }).first().click();
    const remixPicker = page.locator('[data-episode-picker="remix"]');
    await expect(remixPicker).toHaveCount(1);
    await page.getByRole('button', { name: /手動で章を貼り付け/ }).click();
    await page.locator('[data-remix-manual-title]').fill(`[E2E] ${marker} 章`);
    await page.locator('[data-remix-manual-text]').fill('[E2E] 章の本文。'.repeat(20));
    await remixPicker.locator('[data-episode-picker-toggle]').click();
    await remixPicker.locator(`[data-episode-picker-item="${epId}"] input[type="checkbox"]`).check();
    await page.getByRole('button', { name: /この組み合わせで1本書き下ろす/ }).click();
    await expect(page.locator('[data-remix-candidate]')).toHaveCount(1, { timeout: 30000 });
    expect(remixCalls.length).toBe(1);
    expect(remixCalls[0].episodeIds, '選んだエピソードのIDが送られる').toEqual([epId]);

    // Kindleウィザード①: 📔エピソード記録のタブに出て、素材として選べる
    await page.goto('/dashboard/kindle-wizard');
    const epTab = page.getByRole('button', { name: /📔 エピソード記録/ });
    await expect(epTab).toBeVisible({ timeout: 30000 });
    await epTab.click();
    await expect(page.getByText(`${marker} 素材`).first()).toBeVisible({ timeout: 30000 });
  } finally {
    await api.delete(`${EPISODES_API}?id=${epId}`).catch(() => {});
    await cleanupE2EEpisodes(api);
    await api.delete('/api/feature-drafts?feature=dr-hub').catch(() => {});
    await api.delete('/api/feature-drafts?feature=kindle-remix').catch(() => {});
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 282: リサーチ保存に全画面表示（共通 FullscreenReader の横展開）
// ───────────────────────────────────────────────────────────────────────────
test('C83: リサーチ保存の全画面表示（282）— ⛶で共通リーダーへ到達・整形表示（R-45）・ルートzoom（文字サイズ4段階）が効く・閉じるとスクロール位置が保たれる・既存5ボタン動作・クリック展開（R-81）・横断表示の⛶・AI参照素材側に退行なし', async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  const marker = `FULLSCREEN${RUN_ID}`;
  const heading = `見出し${marker}`;
  const bold = `太字${marker}`;
  // 1行目は導入文（helpers が本文先頭に [E2E] を付けるため、見出し行を先頭に置くと ## が行頭でなくなる）
  const content = `検証用の本文です。\n\n## ${heading}\n\n**${bold}** の段落です。\n\n- 箇条書き一\n- 箇条書き二\n\n${'長い本文の行です。'.repeat(150)}`;
  const itemId = await createLibraryItem(request, { title: `全画面 ${marker}`, content });
  const ctxId = await createContextSave(request, {
    topic: `全画面退行 ${marker}`,
    contextText: `検証用の本文です。\n\n## CTX${heading}\n\n**CTX${bold}** の本文。${'あ'.repeat(200)}`,
  });
  const folderId = await createFolder(request, 'library', `全画面 ${marker}`);
  expect((await assignFolders(request, 'library', itemId, [folderId])).status()).toBe(200);

  const dialog = page.locator('[role="dialog"][data-kb-scope="reader"]');
  const readerBody = dialog.locator('.markdown-body');
  const closeReader = async () => {
    await dialog.getByRole('button', { name: '✕ 閉じる' }).click();
    await expect(dialog, '閉じるでリーダーが消えること').toHaveCount(0);
  };
  const expectFormatted = async (h: string, b: string) => {
    await expect(readerBody.locator(':is(h1,h2,h3,h4)').filter({ hasText: h }), '見出しがhタグで整形されること').toBeVisible();
    await expect(readerBody.locator('strong').filter({ hasText: b }), '太字がstrongで整形されること').toBeVisible();
    const text = (await readerBody.innerText()) ?? '';
    expect(text, '生MD記法（##）が露出しないこと').not.toContain('## ');
    expect(text, '生MD記法（**）が露出しないこと').not.toContain('**');
  };

  try {
    await page.goto('/dashboard/library');
    await page.evaluate(() => {
      localStorage.removeItem('lumina_hover_preview'); // 273の既定OFFで始める
      localStorage.setItem('lumina_text_scale', '100');
    });
    // ページが縦にスクロールする高さにする（§2-4 の位置保持を空振りさせない）
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // ── ① 253の横断表示（FolderCrossView）にも ⛶全画面 が付く ──
    const bar = page.locator('[data-custom-folder-bar="library"]');
    await expect(bar).toBeVisible({ timeout: 30000 });
    await bar.locator(`[data-folder-card="${folderId}"]`).click();
    const cross = page.locator(`[data-folder-cross-view="${folderId}"]`);
    await expect(cross, 'フォルダを開くと横断ビューが出ること').toBeVisible();
    await cross.locator(`[data-cross-fullscreen="library:${itemId}"]`).click();
    await expect(dialog, '横断表示の⛶で共通リーダーが開くこと').toBeVisible({ timeout: 20000 });
    await expectFormatted(heading, bold);
    await closeReader();

    // ── ② リサーチ保存のカード（検索で1件に絞る） ──
    await page.goto('/dashboard/library');
    await page.locator('[data-library-search]').fill(marker);
    const zone = page.locator(`[data-library-expand-zone="${itemId}"]`);
    const body = page.locator(`[data-library-expanded-body="${itemId}"]`);
    const fsBtn = page.locator(`[data-library-fullscreen="${itemId}"]`);
    await expect(zone, '対象カードが出ること').toBeVisible({ timeout: 30000 });

    // クリック展開（274と同じ挙動・R-81）: 既定は閉、タイトルで開く、本文クリックでは閉じない
    await expect(body).toHaveCount(0);
    await expect(zone).toHaveAttribute('aria-expanded', 'false');
    // タイトル（strong）を押す。フォルダ名も同じ文字列なので文字一致では2要素になる
    await zone.locator('strong').click();
    await expect(body, 'タイトルのクリックで本文が開くこと').toBeVisible();
    await expect(zone).toHaveAttribute('aria-expanded', 'true');
    await body.click();
    await expect(body, '本文のクリックで閉じないこと').toBeVisible();

    // ⛶ボタンを画面上端へ寄せてスクロール位置を作る（開閉前後で同じ位置に戻ることを確かめる）
    await fsBtn.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const y0 = await page.evaluate(() => window.scrollY);
    expect(y0, 'テストの前提: ページがスクロールされていること').toBeGreaterThan(0);

    // ── ③ ⛶で共通リーダーへ到達・整形表示（R-45）・タイトル ──
    await fsBtn.click();
    await expect(dialog, '⛶で全画面リーダーが開くこと').toBeVisible();
    await expect(dialog.getByText(`全画面 ${marker}`).first(), 'ヘッダーにタイトルが出ること').toBeVisible();
    await expectFormatted(heading, bold);
    await expect(body, '⛶で展開状態が変わらないこと（R-81 操作要素は展開の当たり判定に含めない）').toBeVisible();
    await expect(dialog.getByRole('button', { name: '中' }), 'リーダー自身の文字サイズ切替も残っていること').toBeVisible();

    // ── ④ 文字サイズ4段階（ルート zoom）がリーダーにも効く（body直下のportalが継承） ──
    const w1 = await readerBody.evaluate((el) => el.getBoundingClientRect().width);
    await page.evaluate(() => { document.documentElement.style.zoom = '1.4'; });
    const w2 = await readerBody.evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.abs(w2 - w1 * 1.4), `zoom1.4で本文幅が1.4倍になること（${w1}→${w2}）`).toBeLessThan(4);
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });

    // リーダーのアクション: 📋コピー（リッチコピー・plain側はMD原文）
    await dialog.locator('[data-library-reader-copy]').click();
    await expect(dialog.locator('[data-library-reader-copy]')).toContainText('コピー済み');
    expect(await page.evaluate(() => navigator.clipboard.readText()), 'リーダーのコピーが本文を含むこと').toContain(bold);

    // ── ⑤ 閉じると元の一覧の同じ位置に戻る ──
    await closeReader();
    expect(await page.evaluate(() => window.scrollY), '閉じた後もスクロール位置が同じであること').toBe(y0);
    expect(await page.evaluate(() => document.body.style.overflow), '背面スクロールロックが解除されること').toBe('');
    await expect(body, '閉じた後も展開状態が保たれること').toBeVisible();

    // ── ⑥ 既存ボタンが動く: ▲閉じる／📋／📥／☆／🗑 ──
    const card = zone.locator('xpath=..');
    await card.locator('button[title="閉じる"]').click();
    await expect(body, '▲閉じるで本文が閉じること').toHaveCount(0);
    await card.locator('button[title="本文をコピー"]').click();
    expect(await page.evaluate(() => navigator.clipboard.readText()), 'カードの📋が本文を含むこと').toContain(heading);
    const dl = page.waitForEvent('download');
    await card.locator('button[title="Markdownをダウンロード"]').click();
    expect((await dl).suggestedFilename(), '📥でMDが落ちること').toMatch(/\.md$/);
    await page.locator(`[data-favorite-button="${itemId}"]`).click();
    const picker = page.locator('[data-folder-picker]');
    await expect(picker, '☆から分類パネルが開くこと').toBeVisible();
    await picker.getByRole('button', { name: '閉じる' }).click();
    await expect(picker).toHaveCount(0);
    // 削除確認はカード側と画面側で2回出る（既存挙動）ため、この区間だけ全部承諾する
    const acceptAll = (d: import('@playwright/test').Dialog) => void d.accept();
    page.on('dialog', acceptAll);
    await card.locator('button[title="削除"]').click();
    await expect(zone, '🗑でカードが消えること').toHaveCount(0);
    page.off('dialog', acceptAll);
    await expect
      .poll(async () => {
        const rows = (await (await request.get(`${LIBRARY_API}?q=${encodeURIComponent(marker)}`)).json()) as { id: string }[];
        return Array.isArray(rows) ? rows.some((r) => r.id === itemId) : true;
      }, '🗑がサーバでも削除されること')
      .toBe(false);

    // ── ⑦ AI参照素材側（ContextLibraryPanel）の全画面に退行がない ──
    await page.goto('/dashboard/context-library');
    const ctxCard = page.locator(`[data-bundle-key="ctx-${ctxId}"]`);
    await expect(ctxCard).toBeVisible({ timeout: 30000 });
    await ctxCard.getByRole('button', { name: 'その他の操作' }).click();
    await ctxCard.getByRole('menuitem', { name: /全画面/ }).click();
    await expect(dialog, 'AI参照素材の⋯→⛶全画面が開くこと').toBeVisible({ timeout: 20000 });
    await expectFormatted(`CTX${heading}`, `CTX${bold}`);
    await closeReader();
  } finally {
    await request.delete(LIBRARY_API, { data: { ids: [itemId] } }).catch(() => {});
    await deleteFolder(request, 'library', folderId).catch(() => {});
    await request.delete(`${CONTEXT_API}?id=${ctxId}`).catch(() => {});
    await cleanupE2EContextSaves(request);
    await cleanupE2ELibrary(request);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 283: 同一リサーチの本文・要約を1枚のカードに（表示側グルーピング）
// ───────────────────────────────────────────────────────────────────────────
test('C84: リサーチ保存のカードまとめ（283）— batch紐付け1枚/推定1枚/同題3件は個別・成果物タブで展開（整形）・成果物ごとに⛶・検索ヒットの印・タグ/お気に入り絞り込み・成果物単位の削除・件と枚の表示', async ({
  page,
  request,
}) => {
  const marker = `GROUP${RUN_ID}`;
  const jobId = 9900001;
  const HA = `本文見出し${marker}`;
  const HS = `要約見出し${marker}`;
  const SUMTOKEN = `SUMONLY${marker}`;
  const now = new Date().toISOString();
  // R-79: 保存側（saveTopicToLibrary / SaveToLibraryButton）の形をそのまま写す
  const post = async (body: Record<string, unknown>) => {
    const res = await request.post(LIBRARY_API, { data: body });
    expect(res.status()).toBe(200);
    return (await res.json()).id as string;
  };
  const a1 = await post({
    type: 'deepresearch', title: withE2EPrefix(`TA ${marker}`),
    content: `導入。\n\n## ${HA}\n\n**太字A** の本文。${'長い本文。'.repeat(60)}`,
    metadata: { from: 'batch-research', jobId, topicIndex: 0, kind: 'research', savedAt: now },
    tags: `ディープリサーチ,バッチ,batch:${jobId}-0`, group_name: 'ディープリサーチ',
  });
  const a2 = await post({
    type: 'deepresearch', title: withE2EPrefix(`TA ${marker}`),
    content: `導入。\n\n## ${HS}\n\n${SUMTOKEN} を含む要約。`,
    metadata: { from: 'batch-research', jobId, topicIndex: 0, kind: 'summary', savedAt: now },
    tags: `ディープリサーチ,要約,バッチ,batch:${jobId}-0s`, group_name: 'ディープリサーチ',
  });
  const b1 = await post({ type: 'deepresearch', title: withE2EPrefix(`TB ${marker}`), content: `通常DR本文 ${marker}`, metadata: { savedAt: now }, tags: 'ディープリサーチ', group_name: 'ディープリサーチ' });
  const b2 = await post({ type: 'deepresearch', title: withE2EPrefix(`TB ${marker}`), content: `通常DR要約 ${marker}`, metadata: { savedAt: now }, tags: 'ディープリサーチ,要約', group_name: 'ディープリサーチ' });
  const cs: string[] = [];
  for (let i = 0; i < 3; i++) {
    cs.push(await post({ type: 'deepresearch', title: withE2EPrefix(`TC ${marker}`), content: `同題${i} ${marker}`, metadata: { savedAt: now }, tags: 'ディープリサーチ', group_name: 'ディープリサーチ' }));
  }
  const all = [a1, a2, b1, b2, ...cs];

  const dialog = page.locator('[role="dialog"][data-kb-scope="reader"]');
  const closeReader = async () => {
    await dialog.getByRole('button', { name: '✕ 閉じる' }).click();
    await expect(dialog).toHaveCount(0);
  };
  const cards = page.locator('[data-library-card]');
  const tab = (id: string) => page.locator(`[data-library-artifact-tab="${id}"]`);
  const body = (id: string) => page.locator(`[data-library-expanded-body="${id}"]`);

  try {
    await page.goto('/dashboard/library');
    await page.locator('[data-library-search]').fill(marker);
    await expect(page.locator(`[data-library-card="${a1}"]`), 'バッチの本文が代表のカードが出ること').toBeVisible({ timeout: 30000 });

    // ── ① 枚数: A(batch 2件→1枚) + B(推定 2件→1枚) + C(同題3件→3枚) = 5枚／7件 ──
    await expect(cards, '7件が5枚のカードになること').toHaveCount(5);
    await expect(page.getByText(`の検索結果: 7件（カード 5枚）`), '件（成果物）と枚（カード）を併記すること').toBeVisible();
    await expect(page.locator('[data-library-artifact-tab]'), '成果物タブはAとBの計4つだけ（Cの3件は個別）').toHaveCount(4);
    await expect(page.locator(`[data-library-card="${a1}"]`)).toHaveAttribute('data-library-link', 'batch');
    await expect(page.locator(`[data-library-card="${b1}"]`), '推定でまとめたカードは本文が代表').toHaveAttribute('data-library-link', 'estimated');
    await expect(page.locator(`[data-library-card="${b1}"] [data-library-estimated]`), '推定でまとめた旨の表示があること').toBeVisible();
    for (const c of cs) await expect(page.locator(`[data-library-card="${c}"]`), '同題3件は個別カードで残ること').toBeVisible();
    // 種別と文字数の併記
    await expect(tab(a1)).toContainText('本文');
    await expect(tab(a1)).toContainText(/\d字/);
    await expect(tab(a2)).toContainText('要約');
    await expect(tab(a2)).toHaveAttribute('data-library-artifact-kind', 'summary');

    // ── ② 成果物タブで展開（整形表示・R-45）。タブ切替で展開先が切り替わる ──
    await expect(body(a1)).toHaveCount(0);
    await tab(a2).click();
    await expect(body(a2), '要約タブで要約が展開されること').toBeVisible();
    await expect(body(a2).locator(':is(h1,h2,h3,h4)').filter({ hasText: HS }), '展開も整形表示（見出しがhタグ）').toBeVisible();
    expect(await body(a2).innerText(), '生MD記法が露出しないこと').not.toContain('## ');
    await tab(a1).click();
    await expect(body(a1), '本文タブで本文が展開されること').toBeVisible();
    await expect(body(a2), '要約側は閉じること').toHaveCount(0);
    await expect(body(a1).locator('strong').filter({ hasText: '太字A' })).toBeVisible();

    // ── ③ 成果物ごとに全画面（282の共通リーダー）──
    await page.locator(`[data-library-fullscreen="${a1}"]`).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.markdown-body :is(h1,h2,h3,h4)').filter({ hasText: HA }), '本文の全画面').toBeVisible();
    await closeReader();
    await tab(a2).click();
    await expect(body(a2)).toBeVisible();
    await page.locator(`[data-library-fullscreen="${a2}"]`).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.markdown-body :is(h1,h2,h3,h4)').filter({ hasText: HS }), '要約の全画面').toBeVisible();
    await closeReader();

    // ── ④ 検索: 要約にしかない語 → カードは出て、ヒットした成果物に印が付き、本文側は印なし ──
    await page.locator('[data-library-search]').fill(SUMTOKEN);
    await expect(page.locator(`[data-library-card="${a1}"]`), '要約だけがヒットしてもカードは欠落しない').toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(tab(a2)).toHaveAttribute('data-library-artifact-hit', '1');
    await expect(tab(a1)).toHaveAttribute('data-library-artifact-hit', '0');
    await expect(page.getByText('の検索結果: 1件（カード 1枚）')).toBeVisible();
    // タグで絞り込み（batch タグ）: 本文・要約の両方がヒット
    await page.locator('[data-library-search]').fill(`batch:${jobId}-0`);
    await expect(page.locator(`[data-library-card="${a1}"]`)).toBeVisible();
    await expect(page.getByText('の検索結果: 2件（カード 1枚）'), 'タグ絞り込みで両成果物がヒット').toBeVisible();

    // ── ⑤ お気に入り絞り込み（成果物単位）: 本文だけ⭐ → ★タブでカードが出て、本文タブに⭐ ──
    expect((await request.put(LIBRARY_API, { data: { id: a1, is_favorite: 1 } })).status()).toBe(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /★お気に入り/ }).click();
    await page.locator('[data-library-search]').fill(marker);
    await expect(page.locator(`[data-library-card="${a1}"]`), 'お気に入り絞り込みでカードが出ること').toBeVisible({ timeout: 30000 });
    await expect(cards, 'お気に入りはAの本文だけ').toHaveCount(1);
    await expect(tab(a1)).toContainText('⭐');
    await expect(tab(a2)).not.toContainText('⭐');

    // ── ⑥ 削除は成果物単位: 要約だけ消して本文カードは残る ──
    // 293: 種別/AIカテゴリの「すべて」ボタンが増えたため、タブは目印属性で指す
    await page.locator('[data-library-tab="all"]').click();
    await page.locator('[data-library-search]').fill(marker);
    await expect(tab(a2)).toBeVisible({ timeout: 30000 });
    await tab(a2).click(); // 要約を選択中にする
    await expect(body(a2)).toBeVisible();
    const acceptAll = (d: import('@playwright/test').Dialog) => void d.accept();
    page.on('dialog', acceptAll);
    await page.locator(`[data-library-delete="${a2}"]`).click();
    await expect(tab(a2), '要約が消えること').toHaveCount(0);
    page.off('dialog', acceptAll);
    await expect(page.locator(`[data-library-card="${a1}"]`), '本文のカードは残ること').toBeVisible();
    await expect
      .poll(async () => {
        const rows = (await (await request.get(`${LIBRARY_API}?q=${encodeURIComponent(marker)}`)).json()) as { id: string }[];
        return [rows.some((r) => r.id === a1), rows.some((r) => r.id === a2)];
      }, 'サーバ側でも要約だけが消えること')
      .toEqual([true, false]);

    // ── ⑦ 統計にも件と枚を出す ──
    await expect(page.getByText('総アイテム（件＝成果物）')).toBeVisible();
    await expect(page.getByText('カード（枚）')).toBeVisible();
  } finally {
    await request.delete(LIBRARY_API, { data: { ids: all } }).catch(() => {});
    await cleanupE2ELibrary(request);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 284: 中断したバッチジョブの表示と片付け
// ───────────────────────────────────────────────────────────────────────────
test('C85: 中断したバッチジョブ（284）— running/pending＋閾値超過は「中断」表示・閾値内runningとcompletedは不変・開始時刻(JST)と保存記事数・🗑で消せる・まとめて削除は確認1回で記事は残る・283グルーピング不変', async ({
  page,
  request,
}) => {
  const marker = `STALE${RUN_ID}`;
  const BATCH = '/api/batch-research';
  // 中断したジョブ（pending・scheduled_at が過去に取り残された）を実データとして2件作る。
  // schedule_type は 'browser'（cron の対象外＝テスト中に勝手に走らない）。scheduled_at 2020年 → 閾値超過
  const mkStale = async (suffix: string) => {
    const res = await request.post(BATCH, {
      data: {
        groupName: `${E2E_PREFIX} 中断 ${suffix} ${marker}`,
        topics: [{ topic: `${E2E_PREFIX} ${suffix} ${marker}`, mode: 'quick' }],
        scheduleType: 'browser',
        scheduledAt: '2020-01-01T00:00:00.000Z',
      },
    });
    expect(res.status()).toBe(200);
    return (await res.json()).job.id as number;
  };
  const p1 = await mkStale('A');
  const p2 = await mkStale('B');
  // ジョブに紐づく記事（AI参照素材・リサーチ保存の本文＋要約）。ジョブ履歴を消しても残ることを確かめる
  const ctxId = await createContextSave(request, { topic: `中断記事 ${marker}`, contextText: `記事本文 ${marker}`, tags: [`batch:${p1}`, `group:${marker}`] });
  const post = async (body: Record<string, unknown>) => {
    const res = await request.post(LIBRARY_API, { data: body });
    expect(res.status()).toBe(200);
    return (await res.json()).id as string;
  };
  const now = new Date().toISOString();
  const l1 = await post({ type: 'deepresearch', title: withE2EPrefix(`LIB ${marker}`), content: `本文 ${marker}`, metadata: { from: 'batch-research', jobId: p1, topicIndex: 0, kind: 'research', savedAt: now }, tags: `ディープリサーチ,バッチ,batch:${p1}-0`, group_name: 'ディープリサーチ' });
  const l2 = await post({ type: 'deepresearch', title: withE2EPrefix(`LIB ${marker}`), content: `要約 ${marker}`, metadata: { from: 'batch-research', jobId: p1, topicIndex: 0, kind: 'summary', savedAt: now }, tags: `ディープリサーチ,要約,バッチ,batch:${p1}-0s`, group_name: 'ディープリサーチ' });

  const jobRow = (id: number) => page.locator(`[data-batch-job="${id}"]`);
  const listHas = async (id: number) => {
    const rows = (await (await request.get(`${BATCH}?limit=100`)).json()).jobs as { id: number }[];
    return rows.some((j) => j.id === id);
  };

  try {
    await stubFeatureDrafts(page);
    // ── ① 表示の出し分け: 実データ（pending・過去予約）＋モックで running 中断／閾値内 running／completed を同じ一覧に混ぜる ──
    const H = 60 * 60 * 1000;
    const fake = (id: number, status: string, createdAgoMs: number, topics: { status: string }[]) => ({
      id, group_name: `${E2E_PREFIX} 模擬 ${status} ${id}`, topics: topics.map((t, i) => ({ topic: `t${i}`, mode: 'quick', ...t })),
      schedule_type: 'immediate', scheduled_at: null, status, created_at: new Date(Date.now() - createdAgoMs).toISOString(),
    });
    const F_RUN_STALE = 999990001, F_RUN_FRESH = 999990002, F_DONE = 999990003;
    await page.route((url) => url.pathname === '/api/batch-research' && url.searchParams.has('limit'), async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      json.jobs = [
        fake(F_RUN_STALE, 'running', 98 * 24 * H, [{ status: 'completed' }, { status: 'pending' }]),
        fake(F_RUN_FRESH, 'running', 10 * 60 * 1000, [{ status: 'pending' }]),
        fake(F_DONE, 'completed', 200 * 24 * H, [{ status: 'completed' }]),
        ...(json.jobs ?? []),
      ];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
    });
    await page.goto('/dashboard/deepresearch');
    await page.getByRole('button', { name: '⚡ バッチリサーチ' }).click();
    await expect(jobRow(p1), '実データの中断ジョブが履歴に出ること').toBeVisible({ timeout: 30000 });
    await expect(jobRow(p1), 'pending＋閾値超過 → 中断').toHaveAttribute('data-batch-job-display', 'stale');
    await expect(jobRow(p1)).toContainText('⚠ 中断（未完了）');
    await expect(jobRow(F_RUN_STALE), 'running＋閾値超過 → 中断').toHaveAttribute('data-batch-job-display', 'stale');
    await expect(jobRow(F_RUN_FRESH), '閾値内の running は実行中のまま').toHaveAttribute('data-batch-job-display', 'running');
    await expect(jobRow(F_RUN_FRESH)).toContainText('⏳ 実行中');
    await expect(jobRow(F_RUN_FRESH)).not.toContainText('中断');
    await expect(jobRow(F_DONE), 'completed は変わらない').toHaveAttribute('data-batch-job-display', 'completed');
    await expect(jobRow(F_DONE)).toContainText('✅ 完了');
    // 開始時刻（JST）・保存記事数
    const info = page.locator(`[data-batch-job-stale-info="${F_RUN_STALE}"]`);
    await expect(info).toContainText('開始・未完了');
    await expect(info).toContainText('約98日');
    await expect(page.locator(`[data-batch-job-saved-count="${F_RUN_STALE}"]`), '中断でも保存済みの記事数が出ること').toContainText('保存済み 1/2件');
    await expect(page.locator(`[data-batch-job-saved-count="${p1}"]`)).toContainText('保存済み 0/1件');
    // 決定的（R-74）: 同じ入力での一致は U57 で固定。ここでは同じ一覧内で判定が揺れないことだけ見る
    await expect(jobRow(F_RUN_STALE)).toHaveAttribute('data-batch-job-display', 'stale');
    await expect(jobRow(F_RUN_FRESH)).toHaveAttribute('data-batch-job-display', 'running');
    // 中断した running の🗑は押せる／本当に実行中の running は押せない
    await expect(page.locator(`[data-batch-job-delete="${F_RUN_STALE}"]`)).toBeEnabled();
    await expect(page.locator(`[data-batch-job-delete="${F_RUN_FRESH}"]`)).toBeDisabled();
    await page.unroute((url) => url.pathname === '/api/batch-research' && url.searchParams.has('limit'));

    // ── ② 個別🗑で中断ジョブが消える（確認1回・記事は残る） ──
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '⚡ バッチリサーチ' }).click();
    await expect(jobRow(p2)).toBeVisible({ timeout: 30000 });
    const dialogs: string[] = [];
    const onDialog = (d: import('@playwright/test').Dialog) => { dialogs.push(`${d.type()}:${d.message()}`); void d.accept(); };
    page.on('dialog', onDialog);
    await page.locator(`[data-batch-job-delete="${p2}"]`).click();
    await expect(jobRow(p2), '🗑で中断ジョブが消えること').toHaveCount(0);
    expect(dialogs.filter((d) => d.startsWith('confirm:')), '確認は1回').toHaveLength(1);
    expect(dialogs[0]).toContain('保存された記事は削除されません');
    await expect.poll(() => listHas(p2)).toBe(false);

    // ── ③ まとめて削除: 確認は1回だけ（R-56）・件数と「記事は消えない」を明記・ジョブ行だけ消える ──
    dialogs.length = 0;
    const bulk = page.locator('[data-batch-stale-bulk-delete]');
    await expect(bulk, '中断ジョブがあるときだけ出る片付けボタン').toBeVisible();
    await expect(bulk).toContainText('中断したジョブをまとめて削除');
    await bulk.click();
    await expect(jobRow(p1), 'まとめて削除で中断ジョブが消えること').toHaveCount(0, { timeout: 20000 });
    const confirms = dialogs.filter((d) => d.startsWith('confirm:'));
    expect(confirms, '確認ダイアログは1回だけ（R-56）').toHaveLength(1);
    expect(confirms[0]).toMatch(/中断した \d+ 件のジョブ履歴を削除します/);
    expect(confirms[0]).toContain('保存された記事は削除されません');
    page.off('dialog', onDialog);
    await expect.poll(() => listHas(p1)).toBe(false);
    // 片付けの対象はサーバーが全件から数える（履歴10件の外も含む）＝この利用者の中断ジョブは残らない
    const after = (await (await request.get(`${BATCH}?limit=10`)).json()) as { staleIds?: number[] };
    expect(after.staleIds ?? [], 'まとめて削除の後は中断ジョブが残らないこと').toEqual([]);
    await expect(bulk, '中断ジョブが無くなればボタンも消える').toHaveCount(0);

    // ── ④ 記事は消えていない: context_saves（タグ batch:<jobId>）とリサーチ保存の本文＋要約 ──
    const ctxRows = (await (await request.get(`${CONTEXT_API}?tag=batch:${p1}`)).json()) as { id: number }[] | { items?: { id: number }[] };
    const ctxList = Array.isArray(ctxRows) ? ctxRows : (ctxRows.items ?? []);
    expect(ctxList.some((r) => r.id === ctxId), 'context_saves の記事が残っていること').toBe(true);
    const libRows = (await (await request.get(`${LIBRARY_API}?q=${encodeURIComponent(marker)}`)).json()) as { id: string }[];
    expect(libRows.some((r) => r.id === l1) && libRows.some((r) => r.id === l2), 'リサーチ保存の本文・要約が残っていること').toBe(true);

    // ── ⑤ ジョブ行を消しても 283 のグルーピング（batch タグ）は効いたまま ──
    await page.goto('/dashboard/library');
    await page.locator('[data-library-search]').fill(marker);
    await expect(page.locator(`[data-library-card="${l1}"]`)).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-library-card]')).toHaveCount(1);
    await expect(page.locator(`[data-library-card="${l1}"]`)).toHaveAttribute('data-library-link', 'batch');
    await expect(page.locator(`[data-library-artifact-tab="${l2}"]`)).toBeVisible();
  } finally {
    await request.delete(`${BATCH}?id=${p1}`).catch(() => {});
    await request.delete(`${BATCH}?id=${p2}`).catch(() => {});
    await request.delete(`${CONTEXT_API}?id=${ctxId}`).catch(() => {});
    await request.delete(LIBRARY_API, { data: { ids: [l1, l2] } }).catch(() => {});
    await cleanupE2EContextSaves(request);
    await cleanupE2ELibrary(request);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 285: 比較を最大4件に・列数は幅で折り返す・要約フォールバック時のラベル是正
// ───────────────────────────────────────────────────────────────────────────
test('C86: 横並び比較4件（285）— 2xlで4列・中間幅は2×2に折り返す・横スクロールなし・4列/2×2とも同期スクロールとsticky・要約なし列は「本文（要約なし）」で文字数は本文・正常列は「要約」のまま', async ({ page }) => {
  await stubFeatureDrafts(page);
  await stubBatchCompare(page);
  await page.goto('/dashboard/deepresearch');
  await page.evaluate(() => localStorage.removeItem('lumina_batch_compare_mode'));

  const col = (i: number) => page.locator(`[data-compare-col="${i}"]`);
  const noHScroll = async (label: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${label}: ページに横スクロールが出ていないこと`).toBeLessThanOrEqual(1);
  };
  // 4列の y 座標を**1回の evaluate で同時に**取る（パネル表示直後の smooth スクロール中に逐次計測するとずれる）。
  // 2回連続で同じ値になるまで待ってから返す
  const rows = async () => {
    const read = () =>
      page.evaluate(() =>
        [0, 1, 2, 3].map((i) => Math.round(document.querySelector(`[data-compare-col="${i}"]`)!.getBoundingClientRect().y)),
      );
    let prev = await read();
    for (let n = 0; n < 20; n++) {
      await page.waitForTimeout(150);
      const cur = await read();
      if (cur.join(',') === prev.join(',')) return cur;
      prev = cur;
    }
    return prev;
  };
  const checkSyncAndSticky = async (label: string) => {
    // 同期スクロール（割合ベース）: 列0を底まで送ると他の3列も動く（2×2でも4列全部が同期）
    await expect(page.locator('[data-compare-sync]')).toBeChecked();
    for (let i = 1; i < 4; i++) await col(i).evaluate((el) => { el.scrollTop = 0; });
    await col(0).evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
    for (let i = 1; i < 4; i++) {
      await expect.poll(async () => col(i).evaluate((el) => el.scrollTop), `${label}: 列${i}が同期して動くこと`).toBeGreaterThan(0);
    }
    // sticky: 送った後も各列のヘッダーが列の上端に居る
    for (let i = 0; i < 4; i++) {
      const header = page.locator(`[data-compare-header="${i}"]`);
      expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
      const c = await col(i).boundingBox();
      const h = await header.boundingBox();
      expect(c && h && h.y - c.y, `${label}: 列${i}のヘッダーが上端に固定されていること`).toBeLessThan(4);
    }
    for (let i = 0; i < 4; i++) await col(i).evaluate((el) => { el.scrollTop = 0; });
  };

  // ── ① 2xl（1920px）: 4件が4列＝4つのカードが同じ高さ位置に並ぶ ──
  await page.setViewportSize({ width: 1920, height: 900 });
  await openBatchCompare(page);
  await expect(page.locator('[data-compare-col]')).toHaveCount(4);
  await expect(page.locator('[data-compare-cols="4"]')).toHaveCount(1);
  let ys = await rows();
  expect(new Set(ys).size, `1920px では4列（y=${ys.join(',')}）`).toBe(1);
  await noHScroll('1920px');
  await checkSyncAndSticky('4列');

  // ── ② 中間（1400px＝xl）: 2列×2行に折り返す（3+1の段違いにしない）──
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.locator('[data-compare-col]')).toHaveCount(4);
  ys = await rows();
  expect(ys[0], `1400px では列0と列1が同じ行（y=${ys.join(',')}）`).toBe(ys[1]);
  expect(ys[2], '列2と列3が同じ行').toBe(ys[3]);
  expect(ys[2], '2行目は1行目より下').toBeGreaterThan(ys[0]);
  await noHScroll('1400px');
  await checkSyncAndSticky('2×2');

  // ── ③ 狭い（1000px＝md）: 2列のまま ──
  await page.setViewportSize({ width: 1000, height: 900 });
  ys = await rows();
  expect(ys[0]).toBe(ys[1]);
  expect(ys[2]).toBeGreaterThan(ys[0]);
  await noHScroll('1000px');

  // ── ④ 要約モード: 要約が無い列（比較E）はラベル「本文（要約なし）」＋文字数は本文のもの、正常列は「要約」のまま ──
  await page.setViewportSize({ width: 1920, height: 900 });
  // 比較D を外して 比較E（要約なし）を入れる
  await page.locator('[data-compare-pick="900003"]').click();
  await page.locator('[data-compare-pick="900004"]').click();
  await expect(page.locator('[data-compare-col]')).toHaveCount(4);
  await page.locator('[data-compare-mode="summary"]').click();
  const researchLen = (i: number) =>
    `## 見出し${i}\n\n${`本文${i}のダミー行です。`.repeat(60)}\n\n### 小見出し${i}\n\n${`さらに本文${i}が続きます。`.repeat(60)}`.length;
  const labelE = page.locator('[data-compare-label="3"]');
  // ラベルは「本文（要約なし）」で始まり、文字数は表示している本文のもの（先頭が「要約」ではない）
  await expect(labelE, 'フォールバック列のラベルは本文・文字数は本文のもの').toHaveText(
    new RegExp(`^本文（要約なし） ${researchLen(4).toLocaleString()}字`),
  );
  await expect(col(3)).toContainText('※ この結果には要約が保存されていないため、本文を表示しています');
  await expect(col(3)).toContainText('本文4のダミー行です。');
  for (const i of [0, 1, 2]) {
    const l = page.locator(`[data-compare-label="${i}"]`);
    await expect(l, '正常な列は「要約 N字」のまま').toHaveText(
      new RegExp(`^要約 ${`**要約${i}** のダミーです。`.length.toLocaleString()}字`),
    );
    await expect(col(i)).not.toContainText('※ この結果には要約が保存されていない');
  }
  // 本文モードでは全列「リサーチ本文」
  await page.locator('[data-compare-mode="research"]').click();
  await expect(page.locator('[data-compare-label="3"]')).toContainText('リサーチ本文');
});

// ───────────────────────────────────────────────────────────────────────────
// 287: AI統合サマリーの体裁（整形表示・Word体裁コピー）と保存の fail-closed
// ───────────────────────────────────────────────────────────────────────────
test('C87: AI統合サマリー（287）— 生MDが露出しない・見出し/太字/箇条書きが描画・コピーはtext/htmlに見出しタグ・保存でタイトルと本文が残る（決定的な名前）・空本文はAPIが400・保存後の一覧も整形表示', async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  const marker = `MERGE${RUN_ID}`;
  const a = await createLibraryItem(request, { title: `統合A ${marker}`, content: `資料Aの本文 ${marker}` });
  const b = await createLibraryItem(request, { title: `統合B ${marker}`, content: `資料Bの本文 ${marker}` });
  const created: string[] = [a, b];
  const heading = `エグゼクティブ${marker}`;
  const bold = `太字${marker}`;
  // /api/merge はAI課金のためモック（出力はプロンプト規約どおり ## 見出し・**太字**・- 箇条書きのMarkdown）
  await page.route((url) => url.pathname === '/api/merge', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: `## 🎯 ${heading}\n\n**${bold}** が要点です。\n\n- 箇条書き一 ${marker}\n- 箇条書き二\n\n## 💡 主要インサイト\n\n本文 ${marker} の段落。`,
      }),
    }),
  );
  const dialogs: string[] = [];
  const onDialog = (d: import('@playwright/test').Dialog) => { dialogs.push(d.message()); void d.accept(); };
  page.on('dialog', onDialog);

  try {
    // ── ① 空本文は保存されない（fail-closed・API）──
    const emptyTitle = `空保存 ${marker}`;
    for (const content of ['', '   \n']) {
      const res = await request.post(LIBRARY_API, { data: { title: emptyTitle, content, type: 'merge', tags: '統合レポート', group_name: '統合レポート' } });
      expect(res.status(), '本文が空なら400').toBe(400);
      expect((await res.json()).error, '失敗理由が返ること').toContain('本文が空');
    }
    const afterEmpty = (await (await request.get(`${LIBRARY_API}?q=${encodeURIComponent(emptyTitle)}`)).json()) as { id: string }[];
    expect(afterEmpty.length, '空本文の行がDBに書かれていないこと').toBe(0);

    // ── ② 選択→AIでまとめる→モーダルは整形表示 ──
    await page.goto('/dashboard/library');
    await page.locator('[data-library-search]').fill(marker);
    await expect(page.locator(`[data-library-card="${a}"]`)).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: '✓ 選択モード' }).click();
    await page.locator(`[data-library-card="${a}"] input[type="checkbox"]`).check();
    await page.locator(`[data-library-card="${b}"] input[type="checkbox"]`).check();
    await page.getByRole('button', { name: '🔗 AIでまとめる' }).click();
    const modal = page.locator('[data-merge-modal]');
    const body = page.locator('[data-merge-body]');
    await expect(modal).toBeVisible();
    await expect(body.locator(':is(h1,h2,h3,h4)').filter({ hasText: heading }), '見出しがhタグで描画されること').toBeVisible();
    await expect(body.locator('strong').filter({ hasText: bold }), '太字がstrongで描画されること').toBeVisible();
    await expect(body.locator('li').filter({ hasText: `箇条書き一 ${marker}` }), '箇条書きがliで描画されること').toBeVisible();
    const text = await body.innerText();
    expect(text, '生MD記法（##）が露出しないこと').not.toContain('## ');
    expect(text, '生MD記法（**）が露出しないこと').not.toContain('**');
    expect(text, '生MD記法（- ）が露出しないこと').not.toMatch(/^- /m);

    // ── ③ コピーは text/html を持ち、見出し・太字がHTMLタグとして含まれる（Word貼付の担保）──
    await page.locator('[data-merge-copy]').click();
    await expect.poll(() => dialogs.some((m) => m.includes('コピーしました')), 'コピー完了が知らされること').toBe(true);
    const clip = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        if (it.types.includes('text/html')) return { html: await (await it.getType('text/html')).text(), plain: await (await it.getType('text/plain')).text() };
      }
      return { html: '', plain: await navigator.clipboard.readText() };
    });
    expect(clip.html, 'text/html が取得できること').not.toBe('');
    expect(clip.html, '見出しがHTMLタグで含まれること').toMatch(/<h[1-4][^>]*>[^<]*エグゼクティブ/);
    expect(clip.html, '太字がHTMLタグで含まれること').toMatch(/<(strong|b)[^>]*>[^<]*太字/);
    expect(clip.plain, 'plain 側は原文のMarkdown').toContain('## 🎯');

    // ── ④ 保存: タイトルは選んだ資料から決定的に、本文はそのまま残る ──
    await page.locator('[data-merge-save]').click();
    await expect(modal, '保存後にモーダルが閉じること').toHaveCount(0);
    // 保存名は「統合サマリー: <選択の1件目> 他1件」。一覧は新しい順なので1件目は統合B（後に作った方）になる
    const titleRe = new RegExp(`^統合サマリー: \\[E2E\\] 統合[AB] ${marker} 他1件$`);
    await expect.poll(() => dialogs.some((m) => m.includes('リサーチ保存に追加しました') && titleRe.test(m.replace(/^.*（/, '').replace(/）$/, ''))), '保存完了と保存名が知らされること').toBe(true);
    const rows = (await (await request.get(`${LIBRARY_API}?q=${encodeURIComponent(marker)}`)).json()) as { id: string; title: string; content: string; type: string }[];
    const saved = rows.find((r) => r.type === 'merge');
    expect(saved, '統合サマリーの行が保存されていること').toBeTruthy();
    created.push(saved!.id);
    expect(saved!.title, 'タイトルが(無題)でなく決定的な名前').toMatch(titleRe);
    const expectedTitle = saved!.title;
    expect(saved!.content, '本文が空でないこと').toContain(bold);
    expect(saved!.content.length).toBeGreaterThan(50);

    // ── ⑤ 保存後の一覧: カードに本文と名前が出て、展開も整形表示（§2-6・283の経路）──
    const card = page.locator(`[data-library-card="${saved!.id}"]`);
    await expect(card, '保存された行がカードとして出ること').toBeVisible({ timeout: 30000 });
    await expect(card).toContainText(expectedTitle);
    await expect(card).not.toContainText('(無題)');
    await expect(card).not.toContainText(' 0文字');
    await page.locator(`[data-library-expand-zone="${saved!.id}"] strong`).click();
    const expanded = page.locator(`[data-library-expanded-body="${saved!.id}"]`);
    await expect(expanded).toBeVisible();
    await expect(expanded.locator(':is(h1,h2,h3,h4)').filter({ hasText: heading }), '保存後の展開も整形表示').toBeVisible();
    expect(await expanded.innerText()).not.toContain('## ');
  } finally {
    page.off('dialog', onDialog);
    await request.delete(LIBRARY_API, { data: { ids: created } }).catch(() => {});
    await cleanupE2ELibrary(request);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 286: 本文・要約のグルーピングをペアリングに（同題3件以上でも組になる／同種別は組まない）
// ───────────────────────────────────────────────────────────────────────────
test('C88: リサーチ保存のペアリング（286）— 同題で本文3＋要約3は3枚・本文2だけは2枚・🔗推定バッジ・batch紐付けと検索の欠落なしは不変', async ({ page, request }) => {
  const marker = `PAIR${RUN_ID}`;
  const now = new Date().toISOString();
  // R-79: 通常DRの保存側（SaveToLibraryButton: type/title/content/metadata{savedAt}/tags/group_name）を写す
  const post = async (title: string, content: string, tags: string) => {
    const res = await request.post(LIBRARY_API, {
      data: { type: 'deepresearch', title: withE2EPrefix(title), content, metadata: { savedAt: now }, tags, group_name: 'ディープリサーチ' },
    });
    expect(res.status()).toBe(200);
    return (await res.json()).id as string;
  };
  const ids: string[] = [];
  const trioTitle = `三組 ${marker}`;
  for (let i = 0; i < 3; i++) {
    ids.push(await post(trioTitle, `本文${i} ${marker}`, 'ディープリサーチ'));
    ids.push(await post(trioTitle, `要約${i} ${marker}`, 'ディープリサーチ,要約'));
  }
  const dupTitle = `重複 ${marker}`;
  ids.push(await post(dupTitle, `重複本文A ${marker}`, 'ディープリサーチ'));
  ids.push(await post(dupTitle, `重複本文B ${marker}`, 'ディープリサーチ'));

  try {
    await page.goto('/dashboard/library');
    await page.locator('[data-library-search]').fill(trioTitle);
    const cards = page.locator('[data-library-card]');
    await expect(cards.first()).toBeVisible({ timeout: 30000 });
    await expect(cards, '本文3＋要約3 → 3枚').toHaveCount(3);
    await expect(page.locator('[data-library-artifact-tab]'), '各カードに本文・要約の2タブ').toHaveCount(6);
    await expect(page.locator('[data-library-estimated]'), '推定でまとめた🔗バッジが全カードに出る').toHaveCount(3);
    await expect(page.locator('[data-library-link="estimated"]')).toHaveCount(3);
    await expect(page.getByText(`の検索結果: 6件（カード 3枚）`), '件と枚の併記').toBeVisible();
    // 要約だけにある語で検索しても欠落しない（283 §4-5 維持）
    await page.locator('[data-library-search]').fill(`要約1 ${marker}`);
    await expect(cards).toHaveCount(1);
    await expect(page.locator('[data-library-artifact-hit="1"]')).toHaveCount(1);
    await expect(page.locator('[data-library-artifact-hit="0"]')).toHaveCount(1);

    // 同種別（本文2件）は組まない
    await page.locator('[data-library-search]').fill(dupTitle);
    await expect(cards, '本文2件だけ → 2枚（誤結合しない）').toHaveCount(2);
    await expect(page.locator('[data-library-artifact-tab]')).toHaveCount(0);
    await expect(page.locator('[data-library-estimated]')).toHaveCount(0);
  } finally {
    await request.delete(LIBRARY_API, { data: { ids } }).catch(() => {});
    await cleanupE2ELibrary(request);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 288: R-45違反の一括是正（S区分29件）— 主要画面の整形表示を共通ヘルパーで判定
// ───────────────────────────────────────────────────────────────────────────
test('C89: 発信ハブのX投稿（288）— ③X投稿連動の本文/URLリプ/スレッドと、記事→X時間差展開の各型が整形表示され生MDが露出しない（APIモック）・コピーは原文のまま', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  await stubFeatureDrafts(page);
  const ARTICLE_ID = 'e2e-288-article';
  await page.route((url) => url.pathname === '/api/library' && url.searchParams.get('type') === 'deepresearch', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
  await page.route((url) => url.pathname === '/api/library' && url.searchParams.get('type') === 'note-article', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: ARTICLE_ID, title: '[E2E] 288 保湿の基本', content: '保湿の順番と量の話。', created_at: '2026-08-26' }]) }),
  );
  const single = '## 朝の保湿\n\n**3分以内**に化粧水→乳液→クリーム。\n\n- 量は指先1関節ぶん\n- 続けやすさが最優先\n\n#スキンケア';
  await page.route('**/api/dr-hub/x-post', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, single, thread: [single, '**まとめ**です'], urlReplyLeadin: '本文で触れた記事の全文はこちらです', warnings: { single: [] }, xLength: 'mini', postType: String(body.postType ?? 'knowhow'), charLimit: 25000 }),
    });
  });

  await page.goto('/dashboard/dr-hub');
  // ── ③ X投稿連動 ──
  await page.getByRole('button', { name: /X投稿連動/ }).click();
  await page.locator('select').filter({ hasText: '連動元のnote記事を選ぶ' }).selectOption(ARTICLE_ID);
  await page.getByRole('button', { name: /X投稿を生成する/ }).click();
  const body = page.locator('[data-x-single-body]');
  await expect(body).toBeVisible({ timeout: 30000 });
  await expect(body.locator(':is(h1,h2,h3,h4)').filter({ hasText: '朝の保湿' }), '見出しがhタグ').toBeVisible();
  await expect(body.locator('strong').filter({ hasText: '3分以内' }), '太字がstrong').toBeVisible();
  await expect(body.locator('li').filter({ hasText: '指先1関節' }), '箇条書きがli').toBeVisible();
  await expect(body, 'ハッシュタグ（# の後に空白なし）は見出しにならず文字として残る').toContainText('#スキンケア');
  await expectNoRawMarkdown(body, 'X投稿本文');
  // スレッドの各投稿も整形
  const views = page.locator('[data-md-view]');
  expect(await views.count()).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < (await views.count()); i++) await expectNoRawMarkdown(views.nth(i), `dr-hub 整形ブロック${i}`);
  // R-71: コピーは表示用レンダラの変換を経ず原文（MD記法のまま）
  await page.getByRole('button', { name: /^📋 コピー$/ }).first().click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip, 'コピーは原文のまま（表示用の変換を流用しない）').toContain('**3分以内**');

  // ── 記事→X時間差展開（XFanoutTab） ──
  await page.getByRole('button', { name: /記事→X時間差展開/ }).click();
  await expect(page.locator('[data-fanout-root]')).toBeVisible();
  await page.locator('[data-fanout-article]').selectOption(ARTICLE_ID);
  await page.locator('[data-fanout-run]').click();
  const fan = page.locator('[data-fanout-body]');
  await expect(fan.first()).toBeVisible({ timeout: 60000 });
  await expect(fan.first().locator('strong').filter({ hasText: '3分以内' })).toBeVisible();
  for (let i = 0; i < (await fan.count()); i++) await expectNoRawMarkdown(fan.nth(i), `時間差展開 型${i}`);
});

test('C90: Kindle出版のチャット（288）— 完了したAI返答は整形表示・利用者の発言は生のまま（APIモック）', async ({ page }) => {
  await stubFeatureDrafts(page);
  const BOOK_ID = 424242;
  const aiText = '## Phase 1: 市場分析\n\n**ジャンル候補**を3つ挙げます。\n\n- 投資・お金\n- 健康・美容\n- 子育て';
  const userText = 'こちらは**利用者**の発言 **そのまま**';
  await page.route((url) => url.pathname === '/api/kindle', async (route) => {
    const method = route.request().method();
    const id = new URL(route.request().url()).searchParams.get('id');
    if (method === 'GET' && !id) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ books: [{ id: BOOK_ID, title: '[E2E] 288 モック本', language: 'ja', targetWordCount: 30000, currentWordCount: 0, status: 'draft', phase: 1 }] }) });
    if (method === 'GET' && id) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ book: { id: BOOK_ID, title: '[E2E] 288 モック本', language: 'ja', targetWordCount: 30000, currentWordCount: 0, status: 'draft', phase: 1, messages: [{ role: 'assistant', content: aiText, timestamp: '2026-09-01T00:00:00.000Z' }, { role: 'user', content: userText, timestamp: '2026-09-01T00:01:00.000Z' }] }, chapters: [] }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/kindle/chapters**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chapters: [] }) }));
  await page.goto('/dashboard/kindle');
  await page.getByText('[E2E] 288 モック本').first().click();
  const ai = page.locator('[data-md-view]').first();
  await expect(ai).toBeVisible({ timeout: 30000 });
  await expect(ai.locator(':is(h1,h2,h3,h4)').filter({ hasText: 'Phase 1' }), 'AI返答の見出しがhタグ').toBeVisible();
  await expect(ai.locator('strong').filter({ hasText: 'ジャンル候補' }), 'AI返答の太字がstrong').toBeVisible();
  await expect(ai.locator('li')).toHaveCount(3);
  await expectNoRawMarkdown(ai, 'Kindleチャット AI返答');
  // 利用者の発言は raw（整形しない）＝ ** が文字として残る
  await expect(page.getByText(userText, { exact: true }), '利用者の発言は生のまま').toBeVisible();
});

// ───────────────────────────────────────────────────────────────────────────
// 289: 比較の列数・高さを手動で選べる
// ───────────────────────────────────────────────────────────────────────────
test('C91: 横並び比較の列数・高さ（289）— 既定は自動/高・1000pxでも4列を選べて横スクロールなし・2列は2×2・低プリセットで4枚が1画面・保持・同期スクロールとsticky', async ({ page }) => {
  await stubFeatureDrafts(page);
  await stubBatchCompare(page);
  await page.goto('/dashboard/deepresearch');
  await page.evaluate(() => {
    localStorage.removeItem('lumina_batch_compare_mode');
    localStorage.removeItem('lumina_batch_compare_cols');
    localStorage.removeItem('lumina_batch_compare_height');
    localStorage.setItem('lumina_text_scale', '100');
  });
  const col = (i: number) => page.locator(`[data-compare-col="${i}"]`);
  const grid = page.locator('[data-compare-cols]');
  const ys = async () => {
    const read = () => page.evaluate(() => [0, 1, 2, 3].map((i) => Math.round(document.querySelector(`[data-compare-col="${i}"]`)!.getBoundingClientRect().y)));
    let prev = await read();
    for (let n = 0; n < 20; n++) { await page.waitForTimeout(150); const cur = await read(); if (cur.join() === prev.join()) return cur; prev = cur; }
    return prev;
  };
  const noHScroll = async (label: string) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${label}: ページに横スクロールが出ていないこと`).toBeLessThanOrEqual(1);
  };
  const checkSyncAndSticky = async (label: string) => {
    for (let i = 1; i < 4; i++) await col(i).evaluate((el) => { el.scrollTop = 0; });
    await col(0).evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
    for (let i = 1; i < 4; i++) await expect.poll(async () => col(i).evaluate((el) => el.scrollTop), `${label}: 列${i}が同期`).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) {
      const header = page.locator(`[data-compare-header="${i}"]`);
      expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
      const c = await col(i).boundingBox(); const h = await header.boundingBox();
      expect(c && h && h.y - c.y, `${label}: 列${i}のヘッダーが上端に固定`).toBeLessThan(4);
    }
    for (let i = 0; i < 4; i++) await col(i).evaluate((el) => { el.scrollTop = 0; });
  };

  // ── ① 既定: 列数=自動・高さ=高（68vh）。1000px幅の自動は2列（従来どおり）──
  await page.setViewportSize({ width: 1000, height: 900 });
  await openBatchCompare(page);
  await expect(page.locator('[data-compare-cols-choice="auto"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-compare-height-choice="high"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(grid).toHaveAttribute('data-compare-cols-mode', 'auto');
  const maxH = await col(0).evaluate((el) => getComputedStyle(el).maxHeight);
  expect(Math.round(parseFloat(maxH)), '既定の高さは68vh相当').toBe(Math.round(900 * 0.68));
  let y = await ys();
  expect(y[0]).toBe(y[1]); expect(y[2]).toBeGreaterThan(y[0]);

  // ── ② 1000px でも 4列を選べる（制限・警告なし）→ 実際に4列・横スクロールなし ──
  await expect(page.locator('[data-compare-cols-choice="4"]')).toBeEnabled();
  await page.locator('[data-compare-cols-choice="4"]').click();
  await expect(grid).toHaveAttribute('data-compare-cols', '4');
  await expect(grid).toHaveAttribute('data-compare-cols-mode', 'manual');
  y = await ys();
  expect(new Set(y).size, `1000pxでも4列に並ぶ（y=${y.join(',')}）`).toBe(1);
  await noHScroll('1000px・4列');
  await expect(page.locator('[data-batch-compare]')).not.toContainText(/警告|収まりません|狭すぎ/);
  await checkSyncAndSticky('4列');
  // 3列 → 3+1
  await page.locator('[data-compare-cols-choice="3"]').click();
  y = await ys();
  expect(y[0]).toBe(y[1]); expect(y[1]).toBe(y[2]); expect(y[3]).toBeGreaterThan(y[0]);
  // 1列 → 縦4段
  await page.locator('[data-compare-cols-choice="1"]').click();
  y = await ys();
  expect(y[0] < y[1] && y[1] < y[2] && y[2] < y[3]).toBe(true);

  // ── ③ 2列 × 低 → 4枚が1画面に収まる ──
  await page.locator('[data-compare-cols-choice="2"]').click();
  await page.locator('[data-compare-height-choice="low"]').click();
  await expect(grid).toHaveAttribute('data-compare-height', 'low');
  await grid.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  const boxes = await page.evaluate(() => [0, 1, 2, 3].map((i) => { const r = document.querySelector(`[data-compare-col="${i}"]`)!.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; }));
  const vh = await page.evaluate(() => window.innerHeight);
  expect(boxes[0].top, '1行目が画面内').toBeGreaterThanOrEqual(0);
  expect(boxes[3].bottom, `低プリセットの2×2は4枚が1画面（${vh}px）に収まる: ${JSON.stringify(boxes)}`).toBeLessThanOrEqual(vh);
  expect(boxes[0].top).toBe(boxes[1].top); expect(boxes[2].top).toBe(boxes[3].top);
  // 低でもヘッダーが本文を食い尽くさない（ヘッダーは列の高さの半分未満）
  const hh = await page.locator('[data-compare-header="0"]').evaluate((el) => el.getBoundingClientRect().height);
  expect(hh / (boxes[0].bottom - boxes[0].top), '低プリセットでヘッダーが列の半分未満').toBeLessThan(0.5);
  await checkSyncAndSticky('2×2・低');
  await noHScroll('2×2・低');
  // 最大 → 画面に近い高さ
  await page.locator('[data-compare-height-choice="max"]').click();
  expect(Math.round(parseFloat(await col(0).evaluate((el) => getComputedStyle(el).maxHeight)))).toBe(Math.round(900 * 0.92));

  // ── ④ 選んだ列数・高さは次回も保持される ──
  await page.locator('[data-compare-height-choice="low"]').click();
  await openBatchCompare(page);
  await expect(page.locator('[data-compare-cols-choice="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-compare-height-choice="low"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(grid).toHaveAttribute('data-compare-cols', '2');
  // 自動に戻せる
  await page.locator('[data-compare-cols-choice="auto"]').click();
  await expect(grid).toHaveAttribute('data-compare-cols-mode', 'auto');
});

test('C92: Gemini と Claude Opus 5 の並列比較（290）— 2本のリクエスト・列ヘッダーにモデル名・整形表示（R-97）・高さ/同期/sticky（289/271）・列ごとの保存（タイトル/タグ/metadataにモデル）・Claude失敗は理由表示でGeminiへ切り替えない（R-99）・他方は無事（R-39）・二重押しで増えない（R-87）・通常開始は1本で不変（R-88）', async ({ page }) => {
  await stubFeatureDrafts(page); // R-12: 下書き復元（通常・比較とも同じAPI）を固定
  // 完了後に走る付随AI・履歴・分類はモックして課金も書き込みもさせない
  for (const pattern of ['**/api/knowledge/**', '**/api/glossary/research-extract', '**/api/deepresearch/insights', '**/api/deepresearch/query-history', '**/api/library/auto-categorize']) {
    await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  }
  // 保存先はモック（本番ライブラリに書かない）。保存要求の中身（タイトル・タグ・metadata）を検証する
  const libraryPosts: { title?: string; tags?: string; content?: string; metadata?: Record<string, unknown> }[] = [];
  await page.route('**/api/library', async (route) => {
    if (route.request().method() === 'POST') {
      libraryPosts.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'e2e-mock' }) });
      return;
    }
    await route.fallback();
  });
  // 生成SSEをモック（AI課金なし）。compare の値で3経路（Gemini成功／Opus成功 or 失敗／通常）を返す
  const posts: { compare?: unknown; model?: string; topic?: string }[] = [];
  const sse = (events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const longBody = (name: string) =>
    `## ${name}の見出し\n\n**要点**をまとめます。\n\n${`${name}の本文行です。`.repeat(90)}\n\n### ${name}の小見出し\n\n- 箇条書きその1\n- 箇条書きその2\n\n${`さらに${name}の説明が続きます。`.repeat(90)}`;
  await page.route('**/api/deepresearch', async (route) => {
    const body = route.request().postDataJSON() as { compare?: unknown; model?: string; topic?: string };
    posts.push({ compare: body.compare, model: body.model, topic: body.topic });
    await new Promise((r) => setTimeout(r, 400)); // 「実行中」の時間を作る（二重押しの判定用）
    const side = body.compare;
    if (side === 'opus' && /失敗ケース/.test(body.topic ?? '')) {
      // Claude 側が上限で落ちたケース。サーバーは Gemini で代替せず error を返す（R-99）
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse([
          { type: 'start' },
          { side, type: 'meta', model: 'claude-opus-5', label: 'Claude Opus 5' },
          { side, type: 'error', message: 'AIの利用上限に達しています（アプリの不具合ではありません）。／原文: [E2E] usage limits' },
        ]),
      });
      return;
    }
    if (side === 'gemini' || side === 'opus') {
      const name = side === 'gemini' ? 'Gemini' : 'Opus';
      const text = longBody(name);
      const chunks = text.match(/[\s\S]{1,200}/g) ?? [];
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse([
          { type: 'start' },
          { side, type: 'meta', model: side === 'gemini' ? 'gemini-3.7-flash' : 'claude-opus-5' },
          // 実サーバーと同じ形: Gemini 側は streamWithModel の 'delta'、Opus 側は 'text'
          ...chunks.map((c) => (side === 'gemini' ? { side, type: 'delta', text: c } : { side, type: 'text', content: c })),
          { side, type: 'done', model: side === 'gemini' ? 'gemini-3.7-flash' : 'claude-opus-5', elapsedMs: 12345, usage: { input_tokens: 1000, output_tokens: 2000 } },
        ]),
      });
      return;
    }
    // 通常経路（compare なし）: 従来どおりの SSE
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse([{ type: 'start' }, { type: 'text', content: '## 通常の結果\n\n通常経路の本文です。' }, { type: 'done', usage: { input_tokens: 1, output_tokens: 1 } }]),
    });
  });

  await page.setViewportSize({ width: 1280, height: 900 }); // md 以上＝2列
  await page.goto('/dashboard/deepresearch');
  await page.evaluate(() => {
    localStorage.removeItem('lumina_batch_compare_height');
    localStorage.setItem('lumina_auto_stock_save', '0'); // 通常経路の自動保存はこのテストの対象外（DBに書かない）
    localStorage.setItem('lumina_text_scale', '100');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForRunReady(page); // R-12: ハイドレーション完了を待ってから fill する
  const topic = page.getByPlaceholder(/調査したいテーマを詳しく入力してください/);
  const compareBtn = page.locator('button[data-compare-run]');
  const panel = page.locator('[data-model-compare]');
  const col = (i: number) => page.locator(`[data-compare-col="${i}"]`);
  const sideCol = (s: string) => page.locator(`[data-compare-model="${s}"]`);

  await expect(compareBtn, 'ボタンにモデル名が分かる表記（§5-1）').toContainText(/Gemini 3\.7 Flash と Claude Opus 5/);
  await expect(compareBtn, '未入力では押せない').toBeDisabled();
  await topic.fill('[E2E] 比較の検証');
  await expect(topic, '入力がstateに入っている前提').toHaveValue('[E2E] 比較の検証');
  await expect(compareBtn).toBeEnabled();

  // ── ① 両方成功: 2本のリクエスト（1本にまとまっていない・§4-1）。二重押しで増えない（R-87） ──
  await compareBtn.click();
  await compareBtn.click({ force: true, noWaitAfter: true }).catch(() => {});
  await expect(panel).toBeVisible();
  await expect(sideCol('gemini'), '実行中→完了の状態が列に出る').toHaveAttribute('data-compare-status', 'done', { timeout: 20000 });
  await expect(sideCol('opus')).toHaveAttribute('data-compare-status', 'done', { timeout: 20000 });
  const comparePosts = posts.filter((p) => p.compare);
  expect(comparePosts.length, '比較は2本のリクエスト（二重押ししても増えない）').toBe(2);
  expect(comparePosts.map((p) => String(p.compare)).sort()).toEqual(['gemini', 'opus']);
  expect(posts.filter((p) => !p.compare).length, '比較ボタンで通常経路は走らない').toBe(0);

  // 列ヘッダーにモデル名（§5-3）
  await expect(page.locator('[data-compare-model-label="gemini"]')).toContainText('Gemini 3.7 Flash');
  await expect(page.locator('[data-compare-model-label="opus"]')).toContainText('Claude Opus 5');
  await expect(page.locator('[data-compare-model-label="opus"]'), 'モデルIDも併記').toContainText('claude-opus-5');
  await expect(page.locator('[data-compare-status-label="gemini"]')).toContainText('完了');

  // 整形表示（R-45/R-97）: 生MD記法が露出せず見出しがタグになっている
  await expect(col(0)).toContainText('Geminiの本文行です。');
  await expect(col(1)).toContainText('Opusの本文行です。');
  for (const i of [0, 1]) {
    await expectNoRawMarkdown(col(i).locator('[data-md-view]'), `比較列${i}`);
    expect(await col(i).locator('h2, h3, h4').count(), `列${i}の見出しがHTMLタグ`).toBeGreaterThan(0);
  }
  // 使用量（§6-3）: 所要・文字数・トークン
  await expect(page.locator('[data-compare-usage="gemini"]')).toContainText(/所要 12秒 ／ [\d,]+字 ／ 入力 1,000 tok ／ 出力 2,000 tok/);

  // 2列固定（列数UIは無い）・同じ行に並ぶ
  const grid = page.locator('[data-model-compare] [data-compare-cols]');
  await expect(grid).toHaveAttribute('data-compare-cols', '2');
  await expect(page.locator('[data-model-compare] [data-compare-cols-picker]'), '2件固定なので列数の選択UIは置かない').toHaveCount(0);
  const ys = await page.evaluate(() => [0, 1].map((i) => Math.round(document.querySelector(`[data-compare-col="${i}"]`)!.getBoundingClientRect().y)));
  expect(ys[0], '2列が横に並ぶ').toBe(ys[1]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'ページに横スクロールが出ない').toBeLessThanOrEqual(1);

  // 高さプリセット（289）: 既定 高(68vh) → 低(34vh)
  const maxH = () => col(0).evaluate((el) => Math.round(parseFloat(getComputedStyle(el).maxHeight)));
  await expect(page.locator('[data-model-compare] [data-compare-height-choice="high"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await maxH(), '既定の高さは68vh相当').toBe(Math.round(900 * 0.68));
  await page.locator('[data-model-compare] [data-compare-height-choice="low"]').click();
  await expect(grid).toHaveAttribute('data-compare-height', 'low');
  expect(await maxH(), '低プリセットは34vh相当').toBe(Math.round(900 * 0.34));

  // 同期スクロール（271・割合ベース）と sticky
  await col(1).evaluate((el) => { el.scrollTop = 0; });
  await col(0).evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
  await expect.poll(() => col(1).evaluate((el) => el.scrollTop), '列0を送ると列1も動く').toBeGreaterThan(0);
  for (const i of [0, 1]) {
    const header = page.locator(`[data-compare-header="${i}"]`);
    expect(await header.evaluate((el) => getComputedStyle(el).position), `列${i}のヘッダーがsticky`).toBe('sticky');
    const c = await col(i).boundingBox();
    const h = await header.boundingBox();
    expect(c && h && h.y - c.y, `列${i}のヘッダーが上端に固定`).toBeLessThan(4);
  }
  const before = await col(1).evaluate((el) => el.scrollTop);
  await page.locator('[data-model-compare] [data-compare-sync]').uncheck();
  await col(0).evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(200);
  expect(await col(1).evaluate((el) => el.scrollTop), 'OFFにすると他列は動かない').toBe(before);

  // 保存（§5-5/§5-6）: 列ごとに保存でき、タイトル・タグ・metadata でどのモデルか分かる
  await expect(page.locator('[data-compare-save="gemini"]').getByRole('button', { name: '📚 リサーチ保存に追加' })).toBeVisible();
  await page.locator('[data-compare-save="opus"]').getByRole('button', { name: '📚 リサーチ保存に追加' }).click();
  await expect.poll(() => libraryPosts.length).toBe(1);
  expect(libraryPosts[0].title, 'タイトルにモデル名（286の同題ペアリングから外れる）').toBe('[E2E] 比較の検証［Claude Opus 5］');
  expect(String(libraryPosts[0].tags)).toContain('ディープリサーチ');
  expect(String(libraryPosts[0].tags)).toContain('model:claude-opus-5');
  expect(libraryPosts[0].metadata?.model).toBe('claude-opus-5');
  expect(libraryPosts[0].metadata?.compare).toBe(true);
  expect(libraryPosts[0].content).toContain('Opusの本文行です。');
  await expect(page.locator('[data-compare-save="opus"]').getByRole('button', { name: '✅ 保存済み' })).toBeVisible();
  expect(libraryPosts.length, 'Gemini 側は押していないので保存されない（片方だけ保存できる）').toBe(1);

  // ── ② Claude 側が失敗: 理由を表示・Gemini へ切り替えない（R-99）・Gemini 側は無事（R-39） ──
  await page.locator('[data-model-compare] [data-compare-close]').click();
  await expect(panel).toHaveCount(0);
  await topic.fill('[E2E] 比較の失敗ケース');
  await compareBtn.click();
  await expect(sideCol('opus')).toHaveAttribute('data-compare-status', 'error', { timeout: 20000 });
  await expect(sideCol('gemini')).toHaveAttribute('data-compare-status', 'done', { timeout: 20000 });
  await expect(page.locator('[data-compare-error="opus"]'), '失敗の理由が表示される（空欄にしない）').toContainText('AIの利用上限に達しています');
  await expect(page.locator('[data-compare-status-label="opus"]')).toContainText('失敗');
  await expect(sideCol('opus'), 'Opus列に Gemini の本文が入らない（切り替えない）').not.toContainText('Geminiの本文行です。');
  await expect(sideCol('opus'), '「✨…で生成」の代替表示が無い').not.toContainText('で生成');
  await expect(page.locator('[data-compare-model-label="opus"]'), 'ヘッダーは Opus のまま').toContainText('Claude Opus 5');
  await expect(page.locator('[data-compare-save="opus"]'), '失敗した列に保存ボタンは出ない').toHaveCount(0);
  await expect(sideCol('gemini'), 'Gemini 側は巻き添えにならない').toContainText('Geminiの本文行です。');
  await expect(page.locator('[data-compare-save="gemini"]')).toHaveCount(1);
  expect(posts.filter((p) => p.compare).length).toBe(4);

  // ── ③ 通常の「開始」は不変（R-88）: 1本・compare フラグなし・従来の結果表示 ──
  await page.locator('[data-model-compare] [data-compare-close]').click();
  await topic.fill('[E2E] 通常のお題');
  await page.locator('button[data-kb-run]').click();
  await expect(page.getByText('通常経路の本文です。')).toBeVisible({ timeout: 20000 });
  const normal = posts.filter((p) => !p.compare);
  expect(normal.length, '通常開始は1本').toBe(1);
  expect(normal[0].compare, 'compare フラグが載らない').toBeUndefined();
  expect(posts.length).toBe(5);
  await expect(panel, '通常開始で比較パネルは出ない').toHaveCount(0);
});

test('C93: /api/deepresearch の compare は gemini／opus 以外なら 400（290）— 黙って従来経路に倒さない', async ({ request }) => {
  const res = await request.post('/api/deepresearch', { data: { topic: '[E2E] compare検証', depth: 'quick', compare: 'claude' } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toContain('compare');
});

test('C94: 追従🗒カテゴリメモ（208）— 既定off・🎛表示設定に導線・onでDR画面右下に4つ目として出て他と重ならない（1280/375px）・fixed追従・非モーダル・新規カテゴリ→選択・保存→トーストにカテゴリ名→一覧・お題が紐付く・絞り込み・編集・カテゴリ削除でメモは未分類に残る・削除は2段階', async ({ page }) => {
  // 2幅×4追従の描画待ち＋実API往復×10段で 60秒の既定を超える（初回本番実測 1分超）ため個別に延ばす
  test.setTimeout(180_000);
  await stubFeatureDrafts(page);
  const marker = RUN_ID;
  const FAB_ICONS = ['💬', '📝', '🗒', '📖'];
  const fabRects = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((b) => {
          const s = getComputedStyle(b);
          const r = b.getBoundingClientRect();
          return s.position === 'fixed' && Math.round(r.width) === Math.round(r.height) && r.width >= 44 && r.width <= 60;
        })
        .map((b) => ({ text: (b.textContent || '').trim(), bottom: Math.round(window.innerHeight - b.getBoundingClientRect().bottom) }))
        .sort((a, b) => a.bottom - b.bottom),
    );

  // ── ① 既定 off: DR画面に 🗒 が出ない（R-48） ──
  await page.goto('/dashboard/deepresearch');
  await page.evaluate(() => localStorage.removeItem('lumina_floating_buttons'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForRunReady(page);
  await expect(page.locator('[data-drmemo-fab]')).toHaveCount(0);

  // ── ② 🎛表示設定に導線があり、チェックで on になる ──
  await page.goto('/dashboard/display-settings');
  const toggle = page.getByRole('checkbox', { name: 'カテゴリメモを表示する' });
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lumina_floating_buttons') || '{}').drmemo)).toBe(true);

  // ── ③ 全部 on: 4つが縦に並び重ならない（1280px と 375px）。既存3つも壊れていない ──
  await page.evaluate(() => localStorage.setItem('lumina_floating_buttons', JSON.stringify({ assistant: true, memo: true, drmemo: true, glossary: true })));
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/dashboard/deepresearch');
    const fab = page.locator('[data-drmemo-fab]');
    await expect(fab, `${width}px で 🗒 が出る`).toBeVisible();
    await expect.poll(async () => (await fabRects()).filter((r) => FAB_ICONS.includes(r.text)).length, `${width}px で追従4つ`).toBe(4);
    const fabs = (await fabRects()).filter((r) => FAB_ICONS.includes(r.text));
    expect(fabs.map((r) => r.text), `${width}px: 下から 💬→📝→🗒→📖`).toEqual(FAB_ICONS);
    for (let i = 1; i < fabs.length; i++) expect(fabs[i].bottom - fabs[i - 1].bottom, `${width}px: 隣と重ならない`).toBeGreaterThanOrEqual(48);
    expect(await fab.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  }

  // ── ④ 開く: 非モーダル（背後の入力欄が使える）・fixed・お題が表示される ──
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard/deepresearch');
  await waitForRunReady(page);
  const topicInput = page.getByPlaceholder(/調査したいテーマを詳しく入力してください/);
  await topicInput.fill(`[E2E] お題 ${marker}`);
  await page.locator('[data-drmemo-fab]').click();
  const panel = page.locator('[data-drmemo-panel]');
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  await expect(panel).toHaveAttribute('aria-modal', 'false');
  // R-48: パネルが追従ボタン列（4つ全部 on）と交差しない＝上段のボタンが行末の🗑を覆わない（機械判定）
  {
    const pb = (await panel.boundingBox())!;
    const fabBoxes = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .filter((b) => getComputedStyle(b).position === 'fixed' && ['💬', '📝', '🗒', '📖'].includes((b.textContent || '').trim()))
        .map((b) => { const r = b.getBoundingClientRect(); return { text: (b.textContent || '').trim(), x: r.x, y: r.y, w: r.width, h: r.height }; }),
    );
    expect(fabBoxes.length).toBe(4);
    for (const f of fabBoxes) {
      const overlap = f.x < pb.x + pb.width && f.x + f.w > pb.x && f.y < pb.y + pb.height && f.y + f.h > pb.y;
      expect(overlap, `${f.text} がパネルに重ならない`).toBe(false);
    }
  }
  await expect(panel.locator('[data-drmemo-context]')).toContainText(`[E2E] お題 ${marker}`);
  await topicInput.fill(`[E2E] お題 ${marker} 追記`);
  await expect(topicInput, '開いたまま背後の入力欄が使える').toHaveValue(`[E2E] お題 ${marker} 追記`);
  await expect(panel.locator('[data-drmemo-context]'), 'お題の変更に追随').toContainText('追記');
  // 追従: 本文をスクロールしてもボタンの位置（下端からの距離）が変わらない
  const bottomOf = () => page.locator('[data-drmemo-fab]').evaluate((el) => Math.round(window.innerHeight - el.getBoundingClientRect().bottom));
  const b0 = await bottomOf();
  await page.evaluate(() => {
    const m = document.querySelector('main');
    if (m) m.scrollTop = 400;
    window.scrollTo(0, 400);
  });
  await page.waitForTimeout(200);
  expect(await bottomOf(), 'スクロールしても追従する').toBe(b0);

  // ── ⑤ 新規カテゴリ → 作成 → 選択状態 ──
  await panel.locator('[data-drmemo-newcat]').click();
  await panel.locator('[data-drmemo-newcat-input]').fill(`[E2E] カテゴリ ${marker}`);
  await panel.locator('[data-drmemo-newcat-create]').click();
  const catChip = panel.locator('[data-drmemo-cat]', { hasText: `[E2E] カテゴリ ${marker}` });
  await expect(catChip).toHaveAttribute('aria-pressed', 'true');
  const catId = (await catChip.getAttribute('data-drmemo-cat'))!;
  expect(catId).toMatch(/^[0-9a-f-]{36}$/);

  // ── ⑥ 保存 → トーストにカテゴリ名 → 一覧に出る → お題が紐付く（API でも確認） ──
  await panel.locator('[data-drmemo-input]').fill(`[E2E] メモ本文 ${marker}`);
  await panel.locator('[data-drmemo-save]').click();
  await expect(page.getByText(`「[E2E] カテゴリ ${marker}」に保存しました`)).toBeVisible();
  const item = panel.locator('[data-drmemo-item]', { hasText: `[E2E] メモ本文 ${marker}` });
  await expect(item).toBeVisible();
  await expect(item.locator('[data-drmemo-item-context]')).toContainText(`[E2E] お題 ${marker} 追記`);
  await expect(panel.locator('[data-drmemo-input]'), '保存後は入力欄が空になる').toHaveValue('');
  await expect(catChip, '件数が増える').toContainText('1');
  const memoId = (await item.getAttribute('data-drmemo-item'))!;
  const listed = (await (await api.get(`/api/memos?category_id=${catId}&limit=30`)).json()).memos as { id: string; category_id: string | null; context_ref: string | null }[];
  const mine = listed.find((m) => m.id === memoId);
  expect(mine?.category_id).toBe(catId);
  expect(mine?.context_ref).toBe(`[E2E] お題 ${marker} 追記`);

  // ── ⑦ 絞り込み: 未分類に切り替えると消え、戻すと出る ──
  await panel.locator('[data-drmemo-cat="none"]').click();
  await expect(panel.locator('[data-drmemo-cat="none"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(item).toHaveCount(0);
  await panel.locator(`[data-drmemo-cat="${catId}"]`).click();
  await expect(item).toBeVisible();

  // ── ⑧ 編集 ──
  await item.locator('[data-drmemo-edit]').click();
  await item.locator('textarea').fill(`[E2E] メモ本文 ${marker} 修正済`);
  await item.locator('[data-drmemo-edit-save]').click();
  // 偽の緑を防ぐ（R-12）: 編集中の textarea の文字でも hasText が一致してしまうため、
  // 「編集モードが閉じた」→「表示側の本文が変わった」→「APIでも変わった」の順に判定する
  await expect(item.locator('textarea'), '保存で編集モードが閉じる（PATCH が成功している）').toHaveCount(0);
  const edited = panel.locator('[data-drmemo-item]', { hasText: `[E2E] メモ本文 ${marker} 修正済` });
  await expect(edited).toBeVisible();
  await expect(edited.locator('textarea')).toHaveCount(0);
  const afterEdit = (await (await api.get(`/api/memos?category_id=${catId}&limit=30`)).json()).memos as { id: string; raw_text: string }[];
  expect(afterEdit.find((m) => m.id === memoId)?.raw_text, 'API でも本文が更新されている').toBe(`[E2E] メモ本文 ${marker} 修正済`);

  // ── ⑨ カテゴリ削除（2段階・「メモは未分類に移動」を明示）→ メモは未分類に残る ──
  await panel.locator('[data-drmemo-manage]').click();
  const row = panel.locator(`[data-drmemo-cat-row="${catId}"]`);
  await expect(row).toBeVisible();
  await row.locator('[data-drmemo-cat-delete]').click();
  await expect(row).toContainText('メモは未分類に移動します');
  await row.locator('[data-drmemo-cat-delete-confirm]').click();
  await expect(panel.locator(`[data-drmemo-cat="${catId}"]`)).toHaveCount(0);
  await expect(panel.locator('[data-drmemo-cat="none"]'), '消したカテゴリを見ていたら未分類へ').toHaveAttribute('aria-pressed', 'true');
  await expect(edited, 'メモは消えず未分類に残る').toBeVisible();
  const after = (await (await api.get(`/api/memos?uncategorized=1&limit=100`)).json()).memos as { id: string; category_id: string | null }[];
  expect(after.find((m) => m.id === memoId)?.category_id, 'DB でも category_id が NULL').toBeNull();

  // ── ⑩ メモ削除は2段階 ──
  await edited.locator('[data-drmemo-delete]').click();
  await expect(edited.locator('[data-drmemo-delete-confirm]')).toBeVisible();
  await edited.locator('[data-drmemo-delete-confirm]').click();
  await expect(edited).toHaveCount(0);

  // ── ⑪ 閉じる → 設定を既定に戻す（他テストに影響させない） ──
  await page.locator('[data-drmemo-close]').click();
  await expect(panel).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem('lumina_floating_buttons'));
});

test('C95: カテゴリメモAPI（208）— 未認証は401・本文空/不正uuidは400・他人のカテゴリは404で秘匿・context_ref正規化・絞り込みとページング（limit+1でhas_more）・従来の全件形は不変・カテゴリ件数・並び替え・メモのカテゴリ変更・カテゴリ削除でメモは残りSET NULL', async () => {
  // 未認証（R-32: storageState を空にして叩く）
  const anon = await pwRequest.newContext({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
  expect((await anon.get('/api/memos?limit=1')).status()).toBe(401);
  expect((await anon.post('/api/memos', { data: { raw_text: '[E2E] x' } })).status()).toBe(401);
  expect((await anon.get('/api/memo-categories')).status()).toBe(401);
  await anon.dispose();

  // 入力検証
  expect((await api.post('/api/memos', { data: { raw_text: '   ' } })).status(), '本文空は400').toBe(400);
  expect((await api.post('/api/memos', { data: { raw_text: '[E2E] x', category_id: 'not-a-uuid' } })).status(), '不正uuidは400').toBe(400);
  expect((await api.post('/api/memos', { data: { raw_text: '[E2E] x', category_id: '00000000-0000-4000-8000-000000000000' } })).status(), '存在しない/他人のカテゴリは404').toBe(404);
  expect((await api.post('/api/memo-categories', { data: { name: '  ' } })).status(), 'カテゴリ名空は400').toBe(400);

  const catA = await createMemoCategory(api, `カテゴリA ${RUN_ID}`);
  const catB = await createMemoCategory(api, `カテゴリB ${RUN_ID}`);
  const m1 = await createMemo(api, { text: `m1 ${RUN_ID}`, categoryId: catA.id, contextRef: `  お題  ${RUN_ID}  ` });
  expect(m1.category_id).toBe(catA.id);
  expect(m1.context_ref, 'context_ref は空白を畳んで保存').toBe(`お題 ${RUN_ID}`);
  const m2 = await createMemo(api, { text: `m2 ${RUN_ID}`, categoryId: catA.id });
  const m3 = await createMemo(api, { text: `m3 ${RUN_ID}` });
  expect(m3.category_id).toBeNull();
  expect(m3.context_ref).toBeNull();

  // 絞り込み＋ページング（limit+1 で has_more）
  const p1 = await (await api.get(`/api/memos?category_id=${catA.id}&limit=1`)).json();
  expect(p1.memos).toHaveLength(1);
  expect(p1.has_more).toBe(true);
  expect(p1.todos, 'ページング時は todos を返さない').toEqual([]);
  const p2 = await (await api.get(`/api/memos?category_id=${catA.id}&limit=1&offset=1`)).json();
  expect(p2.memos).toHaveLength(1);
  expect(p2.has_more).toBe(false);
  expect(new Set([p1.memos[0].id, p2.memos[0].id])).toEqual(new Set([m1.id, m2.id]));
  const un = await (await api.get('/api/memos?uncategorized=1&limit=100')).json();
  expect((un.memos as { id: string }[]).some((m) => m.id === m3.id)).toBe(true);
  expect((un.memos as { category_id: string | null }[]).every((m) => m.category_id === null)).toBe(true);
  // 従来（limit なし）は memos＋todos の形のまま（/dashboard/memo を壊さない）
  const legacy = await (await api.get('/api/memos')).json();
  expect(Array.isArray(legacy.todos)).toBe(true);
  expect(legacy.has_more).toBeUndefined();

  // カテゴリ件数
  const cats = (await (await api.get('/api/memo-categories')).json()).categories as { id: string; memo_count: number; sort_order: number }[];
  expect(cats.find((c) => c.id === catA.id)?.memo_count).toBe(2);
  expect(cats.find((c) => c.id === catB.id)?.memo_count).toBe(0);

  // 並び替え: B を A の前へ
  expect((await api.patch('/api/memo-categories', { data: { id: catB.id, sort_order: -1 } })).status()).toBe(200);
  const ordered = ((await (await api.get('/api/memo-categories')).json()).categories as { id: string }[]).map((c) => c.id);
  expect(ordered.indexOf(catB.id)).toBeLessThan(ordered.indexOf(catA.id));

  // メモのカテゴリ変更（編集）
  const patched = await (await api.patch(`/api/memos/${m3.id}`, { data: { category_id: catB.id } })).json();
  expect(patched.memo.category_id).toBe(catB.id);

  // カテゴリ削除 → メモは残り category_id が NULL
  expect((await api.delete(`/api/memo-categories?id=${catA.id}`)).status()).toBe(200);
  const after = (await (await api.get('/api/memos?uncategorized=1&limit=100')).json()).memos as { id: string; category_id: string | null }[];
  for (const id of [m1.id, m2.id]) {
    const m = after.find((x) => x.id === id);
    expect(m, 'メモが残っている').toBeTruthy();
    expect(m?.category_id).toBeNull();
  }
  // 後片付けは afterAll の cleanupE2EMemos
});

// ───────────────────────────────────────────────────────────────────────────
// 291: 📚リサーチ保存の「選択して比較」と一覧の視認性
// ───────────────────────────────────────────────────────────────────────────
/** 291: テスト用のリサーチ保存行を保存側（263/SaveToLibraryButton）と同じ形で作る（R-79） */
async function postLibraryRow(request: APIRequestContext, body: Record<string, unknown>): Promise<string> {
  const res = await request.post(LIBRARY_API, { data: body });
  expect(res.status(), 'テスト用の資料が作成できること').toBe(200);
  return (await res.json()).id as string;
}
/** 291: 見出し＋太字＋長い本文（比較列がスクロールできる長さ・整形表示の判定材料） */
function longMarkdown(tag: string, paragraphs = 40): string {
  return `導入 ${tag}。\n\n## 見出し${tag}\n\n**太字${tag}** の本文。\n\n${(`${'長い本文。'.repeat(20)}\n\n`).repeat(paragraphs)}`;
}
/** 291: ページに横スクロールが出ていないこと（C91と同じ判定） */
async function expectNoPageHScroll(page: import('@playwright/test').Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label}: ページに横スクロールが出ていないこと`).toBeLessThanOrEqual(1);
}
/** 291: 要素群の y 座標（レイアウトが落ち着くまで待って読む） */
async function stableYs(page: import('@playwright/test').Page, selector: string): Promise<number[]> {
  const read = () => page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((el) => Math.round(el.getBoundingClientRect().y)), selector);
  let prev = await read();
  for (let n = 0; n < 20; n++) {
    await page.waitForTimeout(150);
    const cur = await read();
    if (cur.join() === prev.join()) return cur;
    prev = cur;
  }
  return prev;
}

test('C96: リサーチ保存の選択比較（291）— 選択モードの操作バーから開く・2〜4件・5件目は無効化と理由・列ヘッダーに種別（本文／要約）・列数と高さ（289）・同期スクロールとsticky（271）・各列から全画面（282）・生MDが露出しない（R-97）・283のまとめと🔗は不変', async ({ page, request }) => {
  test.setTimeout(120_000);
  const marker = `CMP${RUN_ID}`;
  const jobId = 9900291;
  const now = new Date().toISOString();
  const a1 = await postLibraryRow(request, {
    type: 'deepresearch', title: withE2EPrefix(`CA ${marker}`), content: longMarkdown(`A本文${marker}`),
    metadata: { from: 'batch-research', jobId, topicIndex: 0, kind: 'research', savedAt: now },
    tags: `ディープリサーチ,バッチ,batch:${jobId}-0`, group_name: 'ディープリサーチ',
  });
  const a2 = await postLibraryRow(request, {
    type: 'deepresearch', title: withE2EPrefix(`CA ${marker}`), content: longMarkdown(`A要約${marker}`, 30),
    metadata: { from: 'batch-research', jobId, topicIndex: 0, kind: 'summary', savedAt: now },
    tags: `ディープリサーチ,要約,バッチ,batch:${jobId}-0s`, group_name: 'ディープリサーチ',
  });
  const bs: string[] = [];
  for (let i = 0; i < 3; i++) {
    bs.push(await postLibraryRow(request, { type: 'deepresearch', title: withE2EPrefix(`CB${i} ${marker}`), content: longMarkdown(`B${i}${marker}`), metadata: { savedAt: now }, tags: 'ディープリサーチ', group_name: 'ディープリサーチ' }));
  }
  const all = [a1, a2, ...bs];
  const col = (i: number) => page.locator(`[data-compare-col="${i}"]`);
  const panel = page.locator('[data-library-compare]');
  const openBtn = page.locator('[data-library-compare-open]');
  const dialog = page.locator('[role="dialog"][data-kb-scope="reader"]');

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard/library');
    await page.evaluate(() => {
      localStorage.removeItem('lumina_batch_compare_cols');
      localStorage.removeItem('lumina_batch_compare_height');
      localStorage.setItem('lumina_text_scale', '100');
    });
    await page.locator('[data-library-search]').fill(marker);
    await expect(page.locator(`[data-library-card="${a1}"]`)).toBeVisible({ timeout: 30000 });
    // 283 のまとめは不変（batch 紐付け1枚・🔗同一実行）
    await expect(page.locator(`[data-library-card="${a1}"]`)).toHaveAttribute('data-library-link', 'batch');
    await expect(page.locator(`[data-library-card="${a1}"]`)).toContainText('🔗 同一実行');
    await expect(page.locator('[data-library-card]')).toHaveCount(4);

    // ── ① 選択モード → 成果物（行）単位でチェック。比較は2件から、5件目で無効化＋理由 ──
    await page.getByRole('button', { name: '✓ 選択モード' }).click();
    await page.locator(`[data-library-artifact-check="${a1}"]`).check();
    await expect(openBtn, '1件では比較できない（操作バーには出る）').toBeDisabled();
    await page.locator(`[data-library-artifact-check="${a2}"]`).check();
    await expect(openBtn, '2件で有効').toBeEnabled();
    await expect(openBtn).toContainText('選択した2件を比較');
    await page.locator(`[data-library-check="${bs[0]}"]`).check();
    await page.locator(`[data-library-check="${bs[1]}"]`).check();
    await expect(openBtn).toContainText('選択した4件を比較');
    await page.locator(`[data-library-check="${bs[2]}"]`).check();
    await expect(openBtn, '5件目を選んでいる間は無効化（先頭4件に黙って切らない）').toBeDisabled();
    await expect(openBtn).toHaveAttribute('title', /4件まで/);
    await expect(openBtn).toHaveAttribute('title', /5件選択中/);
    // 既存の操作（AIでまとめる／Kindle／削除）は同じバーに並んだまま
    await expect(page.getByRole('button', { name: '🔗 AIでまとめる' })).toBeVisible();
    await expect(page.getByRole('button', { name: '📖 Kindle本にする' })).toBeVisible();
    await expect(page.locator('[data-bulk-delete]')).toContainText('5件を削除');
    await page.locator(`[data-library-check="${bs[2]}"]`).uncheck();
    await expect(openBtn).toBeEnabled();

    // ── ② 開く: 4列＝選んだ順（本文・要約・B0・B1）。列ヘッダーに種別 ──
    await openBtn.click();
    await expect(panel).toBeVisible();
    await expect(page.locator('[data-compare-col]')).toHaveCount(4);
    await expect(col(0)).toHaveAttribute('data-compare-kind', 'research');
    await expect(col(1)).toHaveAttribute('data-compare-kind', 'summary');
    await expect(col(0)).toHaveAttribute('data-compare-item', a1);
    await expect(col(1)).toHaveAttribute('data-compare-item', a2);
    await expect(col(2)).toHaveAttribute('data-compare-item', bs[0]);
    await expect(page.locator('[data-compare-kind-label]'), '全列のヘッダーに種別ラベル').toHaveCount(4);
    await expect(col(0).locator('[data-compare-kind-label]')).toHaveText('本文');
    await expect(col(1).locator('[data-compare-kind-label]')).toHaveText('要約');
    await expect(col(2).locator('[data-compare-kind-label]')).toHaveText('本文');
    await expect(col(0).locator('[data-compare-label="0"]')).toContainText(/\d字/);
    // 整形表示（R-97）: 見出しが h タグ・太字が strong・生MD記法が文字として出ない
    await expect(col(0).locator('[data-md-view] :is(h1,h2,h3,h4)').filter({ hasText: `見出しA本文${marker}` })).toBeVisible();
    await expect(col(1).locator('[data-md-view] strong').filter({ hasText: `太字A要約${marker}` })).toBeVisible();
    for (let i = 0; i < 4; i++) await expectNoRawMarkdown(col(i).locator('[data-md-view]'), `比較列${i}`);

    // ── ③ 289: 既定は自動／高。1280px の自動は 2×2。4列を選べて横スクロールなし。低で 34vh ──
    await expect(page.locator('[data-compare-cols-choice="auto"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-compare-height-choice="high"]')).toHaveAttribute('aria-pressed', 'true');
    let y = await stableYs(page, '[data-compare-col]');
    expect(y[0]).toBe(y[1]); expect(y[2]).toBeGreaterThan(y[0]);
    await page.locator('[data-compare-cols-choice="4"]').click();
    await expect(page.locator('[data-library-compare] [data-compare-cols]')).toHaveAttribute('data-compare-cols', '4');
    y = await stableYs(page, '[data-compare-col]');
    expect(new Set(y).size, `4列に並ぶ（y=${y.join(',')}）`).toBe(1);
    await expectNoPageHScroll(page, '比較4列');
    await page.locator('[data-compare-height-choice="low"]').click();
    expect(Math.round(parseFloat(await col(0).evaluate((el) => getComputedStyle(el).maxHeight))), '低＝34vh').toBe(Math.round(900 * 0.34));
    await page.locator('[data-compare-height-choice="high"]').click();

    // ── ④ 271: 同期スクロール（割合）と sticky 列ヘッダー ──
    for (let i = 1; i < 4; i++) await col(i).evaluate((el) => { el.scrollTop = 0; });
    await col(0).evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
    for (let i = 1; i < 4; i++) await expect.poll(async () => col(i).evaluate((el) => el.scrollTop), `列${i}が同期`).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) {
      const header = page.locator(`[data-compare-header="${i}"]`);
      expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
      const c = await col(i).boundingBox(); const h = await header.boundingBox();
      expect(c && h && h.y - c.y, `列${i}のヘッダーが上端に固定`).toBeLessThan(4);
      await expect(header.locator('[data-compare-kind-label]'), `スクロール後も列${i}の種別が見える`).toBeVisible();
    }
    // OFF にすると他列は動かない
    await page.locator('[data-compare-sync]').uncheck();
    for (let i = 0; i < 4; i++) await col(i).evaluate((el) => { el.scrollTop = 0; });
    await col(0).evaluate((el) => { el.scrollTop = 200; el.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(300);
    expect(await col(1).evaluate((el) => el.scrollTop), '同期OFFでは他列が動かない').toBe(0);
    await page.locator('[data-compare-sync]').check();

    // ── ⑤ 282: 各列から個別に全画面（共通リーダー） ──
    await page.locator('[data-compare-fullscreen="1"]').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.markdown-body :is(h1,h2,h3,h4)').filter({ hasText: `見出しA要約${marker}` }), '要約の列から要約の全画面').toBeVisible();
    await dialog.getByRole('button', { name: '✕ 閉じる' }).click();
    await expect(dialog).toHaveCount(0);
    await page.locator('[data-compare-fullscreen="2"]').click();
    await expect(dialog.locator('.markdown-body :is(h1,h2,h3,h4)').filter({ hasText: `見出しB0${marker}` }), 'B0の列からB0の全画面').toBeVisible();
    await dialog.getByRole('button', { name: '✕ 閉じる' }).click();
    await expect(dialog).toHaveCount(0);

    // ── ⑥ 閉じる。列数の指定は保持される（289と同じ保存先） ──
    await page.locator('[data-library-compare] [data-compare-close]').click();
    await expect(panel).toHaveCount(0);
    await openBtn.click();
    await expect(page.locator('[data-compare-cols-choice="4"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-compare-cols-choice="auto"]').click();
    await page.locator('[data-library-compare] [data-compare-close]').click();
  } finally {
    await request.delete(LIBRARY_API, { data: { ids: all } }).catch(() => {});
    await cleanupE2ELibrary(request);
  }
});

test('C97: リサーチ保存の一覧の見え方（291）— 列数1〜4（既定は自動・横スクロールなし）・密度（既定は詳細・コンパクトは低い）・文字数の段階は決定的で数値併記・バッジ行→タイトル行・保持・タッチ端末は1列固定・283の🔗/成果物タブ/🔍と検索の欠落は不変', async ({ page, request, browser }) => {
  test.setTimeout(120_000);
  const marker = `LIST${RUN_ID}`;
  const jobId = 9900292;
  const SUMTOKEN = `SUMONLY${marker}`;
  const now = new Date().toISOString();
  const text = (tag: string, len: number) => `${tag} ${marker} ` + 'あ'.repeat(Math.max(0, len - tag.length - marker.length - 2));
  const c500a = await postLibraryRow(request, { type: 'deepresearch', title: withE2EPrefix(`L500a ${marker}`), content: text('L500a', 500), metadata: { savedAt: now }, tags: 'ディープリサーチ', group_name: 'ディープリサーチ' });
  const c500b = await postLibraryRow(request, { type: 'deepresearch', title: withE2EPrefix(`L500b ${marker}`), content: text('L500b', 500), metadata: { savedAt: now }, tags: 'ディープリサーチ', group_name: 'ディープリサーチ' });
  const c1200 = await postLibraryRow(request, { type: 'deepresearch', title: withE2EPrefix(`L1200 ${marker}`), content: text('L1200', 1200), metadata: { savedAt: now }, tags: 'ディープリサーチ', group_name: 'ディープリサーチ' });
  const c5000 = await postLibraryRow(request, { type: 'deepresearch', title: withE2EPrefix(`L5000 ${marker}`), content: text('L5000', 5000), metadata: { savedAt: now }, tags: 'ディープリサーチ', group_name: 'ディープリサーチ' });
  const p1 = await postLibraryRow(request, {
    type: 'deepresearch', title: withE2EPrefix(`LP ${marker}`), content: text('LP本文', 800),
    metadata: { from: 'batch-research', jobId, topicIndex: 0, kind: 'research', savedAt: now },
    tags: `ディープリサーチ,バッチ,batch:${jobId}-0`, group_name: 'ディープリサーチ',
  });
  const p2 = await postLibraryRow(request, {
    type: 'deepresearch', title: withE2EPrefix(`LP ${marker}`), content: `${SUMTOKEN} を含む要約 ${marker}`,
    metadata: { from: 'batch-research', jobId, topicIndex: 0, kind: 'summary', savedAt: now },
    tags: `ディープリサーチ,要約,バッチ,batch:${jobId}-0s`, group_name: 'ディープリサーチ',
  });
  const all = [c500a, c500b, c1200, c5000, p1, p2];
  const card = (id: string) => page.locator(`[data-library-card="${id}"]`);
  const badge = (id: string) => card(id).locator('[data-char-count]');
  const grid = page.locator('[data-library-grid]').first();
  const tierOf = async (id: string) => Number(await badge(id).getAttribute('data-char-tier'));
  const bgOf = (id: string) => badge(id).evaluate((el) => getComputedStyle(el).backgroundColor);

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard/library');
    await page.evaluate(() => {
      localStorage.removeItem('lumina_library_cols');
      localStorage.removeItem('lumina_library_density');
      localStorage.setItem('lumina_text_scale', '100');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-library-search]').fill(marker);
    await expect(card(c500a)).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-library-card]'), '6件が5枚（283のまとめは不変）').toHaveCount(5);

    // ── ① 既定は自動／詳細（現状維持）。1280px の自動は xl＝4列 ──
    await expect(page.locator('[data-library-cols-choice="auto"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-library-density-choice="detail"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toHaveAttribute('data-library-cols', 'auto');
    await expect(grid).toHaveAttribute('data-library-density', 'detail');
    let y = await stableYs(page, '[data-library-card]');
    expect(new Set(y.slice(0, 4)).size, `自動（xl）は4列（y=${y.join(',')}）`).toBe(1);

    // ── ② §3-3 文字数の段階: 同じ文字数は同じ段階・同じ色。数値は必ず併記。段階は文字数に単調 ──
    await expect(badge(c500a)).toHaveText('500文字');
    await expect(badge(c500b)).toHaveText('500文字');
    await expect(badge(c5000)).toHaveText('5,000文字');
    await expect(badge(c1200)).toHaveText('1,200文字');
    expect(await tierOf(c500a)).toBe(await tierOf(c500b));
    expect(await bgOf(c500a), '同じ文字数なら同じ色').toBe(await bgOf(c500b));
    expect(await tierOf(c1200)).toBeGreaterThan(await tierOf(c500a));
    expect(await tierOf(c5000)).toBeGreaterThan(await tierOf(c1200));
    expect(await bgOf(c5000)).not.toBe(await bgOf(c500a));
    await expect(badge(c5000)).toHaveAttribute('title', /5,000文字/);
    // まとめたカードは成果物タブ側に文字数（種別＋数値）。🔗同一実行も出る
    await expect(page.locator(`[data-library-artifact-tab="${p1}"] [data-char-count]`)).toHaveText(/\d字/);
    await expect(card(p1)).toContainText('🔗 同一実行');
    // ── §3-4 1行目バッジ（種別・文字数・日付）→ 2行目タイトル ──
    const badgesBox = await card(c500a).locator('[data-library-badges]').boundingBox();
    const titleBox = await card(c500a).locator('[data-library-title]').boundingBox();
    expect(badgesBox && titleBox && titleBox.y > badgesBox.y, 'バッジ行がタイトル行より上').toBe(true);
    await expect(card(c500a).locator('[data-library-badges] [data-library-category]')).toContainText('ディープリサーチ');
    await expect(card(c500a).locator('[data-library-title]')).toContainText(`L500a ${marker}`);

    // ── ③ §3-1 列数 2／1／4 を選べる。横スクロールなし ──
    await page.locator('[data-library-cols-choice="2"]').click();
    await expect(grid).toHaveAttribute('data-library-cols', '2');
    y = await stableYs(page, '[data-library-card]');
    expect(y[0]).toBe(y[1]); expect(y[2]).toBeGreaterThan(y[0]);
    await expectNoPageHScroll(page, '一覧2列');
    await page.locator('[data-library-cols-choice="1"]').click();
    y = await stableYs(page, '[data-library-card]');
    expect(y[0] < y[1] && y[1] < y[2] && y[2] < y[3]).toBe(true);
    await page.locator('[data-library-cols-choice="4"]').click();
    y = await stableYs(page, '[data-library-card]');
    expect(new Set(y.slice(0, 4)).size, `4列（y=${y.join(',')}）`).toBe(1);
    await expectNoPageHScroll(page, '一覧4列');

    // ── ④ §3-2 密度: コンパクトは同じカードが低くなる（1列で自分の高さを測る）。成果物タブ・🔗・🔍は残る ──
    await page.locator('[data-library-cols-choice="1"]').click();
    const hDetail = (await card(c500a).boundingBox())!.height;
    await page.locator('[data-library-density-choice="compact"]').click();
    await expect(grid).toHaveAttribute('data-library-density', 'compact');
    await page.waitForTimeout(200);
    const hCompact = (await card(c500a).boundingBox())!.height;
    expect(hCompact, `コンパクト(${hCompact}) < 詳細(${hDetail})`).toBeLessThan(hDetail);
    await expect(card(c500a).locator('[data-library-fullscreen]'), 'コンパクトでは操作ボタンを出さない').toHaveCount(0);
    await expect(badge(c500a), 'コンパクトでも文字数バッジ').toHaveText('500文字');
    await expect(page.locator(`[data-library-artifact-tab="${p1}"]`), 'コンパクトでも成果物タブ').toBeVisible();
    await expect(card(p1)).toContainText('🔗 同一実行');
    // 283 §4-5: 検索でヒットした成果物に🔍（コンパクトでも欠落しない）
    await page.locator('[data-library-search]').fill(SUMTOKEN);
    await expect(card(p1), '要約だけがヒットしてもカードは欠落しない').toBeVisible();
    await expect(page.locator(`[data-library-artifact-tab="${p2}"]`)).toHaveAttribute('data-library-artifact-hit', '1');
    await expect(page.locator(`[data-library-artifact-tab="${p1}"]`)).toHaveAttribute('data-library-artifact-hit', '0');
    await page.locator('[data-library-search]').fill(marker);
    await expect(card(c500a)).toBeVisible();
    // 詳細に戻すと操作ボタンとフォルダ等が戻る
    await page.locator('[data-library-density-choice="detail"]').click();
    await expect(card(c500a).locator('[data-library-fullscreen]')).toHaveCount(1);
    await page.locator('[data-library-density-choice="compact"]').click();

    // ── ⑤ 保持: 列数2・コンパクトで再読込しても同じ ──
    await page.locator('[data-library-cols-choice="2"]').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-library-search]').fill(marker);
    await expect(card(c500a)).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-library-cols-choice="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-library-density-choice="compact"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toHaveAttribute('data-library-cols', '2');
    await expect(grid).toHaveAttribute('data-library-density', 'compact');
    // 既定へ戻す（後続テストへ持ち越さない）
    await page.locator('[data-library-cols-choice="auto"]').click();
    await page.locator('[data-library-density-choice="detail"]').click();
  } finally {
    // ── ⑥ タッチ端末: 列数の選択は出さず1列固定・横スクロールなし ──
    const ctx = await browser.newContext({ storageState: STORAGE_STATE, baseURL: BASE_URL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
    try {
      const mp = await ctx.newPage();
      await mp.goto('/dashboard/library');
      await mp.evaluate(() => { localStorage.setItem('lumina_library_cols', '4'); });
      await mp.reload({ waitUntil: 'domcontentloaded' });
      await mp.locator('[data-library-search]').fill(marker);
      await expect(mp.locator(`[data-library-card="${c500a}"]`)).toBeVisible({ timeout: 30000 });
      await expect(mp.locator('[data-library-cols-picker]'), 'タッチ端末では列数の選択を出さない').toHaveCount(0);
      await expect(mp.locator('[data-library-grid]').first(), '保存値が4でもタッチ端末は1列').toHaveAttribute('data-library-cols', '1');
      const ys = await stableYs(mp, '[data-library-card]');
      expect(new Set(ys).size, `1列に並ぶ（y=${ys.join(',')}）`).toBe(ys.length);
      await expectNoPageHScroll(mp, 'タッチ端末');
      await mp.evaluate(() => { localStorage.removeItem('lumina_library_cols'); });
    } finally {
      await ctx.close();
    }
    await request.delete(LIBRARY_API, { data: { ids: all } }).catch(() => {});
    await cleanupE2ELibrary(request);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 292: 🗂テキスト分析の保存一覧への横展開（291の部品と判断をそのまま使う）
// ───────────────────────────────────────────────────────────────────────────
test('C98: テキスト分析の保存一覧への横展開（292）— 選択して比較（2〜4件・5件目は無効化と理由・列ヘッダーに分析タイプ・289列数/高さ・271同期/sticky・282全画面・生MD露出なし）・列数（既定1列・2/自動/横スクロールなし）・密度（既定詳細・コンパクトは低い）・文字数の段階は291と同じ・バッジ行→タイトル行・保持・一括操作/カテゴリ/☆に退行なし', async ({ page, request }) => {
  test.setTimeout(150_000);
  const marker = `TA292${RUN_ID}`;
  // createSave は [E2E] 接頭辞を付ける。d/e は本文の長さを揃える（同じ文字数→同じ段階・同じ色）
  // 分析タイプとラベルは画面の保存と同じ組（保存APIはラベルを種別から導かない）
  const a = await createSave(request, { title: `TA-A ${marker}`, content: longMarkdown(`A${marker}`, 30), analysisType: 'transcription', analysisLabel: '全文書き起こし' });
  const b = await createSave(request, { title: `TA-B ${marker}`, content: longMarkdown(`B${marker}`, 30), analysisType: 'summary', analysisLabel: '概要・要約' });
  const c = await createSave(request, { title: `TA-C ${marker}`, content: longMarkdown(`C${marker}`, 30), analysisType: 'detail_summary', analysisLabel: '詳細にまとめる' });
  const d = await createSave(request, { title: `TA-D ${marker}`, content: `${'d'.repeat(400)} ${marker}`, analysisType: 'summary', analysisLabel: '概要・要約' });
  const e = await createSave(request, { title: `TA-E ${marker}`, content: `${'e'.repeat(400)} ${marker}`, analysisType: 'summary', analysisLabel: '概要・要約' });
  const panel = page.locator('[data-saved-panel="text-analysis"]');
  const card = (id: number) => panel.locator(`[data-analysis-card="${id}"]`);
  const badge = (id: number) => card(id).locator('[data-char-count]');
  const check = (id: number) => panel.locator(`[data-select-check="${id}"]`);
  const grid = panel.locator('[data-library-grid]').first();
  const openBtn = panel.locator('[data-library-compare-open]');
  const col = (i: number) => page.locator(`[data-compare-col="${i}"]`);
  const dialog = page.locator('[role="dialog"][data-kb-scope="reader"]');
  const tierOf = async (id: number) => Number(await badge(id).getAttribute('data-char-tier'));
  const bgOf = (id: number) => badge(id).evaluate((el) => getComputedStyle(el).backgroundColor);

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard/saved');
    await page.evaluate(() => {
      localStorage.removeItem('lumina_ta_cols');
      localStorage.removeItem('lumina_ta_density');
      localStorage.removeItem('lumina_batch_compare_cols');
      localStorage.removeItem('lumina_batch_compare_height');
      localStorage.setItem('lumina_text_scale', '100');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await panel.locator('[data-kb-search]').fill(marker);
    await expect(card(a)).toBeVisible({ timeout: 30000 });
    await expect(panel.locator('[data-analysis-card]')).toHaveCount(5);

    // ── ① 既定は 1列／詳細（現状維持）。バッジ行（分析タイプ・文字数・日付）→タイトル行 ──
    await expect(panel.locator('[data-library-cols-choice="1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.locator('[data-library-density-choice="detail"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toHaveAttribute('data-library-cols', '1');
    await expect(grid).toHaveAttribute('data-library-density', 'detail');
    await expect(card(a).locator('[data-ta-type-label="transcription"]')).toHaveText('全文書き起こし');
    await expect(card(c).locator('[data-ta-type-label="detail_summary"]')).toHaveText('詳細にまとめる');
    const badgesBox = await card(d).locator('[data-ta-badges]').boundingBox();
    const titleBox = await card(d).locator('[data-ta-title]').boundingBox();
    expect(badgesBox && titleBox && titleBox.y > badgesBox.y, 'バッジ行がタイトル行より上').toBe(true);
    await expect(card(d).locator('[data-ta-title]')).toContainText(`TA-D ${marker}`);
    // ── §2-3 文字数の段階は291と同じ関数: 同じ文字数は同じ段階・同じ色、数値を併記、長い方が濃い ──
    await expect(badge(d)).toHaveText(/^[\d,]+文字$/);
    expect(await badge(d).textContent()).toBe(await badge(e).textContent());
    expect(await tierOf(d)).toBe(await tierOf(e));
    expect(await bgOf(d), '同じ文字数なら同じ色').toBe(await bgOf(e));
    expect(await tierOf(a)).toBeGreaterThan(await tierOf(d));
    expect(await bgOf(a)).not.toBe(await bgOf(d));

    // ── ② 列数: 2列→2枚が横に並ぶ／自動（1280px＝xl）→4列／1列に戻す。横スクロールなし ──
    await panel.locator('[data-library-cols-choice="2"]').click();
    await expect(grid).toHaveAttribute('data-library-cols', '2');
    let y = await stableYs(page, '[data-saved-panel="text-analysis"] [data-analysis-card]');
    expect(y[0]).toBe(y[1]); expect(y[2]).toBeGreaterThan(y[0]);
    await expectNoPageHScroll(page, 'テキスト分析2列');
    await panel.locator('[data-library-cols-choice="auto"]').click();
    await expect(grid).toHaveAttribute('data-library-cols', 'auto');
    y = await stableYs(page, '[data-saved-panel="text-analysis"] [data-analysis-card]');
    expect(new Set(y.slice(0, 4)).size, `自動（xl）は4列（y=${y.join(',')}）`).toBe(1);
    await expectNoPageHScroll(page, 'テキスト分析4列');
    await panel.locator('[data-library-cols-choice="1"]').click();
    y = await stableYs(page, '[data-saved-panel="text-analysis"] [data-analysis-card]');
    expect(y[0] < y[1] && y[1] < y[2]).toBe(true);

    // ── ③ 密度: コンパクトは同じカードが低くなり操作ボタンを出さない。チェック（選択の口）・バッジは残る ──
    const hDetail = (await card(d).boundingBox())!.height;
    await panel.locator('[data-library-density-choice="compact"]').click();
    await expect(grid).toHaveAttribute('data-library-density', 'compact');
    await page.waitForTimeout(200);
    const hCompact = (await card(d).boundingBox())!.height;
    expect(hCompact, `コンパクト(${hCompact}) < 詳細(${hDetail})`).toBeLessThan(hDetail);
    await expect(card(d).getByRole('button', { name: '⛶ 全画面' }), 'コンパクトでは操作ボタンを出さない').toHaveCount(0);
    await expect(check(d)).toBeVisible();
    await expect(badge(d)).toBeVisible();
    await panel.locator('[data-library-density-choice="detail"]').click();
    await expect(card(d).getByRole('button', { name: '⛶ 全画面' })).toHaveCount(1);
    await expect(card(d).locator(`[data-favorite-button="${d}"]`), '☆（249の分類パネル）の口は不変').toBeVisible();

    // ── ④ 選択して比較: 2件から・4件まで・5件目は無効化＋理由。既存の一括操作は同じパネルに残る ──
    await check(a).check();
    await expect(openBtn, '1件では無効').toBeDisabled();
    await check(b).check();
    await expect(openBtn).toBeEnabled();
    await expect(openBtn).toContainText('選択した2件を比較');
    await check(c).check();
    await check(d).check();
    await expect(openBtn).toContainText('選択した4件を比較');
    await check(e).check();
    await expect(openBtn, '5件目を選んでいる間は無効化（先頭4件に黙って切らない・R-101）').toBeDisabled();
    await expect(openBtn).toHaveAttribute('title', /4件まで/);
    await expect(openBtn).toHaveAttribute('title', /5件選択中/);
    await expect(panel.locator('[data-bulk-delete]')).toContainText('5件');
    await expect(panel.getByRole('button', { name: /MDダウンロード/ })).toBeVisible();
    await expect(panel.getByRole('button', { name: /Kindle本にする/ })).toBeVisible();
    await expect(panel.getByText('📁 カテゴリに移動')).toBeVisible();
    await check(e).uncheck();
    await expect(openBtn).toBeEnabled();
    await openBtn.click();
    const cmp = page.locator('[data-library-compare]');
    await expect(cmp).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-compare-col]')).toHaveCount(4);
    // 列ヘッダーに分析タイプ（§2-5）。列は選んだ順
    await expect(col(0)).toHaveAttribute('data-compare-kind', 'transcription');
    await expect(col(0).locator('[data-compare-kind-label]')).toHaveText('全文書き起こし');
    await expect(col(1).locator('[data-compare-kind-label]')).toHaveText('概要・要約');
    await expect(col(2).locator('[data-compare-kind-label]')).toHaveText('詳細にまとめる');
    await expect(col(3).locator('[data-compare-kind-label]')).toHaveText('概要・要約');
    await expect(col(0)).toHaveAttribute('data-compare-item', String(a));
    await expect(col(3)).toHaveAttribute('data-compare-item', String(d));
    // 整形表示（R-97）
    await expect(col(0).locator('[data-md-view] :is(h1,h2,h3,h4)').filter({ hasText: `見出しA${marker}` })).toBeVisible();
    for (let i = 0; i < 4; i++) await expectNoRawMarkdown(col(i).locator('[data-md-view]'), `比較列${i}`);
    // 289: 列数4／高さ低、横スクロールなし
    await expect(page.locator('[data-compare-cols-choice="auto"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-compare-cols-choice="4"]').click();
    y = await stableYs(page, '[data-compare-col]');
    expect(new Set(y).size, `4列に並ぶ（y=${y.join(',')}）`).toBe(1);
    await expectNoPageHScroll(page, '比較4列');
    await page.locator('[data-compare-height-choice="low"]').click();
    expect(Math.round(parseFloat(await col(0).evaluate((el) => getComputedStyle(el).maxHeight)))).toBe(Math.round(900 * 0.34));
    await page.locator('[data-compare-height-choice="high"]').click();
    // 271: 同期スクロールと sticky（長文3列＋短文1列。短い列はスクロールできないので長文の3列で判定）
    for (let i = 1; i < 3; i++) await col(i).evaluate((el) => { el.scrollTop = 0; });
    await col(0).evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
    for (let i = 1; i < 3; i++) await expect.poll(async () => col(i).evaluate((el) => el.scrollTop), `列${i}が同期`).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) {
      const header = page.locator(`[data-compare-header="${i}"]`);
      expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
      const cb = await col(i).boundingBox(); const hb = await header.boundingBox();
      expect(cb && hb && hb.y - cb.y, `列${i}のヘッダーが上端に固定`).toBeLessThan(4);
    }
    // 282: 各列から全画面（共通リーダー）
    await page.locator('[data-compare-fullscreen="1"]').click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.markdown-body :is(h1,h2,h3,h4)').filter({ hasText: `見出しB${marker}` }), 'Bの列からBの全画面').toBeVisible();
    await dialog.getByRole('button', { name: '✕ 閉じる' }).click();
    await expect(dialog).toHaveCount(0);
    await page.locator('[data-library-compare] [data-compare-close]').click();
    await expect(cmp).toHaveCount(0);
    await page.locator('[data-compare-cols-choice]').first().waitFor({ state: 'detached' }).catch(() => {});
    await page.evaluate(() => { localStorage.removeItem('lumina_batch_compare_cols'); localStorage.removeItem('lumina_batch_compare_height'); });
    await panel.getByRole('button', { name: '✕ 選択をすべて解除' }).click();

    // ── ⑤ 保持: 列数2・コンパクトで再読込しても同じ。最後に既定へ戻す ──
    await panel.locator('[data-library-cols-choice="2"]').click();
    await panel.locator('[data-library-density-choice="compact"]').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await panel.locator('[data-kb-search]').fill(marker);
    await expect(card(a)).toBeVisible({ timeout: 30000 });
    await expect(panel.locator('[data-library-cols-choice="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.locator('[data-library-density-choice="compact"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toHaveAttribute('data-library-cols', '2');
    await panel.locator('[data-library-cols-choice="1"]').click();
    await panel.locator('[data-library-density-choice="detail"]').click();
  } finally {
    await cleanupE2ESaves(request);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 293: 検索とフィルタの強化（📚リサーチ保存／🗂テキスト分析）
// ───────────────────────────────────────────────────────────────────────────
test('C99: リサーチ保存の検索とフィルタ（293）— 「タイトルのみ」は本文にヒットしない・「すべて」はヒット・範囲の保持・種別フィルタ（件＝成果物・決定的・カードは出して該当成果物に🔍）・AIカテゴリ（未分類が選べる）・複数条件が同時に効く・適用中の条件の表示と個別解除・すべて解除・0件は絞りすぎの案内・一括AI分類が自動で走らない・283/291に退行なし', async ({ page, request }) => {
  test.setTimeout(120_000);
  const marker = `FLT${RUN_ID}`;
  const jobId = 9900293;
  const SUMTOKEN = `SUMONLY${marker}`;
  const CAT_A = `E2Eカテ${RUN_ID}`;
  const CAT_B = `E2E別${RUN_ID}`;
  const now = new Date().toISOString();
  const a1 = await postLibraryRow(request, {
    type: 'deepresearch', title: withE2EPrefix(`FA ${marker}`), content: `本文A ${marker}`,
    metadata: { from: 'batch-research', jobId, topicIndex: 0, kind: 'research', savedAt: now },
    tags: `ディープリサーチ,バッチ,batch:${jobId}-0`, group_name: 'ディープリサーチ',
  });
  const a2 = await postLibraryRow(request, {
    type: 'deepresearch', title: withE2EPrefix(`FA ${marker}`), content: `${SUMTOKEN} を含む要約 ${marker}`,
    metadata: { from: 'batch-research', jobId, topicIndex: 0, kind: 'summary', savedAt: now },
    tags: `ディープリサーチ,要約,バッチ,batch:${jobId}-0s`, group_name: 'ディープリサーチ',
  });
  const b1 = await postLibraryRow(request, { type: 'deepresearch', title: withE2EPrefix(`FB1 ${marker}`), content: `本文B1 ${marker}`, metadata: { savedAt: now, subCategory: CAT_A }, tags: 'ディープリサーチ', group_name: 'ディープリサーチ' });
  const b2 = await postLibraryRow(request, { type: 'deepresearch', title: withE2EPrefix(`FB2 ${marker}`), content: `本文B2 ${marker}`, metadata: { savedAt: now }, tags: 'ディープリサーチ', group_name: 'ディープリサーチ' });
  const b3 = await postLibraryRow(request, { type: 'deepresearch', title: withE2EPrefix(`FB3 ${marker}`), content: `本文B3 ${marker}`, metadata: { savedAt: now, subCategory: CAT_B }, tags: 'ディープリサーチ', group_name: 'ディープリサーチ' });
  const all = [a1, a2, b1, b2, b3];
  const cards = page.locator('[data-library-card]');
  const card = (id: string) => page.locator(`[data-library-card="${id}"]`);
  const tab = (id: string) => page.locator(`[data-library-artifact-tab="${id}"]`);
  const search = page.locator('[data-library-search]');
  const cond = (k: string) => page.locator(`[data-active-condition="${k}"]`);
  const kindCount = (k: string) => page.locator(`[data-library-kind-choice="${k}"]`).getAttribute('data-library-kind-count');
  const catCount = (v: string) => page.locator(`[data-library-category-choice="${v}"]`).getAttribute('data-library-category-count');
  // §5-4: 既存データの一括AI分類が自動で走らない（画面操作の間、分類APIが1回も呼ばれない）
  let categorizeCalls = 0;
  await page.route('**/api/library/auto-categorize**', (route) => { categorizeCalls += 1; void route.fulfill({ status: 500, body: '{}' }); });

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard/library');
    await page.evaluate(() => { localStorage.removeItem('lumina_library_search_scope'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    // hydration 前に入力すると値が失われる（一覧の初回取得＝effect 完了を待ってから入力する）
    await expect(cards.first()).toBeVisible({ timeout: 30000 });
    await search.fill(marker);
    await expect(card(a1)).toBeVisible({ timeout: 30000 });
    await expect(cards, '5件が4枚（283のまとめは不変）').toHaveCount(4);
    await expect(card(a1)).toContainText('🔗 同一実行');
    await expect(page.locator('[data-library-cols-picker]'), '291の列数ピッカーは残る').toBeVisible();

    // ── ① 検索範囲: 既定「すべて」（本文にヒット）→「タイトルのみ」では本文にヒットしない → 0件は絞りすぎの案内＋個別解除 ──
    await expect(page.locator('[data-library-search-range-choice="all"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(search).toHaveAttribute('placeholder', /タイトル・本文・タグ/);
    await search.fill(SUMTOKEN);
    await expect(card(a1), '「すべて」は要約の本文にヒット').toBeVisible();
    await expect(cards).toHaveCount(1);
    await page.locator('[data-library-search-range-choice="title"]').click();
    await expect(search).toHaveAttribute('placeholder', /タイトルで検索/);
    await expect(cards, '「タイトルのみ」は本文にヒットしない').toHaveCount(0);
    const empty = page.locator('[data-library-empty]');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('絞りすぎ');
    await expect(page.locator('[data-active-conditions]')).toHaveAttribute('data-active-conditions', '2');
    await expect(cond('search')).toContainText(SUMTOKEN);
    await expect(cond('range')).toContainText('タイトルのみ');
    await cond('range').locator('[data-active-condition-remove="range"]').click();
    await expect(cards, '検索範囲の条件だけ外すとまたヒットする').toHaveCount(1);
    await expect(page.locator('[data-library-search-range-choice="all"]')).toHaveAttribute('aria-pressed', 'true');
    // 保持: タイトルのみにして再読込
    await page.locator('[data-library-search-range-choice="title"]').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-library-search-range-choice="title"]'), '選んだ検索範囲は保持される').toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
    await expect(cards.first()).toBeVisible({ timeout: 30000 });
    await page.locator('[data-library-search-range-choice="all"]').click();

    // ── ② 種別フィルタ: 件数は件＝成果物・決定的。絞ってもカードは出して該当成果物に🔍（283 §4-5） ──
    await search.fill(marker);
    await expect(cards).toHaveCount(4);
    expect(await kindCount('research'), '本文4件').toBe('4');
    expect(await kindCount('summary'), '要約1件').toBe('1');
    expect(await kindCount('all')).toBe('5');
    await page.locator('[data-library-kind-choice="summary"]').click();
    await expect(cards, '要約を持つカードだけ').toHaveCount(1);
    await expect(tab(a2)).toHaveAttribute('data-library-artifact-hit', '1');
    await expect(tab(a1), '該当しない成果物は印なし（薄く）').toHaveAttribute('data-library-artifact-hit', '0');
    await expect(cond('kind')).toContainText('要約');
    expect(await kindCount('summary'), '同じデータなら同じ数（切り替え後も不変）').toBe('1');
    await page.locator('[data-library-kind-choice="research"]').click();
    await expect(cards).toHaveCount(4);
    await expect(tab(a1)).toHaveAttribute('data-library-artifact-hit', '1');
    await cond('kind').locator('[data-active-condition-remove="kind"]').click();
    await expect(cond('kind')).toHaveCount(0);

    // ── ③ AIカテゴリ（metadata.subCategory）: 未分類が選べる・件数は決定的 ──
    expect(await catCount(CAT_A)).toBe('1');
    expect(await catCount(CAT_B)).toBe('1');
    expect(await catCount('__uncategorized__'), '未分類＝a1,a2,b2').toBe('3');
    await page.locator(`[data-library-category-choice="${CAT_A}"]`).click();
    await expect(cards).toHaveCount(1);
    await expect(card(b1)).toBeVisible();
    await expect(cond('category')).toContainText(CAT_A);
    await page.locator('[data-library-category-choice="__uncategorized__"]').click();
    await expect(cards, '未分類＝a1カード（a1,a2）とb2').toHaveCount(2);
    await expect(cond('category')).toContainText('未分類');
    // 複数条件: 未分類 × 種別=要約 → a1カードだけ（a2に🔍）
    await page.locator('[data-library-kind-choice="summary"]').click();
    await expect(cards).toHaveCount(1);
    await expect(card(a1)).toBeVisible();
    await expect(tab(a2)).toHaveAttribute('data-library-artifact-hit', '1');
    await expect(page.locator('[data-active-conditions]')).toHaveAttribute('data-active-conditions', '3');
    expect(await catCount('__uncategorized__'), '種別条件を通した土台で数える（要約は未分類の1件）').toBe('1');
    // すべて解除 → 条件0（検索も消える）
    await page.locator('[data-active-conditions-clear]').click();
    await expect(page.locator('[data-active-conditions]')).toHaveCount(0);
    await expect(page.locator('[data-library-kind-choice="all"]')).toHaveAttribute('aria-pressed', 'true');
    await search.fill(marker);
    await expect(cards).toHaveCount(4);
    expect(categorizeCalls, '一括AI分類が自動で呼ばれていない').toBe(0);
  } finally {
    await request.delete(LIBRARY_API, { data: { ids: all } }).catch(() => {});
    await cleanupE2ELibrary(request);
  }
});

test('C100: テキスト分析の検索とフィルタ（293）— 「タイトルのみ」は本文にヒットしない・保持・種別フィルタ（サーバー集計・決定的）・カテゴリ「未分類」が選べる・複数条件が同時に効く・適用中の条件と個別解除・すべて解除・0件は絞りすぎの案内・一括AI分類が自動で走らない・292/一括操作に退行なし', async ({ page, request }) => {
  test.setTimeout(120_000);
  const marker = `TAF${RUN_ID}`;
  const BODYTOKEN = `BODYONLY${marker}`;
  // t1/t2 は未分類（folder=''）、t3/t4 は [E2E]検証 カテゴリ
  const t1 = await createSave(request, { title: `TF1 ${marker}`, content: `${BODYTOKEN} 本文1 ${marker}`, analysisType: 'transcription', analysisLabel: '全文書き起こし', folder: '' });
  const t2 = await createSave(request, { title: `TF2 ${marker}`, content: `本文2 ${marker}`, analysisType: 'summary', analysisLabel: '概要・要約', folder: '' });
  const t3 = await createSave(request, { title: `TF3 ${marker}`, content: `本文3 ${marker}`, analysisType: 'detail_summary', analysisLabel: '詳細にまとめる' });
  const t4 = await createSave(request, { title: `TF4 ${marker}`, content: `本文4 ${marker}`, analysisType: 'transcription', analysisLabel: '全文書き起こし' });
  const panel = page.locator('[data-saved-panel="text-analysis"]');
  const cards = panel.locator('[data-analysis-card]');
  const card = (id: number) => panel.locator(`[data-analysis-card="${id}"]`);
  const search = panel.locator('[data-kb-search]');
  const cond = (k: string) => panel.locator(`[data-active-condition="${k}"]`);
  const typeCount = (t: string) => panel.locator(`[data-ta-type-choice="${t}"]`).getAttribute('data-ta-type-count');
  let categorizeCalls = 0;
  await page.route('**/api/text-analysis/auto-categorize**', (route) => { categorizeCalls += 1; void route.fulfill({ status: 500, body: '{}' }); });

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard/saved');
    await page.evaluate(() => { localStorage.removeItem('lumina_ta_search_scope'); localStorage.setItem('ta_category_open', '1'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    // hydration 前に入力すると値が失われる（一覧の初回取得＝effect 完了を待ってから入力する）
    await expect(cards.first()).toBeVisible({ timeout: 30000 });
    await search.fill(marker);
    await expect(card(t1)).toBeVisible({ timeout: 30000 });
    await expect(cards).toHaveCount(4);

    // ── ① 検索範囲: 既定「すべて」→ 本文トークンでヒット／「タイトルのみ」で0件＋絞りすぎの案内＋個別解除 ──
    await expect(panel.locator('[data-ta-search-range-choice="all"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(search).toHaveAttribute('placeholder', /タイトル・ファイル名・本文/);
    await search.fill(BODYTOKEN);
    await expect(card(t1), '「すべて」は本文にヒット').toBeVisible();
    await expect(cards).toHaveCount(1);
    await panel.locator('[data-ta-search-range-choice="title"]').click();
    await expect(search).toHaveAttribute('placeholder', /本文は対象外/);
    await expect(cards, '「タイトルのみ」は本文にヒットしない').toHaveCount(0);
    await expect(panel.locator('[data-ta-empty]')).toContainText('絞りすぎ');
    await expect(panel.locator('[data-active-conditions]')).toHaveAttribute('data-active-conditions', '2');
    await cond('range').locator('[data-active-condition-remove="range"]').click();
    await expect(cards).toHaveCount(1);
    // 保持
    await panel.locator('[data-ta-search-range-choice="title"]').click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(panel.locator('[data-ta-search-range-choice="title"]'), '検索範囲は保持される').toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
    await expect(cards.first()).toBeVisible({ timeout: 30000 });
    await panel.locator('[data-ta-search-range-choice="all"]').click();

    // ── ② 種別フィルタ（件数はサーバー集計・全件母数・決定的） ──
    await search.fill(marker);
    await expect(cards).toHaveCount(4);
    const c1 = Number(await typeCount('transcription'));
    expect(c1).toBeGreaterThanOrEqual(2);
    await panel.locator('[data-ta-type-choice="transcription"]').click();
    await expect(cards, '全文書き起こしの2件').toHaveCount(2);
    await expect(card(t1)).toBeVisible();
    await expect(card(t4)).toBeVisible();
    await expect(cond('type')).toContainText('全文書き起こし');
    expect(Number(await typeCount('transcription')), '同じデータなら同じ数').toBe(c1);

    // ── ③ カテゴリ「未分類」（folder 空）が選べる。複数条件（種別×未分類）が同時に効く ──
    const unc = panel.locator('[data-ta-category-choice="__uncategorized__"]');
    await expect(unc).toBeVisible();
    const u1 = Number(await unc.getAttribute('data-ta-category-count'));
    expect(u1).toBeGreaterThanOrEqual(2);
    await unc.click();
    await expect(cards, '全文書き起こし × 未分類 = t1').toHaveCount(1);
    await expect(card(t1)).toBeVisible();
    await expect(cond('category')).toContainText('未分類');
    await expect(panel.locator('[data-active-conditions]')).toHaveAttribute('data-active-conditions', '3');
    expect(Number(await unc.getAttribute('data-ta-category-count')), '件数は絞り込みで変わらない（全件母数・決定的）').toBe(u1);
    await panel.locator('[data-ta-type-choice="summary"]').click();
    await expect(cards, '概要・要約 × 未分類 = t2').toHaveCount(1);
    await expect(card(t2)).toBeVisible();
    // 個別解除: 種別だけ外す → 未分類の2件
    await cond('type').locator('[data-active-condition-remove="type"]').click();
    await expect(cards).toHaveCount(2);
    // すべて解除 → 条件0
    await panel.locator('[data-active-conditions-clear]').click();
    await expect(panel.locator('[data-active-conditions]')).toHaveCount(0);
    await search.fill(marker);
    await expect(cards).toHaveCount(4);

    // ── ④ 退行なし: 292 の列数/密度ピッカー・選択→一括パネル（削除・比較） ──
    await expect(panel.locator('[data-library-cols-picker]')).toBeVisible();
    await panel.locator(`[data-select-check="${t1}"]`).check();
    await panel.locator(`[data-select-check="${t2}"]`).check();
    await expect(panel.locator('[data-bulk-delete]')).toContainText('2件');
    await expect(panel.locator('[data-library-compare-open]')).toBeEnabled();
    await panel.getByRole('button', { name: '✕ 選択をすべて解除' }).click();
    expect(categorizeCalls, '一括AI分類が自動で呼ばれていない').toBe(0);
  } finally {
    await cleanupE2ESaves(request);
  }
});
