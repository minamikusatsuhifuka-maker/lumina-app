import { APIRequestContext, expect } from '@playwright/test';

export const SAVES_API = '/api/text-analysis/saves';

// 実行ごとの一意マーカー。テストデータのタイトルに埋め込み、検索・後片付けの基準にする
export const RUN_ID = Date.now().toString(36);
export const SEED_TOKEN = `E2ESEED${RUN_ID}`;
export const BODY_TOKEN = `E2EBODYONLY${RUN_ID}`;

// 250: テストデータの識別接頭辞。後片付け（cleanup*）はこの文字列だけを基準に判定するため、
// **E2Eが作るデータは必ずこれを含める**。呼び出し側の書き忘れで掃除対象から外れた残骸が
// 実際に発生した（2026-07-29の1件）ので、付与はヘルパー側で強制する（R-55）。
export const E2E_PREFIX = '[E2E]';
export function withE2EPrefix(text: string): string {
  return text.includes(E2E_PREFIX) ? text : `${E2E_PREFIX} ${text}`;
}
export const SEED_FOLDER = `${E2E_PREFIX}検証`;

export type SaveListResponse = {
  items: Record<string, unknown>[];
  total_count: number;
  all_total: number;
  folders: { folder: string; count: number }[];
  all_tags: string[];
};

export async function listSaves(
  request: APIRequestContext,
  params: Record<string, string | number> = {},
): Promise<SaveListResponse> {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString();
  const res = await request.get(`${SAVES_API}${qs ? `?${qs}` : ''}`);
  expect(res.status(), `一覧API GET ${qs} が200であること`).toBe(200);
  return (await res.json()) as SaveListResponse;
}

export async function createSave(
  request: APIRequestContext,
  body: {
    title: string;
    content: string;
    folder?: string;
    tags?: string[];
    inputText?: string;
    analysisType?: string;
  },
): Promise<number> {
  const res = await request.post(SAVES_API, {
    data: {
      // 接頭辞は呼び出し側に任せず、ここで必ず付ける（掃除の取りこぼしを構造的に防ぐ）
      title: withE2EPrefix(body.title),
      content: withE2EPrefix(body.content),
      category: body.folder ?? SEED_FOLDER,
      tags: body.tags ?? [],
      analysisType: body.analysisType ?? 'summary',
      inputText: body.inputText,
    },
  });
  expect(res.status(), 'テスト用レコードのPOSTが200であること').toBe(200);
  const json = await res.json();
  const id = json.save?.id ?? json.id;
  expect(typeof id, '作成レスポンスにidが含まれること').toBe('number');
  return id as number;
}

export async function patchSaves(
  request: APIRequestContext,
  body: Record<string, unknown>,
) {
  return request.patch(SAVES_API, { data: body });
}

export async function deleteSave(request: APIRequestContext, id: number) {
  const res = await request.delete(`${SAVES_API}?id=${id}`);
  expect(res.status(), `テスト用レコード id=${id} の削除が200であること`).toBe(200);
}

// 過去実行の残骸を含め、E2Eマーカー付きレコードを全削除する（自己完結・既存データは触らない）
export async function cleanupE2ESaves(request: APIRequestContext) {
  // limit上限100のため、無くなるまで繰り返す（安全弁として最大10周）
  for (let pass = 0; pass < 10; pass++) {
    const list = await listSaves(request, { q: E2E_PREFIX, limit: 100 });
    const targets = list.items.filter((item) =>
      String(item.auto_title ?? item.file_name ?? '').includes(E2E_PREFIX),
    );
    if (targets.length === 0) break;
    for (const item of targets) {
      await deleteSave(request, item.id as number);
    }
  }
}

// ============================================================================
// 249: マイフォルダ（お気に入りのカスタムフォルダ分類）
// ============================================================================

export const FOLDERS_API = '/api/custom-folders';
export const CONTEXT_API = '/api/context-saves';
// 252: scope はアイテム種別。どの scope が同じフォルダ一覧を見るかはサーバーが決める
// （text_analysis と library は共有 / context は独立）
export type FolderScopeName = 'text_analysis' | 'library' | 'context';

export type FolderListResponse = {
  folders: { id: number; name: string; sort_order: number; count: number }[];
  favorite_total: number;
  unfiled_favorite_count: number;
};

export async function listFolders(
  request: APIRequestContext,
  scope: FolderScopeName,
): Promise<FolderListResponse> {
  const res = await request.get(`${FOLDERS_API}?scope=${scope}`);
  expect(res.status(), `フォルダ一覧API(scope=${scope})が200であること`).toBe(200);
  return (await res.json()) as FolderListResponse;
}

export async function createFolder(
  request: APIRequestContext,
  scope: FolderScopeName,
  name: string,
): Promise<number> {
  // フォルダ名も掃除の判定対象。接頭辞はここで必ず付ける（R-55）
  const res = await request.post(FOLDERS_API, { data: { scope, name: withE2EPrefix(name) } });
  expect(res.status(), `フォルダ作成(${name})が200であること`).toBe(200);
  const json = await res.json();
  expect(typeof json.folder?.id, '作成レスポンスにフォルダidが含まれること').toBe('number');
  return json.folder.id as number;
}

export async function assignFolders(
  request: APIRequestContext,
  scope: FolderScopeName,
  itemId: number | string,
  folderIds: number[],
) {
  return request.patch(FOLDERS_API, {
    data: { scope, action: 'assign', itemId, folderIds },
  });
}

export async function deleteFolder(
  request: APIRequestContext,
  scope: FolderScopeName,
  id: number,
) {
  return request.delete(`${FOLDERS_API}?scope=${scope}&id=${id}`);
}

/** AI参照素材（context_saves）のテスト用素材を作る。接頭辞はここで必ず付ける */
export async function createContextSave(
  request: APIRequestContext,
  body: { topic: string; contextText: string; tags?: string[] },
): Promise<number> {
  const res = await request.post(CONTEXT_API, {
    data: {
      topic: withE2EPrefix(body.topic),
      contextText: withE2EPrefix(body.contextText),
      tags: body.tags ?? [],
    },
  });
  expect(res.status(), 'テスト用の参照素材が作成できること').toBe(200);
  const id = (await res.json()).id;
  expect(typeof id, '作成レスポンスにidが含まれること').toBe('number');
  return id as number;
}

/** 過去実行分を含め、[E2E] 印のAI参照素材を全削除する */
export async function cleanupE2EContextSaves(request: APIRequestContext) {
  for (let pass = 0; pass < 10; pass++) {
    const res = await request.get(`${CONTEXT_API}?q=${encodeURIComponent(E2E_PREFIX)}&limit=100`);
    expect(res.status(), 'AI参照素材の一覧APIが200であること').toBe(200);
    const items = ((await res.json()).items ?? []) as { id: number; topic: string }[];
    const targets = items.filter((it) => String(it.topic ?? '').includes(E2E_PREFIX));
    if (targets.length === 0) break;
    for (const it of targets) {
      await request.delete(`${CONTEXT_API}?id=${it.id}`);
    }
  }
}

export const LIBRARY_API = '/api/library';
export const FOLDER_ITEMS_API = '/api/custom-folders/items';

export type CrossFolderItem = {
  scope: 'text_analysis' | 'library';
  id: string;
  title: string;
  label: string;
  char_count: number;
  favorite: boolean;
  custom_folder_ids: number[];
};

/** 253: フォルダの中身を画面をまたいで取得する（保存一覧＋リサーチ保存） */
export async function listFolderItems(
  request: APIRequestContext,
  folderId: number,
): Promise<{ items: CrossFolderItem[]; total: number; folder: { id: number; name: string } }> {
  const res = await request.get(`${FOLDER_ITEMS_API}?folderId=${folderId}`);
  expect(res.status(), `フォルダの中身API(folderId=${folderId})が200であること`).toBe(200);
  return await res.json();
}

/** 📚リサーチ保存（library）のテスト用資料を作る。接頭辞はここで必ず付ける */
export async function createLibraryItem(
  request: APIRequestContext,
  body: { title: string; content: string; type?: string },
): Promise<string> {
  const res = await request.post(LIBRARY_API, {
    data: {
      title: withE2EPrefix(body.title),
      content: withE2EPrefix(body.content),
      type: body.type ?? 'research',
      tags: '',
      group_name: '',
    },
  });
  expect(res.status(), 'テスト用の資料が作成できること').toBe(200);
  const id = (await res.json()).id;
  expect(typeof id, '作成レスポンスにidが含まれること').toBe('string');
  return id as string;
}

/** 過去実行分を含め、[E2E] 印のリサーチ保存を全削除する */
export async function cleanupE2ELibrary(request: APIRequestContext) {
  const res = await request.get(`${LIBRARY_API}?q=${encodeURIComponent(E2E_PREFIX)}`);
  expect(res.status(), 'リサーチ保存の一覧APIが200であること').toBe(200);
  const rows = (await res.json()) as { id: string; title: string }[];
  const targets = Array.isArray(rows)
    ? rows.filter((r) => String(r.title ?? '').includes(E2E_PREFIX))
    : [];
  if (targets.length === 0) return;
  await request.delete(LIBRARY_API, { data: { ids: targets.map((r) => r.id) } });
}

/** 過去実行分を含め、[E2E] 印のフォルダを両スコープから全削除する */
export async function cleanupE2EFolders(request: APIRequestContext) {
  // 252: text_analysis と library は同じ体系なので、片方を掃除すれば両方から消える
  for (const scope of ['text_analysis', 'context'] as FolderScopeName[]) {
    const { folders } = await listFolders(request, scope);
    for (const f of folders) {
      if (f.name.includes(E2E_PREFIX)) {
        await deleteFolder(request, scope, f.id);
      }
    }
  }
}

// ============================================================================
// 281: 📔 エピソード記録（episode_records）
// ============================================================================

export const EPISODES_API = '/api/episodes';

/** エピソード記録のテスト用レコードを作る。接頭辞はタイトルにここで必ず付ける（R-55） */
export async function createEpisode(
  request: APIRequestContext,
  body: {
    title: string;
    period?: string;
    situation?: string;
    feelings?: string;
    details?: string;
    thoughts?: string;
    reflection?: string;
    tags?: string[];
  },
): Promise<number> {
  const res = await request.post(EPISODES_API, {
    data: { ...body, title: withE2EPrefix(body.title), tags: body.tags ?? [] },
  });
  expect(res.status(), 'テスト用のエピソード記録が作成できること').toBe(200);
  const id = (await res.json()).id;
  expect(typeof id, '作成レスポンスにidが含まれること').toBe('number');
  return id as number;
}

/** 過去実行分を含め、[E2E] 印のエピソード記録を全削除する（全文検索は全欄＋タグを対象にする） */
export async function cleanupE2EEpisodes(request: APIRequestContext) {
  for (let pass = 0; pass < 10; pass++) {
    const res = await request.get(`${EPISODES_API}?q=${encodeURIComponent(E2E_PREFIX)}&limit=100`);
    expect(res.status(), 'エピソード記録の一覧APIが200であること').toBe(200);
    const items = ((await res.json()).items ?? []) as { id: number; title: string; tags: string[] }[];
    const targets = items.filter(
      (it) => String(it.title ?? '').includes(E2E_PREFIX) || (it.tags ?? []).some((t) => String(t).includes(E2E_PREFIX)),
    );
    if (targets.length === 0) break;
    for (const it of targets) {
      await request.delete(`${EPISODES_API}?id=${it.id}`);
    }
  }
}
