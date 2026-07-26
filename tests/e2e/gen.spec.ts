import { test, expect } from '@playwright/test';
import { RUN_ID, createSave, deleteSave } from './helpers';

// ============================================================================
// 生成完走系（B1/B3〜B7/B9/B10）— 実AI課金が発生するため既定スキップ（@gen）
// - `npm run test:e2e:gen` でのみ実行（`npm run test:e2e` は --grep-invert @gen で除外）
// - 最小トークンで「完走すること」と「レスポンスの形」だけをassertし、内容品質は判定しない
// - 成果物は [E2E] プレフィックスを付け、削除APIがあるものはテスト末尾で削除
//   （pipeline_jobs と api_usage_logs は削除APIが無いため行が残る。intent/topicの
// 　 [E2E] マーカーで識別可能）
// ============================================================================

const GEN_TIMEOUT = 360_000;
const REQ_TIMEOUT = 330_000;

test('B1: ディープリサーチ（quick）が完走しSSEがdoneで終わる @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const res = await request.post('/api/deepresearch', {
    data: { topic: '[E2E] 保湿剤の基礎', depth: 'quick', model: 'claude' },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('"type":"text"');
  expect(body).toContain('"type":"done"');
  expect(body).not.toContain('"type":"error"');
});

test('B3: write生成（/api/generate）がストリーミングで完走する @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const res = await request.post('/api/generate', {
    data: {
      prompt: 'E2Eスモークテストです。「ok」とだけ出力してください。',
      mode: 'blog',
      style: 'casual',
      length: 'short',
      audience: 'general',
      systemOverride: '「ok」とだけ出力してください。他には何も書かないこと。',
    },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const body = await res.text();
  // Anthropic生ストリームのパススルー形式
  expect(body).toContain('content_block_delta');
  expect(body).toContain('message_stop');
});

test('B4: 横断分析実行（cross-analyze）がSSEで完走する @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const res = await request.post('/api/text-analysis/cross-analyze', {
    data: {
      articles: [
        { title: '[E2E] 記事1', content: 'こんにちは。E2E検証用の短い本文です。' },
        { title: '[E2E] 記事2', content: 'こんばんは。E2E検証用の短い本文です。' },
      ],
      presetType: 'custom',
      customPrompt: '「ok」とだけ出力してください。他には何も書かないこと。',
      language: 'ja',
    },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('"type":"delta"');
  expect(body).toContain('"type":"done"');
  expect(body).not.toContain('"type":"error"');
});

test('B5: note記事群（plan→article）が完走しレスポンス形が正しい @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const ids = [
    await createSave(request, {
      title: `[E2E] note素材1 ${RUN_ID}`,
      content: '保湿はスキンケアの基本です。E2E検証用の短い素材本文。',
    }),
    await createSave(request, {
      title: `[E2E] note素材2 ${RUN_ID}`,
      content: '紫外線対策は一年を通して大切です。E2E検証用の短い素材本文。',
    }),
  ];
  try {
    const plan = await request.post('/api/note-bundle/plan', {
      data: { sources: ids.map((id) => ({ source: 'analysis', id })) },
      timeout: REQ_TIMEOUT,
    });
    expect(plan.status()).toBe(200);
    const planJson = await plan.json();
    expect(Array.isArray(planJson.articles)).toBe(true);
    expect(planJson.articles.length).toBeGreaterThan(0);
    expect(Array.isArray(planJson.materials)).toBe(true);
    expect(Array.isArray(planJson.patternOptions)).toBe(true);

    const article = await request.post('/api/note-bundle/article', {
      data: {
        title: '[E2E] スモーク記事',
        points: [],
        sources: [{ source: 'analysis', id: ids[0] }],
        style: 'balanced',
        length: 'short',
        model: 'claude',
      },
      timeout: REQ_TIMEOUT,
    });
    expect(article.status()).toBe(200);
    const articleJson = await article.json();
    expect(String(articleJson.content).length).toBeGreaterThan(0);
    expect(articleJson.ad_check).toBeTruthy();
  } finally {
    for (const id of ids) await deleteSave(request, id);
  }
});

test('B6: HPブログ生成が完走しレスポンス形が正しい @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const res = await request.post('/api/hp-blog', {
    data: { theme: '保湿ケアの基本', length: 'short', model: 'claude' },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(String(json.content).length).toBeGreaterThan(0);
});

test('B7: kindle（書籍作成→1章生成→削除）が完走する @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const created = await request.post('/api/kindle', {
    data: { title: `[E2E] スモーク書籍 ${RUN_ID}`, language: 'ja' },
  });
  expect(created.status()).toBe(200);
  const bookId = (await created.json()).book?.id;
  expect(bookId).toBeTruthy();
  try {
    const chapter = await request.post('/api/kindle/generate-chapter', {
      data: {
        language: 'ja',
        targetWordCount: 100,
        chapter: {
          number: 1,
          title: '[E2E] 第1章',
          summary: 'E2E検証用の短い章。「完走」だけを確認する。',
          keyMessages: [],
        },
        bookMeta: { title: '[E2E] スモーク書籍', targetAudience: '検証', genre: '検証' },
      },
      timeout: REQ_TIMEOUT,
    });
    expect(chapter.status()).toBe(200);
    const body = await chapter.text();
    expect(body).toContain('"type":"delta"');
    expect(body).toContain('"type":"done"');
  } finally {
    const del = await request.delete(`/api/kindle?id=${bookId}`);
    expect(del.status(), '[E2E] 書籍が削除されること').toBe(200);
  }
});

test('B9: オーケストレーター（最小1ステップ）が完走イベントまで到達する @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  // launch_set の email_subject_lines 1ステップのみ有効化（依存は自動除去され単独実行できる）
  // 注: pipeline_jobs には削除APIが無いため [E2E] マーカー付きの行が残る
  const created = await request.post('/api/orchestrator', {
    data: {
      intent: `[E2E] スモークテスト ${RUN_ID}`,
      pipelineType: 'launch_set',
      enabledStepIds: ['email_subject_lines'],
    },
  });
  expect(created.status()).toBe(200);
  const jobId = (await created.json()).job?.id;
  expect(jobId).toBeTruthy();

  const exec = await request.post('/api/orchestrator/execute', {
    data: { jobId },
    timeout: REQ_TIMEOUT,
  });
  expect(exec.status()).toBe(200);
  const body = await exec.text();
  expect(body, '完走イベント（completed）が届くこと').toContain('"type":"completed"');
});

test('B10: 用語集（/api/glossary）が完走しterm形で返る @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const res = await request.post('/api/glossary', {
    data: { word: 'AI' },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.term).toBeTruthy();
  expect(String(json.term.word).length).toBeGreaterThan(0);
  expect(String(json.term.simple).length).toBeGreaterThan(0);
  // DB保存はされない（保存はクライアントのlocalStorage）ため後片付け不要
});
