import { APIRequestContext, expect } from '@playwright/test';

export const SAVES_API = '/api/text-analysis/saves';

// 実行ごとの一意マーカー。テストデータのタイトルに埋め込み、検索・後片付けの基準にする
export const RUN_ID = Date.now().toString(36);
export const SEED_TOKEN = `E2ESEED${RUN_ID}`;
export const BODY_TOKEN = `E2EBODYONLY${RUN_ID}`;
export const SEED_FOLDER = 'E2E検証';

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
      title: body.title,
      content: body.content,
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
    const list = await listSaves(request, { q: '[E2E]', limit: 100 });
    const targets = list.items.filter((item) =>
      String(item.auto_title ?? item.file_name ?? '').includes('[E2E]'),
    );
    if (targets.length === 0) break;
    for (const item of targets) {
      await deleteSave(request, item.id as number);
    }
  }
}
