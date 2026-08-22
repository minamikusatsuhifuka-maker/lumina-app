import { test, expect } from '@playwright/test';
import { describeAnthropicError, isFallbackWorthy } from '../../src/lib/anthropic-error';
import { findUngroundedTerms, findBannedExpressions, splitByPriority } from '../../src/lib/content-verify';
import { buildDiffRows, describeDiffStats } from '../../src/lib/text-diff';
import { sanitizeForDb } from '../../src/lib/sanitize';
import { cleanChapterBody } from '../../src/lib/kindle-text';
import { KINDLE_TASTES, KINDLE_TASTE_KEYS, KINDLE_TASTE_GUARD, KINDLE_SCORE_AXES } from '../../src/lib/kindle-taste';
import {
  AUTO_STOCK_KEY,
  isAutoStockSaveEnabled,
  setAutoStockSaveEnabled,
} from '../../src/lib/auto-stock-save';
import { SHORTCUT_SECTIONS, RUN_KEY_LABELS } from '../../src/lib/shortcuts';
import {
  MAX_NAV_ICON_LENGTH,
  MAX_NAV_LABEL_LENGTH,
  NAV_LABELS_DEFAULT,
  navCategoryLabelOf,
  navIconOf,
  navLabelOf,
  normalizeNavIcon,
  normalizeNavLabel,
  parseNavLabels,
} from '../../src/lib/nav-labels';
import { ALL_NAV_ITEMS, navCategories } from '../../src/lib/nav-items';
import { CLEAR_PASTE_MESSAGE, type ClearAndPasteResult } from '../../src/lib/clear-and-paste';

// ============================================================================
// 純関数の単体テスト（234【1】要件4）— ネットワーク・AI課金・認証を一切使わない
//
// 追加の経緯: 234で「目次生成が全目的で失敗」した際、真因は Anthropic の課金上限
// （HTTP 400）だったが、呼び出し側が response.ok を見ておらず、画面には
// 「JSONパース失敗」と表示された。既定スイート27件は画面が開くかしか見ておらず、
// AI経路の成否も、エラー文言の妥当性も検証していなかった（＝検出できなかった理由）。
// ここでは無料・決定的に守れる部分を単体テストで固定する。
// ============================================================================

test('U1: 課金上限のエラーが「アプリの不具合ではない」と分かる文言になる', () => {
  // 234で実際に返ってきたペイロード
  const body = {
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message: 'You have reached your specified API usage limits. You will regain access on 2026-09-01 at 00:00 UTC.',
    },
  };
  const msg = describeAnthropicError(400, body);
  expect(msg).toContain('利用上限');
  expect(msg).toContain('アプリの不具合ではありません');
  // 原文を落とさない（復旧予定日時が院長に伝わること）
  expect(msg).toContain('2026-09-01');
  // 誤った症状名に化けていないこと（これが234の本質的な失敗）
  expect(msg).not.toContain('パース');
});

test('U2: レート制限・認証・過負荷がそれぞれ区別できる', () => {
  expect(describeAnthropicError(429, { error: { type: 'rate_limit_error', message: 'rate limited' } })).toContain('混み合っています');
  expect(describeAnthropicError(401, { error: { type: 'authentication_error', message: 'bad key' } })).toContain('認証に失敗');
  expect(describeAnthropicError(529, { error: { type: 'overloaded_error', message: 'overloaded' } })).toContain('高負荷');
  // 未知のエラーでもステータスは必ず残す
  expect(describeAnthropicError(500, null)).toContain('500');
});

test('U3: 内容検証器（233②）— 禁止表現を検出し、正当な注意喚起は検出しない', () => {
  const banned = findBannedExpressions('当院なら必ず治ります。今だけ初回無料、先着10名です。');
  const categories = banned.map((b) => b.category);
  expect(categories).toContain('効果保証・断定');
  expect(categories).toContain('限定性・希少性');
  expect(categories).toContain('費用誤認');

  // 誤検出しないこと（正当な受診案内）
  expect(findBannedExpressions('気になる症状があれば早めの受診をおすすめします。')).toHaveLength(0);
});

test('U4: 内容検証器（233②）— 素材にない固有名詞だけを警告する', () => {
  const source = '保湿剤の外用が推奨されている。2023年の調査では約60%が継続していた。';
  const generated = '保湿剤の外用が推奨されます。2023年の調査では約60%が継続。ハーバード大学の研究では92%でした。';
  const terms = findUngroundedTerms(generated, [source]).map((t) => t.term);
  expect(terms).toContain('ハーバード大学');
  expect(terms).toContain('92%');
  // 素材にある記述は警告しない
  expect(terms).not.toContain('2023年');
  expect(terms).not.toContain('60%');
});

test('U5: フォールバック判定（235）— 上限・混雑のみ切替、認証エラーは切り替えない', () => {
  const limit = { error: { type: 'invalid_request_error', message: 'You have reached your specified API usage limits.' } };
  expect(isFallbackWorthy(400, limit), '課金上限はGeminiへ切替').toBe(true);
  expect(isFallbackWorthy(429, { error: { type: 'rate_limit_error', message: 'rate limited' } })).toBe(true);
  expect(isFallbackWorthy(529, { error: { type: 'overloaded_error', message: 'overloaded' } })).toBe(true);
  expect(isFallbackWorthy(400, { error: { type: 'billing_error', message: 'credit balance too low' } })).toBe(true);

  // 認証エラー・リクエスト不正は切り替えない（フォールバックで隠すと設定ミスに永久に気づけない）
  expect(isFallbackWorthy(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } })).toBe(false);
  expect(isFallbackWorthy(400, { error: { type: 'invalid_request_error', message: 'max_tokens is required' } })).toBe(false);
  expect(isFallbackWorthy(404, { error: { type: 'not_found_error', message: 'model not found' } })).toBe(false);
});

test('U6: フォールバックしないエラーは234の文言のまま表面化する（235で退化していない）', () => {
  // 235でフォールバックを入れても、認証エラーは隠さず原因が分かる文言で出ること
  const msg = describeAnthropicError(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  expect(msg).toContain('認証に失敗');
  expect(isFallbackWorthy(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } })).toBe(false);
});

test('U7: 左右diff（236C）— 変更行は行内差分に、追加/削除は片側のみになる', () => {
  // 3行目は互いに全く似ていない文にする（似ていれば「変更」に束ねるのが正しい挙動のため）
  const original = '保湿剤は入浴後5分以内に塗ります。\nこすらずに洗います。\nAAAAAAAAAA';
  const revised = '保湿剤は入浴後5分以内に塗るのがコツです。\nこすらずに洗います。\nBBBBBBBBBB';
  const { rows, stats } = buildDiffRows(original, revised);

  // 1行目: 似ているので「変更」に束ねられ、行内の文字差分がつく
  expect(rows[0].op).toBe('changed');
  expect(rows[0].leftParts?.some((p) => p.op === 'removed')).toBe(true);
  expect(rows[0].rightParts?.some((p) => p.op === 'added')).toBe(true);
  // 変更なしの行は左右とも同じ文字列
  expect(rows[1].op).toBe('equal');
  expect(rows[1].left).toBe(rows[1].right);
  // 似ていない行は片側だけ（左のみ＝削除／右のみ＝追加）
  const removed = rows.find((r) => r.op === 'removed');
  const added = rows.find((r) => r.op === 'added');
  expect(removed, '削除行が1行ある').toBeTruthy();
  expect(added, '追加行が1行ある').toBeTruthy();
  expect(removed!.right, '削除行は右カラムが空').toBe(null);
  expect(added!.left, '追加行は左カラムが空').toBe(null);

  expect(stats.unchanged).toBe(1);
  expect(stats.changed).toBeGreaterThanOrEqual(1);
});

test('U8: 左右diff — 同一テキストは全行equal・差分ゼロ', () => {
  const text = '一行目\n二行目\n三行目';
  const { rows, stats } = buildDiffRows(text, text);
  expect(rows.every((r) => r.op === 'equal')).toBe(true);
  expect(stats.added + stats.removed + stats.changed).toBe(0);
  expect(describeDiffStats(stats)).toBe('変更はありません');
});

test('U9: テイスト定義（236B）— 全テイストが医療広告ガードを共有し、変換ガードが内容の創作を禁じている', () => {
  for (const key of KINDLE_TASTE_KEYS) {
    const t = KINDLE_TASTES[key];
    expect(t.label, `${key} にラベル`).toBeTruthy();
    expect(t.hint, `${key} に説明`).toBeTruthy();
    expect(t.promptBlock.length, `${key} のプロンプト`).toBeGreaterThan(50);
  }
  // マーケティング強めでもNG表現の禁止が明記されていること（誇張に滑らせない）
  expect(KINDLE_TASTES.marketing.promptBlock).toContain('禁止');
  expect(KINDLE_TASTES.marketing.promptBlock).toContain('不安を煽る');
  // 共通ガードが「表現の変換であって内容の創作ではない」ことを言っている
  expect(KINDLE_TASTE_GUARD).toContain('内容の創作ではない');
  expect(KINDLE_TASTE_GUARD).toContain('追加しない');
  // 採点は5軸
  expect(KINDLE_SCORE_AXES).toHaveLength(5);
});

test('U10: DB保存前サニタイズ（237）— NUL・孤立サロゲートだけを落とし、本文は壊さない', () => {
  // 237の真因: この2種が混ざるとPostgresのINSERTが例外になり、本文まるごとが保存できなかった
  expect(sanitizeForDb('皮膚フローラ と全身症状')).toBe('皮膚フローラと全身症状');
  expect(sanitizeForDb('皮膚フローラ\ud800と全身症状')).toBe('皮膚フローラと全身症状');
  expect(sanitizeForDb('皮膚フローラ\udc00と全身症状')).toBe('皮膚フローラと全身症状');

  // 正常な文字は1文字も落とさない（絵文字＝正しいサロゲートペア・結合文字・改行・タブ）
  const intact = '皮膚フローラ🦠👨‍⚕️é\n\t— 全身症状との関連（2023年・60%）';
  expect(sanitizeForDb(intact)).toBe(intact);

  // null/undefined/数値でも落ちない（保存経路で型が揺れても例外にしない）
  expect(sanitizeForDb(null)).toBe('');
  expect(sanitizeForDb(undefined)).toBe('');
  expect(sanitizeForDb(123)).toBe('123');
});

test('U13: 誤検出削減と優先度分け（238【3】）— 一般語は消え、固有名詞・数値は🔴で残る', () => {
  const source = '保湿剤は入浴後5分以内の外用が有効。こすらないことが基本。';
  const generated = [
    '肌のバリアはドアのようなもの。ウイルスやスイッチ、フライパン、ショック、リセットといった言葉で説明します。',
    'タオルでゴシゴシ拭かないでください。ステロイドやコラーゲンの話題もあります。',
    'ハーバード大学の研究では改善率92%。田中太郎教授が2019年にADSを提唱しました。',
  ].join('\n');

  const terms = findUngroundedTerms(generated, [source], { maxResults: 100 });
  const { high, low } = splitByPriority(terms);
  const all = terms.map((t) => t.term);

  // 院長報告の「確認する意味がなかった語」は検出されない
  for (const w of ['ウイルス', 'スイッチ', 'フライパン', 'ショック', 'リセット', 'タオル', 'ステロイド', 'コラーゲン']) {
    expect(all, `${w} は除外されている`).not.toContain(w);
  }

  // 本当に確認すべき語は🔴で残る
  const highTerms = high.map((t) => t.term);
  for (const w of ['ハーバード大学', '92%', '田中太郎教授', '2019年', 'ADS']) {
    expect(highTerms, `${w} は🔴要確認`).toContain(w);
  }

  // 並び順は🔴が先頭
  expect(terms[0].priority).toBe('high');
  // 🟡は残ってよいが、🔴に混ざって埋もれない
  expect(high.length + low.length).toBe(terms.length);
});

test('U11: 章本文の掃除（238【1】）— 本文中に残った「章タイトル＋日付」を消し、本文は壊さない', () => {
  const title = '届かなければ意味がない？注目されるデリバリー技術「ADS」とは';
  const body = [
    '**この章でわかること**',
    '・要点A',
    '',
    '## 有効成分はどこまで届くのか',
    '',
    '本文の段落です。皮膚のバリア機能について説明します。',
    '',
    `第4章 ${title}`,
    '2026年8月8日',
    '',
    '続きの段落です。ここは残らなければいけません。',
  ].join('\n');

  const cleaned = cleanChapterBody(body, 4, title);
  // 混入ブロックが消えている
  expect(cleaned).not.toContain('2026年8月8日');
  expect(cleaned).not.toContain(`第4章 ${title}`);
  // 本文・正当な小見出しは残る
  expect(cleaned).toContain('## 有効成分はどこまで届くのか');
  expect(cleaned).toContain('本文の段落です。皮膚のバリア機能について説明します。');
  expect(cleaned).toContain('続きの段落です。ここは残らなければいけません。');
  expect(cleaned).toContain('**この章でわかること**');
});

test('U12: 章本文の掃除 — 通常の本文は1文字も変えない（誤削除しない）', () => {
  const title = '保湿剤の選び方';
  const body = [
    '**この章でわかること**',
    '・保湿剤の3系統',
    '',
    '## セラミドとは',
    '',
    '第1章で触れたバリア機能の話を、ここではもう少し詳しく見ます。',
    '2026年の調査では約60%が継続していました。',
    '',
    '### 使い分けの目安',
    '',
    '季節と部位で使い分けます。',
  ].join('\n');

  // 「第1章で触れた…」は文の一部・「2026年の調査では…」は日付だけの行ではない → 残る
  const cleaned = cleanChapterBody(body, 5, title);
  expect(cleaned).toContain('第1章で触れたバリア機能の話を、ここではもう少し詳しく見ます。');
  expect(cleaned).toContain('2026年の調査では約60%が継続していました。');
  expect(cleaned).toContain('### 使い分けの目安');
  expect(cleaned.trim()).toBe(body.trim());
});

// ============================================================================
// 247: ショートカット／自動ストック保存 の純粋部分
// ============================================================================

test('U14: 自動ストック保存の設定（247）— 既定ON・"0"のときだけOFF・往復できる', () => {
  const store = new Map<string, string>();
  const original = (globalThis as any).localStorage;
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  // window.dispatchEvent が無い環境でも設定変更が落ちないこと（設定関数がイベントを飛ばすため）
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = { dispatchEvent: () => true };
  try {
    // 未設定＝既定ON（「保存されていない＝OFF」にしない）
    expect(isAutoStockSaveEnabled()).toBe(true);
    // OFFにすると '0' が入り、判定もOFFになる
    setAutoStockSaveEnabled(false);
    expect(store.get(AUTO_STOCK_KEY)).toBe('0');
    expect(isAutoStockSaveEnabled()).toBe(false);
    // ONに戻せる
    setAutoStockSaveEnabled(true);
    expect(isAutoStockSaveEnabled()).toBe(true);
    // 壊れた値は既定（ON）に倒す＝'0' 以外はすべてON
    store.set(AUTO_STOCK_KEY, 'yes');
    expect(isAutoStockSaveEnabled()).toBe(true);
  } finally {
    (globalThis as any).localStorage = original;
    (globalThis as any).window = originalWindow;
  }
});

test('U15: 実行・クリアのキーが一覧（小窓＝使い方ガイドの共通ソース）に登録されている（247）', () => {
  const runSection = SHORTCUT_SECTIONS.find((s) => s.scope === 'run');
  expect(runSection, '生成・実行画面のセクションが登録されていること').toBeTruthy();
  const descs = runSection!.items.map((i) => i.desc).join(' / ');
  expect(descs).toContain('実行する');
  expect(descs).toContain('クリア');
  // 実行は ⌘+Enter、クリアは ⌘+⌫（キーの並びまで一覧に出す＝押し方が分かる）
  // 248: クリアを ⌘⇧⌫（3キー）から ⌘⌫（2キー）へ変更。一覧・ボタン併記が同じ値を見る
  expect(runSection!.items.map((i) => i.keys.join('+'))).toEqual([
    '⌘+Enter',
    '⌘+⌫',
    '⌘+⇧+V', // 254
  ]);
  // ボタン併記の表記が Mac / Windows の両方用意されている（片方だけ嘘の案内にしない）
  expect(RUN_KEY_LABELS.mac).toEqual({ run: '⌘↵', clear: '⌘⌫', clearPaste: '⌘⇧V' });
  expect(RUN_KEY_LABELS.win).toEqual({ run: 'Ctrl+↵', clear: 'Ctrl+⌫', clearPaste: 'Ctrl+⇧V' });
  // 248: キーの本数は「押しやすさ」を意見ではなく形で固定するためのもの。
  // 実行とクリアは修飾キー1つ＋1キー（＝2キー）に収める。
  // 254追記: 「クリアして貼り付け」だけは3キー（⌘⇧V）を許す——Mac/Windowsとも
  // 「書式なしで貼り付け」の標準キーが ⌘⇧V で、それを踏襲した方が覚えやすいため
  // （⌘⇧⌫ が押しにくかったのは右手が窮屈になるからで、⌘⇧V は左手だけで押せる）。
  // 例外を作るときは、ここに理由付きで書いてから足す（無制限に増やさない）。
  const MAX_KEYS: { match: string; max: number }[] = [
    { match: '実行する', max: 2 },
    { match: '入力をクリア', max: 2 },
    { match: 'クリアして貼り付け', max: 3 },
  ];
  for (const item of runSection!.items) {
    const rule = MAX_KEYS.find((r) => item.desc.includes(r.match));
    expect(rule, `${item.desc} のキー本数の上限が決まっていること`).toBeTruthy();
    expect(item.keys.length, `${item.desc} は${rule!.max}キーで押せること`).toBeLessThanOrEqual(
      rule!.max,
    );
  }
});

// ============================================================================
// 251: サイドバーのメニュー名の変更（表示名の正規化と、壊れた保存値の扱い）
// ============================================================================

test('U16: 表示名の正規化 — 空文字は既定に倒れ、長すぎる名前は切り詰め、改行は潰す（251）', () => {
  // 空・空白のみは null＝上書きしない（サイドバーが空ラベルになる経路を作らない）
  expect(normalizeNavLabel('')).toBeNull();
  expect(normalizeNavLabel('   ')).toBeNull();
  expect(normalizeNavLabel('\n\t ')).toBeNull();
  expect(normalizeNavLabel(undefined)).toBeNull();
  expect(normalizeNavLabel(123)).toBeNull();

  // 前後空白の除去と、連続空白・改行の圧縮（1行に収める）
  expect(normalizeNavLabel('  参照  素材  ')).toBe('参照 素材');
  expect(normalizeNavLabel('参照\n素材')).toBe('参照 素材');

  // 上限で切り詰める（サイドバー220pxで折り返さないため）
  const long = 'あ'.repeat(40);
  expect([...normalizeNavLabel(long)!].length).toBe(MAX_NAV_LABEL_LENGTH);

  // 絵文字のみの名前も通る（サロゲートペアで割れない）
  expect(normalizeNavLabel('🧠🧠')).toBe('🧠🧠');
  const manyEmoji = '🧠'.repeat(30);
  expect([...normalizeNavLabel(manyEmoji)!].length).toBe(MAX_NAV_LABEL_LENGTH);
});

test('U17: アイコンの正規化 — 空は既定、長すぎるものは切り詰める（251）', () => {
  expect(normalizeNavIcon('')).toBeNull();
  expect(normalizeNavIcon('  ')).toBeNull();
  expect(normalizeNavIcon(null)).toBeNull();
  expect(normalizeNavIcon(' 🧠 ')).toBe('🧠');
  // 絵文字を並べても上限で切れる。コードポイント単位なので「?」に化けない
  const cut = normalizeNavIcon('🧠🎛📚📝📖✍️')!;
  expect([...cut].length).toBeLessThanOrEqual(MAX_NAV_ICON_LENGTH);
  expect(cut).not.toContain('\uFFFD');
});

test('U18: 壊れた保存値はすべて既定に倒れる（251・243の方式踏襲）', () => {
  // 型が違う・null・配列 → 既定（空の上書き）
  expect(parseNavLabels(null)).toEqual(NAV_LABELS_DEFAULT);
  expect(parseNavLabels('こわれた')).toEqual(NAV_LABELS_DEFAULT);
  expect(parseNavLabels(42)).toEqual(NAV_LABELS_DEFAULT);
  expect(parseNavLabels({})).toEqual(NAV_LABELS_DEFAULT);
  expect(parseNavLabels({ items: 'x', categories: 3 })).toEqual(NAV_LABELS_DEFAULT);

  // 中身が空の上書きは捨てる（空ラベルがDOMに出ない）
  const parsed = parseNavLabels({
    items: {
      '/dashboard/context-library': { label: '  ', icon: '' },
      '/dashboard/library': { label: '資料庫' },
      '/dashboard/memo': { icon: '📌' },
      '': { label: 'キーが空' },
    },
    categories: { 'ホーム': '  ', '管理・設定': '設定' },
  });
  expect(parsed.items['/dashboard/context-library'], '空だけの上書きは持たない').toBeUndefined();
  expect(parsed.items['/dashboard/library']).toEqual({ label: '資料庫' });
  expect(parsed.items['/dashboard/memo']).toEqual({ icon: '📌' });
  expect(parsed.items['']).toBeUndefined();
  expect(parsed.categories['ホーム'], '空のカテゴリ名は持たない').toBeUndefined();
  expect(parsed.categories['管理・設定']).toBe('設定');
});

test('U19: 上書きが無ければ必ず既定名・既定アイコンを返す（251）', () => {
  const state = parseNavLabels({
    items: { '/dashboard/context-library': { label: 'ネタ帳', icon: '📦' } },
    categories: { '情報収集・調査': '調べもの' },
  });
  expect(navLabelOf(state, '/dashboard/context-library', 'AI参照素材')).toBe('ネタ帳');
  expect(navIconOf(state, '/dashboard/context-library', '🧠')).toBe('📦');
  expect(navCategoryLabelOf(state, '情報収集・調査')).toBe('調べもの');
  // 未設定の項目は既定のまま（1つ変えても他に波及しない）
  expect(navLabelOf(state, '/dashboard/library', 'リサーチ保存')).toBe('リサーチ保存');
  expect(navIconOf(state, '/dashboard/library', '📚')).toBe('📚');
  expect(navCategoryLabelOf(state, '管理・設定')).toBe('管理・設定');
  // 既定状態では全項目が既定名で返る
  for (const item of ALL_NAV_ITEMS.slice(0, 10)) {
    expect(navLabelOf(NAV_LABELS_DEFAULT, item.href, item.label)).toBe(item.label);
  }
});

test('U20: メニュー定義の正本が壊れていない（href重複なし・全項目に名前とアイコン）（251）', () => {
  const hrefs = navCategories.flatMap((c) => c.items.map((i) => i.href));
  // 同じhrefが2つのカテゴリに出ると、リネームが片方にしか効いたように見える
  expect(new Set(hrefs).size, 'hrefが重複していないこと').toBe(hrefs.length);
  for (const item of ALL_NAV_ITEMS) {
    expect(item.label.trim().length, `${item.href} に表示名があること`).toBeGreaterThan(0);
    expect(item.icon.trim().length, `${item.href} にアイコンがあること`).toBeGreaterThan(0);
    expect(item.href.startsWith('/'), `${item.href} が絶対パスであること`).toBe(true);
  }
  // カテゴリ名の重複も無いこと（カテゴリ名をキーに上書きを持つため）
  const cats = navCategories.map((c) => c.category);
  expect(new Set(cats).size).toBe(cats.length);
});

test('U21: クリアして貼付 — 4つの結末すべてに案内があり、キー表記が一覧と一致する（254）', () => {
  // 実測した4パターン（成功・権限拒否・空クリップボード・何もしない）が漏れなく定義されていること
  const results: ClearAndPasteResult[] = ['pasted', 'cleared-manual', 'empty', 'noop'];
  for (const r of results) {
    expect(CLEAR_PASTE_MESSAGE, `${r} の案内が定義されていること`).toHaveProperty(r);
  }
  // 何もしていないときに案内を出さない（嘘の成功を見せない）
  expect(CLEAR_PASTE_MESSAGE.noop).toBeNull();
  // 貼れなかったときは「次に何をすればよいか」を必ず書く
  expect(CLEAR_PASTE_MESSAGE['cleared-manual']!.text).toContain('⌘V');
  expect(CLEAR_PASTE_MESSAGE['cleared-manual']!.kind).not.toBe('success');
  expect(CLEAR_PASTE_MESSAGE.empty!.text).toContain('空');
  expect(CLEAR_PASTE_MESSAGE.empty!.kind).not.toBe('success');

  // キー表記はボタン併記・一覧・ガイドが同じ値を見る（二重管理しない）
  expect(RUN_KEY_LABELS.mac.clearPaste).toBe('⌘⇧V');
  expect(RUN_KEY_LABELS.win.clearPaste).toBe('Ctrl+⇧V');
  const runSection = SHORTCUT_SECTIONS.find((s) => s.scope === 'run')!;
  const pasteItem = runSection.items.find((i) => i.desc.includes('クリアして貼り付け'));
  expect(pasteItem, '一覧に「クリアして貼り付け」が登録されていること').toBeTruthy();
  expect(pasteItem!.keys).toEqual(['⌘', '⇧', 'V']);
  // ⌘V単独を奪う項目が一覧に無いこと（通常の貼り付けは絶対に壊さない）
  for (const section of SHORTCUT_SECTIONS) {
    for (const item of section.items) {
      const combo = item.keys.join('');
      expect(combo, `${item.desc} が ⌘V 単独を奪っていないこと`).not.toBe('⌘V');
    }
  }
});
