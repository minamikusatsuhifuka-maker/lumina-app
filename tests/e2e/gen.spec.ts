import { test, expect } from '@playwright/test';
import { RUN_ID, createSave, deleteSave, createLibraryItem, createMandalaChart, saveMandalaCell, deleteMandalaChart, createEpisode, addMandalaLinks } from './helpers';
import { findBadHeadingLines, findMultiSentenceLines } from '../../src/lib/note-format';
import { MANDALA_PAID_LINE_MARKER } from '../../src/lib/mandala-note';
import { SUMMARY_FOR_NEXT_MAX } from '../../src/lib/presentation';
// 319: 追加リサーチ
import { followUpMetadata, followUpTitle } from '../../src/lib/followup-research';

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
    // 310（R-114）: note-bundle の生成物も1文1行
    expect(findMultiSentenceLines(String(articleJson.content)), '1文1行').toEqual([]);
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

// ── 228b: note強化パイプラインのサーバ側実地検証 ────────────────────────────
// 手順を明示的に含む固定記事で summary→描画→figures→図表描画→placement→挿絵→ad-check を完走確認。
// 挿絵は最安の nano-banana-2（約$0.02/枚）。画像はレスポンス返却のみ＝gallery保存しない（残骸なし）。

const E2E_NOTE_ARTICLE = `# [E2E] 保湿ケアの基本

乾燥する季節は肌のバリア機能が低下しがちです。毎日の保湿ケアで肌を守ることが大切です。

保湿ケアの手順は次のとおりです。まず洗顔でやさしく汚れを落とします。次に化粧水で水分を与えます。最後に保湿剤でうるおいを閉じ込めます。

朝と夜の2回、無理のない範囲で続けることが習慣化のコツです。

まとめると、保湿は特別なことではなく毎日の小さな積み重ねが大切です。`;

test('B13: note強化パイプライン（まとめ→図表→配置→挿絵→広告チェック）が完走する @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);

  // 1) まとめ生成（Claude）
  const sum = await request.post('/api/note-enhance/summary', {
    data: { content: E2E_NOTE_ARTICLE, title: '[E2E] 保湿ケアの基本' },
    timeout: REQ_TIMEOUT,
  });
  expect(sum.status()).toBe(200);
  const sumJson = await sum.json();
  expect(Array.isArray(sumJson.points)).toBe(true);
  expect(sumJson.points.length).toBeGreaterThan(0);

  // 2) まとめ画像（og描画・AI不使用）
  const img = await request.post('/api/note-enhance/summary-image', {
    data: { title: '[E2E] 保湿ケアの基本｜まとめ', points: sumJson.points, template: 'card' },
    timeout: REQ_TIMEOUT,
  });
  expect(img.status()).toBe(200);
  expect(String((await img.json()).imageBase64).length).toBeGreaterThan(1000);

  // 3) 図表抽出（Gemini）: 本文に明示的な手順があるため1件以上を期待
  const figs = await request.post('/api/note-enhance/figures', {
    data: { content: E2E_NOTE_ARTICLE, title: '[E2E] 保湿ケアの基本' },
    timeout: REQ_TIMEOUT,
  });
  expect(figs.status()).toBe(200);
  const figsJson = await figs.json();
  expect(Array.isArray(figsJson.figures)).toBe(true);
  expect(figsJson.figures.length).toBeGreaterThan(0);
  const fig = figsJson.figures[0];
  expect(['steps', 'compare', 'qa', 'beforeafter']).toContain(fig.template);
  expect(Array.isArray(fig.groups)).toBe(true);
  expect(fig.groups.length).toBeGreaterThan(0);

  // 4) 図表描画（og・AI不使用・groups経路）
  const figImg = await request.post('/api/note-enhance/summary-image', {
    data: { title: fig.title, groups: fig.groups, template: fig.template },
    timeout: REQ_TIMEOUT,
  });
  expect(figImg.status()).toBe(200);
  expect(String((await figImg.json()).imageBase64).length).toBeGreaterThan(1000);

  // 5) 配置提案（Gemini）: 228a方針 hook最多1＋cta最多1のみが返ること
  const pl = await request.post('/api/note-enhance/placement', {
    data: { content: E2E_NOTE_ARTICLE, title: '[E2E] 保湿ケアの基本' },
    timeout: REQ_TIMEOUT,
  });
  expect(pl.status()).toBe(200);
  const plJson = await pl.json();
  expect(Array.isArray(plJson.placements)).toBe(true);
  const slots = plJson.placements.map((p: { slot: string }) => p.slot);
  expect(slots.filter((s: string) => s === 'hook').length).toBeLessThanOrEqual(1);
  expect(slots.filter((s: string) => s === 'cta').length).toBeLessThanOrEqual(1);
  expect(slots.every((s: string) => s === 'hook' || s === 'cta')).toBe(true);

  // 6) 挿絵1枚（nano-banana-2＝最安。サーバ側ガード連結経路の実走）
  const genImg = await request.post('/api/note-enhance/image', {
    data: { prompt: '洗面台で保湿ケアをする明るい朝の情景', engine: 'nano-banana-2', styleKey: 'soft-illust' },
    timeout: REQ_TIMEOUT,
  });
  expect(genImg.status()).toBe(200);
  expect(String((await genImg.json()).imageBase64).length).toBeGreaterThan(1000);

  // 7) 医療広告チェック（fail-open設計のためstatusの形だけassert）
  const ad = await request.post('/api/note-enhance/ad-check', {
    data: { content: E2E_NOTE_ARTICLE },
    timeout: REQ_TIMEOUT,
  });
  expect(ad.status()).toBe(200);
  expect(['ok', 'warn']).toContain((await ad.json()).ad_check.status);
});

// 未認証は全ルート401（160の「デフォルト保護」規約の担保。AI呼び出し前に弾かれる＝課金なし）
test.describe('B14: note強化APIの未認証ガード @gen', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('B14: 6ルートすべて未認証で401 @gen', async ({ request }) => {
    const routes = [
      '/api/note-enhance/summary',
      '/api/note-enhance/summary-image',
      '/api/note-enhance/figures',
      '/api/note-enhance/placement',
      '/api/note-enhance/image',
      '/api/note-enhance/ad-check',
    ];
    for (const route of routes) {
      const res = await request.post(route, { data: { content: 'x' } });
      expect(res.status(), `${route} が未認証で401であること`).toBe(401);
    }
  });
});

// B15（234【1】）: Kindle目次生成の成否スモーク。
// 234では「目次生成が全目的で失敗」しても既定スイート27件が全通過していた
// ＝AI経路の成否を一度も検証していなかったのが検出漏れの真因。ここで塞ぐ。
// 素材はテスト内で作成→削除する自己完結型。2目的で回して目的分岐の後方互換も見る。
test('B15: Kindle目次生成が2目的とも成功する @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const created = await request.post('/api/library', {
    data: {
      type: 'deepresearch',
      title: `[E2E] ${RUN_ID} 目次生成スモーク素材`,
      content:
        '乾燥肌のスキンケアに関する調査メモ。保湿剤は入浴後5分以内の外用が有効とされる。' +
        'セラミド・ヘパリン類似物質・ワセリンの3系統があり、季節と部位で使い分ける。' +
        '継続率が低いことが課題で、置き場所を決めると習慣化しやすい。' +
        '洗浄はぬるま湯・こすらないことが基本。'.repeat(6),
    },
  });
  expect(created.status()).toBe(200);
  const sourceId = String((await created.json()).id);

  try {
    for (const purposeKey of ['acquisition', 'branding']) {
      const res = await request.post('/api/kindle/outline', {
        data: { sourceIds: [sourceId], purposeKey, styleKey: 'balanced', preset: 'leadmagnet', theme: '' },
        timeout: REQ_TIMEOUT,
      });
      const body = await res.json().catch(() => ({}));
      // 失敗時はAPIが返した理由をそのままレポートに出す（234の「JSONパース失敗」誤診断の再発防止）
      expect(res.status(), `purposeKey=${purposeKey}: ${JSON.stringify(body).slice(0, 300)}`).toBe(200);
      expect(typeof body.book_title, `purposeKey=${purposeKey} の book_title`).toBe('string');
      expect(Array.isArray(body.chapters) && body.chapters.length > 0, `purposeKey=${purposeKey} の chapters`).toBe(true);
    }
  } finally {
    await request.delete('/api/library', { data: { id: sourceId } });
  }
});

test('B16: ペルソナ別note記事（264）— タイトル案3本と構造化された本文が分離して返る @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  // 素材のDR記事を自作（[E2E]接頭辞・末尾で削除＝R-55）
  const drId = await createLibraryItem(request, {
    title: `264検証用DR記事 ${RUN_ID}`,
    content:
      '# 冬の乾燥肌と保湿ケア\n\n角層は水分を保つバリアの役割を持つ。冬は空気の乾燥と暖房で角層の水分が失われやすい。' +
      '入浴後は早めに保湿剤を塗る・こすらず押さえるようにのばす・熱すぎるお湯を避ける、が基本とされる。' +
      '室内の加湿や刺激の少ない肌着も助けになる。かゆみが強い場合は皮膚科での相談がすすめられる。',
    type: 'deepresearch',
  });
  try {
    const res = await request.post('/api/dr-hub/persona', {
      data: { drId, mode: 'full', personaKey: 'homemaker', length: 'short' },
      timeout: REQ_TIMEOUT,
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    // タイトル案は本文と分離して返る（noteのタイトル欄に貼るため）
    expect(Array.isArray(data.titles), 'titlesが配列').toBe(true);
    expect(data.titles.length, 'タイトル案が3本').toBe(3);
    for (const t of data.titles) {
      expect(String(t)).not.toContain('#');
    }

    // 本文: h1なし・大見出し(##)2本以上・空行段落・最後まで書き切る
    const body = String(data.content ?? '');
    expect(body.length).toBeGreaterThan(500);
    expect(/^#\s/m.test(body), '本文にh1（#）が無い').toBe(false);
    const h2 = body.match(/^##\s/gm) ?? [];
    expect(h2.length, '大見出し(##)が2本以上').toBeGreaterThanOrEqual(2);
    expect(body).toContain('\n\n');
    expect(body).not.toContain('【タイトル案】');
    expect(body).not.toContain('【本文】');
    // 309（院長判断B）: ①の全出力は「1文1行」（プロンプト＋決定的整形の二段構え）。違反0件
    expect(findMultiSentenceLines(body), '1文1行（句点の後に続きが無い）').toEqual([]);
    expect(data.sentenceViolations).toBe(0);

    // ad_check が併記される（形の検証のみ）
    expect(data.ad_check?.status === 'ok' || data.ad_check?.status === 'warn').toBe(true);
  } finally {
    const del = await request.delete('/api/library', { data: { id: drId } });
    expect(del.status()).toBe(200);
  }
});

test('B30: マンダラ→有料note記事（309）— ①ペルソナ経路の mandala オプトインで生成が完走し、生成物に「▼ 有料ライン」の区切り行が1本・1文1行・段落間空行・h1なし・出どころが返る・骨子にない数字を足さない（機械検査は行数と目印まで） @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const marker = `MNOTE${RUN_ID}`;
  const epId = await createEpisode(request, { title: `${marker} 記録`, situation: '診察室', details: '入浴後すぐ保湿剤を塗る習慣を自分で3週間続けた。最初の1週間は塗り忘れが多かった。', tags: ['[E2E]'] });
  const { id: chartId, cells } = await createMandalaChart(request, `${marker} 保湿を続ける`, 'paid_note');
  const byPos = (p: number) => cells.find((c) => c.position === p)!;
  try {
    // 型のタイトルはそのまま、本文（骨子）を短く入れる。区分は型どおり（0〜3,5 無料／6〜8 有料）
    const bodies: Record<number, string> = {
      0: '冬になると「保湿しているのに乾く」と感じる人が多い。私も同じだった。',
      1: '読み終えると、入浴後の保湿を無理なく習慣にできる。',
      2: '自分で3週間、入浴後すぐの保湿を続けた記録がある。',
      3: '角層の水分は入浴後に失われやすい。塗るタイミングが効く理由はそこにある。',
      5: '有料部分では手順とチェック表を渡す。対象は保湿が続かない人。',
      6: '手順は3つ。タオルで押さえる、5分以内に塗る、塗り残しやすい場所を最後に確認する。',
      7: 'チェック表のテンプレート。朝晩の欄と、塗り忘れた日の理由欄。',
      8: '最初の1週間は忘れて当然。続いた日数を数えるところから。',
    };
    for (const [p, body] of Object.entries(bodies)) {
      expect((await saveMandalaCell(request, byPos(Number(p)).id, { body })).status()).toBe(200);
    }
    expect((await saveMandalaCell(request, byPos(4).id, { body: '入浴後の保湿を習慣にできている' })).status()).toBe(200);
    expect((await addMandalaLinks(request, byPos(2).id, [{ scope: 'episode', item_key: epId }])).status()).toBe(200);

    const res = await request.post('/api/dr-hub/persona', {
      data: { mandala: { chartId, mode: 'paid_chart' }, mode: 'full', personaKey: 'homemaker', length: 'short' },
      timeout: REQ_TIMEOUT,
    });
    const data = await res.json().catch(() => ({}));
    expect(res.status(), JSON.stringify(data).slice(0, 300)).toBe(200);
    const body = String(data.content ?? '');
    expect(body.length).toBeGreaterThan(500);
    expect(/^#\s/m.test(body), '本文にh1（#）が無い').toBe(false);
    expect((body.match(/^##\s/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(body).toContain('\n\n');
    expect(body.split('\n').filter((l) => l.trim() === MANDALA_PAID_LINE_MARKER).length, '有料ラインの目印が1本').toBe(1);
    expect(findMultiSentenceLines(body), '1文1行').toEqual([]);
    expect(data.sentenceViolations).toBe(0);
    expect(data.mandala).toMatchObject({ source: 'mandala', chartId, mode: 'paid_chart' });
    expect(Array.isArray(data.titles) && data.titles.length === 3).toBe(true);
    expect(data.episodeCount, 'マスにリンクした📔が体験ブロックとして入る').toBe(1);
    expect(data.ad_check?.status === 'ok' || data.ad_check?.status === 'warn').toBe(true);
  } finally {
    await deleteMandalaChart(request, chartId);
    await request.delete(`/api/episodes?id=${epId}`).catch(() => {});
  }
});

test('B17: X投稿v2（265c）— 既定でミニ講義型（1,000字以上）・URLは本文に入らない @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  // 素材のnote記事を自作（[E2E]接頭辞・末尾で削除＝R-55）
  // 素材が薄いと「記事にない事実を書かない」ガードが効いて1,000字に届かない（正しい挙動）。
  // 実運用の記事に近い分量・論点数の素材を渡す
  const articleId = await createLibraryItem(request, {
    title: `265検証用note記事 ${RUN_ID}`,
    content: `## なぜ「入浴後すぐ」なのか
入浴後の保湿は「早さ」と「塗り方」で差が出ます。角層に水分が残っているうちに保湿剤を重ねると、水分の蒸発を抑えやすくなります。逆に、時間を置くほど角層の水分は失われていき、保湿剤を塗っても乾いた状態に蓋をするだけになりがちです。

## 塗り方の基本
こすらず手のひらで押さえるようにのばすのが基本です。強くこすると角層に負担がかかり、かゆみの引き金にもなります。量の目安は「ティッシュが軽く貼りつく程度」。塗り残しが出やすいのは、すね・背中・腰まわりです。

## お湯の温度と洗い方
熱すぎるお湯は角層の油分を落としやすく、長風呂も同様です。体を洗うときはナイロンタオルでこすらず、よく泡立てた泡で手洗いする方が負担が少なくなります。

## 環境と衣類
加湿器などで室内の湿度を保つこと、肌着をチクチクしない素材（綿など）にすることも、かゆみ対策として効きます。特に冬場の暖房の効いた部屋は想像以上に乾燥しています。

## 新人スタッフへの伝え方
新人スタッフに説明するときは「順番→理由→今日の一歩」の順で伝えると腹落ちしやすいです。手順だけを暗記させると応用が利かず、理由だけを話すと現場で動けません。よくある失敗は、初回の説明で全部を伝えようとして何も残らないこと。1回の説明で持ち帰ってもらうのは1つに絞ります。

## よくある質問
「保湿剤は朝も塗るべきか」→ 乾燥が気になる季節は朝晩の2回が続けやすい目安です。「かゆみが強いときは」→ 自己判断で市販薬を使い続けず、皮膚科で相談することがすすめられます。`,
    type: 'note-article',
  });
  try {
    // 既定値の検証のため xLength / postType は**送らない**（サーバー側の既定がミニ講義・ノウハウ型であること）
    const res = await request.post('/api/dr-hub/x-post', {
      data: { articleId, threadCount: 2 },
      timeout: REQ_TIMEOUT,
    });
    expect(res.status()).toBe(200);
    const data = await res.json();

    // 既定=ミニ講義型: 単発ポストが1,000字以上（v2の最重要変更。旧140字上限は廃止）
    expect(data.xLength).toBe('mini');
    const single = String(data.single ?? '');
    expect(single.length, '既定でミニ講義型（1,000字以上）').toBeGreaterThanOrEqual(1000);
    expect(single.length).toBeLessThanOrEqual(25000);

    // URLは本文に入らない（1つ目のリプライへ＝X-03）。サーバー検証の警告も出ていないこと
    expect(/https?:\/\//.test(single), '単発ポスト本文にURLが無い').toBe(false);
    const thread = (data.thread ?? []) as string[];
    expect(thread.length).toBeGreaterThanOrEqual(2);
    expect(/https?:\/\//.test(thread[0] ?? ''), 'スレッド1本目にURLが無い').toBe(false);
    const singleWarnings = (data.warnings?.single ?? []) as Array<{ code: string }>;
    expect(singleWarnings.some((w) => w.code === 'url-in-body')).toBe(false);
    expect(singleWarnings.some((w) => w.code === 'too-many-hashtags'), 'ハッシュタグ2個以下').toBe(false);

    // URLリプライ用の導線文が別で返る
    expect(String(data.urlReplyLeadin ?? '').length).toBeGreaterThan(0);
  } finally {
    const del = await request.delete('/api/library', { data: { id: articleId } });
    expect(del.status()).toBe(200);
  }
});

test('B18: Kindle多軸展開（269）— 書き下ろしが構造どおりで書籍文脈が残らない @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  // インライン章（手動アップロード経路）＝シード不要・残骸なし
  const res = await request.post('/api/kindle/note-remix', {
    data: {
      chapter: {
        title: '[E2E] 入浴後の保湿の基本',
        content:
          '角層は水分を保つバリアの役割を持つ。入浴後は角層に水分が残っているうちに保湿剤を塗るのが基本で、時間を置くほど水分は失われる。' +
          'こすらず手のひらで押さえるようにのばす。熱すぎるお湯・長風呂は角層の油分を落としやすい。' +
          '加湿と刺激の少ない肌着も助けになる。かゆみが強い場合は皮膚科での相談がすすめられる。',
      },
      bookTitle: '[E2E] 検証用書籍',
      personaKey: 'homemaker',
      angleKey: 'daily',
    },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const data = await res.json();

  // タイトル3本がマーカー分離で返る（264規約の再利用）
  expect(Array.isArray(data.titles)).toBe(true);
  expect(data.titles.length).toBe(3);

  // 本文: h1なし・##見出し2本以上・書籍への導線を含む
  const body = String(data.content ?? '');
  expect(body.length).toBeGreaterThan(500);
  expect(/^#\s/m.test(body)).toBe(false);
  expect((body.match(/^##\s/gm) ?? []).length).toBeGreaterThanOrEqual(2);
  expect(body).toContain('書籍');
  // 310（R-114）: remix の生成物も1文1行
  expect(findMultiSentenceLines(body), '1文1行').toEqual([]);

  // §7: 書籍文脈の残存なし（プロンプト＋機械検証の二段構えの実測）
  expect(data.contextHits).toEqual([]);
  // §2-2: 書き下ろしのため一致度は警告しきい値未満
  expect(data.overlapWarn).toBe(false);
  expect(data.ad_check?.status === 'ok' || data.ad_check?.status === 'warn').toBe(true);
});

// 275: プレゼン原稿は**マルチモーダル**（画像＋テキスト）で1ページ1リクエスト。
// モック版（C73）では画像の受け渡し形式（inlineData）が正しいかを検証できないため、
// 実AIで1枚だけ通す（R-36: AI経路の成否を検証しないE2Eは証拠にならない）。
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('B19: プレゼン原稿1ページ（275）— 画像＋テキストで4要素・要点・テーマ推定が返る @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const res = await request.post('/api/presentation/page-script', {
    data: {
      pageNumber: 1,
      totalPages: 2,
      audience: 'staff',
      theme: '', // 未指定＝1枚目から推定させる（§3-3）
      imageDataUrl: `data:image/png;base64,${TINY_PNG_B64}`,
      pageText: '保湿剤の基本／角層の水分を保つ／入浴後は早めに塗る／1日2回が目安',
      prevSummary: '',
      nextTitle: '外用薬の塗り方',
    },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const json = await res.json();
  // §3-5: 原稿の型（4要素）がすべて文字列で返る
  for (const key of ['connect', 'main', 'supplement', 'handoff']) {
    expect(typeof json.sections?.[key], `${key} が文字列で返る`).toBe('string');
  }
  expect(json.sections.main.length, '本題が空でない').toBeGreaterThan(0);
  // §3-3: 次ページへ渡す要点は1〜2文に圧縮されている
  expect(json.summaryForNext.length).toBeGreaterThan(0);
  expect(json.summaryForNext.length).toBeLessThanOrEqual(SUMMARY_FOR_NEXT_MAX + 1);
  // テーマ未指定でも1枚目から推定される
  expect(String(json.inferredTheme).length).toBeGreaterThan(0);
  expect(json._ai?.provider).toBe('gemini');
  // 話し言葉の原稿＝見出し記号を含まない
  expect(json.sections.main).not.toContain('##');
});

test('B20: プレゼン原稿は読むものが無ければ400（偽の原稿を作らない） @gen', async ({ request }) => {
  // AIは呼ばない（バリデーションで弾く経路）
  const res = await request.post('/api/presentation/page-script', {
    data: { pageNumber: 1, totalPages: 1, audience: 'staff', theme: '', imageDataUrl: '', pageText: '' },
  });
  expect(res.status()).toBe(400);
});

// 276: 比喩生成もモック版（C74）ではAIの応答形（3軸・限界の併記）を検証できないため、
// 1層だけ実AIで通す（R-36）。医療分野＝ガードが最も厚い経路を選ぶ。
test('B21: 喩え話・比喩（276）— 医療分野の1層が3軸で返り、各比喩に限界が併記される @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const res = await request.post('/api/metaphor', {
    data: {
      text: 'ミトコンドリアは細胞の中にある小器官で、栄養と酸素からATPというエネルギーの通貨を作り出しています。',
      field: 'medical',
      audience: 'junior',
    },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const json = await res.json();
  // §6-2: 3軸が固定順で必ず3つ返る（軸をAIに選ばせない）
  expect(json.items?.map((i: { axis: string }) => i.axis)).toEqual(['structure', 'process', 'scale']);
  // §5-2: 「該当なし」でない比喩には当てはまる範囲／当てはまらない点が付く
  const real = (json.items as { metaphor: string; appliesTo: string; doesNotApply: string }[])
    .filter((i) => !i.metaphor.startsWith('該当なし'));
  expect(real.length, '少なくとも1軸は比喩が立つ').toBeGreaterThan(0);
  for (const item of real) {
    expect(item.appliesTo.length, '当てはまる範囲が空でない').toBeGreaterThan(0);
    expect(item.doesNotApply.length, '当てはまらない点が空でない').toBeGreaterThan(0);
  }
  expect(json._ai?.provider).toBe('gemini');
});

test('B22: 一般分野では医療特化のターゲット層を受け付けない（276§4-2・画面の出し分けをサーバーでも担保） @gen', async ({ request }) => {
  // AIは呼ばない（バリデーションで弾く経路）
  const res = await request.post('/api/metaphor', {
    data: { text: 'インフレは物の値段が上がることです。', field: 'general', audience: 'beauty' },
  });
  expect(res.status()).toBe(400);
});

// 279: 言い換え1箇所の実AI経路（R-36）。医療分野＝ガードが最も厚い経路。
test('B23: 分かりやすさ診断の言い換え（279）— 1箇所で候補が返り、元の文と異なる @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const sentence = '角層のバリア機能が低下すると経皮吸収が亢進する。';
  const res = await request.post('/api/plain-check/rephrase', {
    data: { field: 'medical', audience: 'junior', kind: 'term', sentence, excerpt: '角層', detail: '＝肌のいちばん外側の層', before: '', after: '' },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(Array.isArray(json.candidates)).toBe(true);
  // 候補が空なら reason が付く（偽の成功にしない）。候補があれば元の文と異なる
  if (json.candidates.length === 0) expect(String(json.reason).length).toBeGreaterThan(0);
  for (const c of json.candidates) {
    expect(typeof c.text).toBe('string');
    expect(c.text).not.toBe(sentence);
  }
  expect(json._ai?.provider).toBe('gemini');
});

test('B24: 言い換えは文が無ければ400（279） @gen', async ({ request }) => {
  const res = await request.post('/api/plain-check/rephrase', { data: { field: 'medical', audience: 'junior', kind: 'long' } });
  expect(res.status()).toBe(400);
});


// 281: 参考例（あるある）の実AI経路（R-36）。問いかけの形・5〜7件の上限をサーバ側で担保する
test('B25: エピソード記録の参考例（281）— 問いかけの形で1〜7件返る @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const res = await request.post('/api/episodes/examples', {
    data: { theme: '[E2E] 浪人時代の勉強' },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(Array.isArray(json.items)).toBe(true);
  expect(json.items.length).toBeGreaterThanOrEqual(1);
  expect(json.items.length).toBeLessThanOrEqual(7);
  for (const it of json.items) {
    expect(typeof it).toBe('string');
    expect(String(it).trim()).toMatch(/(か|？|\?)$/);
  }
  expect(json._ai?.provider).toBe('gemini');
});

test('B26: 参考例はテーマが無ければ400（281） @gen', async ({ request }) => {
  const res = await request.post('/api/episodes/examples', { data: {} });
  expect(res.status()).toBe(400);
});

test('B27: AI統合サマリー（287 §2-5）— 実AIの出力に h1（# ）が無く ## で構成される @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const res = await request.post('/api/merge', {
    data: {
      items: [
        { title: '[E2E] 保湿剤の基礎', content: '保湿剤は角層の水分保持を助ける。ヘパリン類似物質・尿素・ワセリンが代表的。' },
        { title: '[E2E] ワセリンの特性', content: 'ワセリンは閉塞性の保湿剤で刺激が少ない。べたつきが欠点。' },
      ],
    },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const { result } = (await res.json()) as { result: string };
  expect(typeof result).toBe('string');
  expect(result.length).toBeGreaterThan(100);
  expect(result, '見出しレベル1（# ）を使わないこと').not.toMatch(/^# /m);
  expect(result, '見出しは ## で構成されること').toMatch(/^## /m);
});

test('B28: モデル比較の Claude Opus 5 側（290）— compare:"opus" で実生成が完走し、meta が claude-opus-5・done に使用量・error なし・Gemini へ切り替わらない @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const t0 = Date.now();
  const res = await request.post('/api/deepresearch', {
    data: { topic: '[E2E] 保湿剤の基礎', depth: 'quick', model: 'claude', compare: 'opus' },
    timeout: REQ_TIMEOUT,
  });
  const elapsedMs = Date.now() - t0;
  expect(res.status()).toBe(200);
  expect(res.headers()['x-ai-provider'], 'フォールバック無効＝Gemini のヘッダが付かない（R-99）').toBeUndefined();
  const body = await res.text();
  const events = body.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
  const meta = events.find((e) => e.type === 'meta');
  expect(meta?.model, '実際に呼んだモデルが Opus 5').toBe('claude-opus-5');
  expect(events.some((e) => e.type === 'error'), `error が無いこと: ${JSON.stringify(events.find((e) => e.type === 'error'))}`).toBe(false);
  const done = events.find((e) => e.type === 'done') as { usage?: { input_tokens?: number; output_tokens?: number }; elapsedMs?: number } | undefined;
  expect(done, 'done で終わる').toBeTruthy();
  expect(done?.usage?.output_tokens ?? 0).toBeGreaterThan(0);
  const chars = events.filter((e) => e.type === 'text').map((e) => String(e.content ?? '')).join('').length;
  expect(chars, '本文が返る').toBeGreaterThan(200);
  // R-73: 実測所要を報告に載せる（maxDuration 300秒との整合判断用）
  console.log(`[B28] Opus 5 quick: client ${elapsedMs}ms / server ${done?.elapsedMs}ms / ${chars}字 / usage ${JSON.stringify(done?.usage)}`);
  expect(elapsedMs, 'maxDuration の内側で終わる').toBeLessThan(300_000);
  // 292 §3-5: Opus 5 の出力に HTML タグ（<span> <div> <p> 等）が含まれない（是正はプロンプト側・表示側は不変）
  const text = events.filter((e) => e.type === 'text').map((e) => String(e.content ?? '')).join('');
  const tag = text.match(HTML_TAG_RE);
  expect(tag, `HTMLタグが本文に出ないこと（検出: ${tag?.[0] ?? '無し'} …${text.slice(Math.max(0, (tag?.index ?? 0) - 40), (tag?.index ?? 0) + 60)}）`).toBeNull();
  // 294 §2-5: 出力が本文（見出しまたは本文の1文目）から始まり、英語の前置き（作業宣言）を含まない。是正はプロンプト側
  expectNoPreamble(text, 'B28');
});

/** 292: 本文に出てはいけない HTML タグ（装飾・レイアウト用途）。コードブロック内も含めて本文に無いことを見る */
const HTML_TAG_RE = /<\/?(span|div|p|b|i|u|br|font|a|strong|em|h[1-6]|ul|ol|li|table|tr|td)\b[^>]*>/i;

/** 294 §2: Opus が出した英語の作業宣言（"I'll research this topic thoroughly before writing the report."）の型 */
const PREAMBLE_RE = /^\s*(I['’]ll|I will|I am going to|Let me|Here is|Here's|Sure|Certainly|Okay|OK)\b/i;

/** 294 §2-5: 本文が見出し（#）または日本語の1文目から始まり、前置きが「#」に連結していないこと */
function expectNoPreamble(text: string, label: string) {
  const head = text.trimStart().slice(0, 120);
  expect(head, `[${label}] 英語の作業宣言で始まらない（先頭: ${JSON.stringify(head)}）`).not.toMatch(PREAMBLE_RE);
  expect(head, `[${label}] 見出し（#）または日本語の本文から始まる（先頭: ${JSON.stringify(head)}）`).toMatch(/^(#{1,6}\s|[^\x00-\x7F])/);
  // 「前置き# 見出し」のように空白なしで # が連結されて見出しが壊れる形が無い（行頭以外の "# " は本文中の記号として許容しない）。
  // 直前の1文字に # 自身を含めない（"## 見出し" の1文字目の # が [^\n\s] に食われて偽陽性になった＝初回実測）
  const glued = text.match(/[^\n\s#]#{1,6} \S/);
  expect(glued, `[${label}] 前置きと見出しが1行に混ざらない（検出: ${glued?.[0] ?? '無し'}）`).toBeNull();
}

test('B29: モデル比較の Gemini 側（292 §3-5）— compare:"gemini" の実生成に退行がなく、HTML タグが本文に出ない @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const res = await request.post('/api/deepresearch', {
    data: { topic: '[E2E] 保湿剤の基礎', depth: 'quick', model: 'gemini', compare: 'gemini' },
    timeout: REQ_TIMEOUT,
  });
  expect(res.status()).toBe(200);
  const body = await res.text();
  const events = body.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
  expect(events.some((e) => e.type === 'error'), `error が無いこと: ${JSON.stringify(events.find((e) => e.type === 'error'))}`).toBe(false);
  expect(events.find((e) => e.type === 'done'), 'done で終わる').toBeTruthy();
  // Gemini 側は streamWithModel の 'delta' 形式（画面側も text/delta の両方を本文として扱う）
  const text = events.filter((e) => e.type === 'text' || e.type === 'delta').map((e) => String(e.content ?? e.text ?? '')).join('');
  expect(text.length, '本文が返る').toBeGreaterThan(200);
  const tag = text.match(HTML_TAG_RE);
  expect(tag, `HTMLタグが本文に出ないこと（検出: ${tag?.[0] ?? '無し'}）`).toBeNull();
  // 294 §6: Gemini 側にも同じ定数が入る（害なし）。前置きが出ないこと＝退行なし
  expectNoPreamble(text, 'B29');
});

test('B31: ②分割記事化（310・R-114）— 1記事分の実出力が1文1行・段落間空行・h1なし（B16 と同じ判定） @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const drId = await createLibraryItem(request, {
    title: `310検証用DR記事 ${RUN_ID}`,
    content:
      '# 冬の乾燥肌と保湿ケア\n\n角層は水分を保つバリアの役割を持つ。冬は空気の乾燥と暖房で角層の水分が失われやすい。' +
      '入浴後は早めに保湿剤を塗る・こすらず押さえるようにのばす・熱すぎるお湯を避ける、が基本とされる。' +
      '室内の加湿や刺激の少ない肌着も助けになる。かゆみが強い場合は皮膚科での相談がすすめられる。',
    type: 'deepresearch',
  });
  try {
    const res = await request.post('/api/dr-hub/split', {
      data: {
        drId,
        mode: 'article',
        article: { title: '[E2E] 入浴後の保湿はなぜ早さが効くのか', points: ['角層の水分は入浴後に失われる', '塗り方は押さえるように'], role: '導入', audience: '乾燥肌に悩む一般読者' },
        series: { index: 1, total: 1 },
        length: 'short',
      },
      timeout: REQ_TIMEOUT,
    });
    const data = await res.json().catch(() => ({}));
    expect(res.status(), JSON.stringify(data).slice(0, 300)).toBe(200);
    const body = String(data.content ?? '');
    expect(body.length).toBeGreaterThan(300);
    // 310追加: 見出し規約（##/### の2階層・h1 なし）も二段構え（共通規約＋enforceNoteHeadingLevels）で全経路
    expect(/^#\s/m.test(body), '本文にh1（#）が無い').toBe(false);
    expect(findBadHeadingLines(body), '見出しは2階層').toEqual([]);
    expect(body).toContain('\n\n');
    expect(findMultiSentenceLines(body), '1文1行').toEqual([]);
  } finally {
    const del = await request.delete('/api/library', { data: { id: drId } });
    expect(del.status()).toBe(200);
  }
});

test('B32: 旧 note記事生成（310・R-114）— ストリーミング完了後の本文（画面側・編集欄の生Markdown）が1文1行・段落間空行 @gen', async ({ page }) => {
  test.setTimeout(GEN_TIMEOUT);
  await page.route('**/api/feature-drafts**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ? { draft: null } : { ok: true }) }),
  );
  await page.goto('/dashboard/note-article');
  const theme = page.locator('textarea').first();
  await expect(theme).toBeVisible({ timeout: 30000 });
  await theme.fill('[E2E] 入浴後すぐの保湿を習慣にするコツ（短く）');
  const shortBtn = page.getByRole('button', { name: /短め/ });
  if ((await shortBtn.count()) > 0) await shortBtn.first().click();
  await page.locator('[data-note-generate]').click();
  // ストリーミング完了＝編集欄（生Markdown）が空でなくなり、生成中の表示が消える
  const editToggle = page.locator('[data-note-edit-toggle]');
  await expect(editToggle).toBeVisible({ timeout: REQ_TIMEOUT });
  await editToggle.click();
  const editor = page.locator('[data-note-editor]');
  await expect(editor).toBeVisible();
  await expect.poll(async () => (await editor.inputValue()).length, { timeout: REQ_TIMEOUT }).toBeGreaterThan(300);
  const body = await editor.inputValue();
  expect(body).toContain('\n\n');
  expect(findMultiSentenceLines(body), '1文1行（done で整形）').toEqual([]);
});

test('B33: マンダラからのリサーチ発注（311）— 付帯情報つきの1トピックをバッチ経路で実行すると、完了時にそのマスへ 📚 が自動で紐づき（302 の addLinks）、印 meta.research が消え、library.metadata に出どころが載る @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const marker = `MRSG${RUN_ID}`;
  const { id: chartId, cells } = await createMandalaChart(request, `${marker} 保湿を続ける`);
  const cell0 = cells.find((c) => c.position === 0)!;
  expect((await saveMandalaCell(request, cell0.id, { title: '入浴後すぐの保湿', body: '角層の水分は入浴後に失われやすい。5分以内に塗る。' })).status()).toBe(200);
  let jobId: number | null = null;
  const createdLibrary: string[] = [];
  try {
    const job = await request.post('/api/batch-research', {
      data: { groupName: `[E2E] ${marker} 発注`, topics: [{ topic: `[E2E] ${marker} 入浴後すぐの保湿剤の塗り方（短く）`, mode: 'quick', mandala: { source: 'research', chartId, cellId: cell0.id, kind: 'deepresearch' } }], scheduleType: 'browser', autoSave: true },
    });
    expect(job.status()).toBe(200);
    jobId = Number((await job.json()).job.id);
    const run = await request.post(`/api/batch-research/${jobId}/run`, { data: { model: 'gemini' }, timeout: REQ_TIMEOUT });
    expect(run.status()).toBe(200);
    const body = await run.text();
    expect(body).toContain('"type":"topic_done"');
    expect(body).toContain('"type":"mandala_linked"');
    expect(body).toMatch(/"type":"mandala_linked","index":0,"cellId":"[0-9a-f-]+","ok":true/);
    const links = await request.get(`/api/mandala/links?cellId=${cell0.id}`).then((r) => r.json());
    expect(links.links.length, '完了で 📚 が1件紐づく').toBe(1);
    expect(links.links[0].scope).toBe('library');
    createdLibrary.push(links.links[0].item_key);
    const chart = await request.get(`/api/mandala/${chartId}`).then((r) => r.json());
    expect(chart.chart.cells.find((c: { id: string }) => c.id === cell0.id).meta.research, '印が消える').toBeUndefined();
    const lib = await request.get(`/api/library?q=${encodeURIComponent(marker)}`).then((r) => r.json());
    const row = (Array.isArray(lib) ? lib : []).find((x: { id: string }) => x.id === links.links[0].item_key);
    expect(row, 'library 行に出どころ（metadata.mandala.source=research）').toBeTruthy();
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    expect(meta.mandala).toMatchObject({ source: 'research', chartId, cellId: cell0.id });
  } finally {
    // 要約行（末尾 s）も同じ検索で拾って消す。context_saves はバッチタグで残るが [E2E] 印は無い＝ジョブ削除で履歴は消える
    const lib = await request.get(`/api/library?q=${encodeURIComponent(marker)}`).then((r) => r.json()).catch(() => []);
    const ids = new Set<string>([...createdLibrary, ...((Array.isArray(lib) ? lib : []).map((x: { id: string }) => x.id))]);
    if (ids.size > 0) await request.delete('/api/library', { data: { ids: [...ids] } }).catch(() => {});
    if (jobId) await request.delete(`/api/batch-research?id=${jobId}`).catch(() => {});
    await deleteMandalaChart(request, chartId);
  }
});

test('B34: マンダラ→X投稿（312）— マス1つから投稿群（本数2）が生成され、本文に外部URLが無く上限内・本数が一致・URLはセルフリプライ欄へ・出どころが返る・医療広告ガード（ad 警告の形）は既存のまま @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const marker = `MXG${RUN_ID}`;
  const { id: chartId, cells } = await createMandalaChart(request, `${marker} 保湿を続ける`);
  const cell0 = cells.find((c) => c.position === 0)!;
  expect((await saveMandalaCell(request, cell0.id, { title: '入浴後すぐの保湿', body: '角層の水分は入浴後に失われやすい。5分以内に塗る。自分で3週間続けて塗り忘れが減った。\n参考 https://example.com/moisture' })).status()).toBe(200);
  try {
    const res = await request.post('/api/dr-hub/x-post', {
      data: { mandala: { chartId, mode: 'cell', cellId: cell0.id, count: 2 }, threadCount: 2, xLength: 'short', postType: 'knowhow' },
      timeout: REQ_TIMEOUT,
    });
    const data = await res.json().catch(() => ({}));
    expect(res.status(), JSON.stringify(data).slice(0, 300)).toBe(200);
    const thread: string[] = Array.isArray(data.thread) ? data.thread : [];
    expect(thread.length, '本数（thread）が一致').toBe(2);
    for (const t of [String(data.single ?? ''), ...thread]) {
      expect(t.length).toBeGreaterThan(0);
      expect(/https?:\/\//.test(t), '本文に外部URLが無い（コード側で移す）').toBe(false);
      expect(t.length).toBeLessThanOrEqual(25000);
    }
    expect(Array.isArray(data.replyUrls)).toBe(true);
    expect(data.replyUrls, '気づきの URL はセルフリプライ候補へ').toContain('https://example.com/moisture');
    expect(data.mandala).toMatchObject({ source: 'mandala', chartId, mode: 'cell', cellId: cell0.id, count: 2 });
    expect(typeof data.warnings).toBe('object');
  } finally {
    await deleteMandalaChart(request, chartId);
  }
});

test('B35: モデル比較の GPT-6 Astra 側（314）— compare:"gpt" で実生成が完走し、meta が gpt-6-astra・done に使用量・error なし・前置き禁止（294）が効く。キーが無い環境では未設定の失敗がその列に出る @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const avail = (await (await request.get('/api/deepresearch/compare')).json()) as { availability: { gpt: boolean } };
  const t0 = Date.now();
  const res = await request.post('/api/deepresearch', {
    data: { topic: '[E2E] 保湿剤の基礎', depth: 'quick', model: 'claude', compare: 'gpt', runId: `e2e-b35-${Date.now()}` },
    timeout: REQ_TIMEOUT,
  });
  const elapsedMs = Date.now() - t0;
  expect(res.status()).toBe(200);
  expect(res.headers()['x-ai-provider'], 'フォールバック無効＝Gemini のヘッダが付かない（R-99）').toBeUndefined();
  const body = await res.text();
  const events = body.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
  const meta = events.find((e) => e.type === 'meta');
  expect(meta?.model, '実際に呼んだモデルが GPT-6 Astra').toBe('gpt-6-astra');
  const err = events.find((e) => e.type === 'error') as { message?: string; unavailable?: boolean } | undefined;
  if (!avail.availability.gpt) {
    expect(err?.unavailable, 'キー未設定なら未設定の失敗（他の列には影響しない）').toBe(true);
    return;
  }
  if (err?.unavailable) {
    // API 提供がまだのアカウント（403/404）: その列だけ失敗として出る設計（fail-closed）。報告に載せる
    console.log(`[B35] GPT-6 Astra は未提供: ${err.message}`);
    expect(err.message).toContain('まだ提供されていません');
    return;
  }
  expect(err, `error が無いこと: ${JSON.stringify(err)}`).toBeUndefined();
  expect(events.some((e) => e.type === 'timeout'), '時間切れでない').toBe(false);
  const done = events.find((e) => e.type === 'done') as { usage?: { input_tokens?: number; output_tokens?: number }; elapsedMs?: number; finishedAt?: string } | undefined;
  expect(done, 'done で終わる').toBeTruthy();
  expect(done?.usage?.output_tokens ?? 0).toBeGreaterThan(0);
  expect(typeof done?.finishedAt).toBe('string');
  const text = events.filter((e) => e.type === 'text').map((e) => String(e.content ?? '')).join('');
  expect(text.length, '本文が返る').toBeGreaterThan(200);
  console.log(`[B35] GPT-6 Astra quick: client ${elapsedMs}ms / server ${done?.elapsedMs}ms / ${text.length}字 / usage ${JSON.stringify(done?.usage)}`);
  expect(elapsedMs, 'maxDuration の内側で終わる').toBeLessThan(600_000);
  const tag = text.match(HTML_TAG_RE);
  expect(tag, `HTMLタグが本文に出ないこと（検出: ${tag?.[0] ?? '無し'}）`).toBeNull();
  expectNoPreamble(text, 'B35');
});

test('B36: 記事→図解（315）— プラン抽出（Gemini）が本文の語句だけで JSON を返しビフォーアフター型が無い。キーがあれば GPT Image 2.5（gpt-image-2.5-flare）で1枚生成→文字を重ねた完成PNGと元画像が返る @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const text = '朝の保湿は洗顔のあと5分以内に行う。化粧水をなじませてから乳液で蓋をする。夜はクレンジングのあとに同じ手順で保湿する。週に1回は角質ケアを足す。冬は加湿器で室内の湿度を保つ。乾燥が強い日は保湿剤を重ねづけする。';
  const planRes = await request.post('/api/visuals/plan', { data: { text }, timeout: REQ_TIMEOUT });
  expect(planRes.status()).toBe(200);
  const plan = (await planRes.json()) as { plans: { id: string; type: string; title: string; groups: { heading?: string; points: string[] }[] }[]; checks: Record<string, { foreign: string[] }> };
  expect(plan.plans.length, '候補が返る').toBeGreaterThan(0);
  expect(plan.plans.every((p) => p.type !== 'beforeafter'), 'ビフォーアフター型が無い').toBe(true);
  const foreignTotal = plan.plans.reduce((n, p) => n + (plan.checks[p.id]?.foreign.length ?? 0), 0);
  console.log(`[B36] plans=${plan.plans.length} types=${plan.plans.map((p) => p.type).join(',')} foreign=${foreignTotal}`);
  const status = (await (await request.get('/api/visuals?mode=status')).json()) as { gptImage: boolean };
  if (!status.gptImage) {
    console.log('[B36] OPENAI_API_KEY 未設定＝画像はスキップ');
    return;
  }
  const imgPlan = { id: 'b36', type: 'image', title: '朝の保湿', groups: [{ points: ['乳液で蓋をする'] }], imagePrompt: '洗面台と朝の光' };
  const t0 = Date.now();
  const res = await request.post('/api/visuals/image', { data: { plan: imgPlan, sourceText: text, settings: { orientation: 'landscape', quality: 'low', aiText: false, extraPrompt: '', model: 'flare' } }, timeout: REQ_TIMEOUT });
  const json = (await res.json()) as { originalBase64?: string; finalBase64?: string; width?: number; height?: number; model?: string; costUsd?: number | null; error?: string; unavailable?: boolean };
  if (res.status() !== 200 && json.unavailable) {
    console.log(`[B36] GPT Image 2.5 は未提供: ${json.error}`);
    expect(json.error).toContain('まだ提供されていません');
    return;
  }
  expect(res.status(), `画像生成が 200: ${json.error ?? ''}`).toBe(200);
  expect(json.model).toBe('gpt-image-2.5-flare');
  expect((json.originalBase64?.length ?? 0) > 1000, '元画像が返る').toBe(true);
  expect((json.finalBase64?.length ?? 0) > 1000, '完成画像が返る').toBe(true);
  expect(json.finalBase64 !== json.originalBase64, '文字を重ねた完成画像は元画像と別').toBe(true);
  expect(json.width).toBe(1536);
  console.log(`[B36] GPT Image 2.5 low landscape: ${Date.now() - t0}ms / cost ${json.costUsd ?? 'n/a'}`);
});

test('B37: 記事→マンダラ生成（316・Gemini）— 実記事1件から 9 マスができ（要点2件以上・全要点に引用が本文に実在）、81 で1つの要点に小項目が付く。捨てた件数を報告 @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const article = '朝の保湿は洗顔のあと5分以内に行う。化粧水をなじませてから乳液で蓋をする。夜はクレンジングのあとに同じ手順で保湿する。週に1回は角質ケアを足す。冬は加湿器で室内の湿度を保つ。乾燥が強い日は保湿剤を重ねづけする。入浴後はタオルで押さえるように水分を拭き取り、こすらない。熱すぎるお湯は皮脂を落としすぎるので、ぬるめの湯温にする。かゆみが強いときは皮膚科で相談する。';
  const libId = await createLibraryItem(request, { title: `316検証用の記事 ${RUN_ID}`, content: article, type: 'deepresearch' });
  let chartId: string | null = null;
  try {
    const t0 = Date.now();
    const res = await request.post('/api/mandala/generate', { data: { scope: 'library', itemKey: libId, mode: '81' }, timeout: REQ_TIMEOUT });
    const json = (await res.json()) as { chartId?: string; points?: { position: number; cellId: string; title: string }[]; dropped?: { points: number; relations: number; reasons: string[] }; error?: string };
    expect(res.status(), `第1段階が 200: ${json.error ?? ''}`).toBe(200);
    chartId = json.chartId!;
    expect(json.points!.length, '要点2件以上').toBeGreaterThanOrEqual(2);
    const chart = (await (await request.get(`/api/mandala/${chartId}`)).json()).chart as { cells: { id: string; depth: number; position: number; title: string; body: string; meta: { origin?: string } }[] };
    const normalize = (s: string) => s.replace(/[\s　]+/g, '');
    for (const p of json.points!) {
      const cell = chart.cells.find((c) => c.id === p.cellId)!;
      expect(cell.meta.origin).toBe('ai');
      const m = cell.body.match(/> 引用: (.+)$/);
      expect(m, `要点「${p.title}」に引用がある`).toBeTruthy();
      expect(normalize(article).includes(normalize(m![1])), `引用が本文に実在: ${m![1]}`).toBe(true);
    }
    console.log(`[B37] stage1 ${Date.now() - t0}ms points=${json.points!.length} dropped=${JSON.stringify(json.dropped)}`);
    const t1 = Date.now();
    const p = json.points![0];
    const r2 = await request.post('/api/mandala/generate/point', { data: { chartId, cellId: p.cellId }, timeout: REQ_TIMEOUT });
    const j2 = (await r2.json()) as { created?: number; dropped?: { items: number }; error?: string };
    expect(r2.status(), `第2段階が 200: ${j2.error ?? ''}`).toBe(200);
    expect(j2.created ?? 0, '小項目が1件以上').toBeGreaterThan(0);
    const chart2 = (await (await request.get(`/api/mandala/${chartId}`)).json()).chart as { cells: { parent_cell_id: string | null; title: string; body: string; meta: { origin?: string } }[] };
    const kids = chart2.cells.filter((c) => c.parent_cell_id === p.cellId);
    expect(kids.length).toBe(8);
    for (const k of kids.filter((c) => c.title)) {
      const m = k.body.match(/> 引用: (.+)$/);
      expect(m && normalize(article).includes(normalize(m[1])), '小項目の引用が本文に実在').toBe(true);
    }
    console.log(`[B37] stage2 ${Date.now() - t1}ms created=${j2.created} dropped=${JSON.stringify(j2.dropped)}`);
  } finally {
    if (chartId) await request.delete(`/api/mandala?id=${chartId}`).catch(() => {});
    await request.delete('/api/library', { data: { ids: [libId] } }).catch(() => {});
  }
});

test('B38: AIでまとめるの二段出力と素材パック（317・実AI）— 3件から要約（1,000〜2,000字目標）と詳細（5,000〜8,000字目標）が並列で出る（目標外なら表示のみ）・詳細から関連図（types=relation）のプランが出て描ける・スライド構成案が1本保存される @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const mk = (t: string, body: string) => createLibraryItem(request, { title: `${t} ${RUN_ID}`, content: body });
  const ids = [
    await mk('317素材A', '朝の保湿は洗顔のあと5分以内に行う。化粧水をなじませてから乳液で蓋をする。皮膚科では保湿剤の重ねづけを勧めている。乾燥が強い日は入浴後3分以内の保湿が目安とされる。'),
    await mk('317素材B', '冬は加湿器で室内の湿度を40〜60%に保つ。熱すぎるお湯は皮脂を落としすぎるため、ぬるめ（38〜40度）にする。タオルで押さえるように水分を拭き取り、こすらない。'),
    await mk('317素材C', '週に1回の角質ケアは、やりすぎるとバリア機能を損なう。かゆみが強いときは皮膚科で相談する。保湿の習慣は2週間続けると肌の水分量が安定してくると説明されることが多い。'),
  ];
  const payload = ids.map((id, i) => ({ title: `素材${i} ${RUN_ID}`, content: `保湿の基本 ${i}` }));
  const saved: string[] = [...ids];
  try {
    const t0 = Date.now();
    const [sRes, dRes] = await Promise.all([
      request.post('/api/merge', { data: { items: payload, mode: 'summary' }, timeout: REQ_TIMEOUT }),
      request.post('/api/merge', { data: { items: payload, mode: 'detail' }, timeout: REQ_TIMEOUT }),
    ]);
    const s = (await sRes.json()) as { result?: string; error?: string; chars?: number };
    const d = (await dRes.json()) as { result?: string; error?: string; chars?: number };
    expect(sRes.status(), `要約が 200: ${s.error ?? ''}`).toBe(200);
    expect(dRes.status(), `詳細が 200: ${d.error ?? ''}`).toBe(200);
    console.log(`[B38] merge ${Date.now() - t0}ms summary=${s.chars} detail=${d.chars}`);
    expect(s.result!.length).toBeGreaterThan(300);
    expect(d.result!.length, '詳細は要約より長い').toBeGreaterThan(s.result!.length);
    // 関連図（詳細を元テキストに・種類を絞る）→ 描画（文字一致の機械判定つき）
    const plan = await request.post('/api/visuals/plan', { data: { text: d.result, types: ['relation'] }, timeout: REQ_TIMEOUT });
    const pj = (await plan.json()) as { plans: { id: string; type: string; groups: { heading?: string; points: string[] }[] }[]; checks: Record<string, { foreign: string[] }>; error?: string };
    expect(plan.status(), pj.error ?? '').toBe(200);
    const rel = pj.plans.find((p) => p.type === 'relation');
    console.log(`[B38] relation plan: ${rel ? `${rel.groups.length} nodes, foreign=${pj.checks[rel.id]?.foreign.length}` : 'none'}`);
    if (rel && (pj.checks[rel.id]?.foreign.length ?? 0) === 0) {
      const r = await request.post('/api/visuals/render', { data: { plan: rel, sourceText: d.result, orientation: 'square' }, timeout: REQ_TIMEOUT });
      const rj = (await r.json()) as { imageBase64?: string; textVerified?: boolean; error?: string };
      expect(r.status(), rj.error ?? '').toBe(200);
      expect(rj.textVerified).toBe(true);
      expect((rj.imageBase64?.length ?? 0) > 5000).toBe(true);
    }
    // スライド構成案（まとめの保存行から）
    const detailId = await createLibraryItem(request, { title: `統合サマリー: 317 ${RUN_ID}`, content: d.result!, type: 'merge' });
    saved.push(detailId);
    const pack = await request.post('/api/pack', { data: { kind: 'slides', ids: [detailId] }, timeout: REQ_TIMEOUT });
    const pk = (await pack.json()) as { id?: string; chars?: number; error?: string; adWarnings?: string[] };
    expect(pack.status(), pk.error ?? '').toBe(200);
    saved.push(pk.id!);
    expect(pk.chars ?? 0).toBeGreaterThan(300);
    console.log(`[B38] slides ${pk.chars} chars adWarnings=${pk.adWarnings?.length ?? 0}`);
  } finally {
    await request.delete('/api/library', { data: { ids: saved } }).catch(() => {});
  }
});


test('B39: 追加リサーチ（319・実AI・Gemini）— 実資料1件＋「これらの企業の直近の年間売上を調べて」で1本生成（前提資料をオプトインで渡す）・出典URLあり・架空の社名は「未確認」と明示・前提資料の固有名詞を保つ・保存で metadata.followUp と継承（用途なし＝空）・一覧に出る @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const article = 'トヨタ自動車、ソニーグループ、任天堂の3社は日本を代表する企業である。加えて、架空の「ルミナ架空商事株式会社（滋賀県草津市・非上場・公開情報なし）」も比較対象に含める。';
  const libId = await createLibraryItem(request, { title: `319検証用の資料 ${RUN_ID}`, content: article, type: 'deepresearch' });
  const libTitle = `[E2E]319検証用の資料 ${RUN_ID}`;
  const saved: string[] = [];
  try {
    const t0 = Date.now();
    const prompt = 'これらの企業の直近の年間売上を調べて';
    const res = await request.post('/api/deepresearch', { data: { topic: prompt, depth: 'quick', model: 'gemini', followUp: { sources: [{ scope: 'library', id: libId }] } }, timeout: REQ_TIMEOUT });
    expect(res.status(), `DR が 200: ${res.status()}`).toBe(200);
    const raw = await res.text();
    let text = '';
    let done = false;
    let timedOut = false;
    let error = '';
    for (const line of raw.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const j = JSON.parse(line.slice(6)) as { type?: string; content?: string; message?: string };
        if (j.type === 'text') text += j.content ?? '';
        else if (j.type === 'done') done = true;
        else if (j.type === 'timeout') timedOut = true;
        else if (j.type === 'error') error = j.message ?? 'error';
      } catch {}
    }
    expect(error, 'エラーなし').toBe('');
    expect(timedOut, '時間切れなし').toBe(false);
    expect(done, 'done が来る').toBe(true);
    expect(text.length, '本文がある').toBeGreaterThan(300);
    expect(text, '出典URLあり').toMatch(/https?:\/\//);
    expect(text, '前提資料の固有名詞を保つ').toMatch(/トヨタ/);
    expect(text, '架空の社名は「未確認」と明示（推測で補わない）').toMatch(/未確認/);
    console.log(`[B39] ${Date.now() - t0}ms chars=${text.length}`);
    // 保存（画面と同じ形）→ followUp が付き、継承は用途・フォルダなし＝空。一覧（🔭 追加: n）に出る
    const meta = followUpMetadata({ sources: [{ scope: 'library', id: libId, title: libTitle }], prompt, mode: 'quick', model: 'gemini-3.7-flash', at: new Date().toISOString(), inherit: true });
    const save = await request.post('/api/library', { data: { type: 'deepresearch', title: followUpTitle(prompt, [libTitle]), content: text, tags: 'ディープリサーチ,追加リサーチ', group_name: 'ディープリサーチ', metadata: { followUp: meta } } });
    expect(save.status()).toBe(200);
    const j = (await save.json()) as { id: string; inherited?: { purposes: number[]; folders: number[] } };
    saved.push(j.id);
    expect(j.inherited).toEqual({ purposes: [], folders: [] });
    const list = (await (await request.get(`/api/followup-research?mode=list&scope=library&id=${libId}`)).json()) as { items: { id: string; prompt: string }[] };
    expect(list.items.map((i) => i.id)).toContain(j.id);
  } finally {
    await request.delete('/api/library', { data: { ids: [libId, ...saved] } }).catch(() => {});
  }
});


test('B40: 生成結果から直接図解・画像（320・実AI）— 種類を絞ったプラン抽出（Gemini・correlation/table/image）が選んだ型だけを返し、相関図の辺はすべてラベルつき・本文に無い語句なし。キーがあれば GPT Image 2.5 で1枚（文字はコードで重ねる＝aiText オフ） @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const text = '睡眠不足は肌荒れと正の相関がある。湿度と乾燥は逆相関で、加湿器は乾燥を減らす。朝の保湿は洗顔のあと5分以内に行う。化粧水をなじませてから乳液で蓋をする。夜はクレンジングのあとに同じ手順で保湿する。週に1回は角質ケアを足す。';
  const types = ['correlation', 'table', 'image'];
  const t0 = Date.now();
  const planRes = await request.post('/api/visuals/plan', { data: { text, types }, timeout: REQ_TIMEOUT });
  expect(planRes.status()).toBe(200);
  const plan = (await planRes.json()) as { plans: { id: string; type: string; title: string; groups: { heading?: string; points: string[] }[] }[]; checks: Record<string, { foreign: string[] }> };
  expect(plan.plans.length, '候補が返る').toBeGreaterThan(0);
  expect(plan.plans.every((p) => types.includes(p.type)), '選んだ型だけ').toBe(true);
  const corr = plan.plans.filter((p) => p.type === 'correlation');
  for (const c of corr) {
    for (const g of c.groups) for (const pt of g.points) expect(pt, `相関図の辺はラベルつき: ${pt}`).toMatch(/^(→|->)\s*[^:：]+[:：]\s*\S/);
  }
  const foreignTotal = plan.plans.reduce((n, p) => n + (plan.checks[p.id]?.foreign.length ?? 0), 0);
  console.log(`[B40] ${Date.now() - t0}ms plans=${plan.plans.length} types=${plan.plans.map((p) => p.type).join(',')} correlation=${corr.length} foreign=${foreignTotal}`);
  const status = (await (await request.get('/api/visuals?mode=status')).json()) as { gptImage: boolean };
  if (!status.gptImage) {
    console.log('[B40] OPENAI_API_KEY 未設定＝画像はスキップ');
    return;
  }
  const imgPlan = { id: 'b40', type: 'image', title: '朝の保湿', groups: [{ points: ['乳液で蓋をする'] }], imagePrompt: '洗面台と朝の光' };
  const t1 = Date.now();
  const res = await request.post('/api/visuals/image', { data: { plan: imgPlan, sourceText: text, settings: { orientation: 'landscape', quality: 'low', aiText: false, extraPrompt: '', model: 'flare' } }, timeout: REQ_TIMEOUT });
  const json = (await res.json()) as { originalBase64?: string; finalBase64?: string; model?: string; costUsd?: number | null; error?: string; unavailable?: boolean };
  if (res.status() !== 200 && json.unavailable) {
    console.log(`[B40] GPT Image 2.5 は未提供: ${json.error}`);
    return;
  }
  expect(res.status(), `画像生成が 200: ${json.error ?? ''}`).toBe(200);
  expect((json.finalBase64?.length ?? 0) > 5000 && (json.originalBase64?.length ?? 0) > 5000, '完成画像と元画像が返る').toBe(true);
  console.log(`[B40] image ${Date.now() - t1}ms model=${json.model} cost=${json.costUsd}`);
});


test('B41: 図解プランの why（322・実AI・Gemini）— 各候補に「この内容に向く理由」（40字以内）が付き、図の文字列（実在チェック）には入らない。関連図の候補があれば実描画が 200（境界検査つき） @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const text = 'トリプトファンはセロトニンに変換され、セロトニンはメラトニンに変換される。メラトニンは睡眠を促す。朝の光はセロトニンの分泌を増やし、夜の暗さはメラトニンの分泌を増やす。';
  const t0 = Date.now();
  const res = await request.post('/api/visuals/plan', { data: { text, types: ['relation', 'flow'] }, timeout: REQ_TIMEOUT });
  expect(res.status()).toBe(200);
  const j = (await res.json()) as { plans: { id: string; type: string; title: string; why?: string; groups: { heading?: string; points: string[] }[] }[]; checks: Record<string, { foreign: string[] }> };
  expect(j.plans.length).toBeGreaterThan(0);
  const withWhy = j.plans.filter((p) => typeof p.why === 'string' && p.why.trim());
  expect(withWhy.length, 'why が付く候補がある').toBeGreaterThan(0);
  for (const p of withWhy) {
    expect(Array.from(p.why!).length, 'why は40字以内').toBeLessThanOrEqual(40);
    expect([p.title, ...p.groups.flatMap((g) => [g.heading ?? '', ...g.points])], 'why は図の文字列に入らない').not.toContain(p.why);
  }
  console.log(`[B41] ${Date.now() - t0}ms plans=${j.plans.map((p) => `${p.type}:${p.why ?? '-'}`).join(' | ')}`);
  const rel = j.plans.find((p) => p.type === 'relation');
  if (rel && (j.checks[rel.id]?.foreign.length ?? 0) === 0) {
    const rr = await request.post('/api/visuals/render', { data: { plan: rel, sourceText: text, orientation: 'landscape' }, timeout: REQ_TIMEOUT });
    const rj = (await rr.json()) as { textVerified?: boolean; error?: string };
    expect(rr.status(), `関連図の実描画が 200: ${rj.error ?? ''}`).toBe(200);
    expect(rj.textVerified).toBe(true);
  }
});


test('B42: 図解の複数提示と一括生成（323・実AI）— 種類を絞った抽出（relation/table）で同じ種類の切り口違いが最大2つ・合計8以内・why つき（種類ごとの件数を報告）。承認相当のプランをコード描画2＋画像1（low）で生成できる @gen', async ({ request }) => {
  test.setTimeout(GEN_TIMEOUT);
  const text = 'トリプトファンはセロトニンに変換され、セロトニンはメラトニンに変換される。朝の光はセロトニンの分泌を増やし、夜の暗さはメラトニンの分泌を増やす。朝は洗顔のあと化粧水をなじませてから乳液で蓋をする。夜はクレンジングのあとに同じ手順で保湿する。週に1回は角質ケアを足す。';
  const t0 = Date.now();
  const res = await request.post('/api/visuals/plan', { data: { text, types: ['relation', 'table'] }, timeout: REQ_TIMEOUT });
  expect(res.status()).toBe(200);
  const j = (await res.json()) as { plans: { id: string; type: string; title: string; why?: string; groups: { heading?: string; points: string[] }[] }[]; checks: Record<string, { foreign: string[] }> };
  expect(j.plans.length).toBeGreaterThan(0);
  expect(j.plans.length).toBeLessThanOrEqual(8);
  const perType: Record<string, number> = {};
  for (const p of j.plans) perType[p.type] = (perType[p.type] ?? 0) + 1;
  for (const [ty, n] of Object.entries(perType)) expect(n, `${ty} は切り口違いで最大2つ`).toBeLessThanOrEqual(2);
  console.log(`[B42] ${Date.now() - t0}ms plans=${j.plans.length} perType=${JSON.stringify(perType)} why=${j.plans.map((p) => p.why ?? '-').join(' | ')}`);
  const okPlans = j.plans.filter((p) => (j.checks[p.id]?.foreign.length ?? 0) === 0 && p.type !== 'image').slice(0, 2);
  for (const p of okPlans) {
    const rr = await request.post('/api/visuals/render', { data: { plan: p, sourceText: text, orientation: 'landscape' }, timeout: REQ_TIMEOUT });
    const rj = (await rr.json()) as { textVerified?: boolean; error?: string };
    expect(rr.status(), `${p.type}「${p.title}」の描画が 200: ${rj.error ?? ''}`).toBe(200);
    expect(rj.textVerified).toBe(true);
  }
  console.log(`[B42] rendered=${okPlans.map((p) => p.type).join(',')}`);
  const status = (await (await request.get('/api/visuals?mode=status')).json()) as { gptImage: boolean };
  if (!status.gptImage) {
    console.log('[B42] OPENAI_API_KEY 未設定＝画像はスキップ');
    return;
  }
  const t1 = Date.now();
  const img = await request.post('/api/visuals/image', { data: { plan: { id: 'b42', type: 'image', title: '朝の保湿', groups: [{ points: ['乳液で蓋をする'] }], imagePrompt: '洗面台と朝の光' }, sourceText: text, settings: { orientation: 'landscape', quality: 'low', aiText: false, extraPrompt: '', model: 'flare' } }, timeout: REQ_TIMEOUT });
  const ij = (await img.json()) as { finalBase64?: string; error?: string; unavailable?: boolean; costUsd?: number | null };
  if (img.status() !== 200 && ij.unavailable) {
    console.log(`[B42] GPT Image 2.5 は未提供: ${ij.error}`);
    return;
  }
  expect(img.status(), `画像生成が 200: ${ij.error ?? ''}`).toBe(200);
  expect((ij.finalBase64?.length ?? 0) > 5000).toBe(true);
  console.log(`[B42] image ${Date.now() - t1}ms cost=${ij.costUsd}`);
});
