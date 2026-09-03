import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeAnthropicError, isFallbackWorthy } from '../../src/lib/anthropic-error';
// 290: モデル比較
// 208: 追従カテゴリメモ
import {
  DR_MEMO_CONTEXT_MAX,
  DR_MEMO_PAGE_SIZE,
  DR_MEMO_UNCATEGORIZED,
  categoryIdOf,
  drMemoToastMessage,
  memoListQuery,
  moveItem,
  normalizeContextRef,
  resolveCategoryChoice,
  sortOrderPatches,
} from '../../src/lib/dr-memo';
import { FLOATING_BUTTONS, FLOATING_DEFAULT, FLOATING_ORDER } from '../../src/components/ThemeProvider';
import { anthropicFailureAction } from '../../src/lib/anthropic-compat';
import { CLAUDE_OPUS_MODEL, GEMINI_TEXT_MODEL } from '../../src/lib/ai-models';
import {
  COMPARE_BUTTON_LABEL,
  COMPARE_CLIENT_TIMEOUT_MS,
  COMPARE_RETRIES,
  COMPARE_SIDE_LABEL,
  COMPARE_SIDE_MODEL_ID,
  DEEPRESEARCH_MAX_DURATION_S,
  allCompareSettled,
  compareSaveMetadata,
  compareSaveTags,
  compareSaveTitle,
  compareUsageLabel,
  formatElapsed,
  initialCompareRuns,
  parseCompareSide,
} from '../../src/lib/model-compare';
import { findUngroundedTerms, findBannedExpressions, splitByPriority } from '../../src/lib/content-verify';
import { buildDiffRows, describeDiffStats } from '../../src/lib/text-diff';
import { sanitizeForDb } from '../../src/lib/sanitize';
import { guardImagePrompt, IMAGE_GUARD_SUFFIX } from '../../src/lib/image-guards';
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
import { ALL_NAV_ITEMS, navCategories, DEFAULT_HOME_HREFS, resolveHomeHrefs } from '../../src/lib/nav-items';
import { CLEAR_PASTE_MESSAGE, clearAndPaste, type ClearAndPasteResult } from '../../src/lib/clear-and-paste';
import { applyReplacePaste, resolvePasteReplaceEnabled } from '../../src/lib/paste-replace';
import {
  ARTIFACT_LABEL,
  ESTIMATED_PAIR_WINDOW_MS,
  artifactKindOf,
  batchLinkKey,
  groupLibraryItems,
} from '../../src/lib/library-groups';
import {
  STALE_JOB_THRESHOLD_MS,
  batchJobDisplayStatus,
  elapsedLabel,
  isStaleBatchJob,
  savedTopicCount,
  staleJobLabel,
} from '../../src/lib/batch-stale';
import { MERGE_TITLE_PREFIX, deriveMergeTitle, hasSavableContent } from '../../src/lib/merge-report';
import { insertAtCursor, PASTE_BUTTON_MESSAGE } from '../../src/lib/paste-insert';
import {
  ANALYSIS_OPTIONS,
  PRIMARY_ANALYSIS_OPTIONS,
  PRIMARY_ANALYSIS_TYPES,
  SECONDARY_ANALYSIS_OPTIONS,
} from '../../src/lib/analysis-prompts';
import {
  computeArrowOffset,
  computePreviewPlacement,
  HOVER_PREVIEW_CHARS,
  HOVER_PREVIEW_DELAY_MS,
  HOVER_PREVIEW_GAP,
  HOVER_PREVIEW_MARGIN,
  HOVER_PREVIEW_MAX_HEIGHT,
  HOVER_PREVIEW_PREFETCH_MS,
  HOVER_PREVIEW_WIDTH,
  toLayoutPx,
  toPreviewText,
  type PreviewRect,
} from '../../src/lib/hover-preview';
import { markdownToReadableText } from '../../src/lib/markdownToText';
import { parsePersonaArticleOutput } from '../../src/lib/persona-styles';
import { PLAYBOOK, PLAYBOOK_VERSION, getPlaybook } from '../../src/lib/knowledge/noteXPlaybook';
import { validateXPost, countHashtags, hasBlankLineRhythm } from '../../src/lib/x-post-rules';
import { appendStrategyDisclaimer } from '../../src/lib/knowledge/strategyDisclaimer';
import { promoteHeadingsForNote, markdownToWordHtml } from '../../src/lib/rich-copy';
import { buildScheduleRows, scheduleToMarkdown } from '../../src/lib/posting-schedule';
import { buildNotePasteText, buildNoteHtml } from '../../src/lib/note-compat';
import { estimateTitleLines, estimateSummaryImageHeight } from '../../src/lib/summary-image-templates';
import {
  EPISODE_FACT_GUARD,
  EXAMPLES_MAX_DURATION_S,
  EXAMPLES_RETRIES,
  EXAMPLES_TIMEOUT_MS,
  EXAMPLE_COUNT_MAX,
  detectEffectClaims,
  emptyEpisodeInput,
  episodeDisplayTitle,
  formatEpisodesForPrompt,
  normalizeEpisodeTags,
  normalizeExamples,
  parseEpisodeIds,
} from '../../src/lib/episodes';
import { parseKindleSourceKey, makeEpisodeSourceKey, KINDLE_MATERIAL_SOURCE_META } from '../../src/lib/kindle-limits';
// 271: 横並び比較の判断（列数・上限・本文/要約の取り出し・同期スクロールの割合）
import {
  BATCH_COMPARE_MAX,
  COMPARE_HEIGHT_VH,
  COMPARE_HEIGHT_DEFAULT,
  COMPARE_COLUMN_CHOICE_DEFAULT,
  compareColumnLabel,
  compareGridClass,
  parseContextWithSummary,
  pickCompareText,
  resolveCompareColumns,
  scrollRatioOf,
  syncScrollTop,
  toggleCompareId,
} from '../../src/lib/batch-compare';
import {
  EMPTY_ROADMAP_INPUTS,
  PHASE_DEFS,
  ROADMAP_DISCLAIMER,
  judgePhase,
  passConditionText,
  rankPaidCandidates,
  reactionScore,
  roadmapToMarkdown,
} from '../../src/lib/monetization-roadmap';
import {
  REMIX_ANGLES,
  REMIX_ANGLE_KEYS,
  getRemixAngle,
  detectBookContext,
  textOverlapRatio,
  candidateSimilarity,
  KDP_OVERLAP_WARN,
  FACT_FIDELITY_RULES,
} from '../../src/lib/kindle-note-remix';
import fs from 'node:fs';
import path from 'node:path';
import {
  AD_CHECK_TIMEOUT_MS,
  DEFAULT_PRESENTATION_AUDIENCE,
  PAGE_SCRIPT_MAX_DURATION_S,
  PAGE_SCRIPT_RETRIES,
  PAGE_SCRIPT_TIMEOUT_MS,
  PRESENTATION_AUDIENCES,
  SCRIPT_SECTION_DEFS,
  SUMMARY_FOR_NEXT_MAX,
  audienceOf,
  buildPageScriptPrompt,
  guessSlideTitle,
  movePage,
  nearestPrevSummary,
  pageScriptBudgetMs,
  scriptDocumentToMarkdown,
  summarizeForNext,
  type SlidePage,
} from '../../src/lib/presentation';
import {
  ABSTRACT_WORDS,
  AXIS_NOT_APPLICABLE,
  DEFAULT_METAPHOR_AUDIENCE,
  DEFAULT_METAPHOR_FIELD,
  LONG_SENTENCE_MAX,
  MAX_METAPHOR_TARGETS,
  METAPHOR_AXES,
  METAPHOR_MAX_DURATION_S,
  METAPHOR_AD_CHECK_TIMEOUT_MS,
  METAPHOR_RETRIES,
  METAPHOR_TIMEOUT_MS,
  alignAxes,
  audiencesForField,
  buildMetaphorPrompt,
  checkPlainLanguage,
  isAxisNotApplicable,
  metaphorBudgetMs,
  metaphorDocumentToMarkdown,
  metaphorFieldOf,
  sanitizeTargets,
  toggleMetaphorTarget,
  type MetaphorAudienceKey,
} from '../../src/lib/metaphor';
import {
  BATCH_TITLE_FALLBACK,
  BATCH_TITLE_TOPIC_MAX,
  batchJobSignature,
  deriveBatchJobTitle,
  truncateTitle,
} from '../../src/lib/batch-title';
import { formatJst, jstDateString, jstDateTimeString, jstShortDate } from '../../src/lib/jst';
import {
  DEFAULT_TYPE_SLOT,
  DEFAULT_URL_COUNT,
  FANOUT_ROUTE_MAX_DURATION_S,
  FANOUT_SIMILARITY_DEFAULT,
  X_FANOUT_TYPES,
  X_SLOTS,
  buildFanoutSchedule,
  defaultUrlFlags,
  fanoutScheduleToMarkdown,
  findSimilarPairs,
  hasSameDayCollision,
  normalizeSelectedTypes,
} from '../../src/lib/x-fanout';
import { NOTE_SLOTS } from '../../src/lib/posting-schedule';
import {
  DEFAULT_PLAIN_AUDIENCE,
  PLAIN_AUDIENCES,
  PLAIN_CHECK_THRESHOLDS,
  PLAIN_MAX_DURATION_S,
  REPHRASE_AD_CHECK_TIMEOUT_MS,
  REPHRASE_RETRIES,
  REPHRASE_TIMEOUT_MS,
  TERM_DICTIONARY,
  buildRephrasePrompt,
  buildReviewPrompt,
  diagnose,
  issuesSignature,
  rephraseBudgetMs,
  reportToMarkdown,
  splitSentences,
} from '../../src/lib/plain-check';
// 291: リサーチ保存の一覧の見え方・選択比較
import {
  CHAR_COUNT_TIERS,
  CHAR_COUNT_TIER_STYLE,
  LIBRARY_COMPARE_MAX,
  LIBRARY_COMPARE_MIN,
  LIST_COLUMN_CHOICES,
  LIST_COLUMN_CHOICE_DEFAULT,
  LIST_DENSITY_DEFAULT,
  charCountTier,
  charCountTitle,
  libraryCompareEntries,
  libraryCompareState,
  listGridClass,
  loadListColumnChoice,
  loadListDensity,
  resolveListColumns,
} from '../../src/lib/library-view';

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
  // 270追記（R-60の例外表の更新）: 📝テキスト分析を全端末3ボタンにした便でも
  // **キーの割り当ては増やしていない**。⌘⇧V は254で登録済みの3キー例外のまま据え置く
  // （iPhoneにはキー併記を出さない＝押せないキーを案内しないので、例外は増えない）。
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

test('U21: クリアして貼付 — 3つの結末すべてに案内があり、キー表記が一覧と一致する（254/270）', () => {
  // 270: 結末を3つに整理した（成功・読めなかった・空）。
  // 254の 'cleared-manual'（読めなくてもクリアだけ実行する）と 'noop' は廃止
  // ——**貼るものが手に入らないときは入力欄に触らない**ようにしたため（R-76）
  const results: ClearAndPasteResult[] = ['pasted', 'denied', 'empty'];
  for (const r of results) {
    expect(CLEAR_PASTE_MESSAGE, `${r} の案内が定義されていること`).toHaveProperty(r);
  }
  // 結末は3つだけ（増やすときはここと画面の案内を必ず揃える）
  expect(Object.keys(CLEAR_PASTE_MESSAGE).sort()).toEqual(['denied', 'empty', 'pasted']);

  // 貼れなかった2経路は成功に見せない（偽の成功を返さない・fail-closed）
  expect(CLEAR_PASTE_MESSAGE.denied.kind).not.toBe('success');
  expect(CLEAR_PASTE_MESSAGE.empty.kind).not.toBe('success');
  // 270の要点は「消えていないこと」が伝わること。案内文の一番の関心事なので文言で固定する
  expect(CLEAR_PASTE_MESSAGE.denied.text, '入力が無事であることを伝えること').toContain('そのまま');
  expect(CLEAR_PASTE_MESSAGE.empty.text, '入力が無事であることを伝えること').toContain('そのまま');
  // 貼れなかったときは「次に何をすればよいか」も書く
  expect(CLEAR_PASTE_MESSAGE.denied.text).toContain('⌘V');
  expect(CLEAR_PASTE_MESSAGE.empty.text).toContain('空');
  // 260の「📋 ペースト」の案内と取り違えない文言であること（E2Eが両者を区別して判定するため）
  expect(CLEAR_PASTE_MESSAGE.denied.text).not.toBe(PASTE_BUTTON_MESSAGE.denied.text);

  // キー表記はボタン併記・一覧・ガイドが同じ値を見る（二重管理しない）
  expect(RUN_KEY_LABELS.mac.clearPaste).toBe('⌘⇧V');
  expect(RUN_KEY_LABELS.win.clearPaste).toBe('Ctrl+⇧V');
  const runSection = SHORTCUT_SECTIONS.find((s) => s.scope === 'run')!;
  const pasteItem = runSection.items.find((i) => i.desc.includes('クリアして貼り付け'));
  expect(pasteItem, '一覧に「クリアして貼り付け」が登録されていること').toBeTruthy();
  expect(pasteItem!.keys).toEqual(['⌘', '⇧', 'V']);
  // 270: 一覧の補足も「読めないときは消えない」に更新されていること（嘘の案内を残さない）
  expect(pasteItem!.note, '読めなかったときの説明が実装と一致すること').toContain('そのまま');
  // ⌘V単独を奪う項目が一覧に無いこと（通常の貼り付けは絶対に壊さない）
  for (const section of SHORTCUT_SECTIONS) {
    for (const item of section.items) {
      const combo = item.keys.join('');
      expect(combo, `${item.desc} が ⌘V 単独を奪っていないこと`).not.toBe('⌘V');
    }
  }
});

// ============================================================================
// 270【最重要】: 破壊的操作（クリア）は「貼るものが手に入ってから」だけ行う（R-76）
// iOSの確認ポップアップはユーザーがキャンセルできる。素直に「クリア→読み取り→貼付」と
// 実装すると、キャンセルのたびに本文が消える。ここは実機でしか観測できない経路なので、
// **順序そのもの**を純関数の呼び出し記録で機械判定する（E2Eでは確認ポップアップを出せない）
// ============================================================================

test('U42: クリアして貼付は、読み取りに成功したときだけ入力を触る（270・キャンセルで本文を失わない）', async () => {
  // Node の globalThis.navigator は getter のみ（代入できない）ため defineProperty で差し替える
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const setNavigator = (value: unknown) =>
    Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  const originalRaf = (globalThis as any).requestAnimationFrame;
  // requestAnimationFrame は「貼れた後のカーソル移動」にしか使わない。
  // ここでは DOM を持たない（textareaRef.current = null）ので実行だけさせる
  (globalThis as any).requestAnimationFrame = (cb: () => void) => {
    cb();
    return 0;
  };

  const run = async (readText: () => Promise<string>) => {
    setNavigator({ clipboard: { readText } });
    const calls: { set: string[]; backup: string[] } = { set: [], backup: [] };
    const result = await clearAndPaste({
      current: '大事な本文',
      setText: (v) => calls.set.push(v),
      textareaRef: { current: null },
      backup: (v) => calls.backup.push(v),
    });
    return { result, calls };
  };

  try {
    // ① 読み取り成功 → クリアして貼付（＝置き換え）。Undo用に元の内容を退避する
    const ok = await run(async () => '貼り付ける内容');
    expect(ok.result).toBe('pasted');
    expect(ok.calls.set, '置き換えは1回の書き込みで行う（空を挟まない）').toEqual(['貼り付ける内容']);
    expect(ok.calls.backup, 'Undoのために元の内容を退避すること').toEqual(['大事な本文']);

    // ② 読み取り失敗（iOSで確認をキャンセル／権限拒否）→ **入力欄に一切触らない**
    const denied = await run(async () => {
      throw new DOMException('The request is not allowed', 'NotAllowedError');
    });
    expect(denied.result).toBe('denied');
    expect(denied.calls.set, 'キャンセルしたら本文を消さないこと').toEqual([]);
    expect(denied.calls.backup, '触っていないのでUndoも出さないこと').toEqual([]);

    // ③ クリップボードが空 → 貼るものが無いので、これも触らない
    const empty = await run(async () => '');
    expect(empty.result).toBe('empty');
    expect(empty.calls.set, '空クリップボードで本文を消さないこと').toEqual([]);
    expect(empty.calls.backup).toEqual([]);

    // ④ クリップボードAPIが無い環境（古いブラウザ）でも本文を壊さない
    setNavigator({});
    const noApi = await clearAndPaste({
      current: '大事な本文',
      setText: () => {
        throw new Error('APIが無い環境で入力を書き換えてはいけない');
      },
      textareaRef: { current: null },
      backup: () => {
        throw new Error('APIが無い環境で退避が走ってはいけない');
      },
    });
    expect(noApi).toBe('denied');
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete (globalThis as any).navigator;
    (globalThis as any).requestAnimationFrame = originalRaf;
  }
});

test('U22: 貼り付けで置き換え — 置き換える条件が3つそろったときだけ働く（255）', () => {
  const calls: { set: string[]; backup: string[] } = { set: [], backup: [] };
  const run = (o: { enabled: boolean; current: string; clipboardText: string }) => {
    calls.set = [];
    calls.backup = [];
    return applyReplacePaste({
      ...o,
      setText: (v) => calls.set.push(v),
      backup: (v) => calls.backup.push(v),
    });
  };

  // 3条件がそろったときだけ置き換える
  expect(run({ enabled: true, current: '前の内容', clipboardText: '新しい内容' })).toBe(true);
  expect(calls.set).toEqual(['新しい内容']);
  expect(calls.backup, 'Undoのために元の内容を退避すること').toEqual(['前の内容']);

  // 設定OFF → 何もしない（＝ブラウザの通常の貼り付けがそのまま走る）
  expect(run({ enabled: false, current: '前の内容', clipboardText: '新しい内容' })).toBe(false);
  expect(calls.set).toEqual([]);
  expect(calls.backup).toEqual([]);

  // 入力が空 → 置き換えるものが無いので素通し（追記と同じ結果になる）
  expect(run({ enabled: true, current: '', clipboardText: '新しい内容' })).toBe(false);
  expect(calls.set).toEqual([]);

  // クリップボードが空 → 素通し。**本文を消して終わりにしない**（255の安全条件）
  expect(run({ enabled: true, current: '大事な本文', clipboardText: '' })).toBe(false);
  expect(calls.set, '空の貼り付けで本文が消えないこと').toEqual([]);
  expect(calls.backup).toEqual([]);
});

test('U23: ホバープレビューの本文整形 — Markdown記号を出さず、長い本文は…で切る（256）', () => {
  // 空・null はプレビューを出さない
  expect(toPreviewText(null)).toBeNull();
  expect(toPreviewText('')).toBeNull();
  expect(toPreviewText('   \n\n  ')).toBeNull();

  // 連続する空行は詰める（ふきだしの縦を無駄に使わない）
  expect(toPreviewText('一行目\n\n\n\n二行目')).toBe('一行目\n\n二行目');

  // 上限まではそのまま、超えたら「…」で切る
  const short = 'あ'.repeat(HOVER_PREVIEW_CHARS);
  expect(toPreviewText(short)).toBe(short);
  const long = toPreviewText('あ'.repeat(HOVER_PREVIEW_CHARS + 200))!;
  expect([...long].length, '上限＋「…」の長さに収まること').toBe(HOVER_PREVIEW_CHARS + 1);
  expect(long.endsWith('…')).toBe(true);

  // Markdownの整形は markdownToReadableText が担当（画面側で通す）。
  // ここでは「## や ** が残った文字列は渡らない」ことを、その関数の出力で確かめる
  const md = '## 見出し\n\n**強調**したい文章です。\n\n- 箇条書き\n';
  const plain = markdownToReadableText(md);
  expect(plain, '見出し記号が残らないこと').not.toContain('##');
  expect(plain, '強調記号が残らないこと').not.toContain('**');
  expect(toPreviewText(plain)).toContain('見出し');

  // 遅延の範囲（257で 0.4〜0.6秒 → 0.25〜0.30秒 へ引き下げ）。
  //
  // 下げた理由: 256の500msは「待たされる」と院長から指摘があった（指示書257②）。
  // それでも下限を250ms未満にしないのは、一覧を横切るだけで次々出て煩わしくなるため
  // ——256の「眺めているだけでは出ない」という要件（R-62(4)）を壊さない最小値がここ。
  // 上限を300msに絞ったのは、これ以上戻すと再び「待たされる」に逆戻りするため。
  expect(HOVER_PREVIEW_DELAY_MS).toBeGreaterThanOrEqual(250);
  expect(HOVER_PREVIEW_DELAY_MS).toBeLessThanOrEqual(300);
  // 先読みは表示より必ず前（先に取得を始めるという性質そのもの）。
  // 0にしないのは、一覧を素早く横切るだけでカードの数だけ取得が走るため
  expect(HOVER_PREVIEW_PREFETCH_MS).toBeGreaterThan(0);
  expect(HOVER_PREVIEW_PREFETCH_MS).toBeLessThan(HOVER_PREVIEW_DELAY_MS);
  // 文字数は指示書の 300〜400 の範囲
  expect(HOVER_PREVIEW_CHARS).toBeGreaterThanOrEqual(300);
  expect(HOVER_PREVIEW_CHARS).toBeLessThanOrEqual(400);
});

test('U24: ホバープレビューはカードの矩形に隣接して出る（257・位置の機械判定）', () => {
  // 256の不具合: 位置の基準がカーソル座標で、画面端では「カーソルを基準に箱ごと反転」
  // していた。本番実測では、カードが y=636 にあるのにプレビューが y=370 に出ており、
  // カードから266px離れていた（＝どのカードのものか分からない）。
  // ここでは「カードとプレビューの矩形の距離」を機械判定する。

  const VP = { width: 1440, height: 900 };
  const W = HOVER_PREVIEW_WIDTH;
  const H = HOVER_PREVIEW_MAX_HEIGHT;

  /** 2つの矩形の最短距離（重なっていれば0） */
  const rectDistance = (a: PreviewRect, b: PreviewRect) => {
    const dx = Math.max(0, Math.max(a.left - (b.left + b.width), b.left - (a.left + a.width)));
    const dy = Math.max(0, Math.max(a.top - (b.top + b.height), b.top - (a.top + a.height)));
    return Math.hypot(dx, dy);
  };
  const boxOf = (card: PreviewRect): PreviewRect => {
    const pl = computePreviewPlacement(card, VP);
    return { left: pl.left, top: pl.top, width: W, height: H };
  };
  const inViewport = (r: PreviewRect) =>
    r.left >= 0 && r.top >= 0 && r.left + r.width <= VP.width && r.top + r.height <= VP.height;

  // 4隅・中央・グリッドの各列（1〜4列相当）を代表点として通す
  const cards: Array<[string, PreviewRect]> = [
    ['左上', { left: 24, top: 24, width: 320, height: 180 }],
    ['右上', { left: 1096, top: 24, width: 320, height: 180 }],
    ['左下', { left: 24, top: 696, width: 320, height: 180 }],
    ['右下', { left: 1096, top: 696, width: 320, height: 180 }],
    ['中央', { left: 560, top: 360, width: 320, height: 180 }],
    // 256で実際に離れた位置に出た条件（画面下寄り・4列グリッドの各列）
    ['4列1列目', { left: 261, top: 560, width: 256, height: 120 }],
    ['4列4列目', { left: 1143, top: 560, width: 256, height: 120 }],
    // 保存一覧の横長カード（左右に入らないので上下へ回る）
    ['横長・上寄り', { left: 248, top: 200, width: 1164, height: 107 }],
    ['横長・下寄り', { left: 248, top: 576, width: 1164, height: 107 }],
  ];

  for (const [label, card] of cards) {
    const box = boxOf(card);
    expect(rectDistance(card, box), `${label}: カードに隣接していること`).toBeLessThanOrEqual(
      HOVER_PREVIEW_GAP + 1,
    );
    expect(inViewport(box), `${label}: 画面内に収まること`).toBe(true);
    expect(box.left, `${label}: 左の余白を割らないこと`).toBeGreaterThanOrEqual(HOVER_PREVIEW_MARGIN);
    expect(box.top, `${label}: 上の余白を割らないこと`).toBeGreaterThanOrEqual(HOVER_PREVIEW_MARGIN);
  }

  // 優先順は 右 → 左 → 下 → 上
  expect(computePreviewPlacement(cards[0][1], VP).side, '左上は右へ').toBe('right');
  expect(computePreviewPlacement(cards[1][1], VP).side, '右上は左へ').toBe('left');
  expect(computePreviewPlacement(cards[7][1], VP).side, '横長・上寄りは下へ').toBe('bottom');
  expect(computePreviewPlacement(cards[8][1], VP).side, '横長・下寄りは上へ').toBe('top');

  // 三角のポインタはカードと箱が重なる範囲に入る（＝どのカードから出ているか分かる）
  const card = cards[0][1];
  const placement = computePreviewPlacement(card, VP);
  const arrow = computeArrowOffset(card, placement, { width: W, height: H });
  const arrowY = placement.top + arrow;
  expect(arrowY, '三角がカードの縦範囲に入ること').toBeGreaterThanOrEqual(card.top);
  expect(arrowY, '三角がカードの縦範囲に入ること').toBeLessThanOrEqual(card.top + card.height);

  // 極端な条件（カードが画面いっぱい）でも画面外へ出さない
  const huge = boxOf({ left: 0, top: 0, width: VP.width, height: VP.height });
  expect(inViewport(huge), 'カードが画面いっぱいでも画面内に収まること').toBe(true);
});

test('U25: 貼り付けで置き換えは全端末で既定OFF、明示的にONにしたときだけ働く（259）', () => {
  // 258では「iOSの逃げ道が既定で閉じていた」ことを直すため、カーソルの無い端末の既定を
  // ONにした。259で**取り下げ**——本文欄の長押しは iOS の選択メニューが出て主経路に
  // ならないと分かり、代わりに「✕ クリア」＋「長押し貼り付け欄／📋 ペースト」を置いた。
  // 主経路でないものを既定ONで残すと、**追記したいだけの貼り付けが黙って全消しになる**。
  expect(resolvePasteReplaceEnabled(null), '未設定は全端末でOFF').toBe(false);
  expect(resolvePasteReplaceEnabled('1'), '明示的にONにしたときだけ働く').toBe(true);
  expect(resolvePasteReplaceEnabled('0'), 'OFFの保存値はOFF').toBe(false);
  // 壊れた保存値は既定（OFF）に倒れる（243・251と同じ倒し方）
  for (const broken of ['', 'true', 'yes', '2']) {
    expect(resolvePasteReplaceEnabled(broken), `壊れた値(${broken})はOFFに倒れる`).toBe(false);
  }
});

test('U27: カーソル位置への差し込み（259）— 位置が取れないときは末尾に足す', () => {
  // 259の「📋 ペースト」と「長押し貼り付け欄」は**入れるだけ**（消さない）。
  // 置き換えたいときは「✕ クリア」→ 貼り付けの2操作にする＝黙って消える経路を作らない。

  // カーソル位置に差し込む
  expect(insertAtCursor('ABCD', 'xy', 2, 2)).toEqual({ next: 'ABxyCD', caret: 4 });
  // 選択範囲があればそこを置き換える
  expect(insertAtCursor('ABCD', 'xy', 1, 3)).toEqual({ next: 'AxyD', caret: 3 });
  // 先頭・末尾
  expect(insertAtCursor('ABCD', 'xy', 0, 0)).toEqual({ next: 'xyABCD', caret: 2 });
  expect(insertAtCursor('ABCD', 'xy', 4, 4)).toEqual({ next: 'ABCDxy', caret: 6 });

  // 位置が取れない・壊れている → 末尾に足す（指示書259「カーソル位置または末尾」）
  for (const bad of [null, undefined, -1, 99, NaN]) {
    expect(insertAtCursor('ABCD', 'xy', bad as number | null), `位置=${String(bad)} は末尾へ`).toEqual({
      next: 'ABCDxy',
      caret: 6,
    });
  }
  // 空の入力欄でも壊れない
  expect(insertAtCursor('', 'xy', 0, 0)).toEqual({ next: 'xy', caret: 2 });
  // 貼るものが無ければ何も変えない（本文を消して終わり、を作らない）
  expect(insertAtCursor('ABCD', '', 1, 3)).toEqual({ next: 'ABCD', caret: 4 });

  // 読めなかった（確認で「許可しない」を選んだ等）ときに黙って終わらせず、
  // iPhoneの標準操作（入力欄そのものを長押し）へ案内する
  expect(PASTE_BUTTON_MESSAGE.denied.text).toContain('入力欄を長押し');
  expect(PASTE_BUTTON_MESSAGE.denied.kind).toBe('warning');
  expect(PASTE_BUTTON_MESSAGE.empty.text).toContain('空');
});

test('U26: 分析タイプの常時表示と折りたたみの分割（258）— 取りこぼしも重複も出ない', () => {
  // 常時表示は院長がよく使う2つだけ
  expect(PRIMARY_ANALYSIS_TYPES).toEqual(['summary', 'detail_summary']);
  expect(PRIMARY_ANALYSIS_OPTIONS.map((o) => o.label)).toEqual(['概要・要約', '詳細にまとめる']);

  // 残りは**自動的に**折りたたみ側へ回る（新しい分析タイプが増えても書き足しが要らない形）
  expect(SECONDARY_ANALYSIS_OPTIONS.map((o) => o.value)).toEqual(
    ANALYSIS_OPTIONS.filter((o) => !PRIMARY_ANALYSIS_TYPES.includes(o.value)).map((o) => o.value),
  );

  // 2つの集合を合わせると元の全件と一致し、どちらにも重複しない
  const merged = [...PRIMARY_ANALYSIS_OPTIONS, ...SECONDARY_ANALYSIS_OPTIONS].map((o) => o.value);
  expect(merged.slice().sort(), '全ての分析タイプがどちらかに入ること').toEqual(
    ANALYSIS_OPTIONS.map((o) => o.value).slice().sort(),
  );
  expect(new Set(merged).size, '同じタイプが両方に出ないこと').toBe(ANALYSIS_OPTIONS.length);
  expect(SECONDARY_ANALYSIS_OPTIONS.length, '畳む側が空にならないこと').toBeGreaterThan(0);
});

test('U28: 画像生成ガードの常時連結（261d）— 全経路でサーバ側連結・二重連結しない', () => {
  // 226承認条件「ユーザー編集後のプロンプトにもサーバ側でガードを必ず連結する」が
  // /api/image-gen・/api/image-gen/multi の2経路で漏れていた（261dで是正）。
  // 連結は guardImagePrompt() の1本に集約し、ここで挙動を固定する。
  const base = '朝の光が差し込むキッチンで白湯を飲む女性の後ろ姿';

  // 1) 通常のプロンプトには末尾にガードが付く
  const guarded = guardImagePrompt(base);
  expect(guarded.startsWith(base)).toBe(true);
  expect(guarded).toContain(IMAGE_GUARD_SUFFIX);

  // 2) 既にガードを含むプロンプト（起案済み・履歴再利用）には二重連結しない
  const twice = guardImagePrompt(guarded);
  expect(twice.split(IMAGE_GUARD_SUFFIX).length - 1, 'ガードは1回だけ').toBe(1);

  // 3) 前後の空白は整えられ、本文は失われない
  expect(guardImagePrompt(`  ${base}  `)).toContain(base);
});

test('U29: ホーム並びの解決 resolveHomeHrefs（262）— 保存値を採用し、壊れた値・空は既定へ倒す', () => {
  // 262: 🎛設定UIが nav-items.ts の定義順で表示していて、サイドバーの実並び
  // （sidebar_home_items 適用後）とズレていた。解決規則をこの1関数に正本化し、
  // サイドバー（EditableHome）と設定UI（NavLabelSettings）の両方が同じ結果を見る。
  expect(resolveHomeHrefs(null)).toEqual(DEFAULT_HOME_HREFS);
  expect(resolveHomeHrefs(undefined)).toEqual(DEFAULT_HOME_HREFS);
  expect(resolveHomeHrefs('broken json')).toEqual(DEFAULT_HOME_HREFS);
  expect(resolveHomeHrefs('[]')).toEqual(DEFAULT_HOME_HREFS);
  expect(resolveHomeHrefs('{"a":1}')).toEqual(DEFAULT_HOME_HREFS);

  // 保存された並びをそのまま採用（カスタマイズが反映される）
  const order = ['/dashboard/deepresearch', '/dashboard', '/dashboard/text-analysis'];
  expect(resolveHomeHrefs(JSON.stringify(order))).toEqual(order);

  // 実在しない href・文字列以外の要素は落とす。有効分が残ればそれを、全滅なら既定を返す
  expect(resolveHomeHrefs(JSON.stringify(['/nope', 42, '/dashboard']))).toEqual(['/dashboard']);
  expect(resolveHomeHrefs(JSON.stringify(['/nope']))).toEqual(DEFAULT_HOME_HREFS);
});

test('U30: ペルソナ記事のタイトル案/本文分離（264）— マーカー欠落は全文を本文に倒す', () => {
  // 264: noteのタイトル欄に貼るためタイトル案3本を本文と分離して生成する。
  // 分離はマーカー（【タイトル案】/【本文】）方式——区切り線 --- は本文の許可記法なので区切りに使わない。
  const raw = `【タイトル案】
1. 乾燥肌と上手につきあう
2) 保湿の基本を見直す
3．今日からできる保湿ケア
【本文】
リード文です。

## 最初の章`;
  const parsed = parsePersonaArticleOutput(raw);
  expect(parsed.titles).toEqual(['乾燥肌と上手につきあう', '保湿の基本を見直す', '今日からできる保湿ケア']);
  expect(parsed.body.startsWith('リード文です。')).toBe(true);
  expect(parsed.body).toContain('## 最初の章');
  expect(parsed.body).not.toContain('【タイトル案】');

  // マーカーが無い（旧形式・AIの逸脱）→ 全文を本文として返す＝記事を失わない（fail-open）
  const legacy = '# 旧形式のタイトル\n\n本文…';
  expect(parsePersonaArticleOutput(legacy)).toEqual({ titles: [], body: legacy });

  // 本文が空の壊れた出力 → 偽の分離を作らず全文を本文へ
  const broken = '【タイトル案】\n1. だけがある\n【本文】\n';
  expect(parsePersonaArticleOutput(broken).body).toContain('だけがある');

  // タイトルは3本まで（4本以上返されても切り詰める）
  const many = '【タイトル案】\n1. a\n2. b\n3. c\n4. d\n【本文】\n本文';
  expect(parsePersonaArticleOutput(many).titles).toEqual(['a', 'b', 'c']);
});

test('U31: ナレッジ基盤（265a）— getPlaybookのfail-closedとPart A/W/S/RのID付与', () => {
  // KB v2.0 は48章（IDタグ章44＋IDなしPart 4）。全文注入せず必要IDだけ結合する。
  expect(PLAYBOOK_VERSION).toBe('2.0');
  expect(PLAYBOOK.length).toBe(48);

  // IDタグを持たないPartにも機械付与したIDで取得できる
  const partA = getPlaybook(['PART-A']);
  expect(partA).toContain('[PART-A]');
  expect(partA).toContain('主語を「かつての自分／教える側としての自分」');
  for (const id of ['PART-W', 'PART-S', 'PART-R']) {
    expect(getPlaybook([id]).length).toBeGreaterThan(100);
  }

  // 複数IDは指定順に結合される
  const joined = getPlaybook(['X-02', 'X-03']);
  expect(joined.indexOf('[X-02]')).toBeGreaterThanOrEqual(0);
  expect(joined.indexOf('[X-02]')).toBeLessThan(joined.indexOf('[X-03]'));
  // v2の中核（40倍シグナル）が本文無編集で入っている
  expect(joined).toContain('約40倍相当');

  // 存在しないIDは例外（fail-closed。黙って空文字を返して品質土台が抜け落ちるのを防ぐ）
  expect(() => getPlaybook(['X-99'])).toThrow(/未定義のナレッジID/);
  expect(() => getPlaybook(['X-02', 'NOPE-01'])).toThrow();
});

test('U32: X投稿の機械検証（265c）— URL/ハッシュタグ/空行/禁止表現を媒体別ルールで判定', () => {
  // URLは1通目の本文NG（露出低下）・2通目（リプライ）はOK
  expect(
    validateXPost('本文です https://note.com/xxx', { media: 'x', isFirstPost: true }).some((w) => w.code === 'url-in-body'),
  ).toBe(true);
  expect(
    validateXPost('記事はこちら https://note.com/xxx', { media: 'x', isFirstPost: false }).some((w) => w.code === 'url-in-body'),
  ).toBe(false);

  // ハッシュタグ: Xは3個で警告・2個までOK。noteには適用しない（§5-1: 媒体で真逆）
  expect(countHashtags('#皮膚科 ＃保湿 #スキンケア')).toBe(3);
  expect(validateXPost('#皮膚科 ＃保湿 #スキンケア', { media: 'x' }).some((w) => w.code === 'too-many-hashtags')).toBe(true);
  expect(validateXPost('#皮膚科 ＃保湿', { media: 'x' }).some((w) => w.code === 'too-many-hashtags')).toBe(false);
  expect(validateXPost('#皮膚科 ＃保湿 #スキンケア #お題', { media: 'note' }).some((w) => w.code === 'too-many-hashtags')).toBe(false);

  // 空行リズム（X-06: 2〜3行ごとに空白行）: 5行以上ベタ続きは警告、空行入りはOK
  const dense = ['一行目', '二行目', '三行目', '四行目', '五行目', '六行目'].join('\n');
  expect(hasBlankLineRhythm(dense)).toBe(false);
  expect(validateXPost(dense, { media: 'x' }).some((w) => w.code === 'no-blank-lines')).toBe(true);
  const spaced = ['一行目', '二行目', '', '三行目', '四行目', '', '五行目'].join('\n');
  expect(hasBlankLineRhythm(spaced)).toBe(true);
  expect(validateXPost(spaced, { media: 'x' }).some((w) => w.code === 'no-blank-lines')).toBe(false);

  // 禁止表現（§4-2）: 既存の content-verify 辞書で検出される
  const banned = validateXPost('この方法で必ず治ります', { media: 'x' });
  expect(banned.some((w) => w.code === 'banned-expression')).toBe(true);
  expect(validateXPost('保湿の基本を3ステップで整理しました', { media: 'x' })).toHaveLength(0);
});

test('U33: 戦略の数値補正（265d §8-1）— 注意書きがサーバー側で必ず・1回だけ付く', () => {
  // 倍率（6倍/15倍）等の数値を断定的な効果予測として出さないための決定的な担保。
  // AIの遵守（プロンプト指示）に依存せず、appendStrategyDisclaimer() が末尾に定型文を付ける。
  const doc = '# 発信戦略: テスト\n\nXプレミアムはインプレッション中央値が約6倍とされる。';
  const out = appendStrategyDisclaimer(doc);
  expect(out).toContain('自己選択バイアス');
  expect(out).toContain('中央値の比較であり対照実験ではありません');
  expect(out).toContain('実践知見の集約値であり、公式の確定値ではありません');
  expect(out.startsWith('# 発信戦略: テスト')).toBe(true);

  // 二重付与しない（保存→復元→再保存でも増えない）
  const twice = appendStrategyDisclaimer(out);
  expect(twice.split('本戦略の数値の扱いについて').length - 1).toBe(1);

  // 空入力はそのまま（偽のドキュメントを作らない）
  expect(appendStrategyDisclaimer('')).toBe('');
});

test('U34: note用見出し繰り上げ（266【1】）— h3→h2に上がり、共有ヘルパーの既定は不変', () => {
  // renderMarkdown は画面表示用に ## → h3 と1段下げる（h1をタイトルに予約。表示としては正しい）。
  // note は h2=大見出し/h3=小見出しなので、note用コピーだけ1段繰り上げる。
  const html = '<h3>大見出し</h3><p>本文</p><h4>小見出し</h4><h3>まとめ</h3>';
  const promoted = promoteHeadingsForNote(html);
  expect((promoted.match(/<h2\b/g) ?? []).length, '##由来のh3がh2へ').toBe(2);
  expect(promoted).toContain('<h3>小見出し</h3>');
  expect(promoted).not.toContain('<h4');
  // 閉じタグも揃って変換される（半端なタグを作らない）
  expect((promoted.match(/<\/h2>/g) ?? []).length).toBe(2);

  // 段階置換による二重繰り上げがない（h4がh2まで上がらない）
  expect(promoteHeadingsForNote('<h4>x</h4>')).toBe('<h3>x</h3>');
  // h2はそのまま（h1を作らない）・見出し以外のタグは触らない
  expect(promoteHeadingsForNote('<h2>x</h2><p>y</p>')).toBe('<h2>x</h2><p>y</p>');

  // 共有ヘルパー（Word体裁・53箇所実績）の既定出力は不変: ## は h3 のまま
  const word = markdownToWordHtml('## 大見出し\n\n本文');
  expect(word).toContain('<h3');
  expect(word).not.toContain('<h2');
});

test('U35: X投稿の下限検証（266【2】）— ミニ講義のみ1,000字下限・短文/長編は適用しない', () => {
  const text900 = 'あ'.repeat(900);
  // ミニ講義: 900字は下限警告（B17で観測した「900字台着地」をプロンプト頼みにしない二段構え）
  expect(validateXPost(text900, { media: 'x', length: 'mini' }).some((w) => w.code === 'under-min')).toBe(true);
  // 1,000字ちょうどはOK
  expect(validateXPost('あ'.repeat(1000), { media: 'x', length: 'mini' }).some((w) => w.code === 'under-min')).toBe(false);
  // 短文・長編プリセットには適用しない（指示書266の表）
  expect(validateXPost(text900, { media: 'x', length: 'short' }).some((w) => w.code === 'under-min')).toBe(false);
  expect(validateXPost(text900, { media: 'x', length: 'long' }).some((w) => w.code === 'under-min')).toBe(false);
  // length未指定（既存呼び出し）では出ない＝後方互換
  expect(validateXPost(text900, { media: 'x' }).some((w) => w.code === 'under-min')).toBe(false);
  // 空文字には出ない（生成失敗はfail-closed側で扱う）
  expect(validateXPost('', { media: 'x', length: 'mini' }).some((w) => w.code === 'under-min')).toBe(false);
});

test('U36: 予約投稿カレンダー（266【3】NP-02）— 平日連続割り当て・媒体別時間帯・土日送り', () => {
  const items = [
    { id: 'a', title: '記事A' },
    { id: 'b', title: '記事B' },
    { id: 'c', title: '記事C' },
  ];
  // 2026-09-04は金曜。金→（土日を飛ばして）月→火 と平日連続で割り当てる
  const rows = buildScheduleRows(items, '2026-09-04');
  expect(rows.map((r) => [r.date, r.weekday])).toEqual([
    ['2026-09-04', '金'],
    ['2026-09-07', '月'],
    ['2026-09-08', '火'],
  ]);
  // 既定は夜20:30（NP-02: 長文・有料は夜帯）。note夜公開のX告知は翌朝（X夜帯18-21時を過ぎているため）
  expect(rows[0].noteTime).toBe('20:30');
  expect(rows[0].xHint).toContain('翌朝');
  // 行ごとの時間帯上書き: 朝7:30ならX告知は当日の夜帯（18:00〜21:00）
  const withMorning = buildScheduleRows(items, '2026-09-04', { 0: 'morning' });
  expect(withMorning[0].noteTime).toBe('7:30');
  expect(withMorning[0].xHint).toContain('18:00〜21:00');
  // 開始日が土曜なら次の月曜から
  expect(buildScheduleRows(items, '2026-09-05')[0].date).toBe('2026-09-07');
  // 壊れた日付・空選択は空配列（偽の表を作らない）
  expect(buildScheduleRows(items, 'broken')).toEqual([]);
  expect(buildScheduleRows([], '2026-09-04')).toEqual([]);
  // Markdown表に媒体別の時間帯注意が入る（R-70）
  const md = scheduleToMarkdown(rows);
  expect(md).toContain('| 2026-09-04 | 金 | 夜 20:30 | 記事A |');
  expect(md).toContain('note夜帯: 20:00〜22:30');
  expect(md).toContain('X夜帯: 18:00〜21:00');
  expect(md).toContain('自動投稿はしない');
});

test('U37: note貼り付けキットの画像・位置指示（267§1退行防止）— マーカー行と<img>が出続ける', () => {
  // 院長実地確認で「リッチコピーは画像も貼り、位置指示も出力している（良好）」と確認された挙動を固定。
  // 266の rich-copy.ts 変更は追加のみ（削除0行）で、この経路（note-compat.ts）は未変更＝退行なしの機械的裏付け。
  const md = '## 見出し\n\n本文の段落です。\n\n- 箇条書き1\n- 箇条書き2';
  const images = [
    { afterBlock: 0, kind: 'hook', label: '導入画像', url: 'https://example.com/a.png' },
    { afterBlock: 2, kind: 'steps', label: '手順図', url: 'https://example.com/b.png' },
  ];

  // 位置指示（マーカー行）が画像の数だけ入り、ラベルとファイル名を含む
  const text = buildNotePasteText(md, images);
  const markers = text.split('\n').filter((l) => l.startsWith('――― 画像'));
  expect(markers.length).toBe(2);
  expect(markers[0]).toContain('導入画像');
  expect(markers[0]).toContain('をここに挿入');

  // リッチHTML側は <img> が入り、## は h2（note互換の正マッピング）
  const html = buildNoteHtml(md, new Map([[0, ['https://example.com/a.png']]]));
  expect(html).toContain('<img src="https://example.com/a.png"');
  expect(html).toContain('<h2>見出し</h2>');
});

test('U38: まとめ画像の高さ見積もり（267§3）— タイトルの折り返し行数が高さに乗る', () => {
  // 要点は多めにして最小クランプ（630px）の外で比較する（クランプ内だと差分が0に吸われる）
  const groups = [{ points: Array.from({ length: 10 }, (_, i) => `要点${i + 1}の本文です`) }];
  const short = { title: '短いタイトル', groups };
  // 院長実地確認の実例（31字）: カード型で2行に折り返し、2行目下端が切れていた
  const long = { title: '【肌と細胞の科学】肌荒れと関係するミトコンドリアの秘密｜まとめ', groups };

  expect(estimateTitleLines('card', short.title)).toBe(1);
  expect(estimateTitleLines('card', long.title)).toBe(2);
  // 3行になる超長タイトルにも追随する（動的拡張・省略はしない＝タイトルは編集済みデータ）
  expect(estimateTitleLines('card', 'あ'.repeat(60))).toBe(3);

  // カード・表・ポスター＋図表テンプレの全形式で、折り返し分だけ高さが増える
  for (const t of ['card', 'table', 'poster', 'steps', 'compare', 'qa', 'beforeafter'] as const) {
    const hs = estimateSummaryImageHeight(t, short);
    const hl = estimateSummaryImageHeight(t, long);
    const perLine = t === 'poster' ? 62 : 56;
    expect(hl - hs, `${t}: 2行タイトルで+${perLine}px`).toBe(perLine);
  }

  // 1行タイトルの高さは折り返し補正の影響を受けない（退行防止: 補正は2行目以降にだけ効く）
  expect(estimateTitleLines('table', 'あ'.repeat(26))).toBe(1);
});

test('U39: 収益化ロードマップのフェーズ判定（268）— 決定的・境界値・警告と断定なし', () => {
  const base = { ...EMPTY_ROADMAP_INPUTS, freeArticleCount: 5, followerCount: 100, purchaseCount: 2 };

  // 記事0本（有料0本）はフェーズ0
  expect(judgePhase(EMPTY_ROADMAP_INPUTS).phase).toBe(0);
  // 有料1〜2本はフェーズ1、3本以上（例: 4本）はフェーズ2
  expect(judgePhase({ ...base, paidArticleCount: 1 }).phase).toBe(1);
  expect(judgePhase({ ...base, paidArticleCount: 2 }).phase).toBe(1);
  expect(judgePhase({ ...base, paidArticleCount: 4 }).phase).toBe(2);
  // 手動フラグでフェーズ3・4（定期購読はメンバーシップより優先）
  expect(judgePhase({ ...base, paidArticleCount: 4, membershipOpen: true }).phase).toBe(3);
  expect(judgePhase({ ...base, paidArticleCount: 4, membershipOpen: true, subscriptionStarted: true }).phase).toBe(4);

  // 決定的: 同じ入力は常に同じ結果（判定にAI・乱数・日時を使っていない）
  const input = { ...base, paidArticleCount: 4 };
  const a = judgePhase(input);
  const b = judgePhase(input);
  expect(a).toEqual(b);

  // フェーズ1の通過条件は「あと◯本」が実値で埋まる
  expect(passConditionText(PHASE_DEFS[1], { ...base, paidArticleCount: 1 })).toContain('あと2本');

  // フェーズ3・4のコピー出力に継続負荷の警告が入り、フェーズ2以下には入らない
  const md3 = roadmapToMarkdown(PHASE_DEFS[3], { ...base, membershipOpen: true }, ['x']);
  expect(md3).toContain('毎月の更新が必須');
  expect(md3).toContain('撤退手順');
  const md1 = roadmapToMarkdown(PHASE_DEFS[1], { ...base, paidArticleCount: 1 }, ['x']);
  expect(md1).not.toContain('撤退手順');

  // 成果を断定する文言が全フェーズのタスク・要約・注意書きに無い（§1-4）
  const allTexts = [
    ROADMAP_DISCLAIMER,
    ...([0, 1, 2, 3, 4] as const).flatMap((p) => [
      PHASE_DEFS[p].summary,
      PHASE_DEFS[p].passCondition,
      ...PHASE_DEFS[p].tasks.map((t) => t.text),
    ]),
  ].join('\n');
  for (const banned of ['必ず増え', '確実に増え', '必ず売れ', '絶対に', '保証します', '必ず成功']) {
    expect(allTexts, `断定文言「${banned}」を含まない`).not.toContain(banned);
  }
  // 注意書き自体が「約束しない」ことを明言している
  expect(ROADMAP_DISCLAIMER).toContain('約束するものではありません');
});

test('U40: 有料化候補のランキング（268§4）— X-02の重みで決定的に降順に並ぶ', () => {
  const items = [
    { id: 'a', reaction: { impressions: 10000, bookmarks: 0, shares: 0 } }, // score 10
    { id: 'b', reaction: { impressions: 0, bookmarks: 0, shares: 1 } }, // score 40（共有はいいねの約40倍相当）
    { id: 'c', reaction: { impressions: 0, bookmarks: 10, shares: 0 } }, // score 30
    { id: 'd', reaction: { impressions: 0, bookmarks: 0, shares: 0 } }, // score 0
  ];
  const ranked = rankPaidCandidates(items);
  expect(ranked.map((r) => r.id)).toEqual(['b', 'c', 'a', 'd']);
  // 共有1件はインプレッション1万より重い（X-02: 共有が最重要シグナル）
  expect(reactionScore(items[1].reaction)).toBeGreaterThan(reactionScore(items[0].reaction));
  // 安定ソート: 同スコアは元の順を保つ（同じ入力で並びが揺れない）
  const tie = rankPaidCandidates([
    { id: 'x', reaction: { impressions: 0, bookmarks: 0, shares: 0 } },
    { id: 'y', reaction: { impressions: 0, bookmarks: 0, shares: 0 } },
  ]);
  expect(tie.map((r) => r.id)).toEqual(['x', 'y']);
});

test('U41: Kindle多軸展開（269）— 7切り口・書籍文脈検出・一致度概算が決定的に働く', () => {
  // 軸3（切り口）は7種すべて定義され、キー順も安定（選択肢の並びが揺れない）
  expect(REMIX_ANGLE_KEYS).toEqual(['mechanism', 'qa', 'clinical', 'glossary', 'compare', 'daily', 'detour']);
  for (const k of REMIX_ANGLE_KEYS) {
    const a = REMIX_ANGLES[k];
    expect(a.label).toBeTruthy();
    expect(a.signal).toBeTruthy();
    expect(a.promptBlock.length).toBeGreaterThan(50);
  }
  // 「遠回りの共有」は主語=自分を明示（患者を主語にしない・§4/R-69系の補正）
  expect(REMIX_ANGLES.detour.promptBlock).toContain('主語は必ず自分');
  expect(getRemixAngle('unknown').key).toBe('mechanism');

  // §7: 書籍文脈の残存検出（正規表現で検出可能な範囲）
  const dirty = '前章で述べたとおり、保湿は重要です。本書では第3章で詳しく扱い、巻末の付録も参照。';
  const hits = detectBookContext(dirty);
  const labels = hits.map((h) => h.label);
  expect(labels).toContain('前章への参照');
  expect(labels).toContain('「本書」');
  expect(labels).toContain('章番号への参照');
  expect(labels).toContain('巻末への参照');
  expect(labels).toContain('付録への参照');
  // 単独で成立する文は検出0件（誤検出しない）
  expect(detectBookContext('入浴後の保湿は角層に水分が残っているうちに。詳しい手順は書籍にまとめています。')).toHaveLength(0);

  // §2-2: 一致度の概算（3-gram containment・決定的）
  const src = '角層は水分を保つバリアの役割を持ち、入浴後は早めの保湿が基本とされています。';
  expect(textOverlapRatio(src, src)).toBe(1);
  expect(textOverlapRatio('まったく無関係のリンゴとバナナの話。', src)).toBeLessThan(0.1);
  // 書籍本文の複製に近いテキストは高い値になり、警告しきい値を超える
  const copied = `保湿の話です。${src}以上が要点でした。`;
  expect(textOverlapRatio(copied, src)).toBeGreaterThan(KDP_OVERLAP_WARN);
  // §5: 候補間の類似は対称
  const s1 = candidateSimilarity('AAAABBBB', 'AAAACCCC');
  const s2 = candidateSimilarity('AAAACCCC', 'AAAABBBB');
  expect(s1).toBe(s2);

  // §4: 事実同一性の規約文言（喩えから結論を導かない・因果を変えない）
  expect(FACT_FIDELITY_RULES).toContain('喩えから新たな結論を導かない');
  expect(FACT_FIDELITY_RULES).toContain('因果関係を変えない');
});


test('U43: 横並び比較の判断（271/285/289）— 上限4件・列数（自動＝幅／手動＝固定列）・高さプリセット・割合スクロール・要約フォールバックのラベル', () => {
  // §4-1: 上限は4（285で3→4）。超える追加は受け付けない（古い方を押し出さない＝比較中の列が黙って消えない）
  expect(BATCH_COMPARE_MAX).toBe(4);
  let ids: number[] = [];
  for (const id of [1, 2, 3, 4, 5]) ids = toggleCompareId(ids, id);
  expect(ids).toEqual([1, 2, 3, 4]);
  // 外してから足せる
  ids = toggleCompareId(ids, 2);
  expect(ids).toEqual([1, 3, 4]);
  ids = toggleCompareId(ids, 5);
  expect(ids).toEqual([1, 3, 4, 5]);

  // §4-2: 列数はカーソルの有無と選択件数の小さい方。タッチ端末は常に1列
  expect(resolveCompareColumns(4, true)).toBe(4);
  expect(resolveCompareColumns(3, true)).toBe(3);
  expect(resolveCompareColumns(2, true)).toBe(2);
  expect(resolveCompareColumns(0, true)).toBe(1);
  expect(resolveCompareColumns(9, true)).toBe(4); // 5列以上は作らない（285§4）
  expect(resolveCompareColumns(4, false)).toBe(1);

  // R-17: Tailwindは完全リテラル（動的組み立てをしない）。3列は xl まで段階的に減る＝横スクロールを出さない
  // 285§2-2: 4件は 2xl で4列、xl では3列にせず 2列×2行、md 未満は1列
  expect(compareGridClass(4)).toBe('grid gap-3 grid-cols-1 md:grid-cols-2 2xl:grid-cols-4');
  expect(compareGridClass(4)).not.toContain('xl:grid-cols-3');
  expect(compareGridClass(3)).toBe('grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3');
  expect(compareGridClass(2)).toBe('grid gap-3 grid-cols-1 md:grid-cols-2');
  expect(compareGridClass(1)).toBe('grid gap-3 grid-cols-1');
  for (const cols of [1, 2, 3, 4] as const) {
    expect(compareGridClass(cols)).not.toContain('${');
  }

  // §3-1: 同期は割合ベース。長さの違う列でも底・頭が対応する
  expect(scrollRatioOf(0, 2000, 500)).toBe(0);
  expect(scrollRatioOf(1500, 2000, 500)).toBe(1);
  expect(scrollRatioOf(750, 2000, 500)).toBeCloseTo(0.5, 5);
  expect(scrollRatioOf(100, 400, 500)).toBe(0); // スクロールできない列は0
  // 5000字の列の半分 → 3000字の列でも半分の位置になる（ピクセルでは合わない）
  expect(syncScrollTop(0.5, 5000, 500)).toBe(2250);
  expect(syncScrollTop(0.5, 3000, 500)).toBe(1250);
  expect(syncScrollTop(1, 3000, 500)).toBe(2500);
  expect(syncScrollTop(0.5, 400, 500)).toBe(0);

  // §2-1: 要約は263③の保存済みセクションを使う（再生成しない）。
  const withSummary = {
    research_text: '本文です。',
    // 実データと同じ形（run/route.ts が組み立てる見出し行）
    context_text: '## 📋 要約（1000字以内）\n\n要約の中身。\n\n---\n\n## 📚 詳細コンテキスト\n\n詳細の中身。',
  };
  expect(parseContextWithSummary(withSummary.context_text).summarySection).toBe('要約の中身。');
  expect(pickCompareText(withSummary, 'research')).toEqual({ text: '本文です。', fellBack: false });
  expect(pickCompareText(withSummary, 'summary')).toEqual({ text: '要約の中身。', fellBack: false });

  // 要約が無い古いデータは、空にせず本文へフォールバックし、その旨を呼び出し側へ返す
  const legacy = { research_text: '古い本文。', context_text: '要約セクションのない素材。' };
  expect(parseContextWithSummary(legacy.context_text).summarySection).toBeNull();
  expect(pickCompareText(legacy, 'summary')).toEqual({ text: '古い本文。', fellBack: true });

  // 289: 列数の手動指定。既定は 'auto'（従来の幅による自動）。手動は「指定と件数の小さい方」・タッチ端末は常に1列
  expect(COMPARE_COLUMN_CHOICE_DEFAULT).toBe('auto');
  expect(resolveCompareColumns(4, true, 'auto')).toBe(4);
  expect(resolveCompareColumns(4, true, 2)).toBe(2);
  expect(resolveCompareColumns(4, true, 3)).toBe(3);
  expect(resolveCompareColumns(2, true, 4)).toBe(2); // 空トラックを出さない
  expect(resolveCompareColumns(4, false, 4)).toBe(1); // タッチ端末は指定より1列を優先
  // 手動指定のクラスは幅の段階を持たない固定列（狭い画面でも指定どおり）。完全リテラル
  expect(compareGridClass(4, 4)).toBe('grid gap-3 grid-cols-4');
  expect(compareGridClass(3, 3)).toBe('grid gap-3 grid-cols-3');
  expect(compareGridClass(2, 2)).toBe('grid gap-3 grid-cols-2');
  expect(compareGridClass(1, 1)).toBe('grid gap-3 grid-cols-1');
  expect(compareGridClass(2, 4)).toBe('grid gap-3 grid-cols-2'); // 2件選択で4列指定 → 2列分だけ
  expect(compareGridClass(4, 'auto')).toBe(compareGridClass(4));
  for (const c of [1, 2, 3, 4] as const) expect(compareGridClass(c, c)).not.toContain('${');
  // 289 §4-2: 高さプリセット。既定は high＝68vh（従来値）。low は 2×2 で1画面に収まる目安（2段＋隙間が100vh未満）
  expect(COMPARE_HEIGHT_DEFAULT).toBe('high');
  expect(COMPARE_HEIGHT_VH.high).toBe(68);
  expect(COMPARE_HEIGHT_VH.low * 2).toBeLessThan(80);
  expect(COMPARE_HEIGHT_VH.low).toBeLessThan(COMPARE_HEIGHT_VH.mid);
  expect(COMPARE_HEIGHT_VH.mid).toBeLessThan(COMPARE_HEIGHT_VH.high);
  expect(COMPARE_HEIGHT_VH.high).toBeLessThan(COMPARE_HEIGHT_VH.max);
  expect(COMPARE_HEIGHT_VH.max).toBeLessThanOrEqual(100);

  // 285§3-2: フォールバック列のラベルは実際に出している内容（本文）に合わせる。正常な列の表記は変えない
  expect(compareColumnLabel('summary', true)).toBe('本文（要約なし）');
  expect(compareColumnLabel('summary', false)).toBe('要約');
  expect(compareColumnLabel('research', false)).toBe('リサーチ本文');
});


test('U44: ホバープレビューの座標は文字サイズ(zoom)で潰れない（273§3）', () => {
  // 240の文字サイズはルートの CSS zoom。getBoundingClientRect は拡大後（視覚px）を返すが、
  // position:fixed の left/top はズーム前（レイアウトpx）として解釈され、描画時に zoom 倍される。
  // 本番実測: zoom=1.25 で style.left=310px のポップアップが 388px（=310×1.25）に出ていた。
  const card: PreviewRect = { left: 620, top: 1000, width: 1236, height: 107 };
  const viewport = { width: 1512, height: 900 }; // innerWidth/Height は zoom で変わらない

  // 箱の実寸も視覚pxに直して「どちら側に置けるか」を判定する
  const zoom = 1.4;
  const boxVisual = { width: HOVER_PREVIEW_WIDTH * zoom, height: HOVER_PREVIEW_MAX_HEIGHT * zoom };
  const placement = computePreviewPlacement(card, viewport, boxVisual);
  // style へ渡す値（レイアウトpx）→ 描画されると zoom 倍されて、決めた視覚pxに戻る
  const styleLeft = toLayoutPx(placement.left, zoom);
  const styleTop = toLayoutPx(placement.top, zoom);
  expect(styleLeft * zoom).toBeCloseTo(placement.left, 5);
  expect(styleTop * zoom).toBeCloseTo(placement.top, 5);

  // zoom=1 のときは従来と1pxも変わらない（既存の挙動を壊さない）
  expect(toLayoutPx(310, 1)).toBe(310);
  const plain = computePreviewPlacement(card, viewport);
  expect(toLayoutPx(plain.left, 1)).toBe(plain.left);
  expect(toLayoutPx(plain.top, 1)).toBe(plain.top);
  // 0や負のzoom（読めなかったとき）は素通しする＝位置を壊さない
  expect(toLayoutPx(310, 0)).toBe(310);

  // 拡大時は箱も大きくなるので、拡大を見込まないと画面からはみ出す組み合わせが出る。
  // 見込んだ結果は視覚pxで画面内に収まっていること
  expect(placement.left).toBeGreaterThanOrEqual(HOVER_PREVIEW_MARGIN);
  expect(placement.left + boxVisual.width).toBeLessThanOrEqual(viewport.width);
  expect(placement.top).toBeGreaterThanOrEqual(HOVER_PREVIEW_MARGIN);
  expect(placement.top + boxVisual.height).toBeLessThanOrEqual(viewport.height);
});


// ============================================================================
// 275: プレゼン発表原稿（第1段階）— 用途・前後の文脈・原稿の型・時間の積算
// ============================================================================

test('U45: プレゼン原稿の用途4種・既定・前後の文脈の圧縮・並び替え・ガードの後勝ち（275）', () => {
  // §3-4: 用途は4種、既定は院内勉強会。壊れた値は既定に倒す
  expect(PRESENTATION_AUDIENCES.map((a) => a.key)).toEqual(['academic', 'staff', 'patient', 'public']);
  expect(DEFAULT_PRESENTATION_AUDIENCE).toBe('staff');
  expect(audienceOf('staff').label).toBe('院内勉強会');
  expect(audienceOf(undefined).key).toBe('staff');
  expect(audienceOf('nonsense').key).toBe('staff');

  // §3-5: 原稿の型は 繋ぎ→本題→補足→送り の4要素（順序も固定）
  expect(SCRIPT_SECTION_DEFS.map((d) => d.label)).toEqual(['繋ぎ', '本題', '補足', '送り']);

  // §3-3: 次ページへ渡す要点は1〜2文に圧縮する（全文を渡さない）
  const main = '角層のバリア機能が低下します。そのため外用薬の浸透が変わります。三文目は落とします。';
  expect(summarizeForNext(main)).toBe('角層のバリア機能が低下します。そのため外用薬の浸透が変わります。');
  // AIが要約を返したときはそれを使う（無いときだけ本題から決定的に導出＝R-74）
  expect(summarizeForNext(main, 'バリア機能の低下が要点です。')).toBe('バリア機能の低下が要点です。');
  // 長すぎる要約は必ず切る（トークンが膨らむのを防ぐ）
  const long = summarizeForNext('あ'.repeat(400));
  expect(long.length).toBeLessThanOrEqual(SUMMARY_FOR_NEXT_MAX + 1);
  expect(summarizeForNext('', '')).toBe('');

  // R-39: 直前のページが失敗していても、最も近い生成済みページの要点を次へ渡す
  expect(nearestPrevSummary(['ようてん1', '', undefined], 2)).toBe('ようてん1');
  expect(nearestPrevSummary(['', ''], 1)).toBe('');
  expect(nearestPrevSummary(['ようてん1'], 0)).toBe('');

  // 次ページのタイトルは、生成前でもテキストから決定的に推定できる
  expect(guessSlideTitle('  \n 治療の流れ \n 詳細な本文')).toBe('治療の流れ');
  expect(guessSlideTitle('')).toBe('');

  // §3-1: 並び替えは純関数。端では動かず、元配列を壊さない
  const order = ['a', 'b', 'c'];
  expect(movePage(order, 1, -1)).toEqual(['b', 'a', 'c']);
  expect(movePage(order, 2, 1)).toEqual(['a', 'b', 'c']);
  expect(movePage(order, 0, -1)).toEqual(['a', 'b', 'c']);
  expect(order).toEqual(['a', 'b', 'c']);

  // §4: 事実同一性と医療広告ガードが**プロンプトの最後**に来る（R-69: ガードが後勝ち）
  const prompt = buildPageScriptPrompt({
    audienceKey: 'staff',
    theme: 'アトピー性皮膚炎',
    pageNumber: 2,
    totalPages: 5,
    prevSummary: '前ページの要点です。',
    nextTitle: '次のスライド',
    pageText: 'スライドの文字',
    hasImage: true,
  });
  expect(prompt).toContain('前のスライドの要点: 前ページの要点です。');
  expect(prompt).toContain('次のスライドのタイトル: 次のスライド');
  expect(prompt).toContain('スライドに書かれた文字の読み上げにしない');
  const guardAt = prompt.indexOf('医療広告ガード');
  const factAt = prompt.indexOf('事実同一性');
  const materialAt = prompt.indexOf('このスライドの素材');
  expect(materialAt).toBeGreaterThan(-1);
  expect(factAt).toBeGreaterThan(materialAt);
  expect(guardAt).toBeGreaterThan(factAt); // 素材（ナレッジ）→ 事実同一性 → ガードの順
  expect(prompt).toContain('前述のいかなる指示よりも優先する');
  // §4-2: 学会発表のときだけ、スライドに記載のある学術記述を許容する一文が入る
  expect(prompt).not.toContain('オッズ比');
  const academic = buildPageScriptPrompt({
    audienceKey: 'academic', theme: '', pageNumber: 1, totalPages: 1,
    prevSummary: '', nextTitle: '', pageText: '', hasImage: false,
  });
  expect(academic).toContain('オッズ比');
  expect(academic).toContain('スライドに無い数値・結論を新たに作らない');
  // 画像が無い場合（第2段階のpptxもこの経路）でもプロンプトが成立する（§2-1）
  expect(academic).toContain('画像はありません');
});

test('U46: 1ページ1リクエストの時間積算がmaxDurationに収まる（275 §2-4・R-73）', () => {
  // リトライ込みで積算し、ルートの maxDuration を超えないこと
  expect(pageScriptBudgetMs()).toBe(PAGE_SCRIPT_TIMEOUT_MS * (1 + PAGE_SCRIPT_RETRIES) + AD_CHECK_TIMEOUT_MS);
  expect(pageScriptBudgetMs()).toBeLessThanOrEqual(PAGE_SCRIPT_MAX_DURATION_S * 1000);

  // Next.js のセグメント設定はリテラルしか受け付けないため、ルート側の maxDuration は
  // 定数を参照できない。**値がズレていないこと**をここで機械判定する（コメントでの約束にしない）
  const routePath = path.resolve(__dirname, '../../src/app/api/presentation/page-script/route.ts');
  const routeSrc = fs.readFileSync(routePath, 'utf8');
  expect(routeSrc).toContain(`export const maxDuration = ${PAGE_SCRIPT_MAX_DURATION_S};`);
  // vercel.json 側の宣言も同値であること
  const vercelJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8'),
  ) as { functions: Record<string, { maxDuration: number }> };
  expect(vercelJson.functions['src/app/api/presentation/page-script/route.ts'].maxDuration)
    .toBe(PAGE_SCRIPT_MAX_DURATION_S);

  // 通し原稿は「原稿ができたページだけ」を決定的に並べる（失敗ページで全体が壊れない＝R-39）
  const mkPage = (id: string): SlidePage => ({
    id, kind: 'pdf', fileName: '資料.pdf', indexInFile: Number(id), imageDataUrl: null, text: '',
  });
  const md = scriptDocumentToMarkdown({
    theme: 'テーマ',
    audienceKey: 'staff',
    pages: [
      {
        page: mkPage('1'),
        result: {
          slideTitle: '一枚目', summaryForNext: '', inferredTheme: '',
          sections: { connect: 'つなぎ', main: 'ほんだい', supplement: 'ほそく', handoff: 'おくり' },
        },
      },
      { page: mkPage('2'), result: null }, // 失敗したページ
    ],
  });
  expect(md).toContain('# テーマ｜発表原稿');
  expect(md).toContain('- 用途: 院内勉強会');
  expect(md).toContain('ページ数: 2枚（原稿あり 1枚）');
  expect(md).toContain('## 1. 一枚目');
  expect(md).toContain('**繋ぎ**');
  expect(md).not.toContain('## 2.');
  // `###` はUIに出さない（品質規約）
  expect(md).not.toContain('###');
});


// ============================================================================
// 276: 喩え話・比喩表現 — 分野の既定・層の出し分け・3軸・機械検証・ガードの2層
// ============================================================================

test('U47: 比喩の分野と層（276）— 既定は医療・一般では医療特化層が消える・上限3つ・3軸整列', () => {
  // §2-3: 分野の既定は「医療・健康」。壊れた値・未指定も安全側（医療）に倒す
  expect(DEFAULT_METAPHOR_FIELD).toBe('medical');
  expect(metaphorFieldOf(undefined)).toBe('medical');
  expect(metaphorFieldOf('nonsense')).toBe('medical');
  expect(metaphorFieldOf('general')).toBe('general');

  // §4: 汎用7層は常に出る。医療特化3層は分野が医療のときだけ増える
  const general = audiencesForField('general').map((a) => a.key);
  const medical = audiencesForField('medical').map((a) => a.key);
  expect(general).toEqual(['junior', 'elementary', 'student', 'worker', 'senior', 'adjacent', 'expert']);
  expect(medical.length).toBe(general.length + 3);
  for (const key of ['beauty', 'family', 'parenting']) {
    expect(medical, `医療分野では ${key} が選べる`).toContain(key);
    expect(general, `一般分野では ${key} が出ない`).not.toContain(key);
  }
  // §4-1: 既定は「中学生でも分かる」
  expect(DEFAULT_METAPHOR_AUDIENCE).toBe('junior');

  // §4-3: 3つまで。4つ目は**受け付けない**（古い方を押し出さない）
  const three: MetaphorAudienceKey[] = ['junior', 'senior', 'worker'];
  expect(toggleMetaphorTarget(three, 'expert')).toEqual(three);
  expect(toggleMetaphorTarget(three, 'senior')).toEqual(['junior', 'worker']);
  expect(MAX_METAPHOR_TARGETS).toBe(3);
  // 一般へ切り替えたら、選んでいた医療特化の層は落ちる
  expect(sanitizeTargets(['junior', 'beauty', 'family'], 'general')).toEqual(['junior']);
  expect(sanitizeTargets(['junior', 'beauty'], 'medical')).toEqual(['junior', 'beauty']);

  // §6-2: 3軸は固定順。AIの返しが欠けていても順序どおり3つ揃い、欠けは「該当なし」で埋まる
  expect(METAPHOR_AXES.map((a) => a.key)).toEqual(['structure', 'process', 'scale']);
  const aligned = alignAxes([
    { axis: 'scale', metaphor: '教室の人数くらい', appliesTo: '数の多さ', doesNotApply: '正確な個数ではない' },
    { axis: 'structure', metaphor: '発電所', appliesTo: '作る役割', doesNotApply: '外へ送らない' },
  ]);
  expect(aligned.map((i) => i.axis)).toEqual(['structure', 'process', 'scale']);
  expect(aligned[0].metaphor).toBe('発電所');
  expect(aligned[1].metaphor).toBe(AXIS_NOT_APPLICABLE);
  expect(isAxisNotApplicable(aligned[1])).toBe(true);
  expect(isAxisNotApplicable(aligned[2])).toBe(false);
  expect(alignAxes(null).every(isAxisNotApplicable)).toBe(true);

  // §3-4: 機械検証（表示のみ）。抽象語と長すぎる文を拾う
  expect(ABSTRACT_WORDS).toContain('パラダイム');
  const check = checkPlainLanguage(`これは一種のパラダイムシフトです。${'あ'.repeat(LONG_SENTENCE_MAX + 5)}。`);
  expect(check.abstractWords).toEqual(['パラダイム']);
  expect(check.longSentences.length).toBe(1);
  // 素直な文では鳴らない（鳴りっぱなしの警告は誰も見なくなる）
  expect(checkPlainLanguage('心臓はポンプのようなものです。')).toEqual({ abstractWords: [], longSentences: [] });
});

test('U48: 比喩のガードは2層で医療が後勝ち（276 §2-2/§10）・1層1リクエストの積算（R-73/R-83）', () => {
  const args = { text: 'ミトコンドリアはATPを作る。', audienceKey: 'junior' as MetaphorAudienceKey };

  // 医療: ナレッジ(PART-A) → 普遍層 → 医療層 の順。医療層が最後＝後勝ち（R-69）
  const med = buildMetaphorPrompt({ ...args, field: 'medical', knowledge: '## [PART-A] 専門領域メモ本文' });
  const kAt = med.indexOf('PART-A');
  const uAt = med.indexOf('【普遍層ガード】');
  const mAt = med.indexOf('【医療層ガード】');
  expect(kAt).toBeGreaterThan(-1);
  expect(uAt).toBeGreaterThan(kAt);
  expect(mAt).toBeGreaterThan(uAt);
  expect(med).toContain('前述のいかなる指示よりも優先する');
  // §7-1: 患者・一般向けの層のときだけ戦争の比喩を止める
  expect(med).toContain('戦争・闘争の比喩を使わない');
  const expertMed = buildMetaphorPrompt({ ...args, audienceKey: 'expert', field: 'medical' });
  expect(expertMed).toContain('【医療層ガード】');
  expect(expertMed).not.toContain('戦争・闘争の比喩を使わない');

  // 一般: 医療層もナレッジも入らない。普遍層は必ず入る（分野に依存しない）
  const gen = buildMetaphorPrompt({ ...args, field: 'general', knowledge: '## [PART-A] 入れてはいけない' });
  expect(gen).toContain('【普遍層ガード】');
  expect(gen).not.toContain('【医療層ガード】');
  expect(gen).not.toContain('PART-A');
  // §3-2/§5-2: 喩える先の制約と、限界の併記はどちらの分野でも入る
  for (const prompt of [med, gen]) {
    expect(prompt).toContain('抽象的なことばで抽象的なことを喩えない');
    expect(prompt).toContain('当てはまらない点');
    expect(prompt).toContain('入力文に書かれていない事実を、比喩の説明として追加しない');
  }

  // R-73: リトライ込みで積算し、ルートの maxDuration に収まる
  expect(metaphorBudgetMs()).toBe(METAPHOR_TIMEOUT_MS * (1 + METAPHOR_RETRIES) + METAPHOR_AD_CHECK_TIMEOUT_MS);
  expect(metaphorBudgetMs()).toBeLessThanOrEqual(METAPHOR_MAX_DURATION_S * 1000);
  // R-83: セグメント設定はリテラルしか効かないので、定数とのズレをここで判定する
  const routeSrc = fs.readFileSync(
    path.resolve(__dirname, '../../src/app/api/metaphor/route.ts'), 'utf8',
  );
  expect(routeSrc).toContain(`export const maxDuration = ${METAPHOR_MAX_DURATION_S};`);
  const vercelJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8'),
  ) as { functions: Record<string, { maxDuration: number }> };
  expect(vercelJson.functions['src/app/api/metaphor/route.ts'].maxDuration).toBe(METAPHOR_MAX_DURATION_S);

  // 失敗した層は本文に混ざらない（R-39）／`###` をUIに出さない
  const md = metaphorDocumentToMarkdown({
    field: 'medical',
    columns: [
      {
        audienceKey: 'junior',
        items: alignAxes([{ axis: 'structure', metaphor: '発電所', appliesTo: '作る役割', doesNotApply: '外へ送らない' }]),
      },
      { audienceKey: 'senior', items: null },
    ],
  });
  expect(md).toContain('- 分野: 医療・健康');
  expect(md).toContain('## 🧒 中学生でも分かる');
  expect(md).toContain('【当てはまらない点】外へ送らない');
  expect(md).not.toContain('年配の方');
  expect(md).not.toContain('###');
});


// ============================================================================
// 277: バッチジョブのタイトル（決定的導出）とタイムゾーン（JST統一）
// ============================================================================

test('U49: バッチジョブ名は決定的に導出し、時刻を含めない（277 §2-2・R-74）', () => {
  const topics = [
    { topic: '生体内の抗酸化力の測定方法', mode: 'standard' },
    { topic: 'ザクロの美容効果', mode: 'quick' },
    { topic: 'ビタミンCの安定性', mode: 'deep' },
  ];

  // 1) グループ名があればそのまま使う
  expect(deriveBatchJobTitle('ザクロ美容効果', topics)).toBe('ザクロ美容効果');
  // 空白だけのグループ名は「未入力」として扱う（トピック名へ倒す）
  expect(deriveBatchJobTitle('   ', topics)).toBe('生体内の抗酸化力の測定方法 他2件');
  expect(deriveBatchJobTitle(undefined, topics)).toBe('生体内の抗酸化力の測定方法 他2件');
  // 2) トピック1件なら「他n件」を付けない
  expect(deriveBatchJobTitle('', [{ topic: 'ザクロの美容効果' }])).toBe('ザクロの美容効果');
  // 文字列配列でも同じ結果（呼び出し側の形に依存しない）
  expect(deriveBatchJobTitle('', ['A', 'B'])).toBe('A 他1件');
  // 3) 長いトピック名は省略する（履歴の1行が崩れない）
  const long = 'あ'.repeat(BATCH_TITLE_TOPIC_MAX + 20);
  const truncated = deriveBatchJobTitle('', [{ topic: long }]);
  expect(truncated.endsWith('…')).toBe(true);
  expect(truncated.length).toBe(BATCH_TITLE_TOPIC_MAX + 1);
  expect(truncateTitle('短い', 40)).toBe('短い');
  // 4) トピックが無い（通常は起きない）ときも時刻は使わない
  expect(deriveBatchJobTitle('', [])).toBe(BATCH_TITLE_FALLBACK);

  // 5) **どの経路でもタイトルに日付・時刻が入らない**（UTC/JSTのずれた名前を作らない）
  const timeLike = /\d{1,4}\/\d{1,2}\/\d{1,2}|\d{1,2}:\d{2}/;
  for (const title of [
    deriveBatchJobTitle('', topics),
    deriveBatchJobTitle(undefined, []),
    deriveBatchJobTitle('ザクロ美容効果', topics),
  ]) {
    expect(title, `タイトルに時刻が含まれない: ${title}`).not.toMatch(timeLike);
  }

  // 6) 決定的（同じ入力なら何度呼んでも同じ・時刻に依存しない）
  expect(deriveBatchJobTitle('', topics)).toBe(deriveBatchJobTitle('', topics));
});

test('U51: 二重登録の判定は「登録内容が全部同じ」ときだけ一致する（277 §3・R-87）', () => {
  const base = {
    title: 'ザクロ美容効果',
    topics: [{ topic: 'A', mode: 'quick' }, { topic: 'B', mode: 'deep' }],
    scheduleType: 'immediate',
    scheduledAt: null,
    autoSave: true,
  };
  // 同じ内容なら一致（＝二重発火として遮断される）
  expect(batchJobSignature(base)).toBe(batchJobSignature({ ...base }));
  // 保存済み行から作り直しても一致する（DBはDate型・空白まじりで返ることがある）
  expect(
    batchJobSignature({ ...base, title: ' ザクロ美容効果 ', scheduledAt: undefined }),
  ).toBe(batchJobSignature(base));
  expect(
    batchJobSignature({ ...base, scheduledAt: new Date('2030-01-01T00:00:00Z') }),
  ).toBe(batchJobSignature({ ...base, scheduledAt: '2030-01-01T00:00:00.000Z' }));

  // 一部でも違えば別物として通す（設定を変えた登録し直しを塞がない）
  for (const diff of [
    { title: '別の名前' },
    { topics: [{ topic: 'A', mode: 'quick' }] },
    { topics: [{ topic: 'A', mode: 'deep' }, { topic: 'B', mode: 'deep' }] },
    { scheduleType: 'cron' },
    { scheduledAt: '2030-01-02T00:00:00.000Z' },
    { autoSave: false }, // 263の自動保存フラグだけを変えた登録（C60が実際に行う操作）
  ]) {
    expect(batchJobSignature({ ...base, ...diff }), JSON.stringify(diff)).not.toBe(
      batchJobSignature(base),
    );
  }
});

test('U50: 日時はJSTで組み立てる（277 §2-3・R-86）', () => {
  // 実際に起きたずれ: ジョブ名「2026/8/31 5:41:17」（UTC）と表示「14:41:17」（JST）
  const utcMoment = '2026-08-31T05:41:17Z';
  expect(jstDateTimeString(utcMoment)).toBe('2026/8/31 14:41:17');
  expect(formatJst(utcMoment, { month: 'numeric', day: 'numeric' })).toBe('8/31');
  expect(jstShortDate(utcMoment)).toBe('8/31');

  // 日付だけの導出も同じ。UTCの15:30は**翌日**のJST 0:30
  expect(jstDateString('2026-08-30T15:30:00Z')).toBe('2026-08-31');
  expect(jstDateString('2026-08-30T14:59:00Z')).toBe('2026-08-30');
  // UTCで日付を作る従来のやり方とは1日ずれることを固定しておく
  expect(new Date('2026-08-30T15:30:00Z').toISOString().slice(0, 10)).toBe('2026-08-30');

  // 壊れた値は例外にせず空文字（表示が落ちない＝R-06の握りつぶしではなく「出さない」）
  expect(jstDateTimeString('not-a-date')).toBe('');
  expect(jstDateString('not-a-date')).toBe('');
});

// ============================================================================
// 278: note記事→X時間差展開 — URL既定2件・型別時間帯・同日禁止・類似度・R-73
// ============================================================================

test('U52: X時間差展開の判断（278）— URLは既定2件で③④は除外・型別時間帯・同日に載せない・被り検出', () => {
  // §2-3: 既定は全5型。壊れた入力は既定へ
  expect(normalizeSelectedTypes(undefined)).toEqual(['knowhow', 'story', 'debate', 'insight', 'infographic']);
  expect(normalizeSelectedTypes(['insight', 'knowhow', 'bogus'])).toEqual(['knowhow', 'insight']); // 型の順に固定

  // §5-2: URLは既定2件＝先頭と最後。③議論型・④常識破壊型には付けない
  const all = [...X_FANOUT_TYPES];
  const flags = defaultUrlFlags(all);
  expect(DEFAULT_URL_COUNT).toBe(2);
  expect(Object.values(flags).filter(Boolean).length).toBe(2);
  expect(flags.knowhow).toBe(true);
  expect(flags.infographic).toBe(true);
  expect(flags.debate).toBe(false);
  expect(flags.insight).toBe(false);
  // 件数を上げても③④には付かない（候補3件が上限）
  expect(Object.values(defaultUrlFlags(all, 5)).filter(Boolean).length).toBe(3);
  expect(defaultUrlFlags(all, 5).debate).toBe(false);
  // ③④しか選んでいなければURLは0件（無理に付けない）
  expect(Object.values(defaultUrlFlags(['debate', 'insight'])).filter(Boolean).length).toBe(0);
  expect(Object.values(defaultUrlFlags(all, 0)).filter(Boolean).length).toBe(0);

  // §4-2: 型ごとの既定時間帯（①②③夜・④朝・⑤昼）。Xの時間帯はnoteと別（R-70）
  expect(DEFAULT_TYPE_SLOT).toEqual({ knowhow: 'night', story: 'night', debate: 'night', insight: 'morning', infographic: 'noon' });
  expect(X_SLOTS.night.window).toBe('18:00〜21:00');
  expect(NOTE_SLOTS.night.window).toBe('20:00〜22:30');
  expect(X_SLOTS.night.time).not.toBe(NOTE_SLOTS.night.time);

  // §4-1/§4-3/§3-2③: 3日おき・土日は次の平日（266と同じ toWeekday）・同じ日に2件入らない
  // 2026-09-02 は水曜。水→土(→月)→木→日(→月)→木 … 土日送りで同日に寄る組み合わせ
  const rows = buildFanoutSchedule(all.map((type) => ({ type })), '2026-09-02', 3);
  expect(rows.map((r) => r.date)).toEqual(['2026-09-02', '2026-09-07', '2026-09-10', '2026-09-14', '2026-09-17']);
  expect(rows.map((r) => r.weekday)).toEqual(['水', '月', '木', '月', '木']);
  expect(hasSameDayCollision(rows)).toBe(false);
  // 間隔1日・金曜開始: 金→(土→月)→火… 土日送りでも重ならない
  const tight = buildFanoutSchedule(all.map((type) => ({ type })), '2026-09-04', 1);
  expect(hasSameDayCollision(tight)).toBe(false);
  expect(tight.map((r) => r.weekday).every((w) => w !== '土' && w !== '日')).toBe(true);
  // 間隔0（不正）は1に丸められ、それでも同日にはならない
  const zero = buildFanoutSchedule(all.map((type) => ({ type })), '2026-09-02', 0);
  expect(hasSameDayCollision(zero)).toBe(false);
  // 型別の既定時間帯が行に載り、行ごとの上書きが効く
  expect(rows.find((r) => r.type === 'insight')?.slot).toBe('morning');
  expect(rows.find((r) => r.type === 'infographic')?.time).toBe('12:30');
  const over = buildFanoutSchedule([{ type: 'insight', slot: 'noon', withUrl: true }], '2026-09-02');
  expect(over[0].slot).toBe('noon');
  expect(over[0].withUrl).toBe(true);
  expect(hasSameDayCollision([{ date: 'a' }, { date: 'a' }])).toBe(true);

  // §3-2①: 類似度は269の判定を流用（既定0.65）。ほぼ同文は拾い、別内容は拾わない
  expect(FANOUT_SIMILARITY_DEFAULT).toBe(0.65);
  const base = '朝の保湿は洗顔のあと3分以内に。順番は化粧水→乳液→クリームの3手順で、量は指先1関節ぶんが目安です。';
  const pairs = findSimilarPairs([
    { type: 'knowhow', text: base },
    { type: 'story', text: `${base} 私はこの順番を最初に習いました。` },
    { type: 'debate', text: '説明は先に結論から話す派と、順を追って話す派、みなさんはどちらですか。私は失敗して結論先出しに変えました。' },
  ]);
  expect(pairs.map((p) => `${p.a}-${p.b}`)).toEqual(['knowhow-story']);
  expect(findSimilarPairs([{ type: 'knowhow', text: base }, { type: 'story', text: base }], 0.95).length).toBe(1);

  // 表は「全件を投稿する」ことを勧める文言を含まない（§3-2②）
  const md = fanoutScheduleToMarkdown('記事タイトル', rows);
  expect(md).toContain('| 投稿日 |');
  expect(md).not.toMatch(/全件|すべて投稿|全部投稿/);
  expect(md).toContain('1つ目のリプライ');

  // R-73/R-83: 見切り時間は③ルートの maxDuration と同値（定数とソースの両方を固定）
  const routeSrc = fs.readFileSync(path.resolve(__dirname, '../../src/app/api/dr-hub/x-post/route.ts'), 'utf8');
  expect(routeSrc).toContain(`export const maxDuration = ${FANOUT_ROUTE_MAX_DURATION_S};`);
});

// ============================================================================
// 279: 分かりやすさ診断 — 機械検出は決定的・6項目・読者/分野の既定・ガード順・R-73
// ============================================================================

test('U53: 分かりやすさ診断の機械検出は決定的で6項目を拾う（279 §2-3・R-74）', () => {
  const text = [
    '角層のバリア機能が低下すると経皮吸収が亢進し、外用薬のアドヒアランスがQOLに与えるインパクトはエビデンスベースで多角的かつ継続的に検討されるべきパラダイムであると考えられている。',
    '細胞内酸化還元応答機構が関与する。',
    'ソリューション・プラットフォーム・エコシステムを整える。',
    '朝は洗顔（ぬるま湯で30秒ほど、こすらずに手のひらで押さえるように行うのがよい）のあとに保湿する。',
    '短い文です。',
  ].join('\n');

  // 決定的: 2回呼んで完全一致・順序も固定（文の順→種別の順）
  const a = diagnose(text);
  const b = diagnose(text);
  expect(issuesSignature(a)).toBe(issuesSignature(b));
  expect(a.length).toBeGreaterThan(0);

  // 1文目: 長文(>80字)・抽象語(パラダイム)・専門用語(角層/バリア機能/経皮吸収/アドヒアランス/QOL/エビデンス)
  const s0 = a.filter((i) => i.sentenceIndex === 0);
  expect(s0.some((i) => i.kind === 'long')).toBe(true);
  expect(s0.some((i) => i.kind === 'abstract' && i.excerpt === 'パラダイム')).toBe(true);
  const terms0 = s0.filter((i) => i.kind === 'term').map((i) => i.excerpt);
  expect(terms0).toEqual(expect.arrayContaining(['角層', 'バリア機能', '経皮吸収', 'アドヒアランス', 'QOL']));
  expect(s0.find((i) => i.kind === 'term' && i.excerpt === '角層')?.detail).toBe('＝肌のいちばん外側の層');
  // 2文目: 漢語の連続（7字以上）
  const kanji = a.find((i) => i.sentenceIndex === 1 && i.kind === 'kanji');
  expect(kanji?.excerpt).toBe('細胞内酸化還元応答機構');
  expect(kanji!.excerpt.length).toBeGreaterThanOrEqual(PLAIN_CHECK_THRESHOLDS.kanjiRun);
  // 3文目: カタカナ語の連続（3語）＋抽象語
  expect(a.some((i) => i.sentenceIndex === 2 && i.kind === 'katakana')).toBe(true);
  expect(a.filter((i) => i.sentenceIndex === 2 && i.kind === 'abstract').map((i) => i.excerpt)).toEqual(['エコシステム', 'ソリューション', 'プラットフォーム']);
  // 4文目: 括弧内の補足が長い
  expect(a.find((i) => i.sentenceIndex === 3 && i.kind === 'paren')?.excerpt.startsWith('（')).toBe(true);
  // 5文目: 何も出ない（鳴りっぱなしにしない）
  expect(a.filter((i) => i.sentenceIndex === 4).length).toBe(0);
  // 素直な文は0件
  expect(diagnose('心臓はポンプのようなものです。')).toEqual([]);
  expect(splitSentences('一。二！三？\n四')).toEqual(['一。', '二！', '三？', '四']);
  // 辞書は定数として1箇所（追加すれば検出に載る形）
  expect(TERM_DICTIONARY.every((t) => t.term && t.plain)).toBe(true);
});

test('U54: 言い換えの読者・分野・ガード順・R-73の積算（279 §4/§5/§6-3）', () => {
  // §4-1: 汎用7層＋主婦向け＝8層。既定は中学生。276の医療特化層（美容/家族/子育て）は入れない
  expect(PLAIN_AUDIENCES.map((a) => a.key)).toEqual(['junior', 'elementary', 'student', 'worker', 'senior', 'adjacent', 'expert', 'homemaker']);
  expect(DEFAULT_PLAIN_AUDIENCE).toBe('junior');

  const issue = { kind: 'term' as const, sentence: '角層のバリア機能が低下する。', excerpt: '角層', detail: '＝肌のいちばん外側の層' };
  // 医療: 制約 → 事実同一性 → 普遍層 → 医療層（最後＝後勝ち・R-69）。患者向け層なので戦争メタファー禁止が入る
  const med = buildRephrasePrompt({ field: 'medical', audienceKey: 'junior', issue, before: '前の文。', after: '次の文。' });
  const at = (k: string) => med.indexOf(k);
  expect(at('喩える先')).toBeGreaterThan(-1);
  expect(at('事実の同一性')).toBeGreaterThan(at('喩える先'));
  expect(at('【普遍層ガード】')).toBeGreaterThan(at('事実の同一性'));
  expect(at('【医療層ガード】')).toBeGreaterThan(at('【普遍層ガード】'));
  expect(med).toContain('戦争・闘争の比喩を使わない');
  expect(med).toContain('元の文が伝えていた内容と同一');
  expect(med).toContain('前: 前の文。');
  // 一般: 医療層は入らない・普遍層と事実同一性は入る
  const gen = buildRephrasePrompt({ field: 'general', audienceKey: 'worker', issue, before: '', after: '' });
  expect(gen).not.toContain('【医療層ガード】');
  expect(gen).toContain('【普遍層ガード】');
  expect(gen).toContain('事実の同一性');
  // 専門家向けは戦争メタファーの禁止文が入らない（医療層自体は入る）
  const expert = buildRephrasePrompt({ field: 'medical', audienceKey: 'expert', issue, before: '', after: '' });
  expect(expert).toContain('【医療層ガード】');
  expect(expert).not.toContain('戦争・闘争の比喩を使わない');
  // AI判定（参考）は言い換えを書かせない・機械検出の重複項目を挙げさせない
  const review = buildReviewPrompt('本文。', 'junior');
  expect(review).toContain('言い換え案は書かない');
  expect(review).toContain('機械で検出済みなので挙げない');

  // R-73: 生成45秒×2 + 広告チェック15秒 = 105秒 ≤ maxDuration 120秒。ルート2本とvercel.jsonの値も一致（R-83）
  expect(rephraseBudgetMs()).toBe(REPHRASE_TIMEOUT_MS * (1 + REPHRASE_RETRIES) + REPHRASE_AD_CHECK_TIMEOUT_MS);
  expect(rephraseBudgetMs()).toBeLessThanOrEqual(PLAIN_MAX_DURATION_S * 1000);
  const vercelJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8')) as { functions: Record<string, { maxDuration: number }> };
  for (const r of ['rephrase', 'review']) {
    const src = fs.readFileSync(path.resolve(__dirname, `../../src/app/api/plain-check/${r}/route.ts`), 'utf8');
    expect(src).toContain(`export const maxDuration = ${PLAIN_MAX_DURATION_S};`);
    expect(vercelJson.functions[`src/app/api/plain-check/${r}/route.ts`].maxDuration).toBe(PLAIN_MAX_DURATION_S);
  }

  // レポートは機械検出とAI判定を別見出しで出し、本文を書き換えていないと明記・`###` なし
  const md = reportToMarkdown({
    sourceText: 'x', field: 'medical', audienceKey: 'junior',
    issues: diagnose('角層のバリア機能が低下する。'),
    aiIssues: [{ kind: 'logic', excerpt: '角層のバリア機能が低下する。', note: '理由がない' }],
    rephrases: { 'term-0-0': [{ text: '肌のいちばん外側の層の守る力が弱まる。', note: '' }] },
  });
  expect(md).toContain('## 機械検出（確定）');
  expect(md).toContain('## AI判定（参考）');
  expect(md).toContain('本文は書き換えていません');
  expect(md).toContain('言い換え案: 肌のいちばん外側');
  expect(md).not.toContain('###');
});


// 281: エピソード記録の純関数（§3 数字の扱い・§2-3 問いかけの形・§6 脚色禁止・R-73・R-84）
test('U55: エピソード記録（281）— 行動の数字は警告せず効果の数値化だけ拾う・参考例は問いかけのみ・脚色禁止の規約・R-73積算・ep-N名前空間', () => {
  // §3: 自分の行動の数字（時間・回数・年数）は絶対に拾わない
  const action = { ...emptyEpisodeInput(), details: '1日10時間勉強した。毎朝5時に起きた。3年続けた。週6日、2時間の演習を続けた。' };
  expect(detectEffectClaims(action)).toEqual([]);
  // §3: 効果の標榜（割合・倍率・N人中M人 × 効果語）は拾う。同じ入力なら同じ結果（R-74）
  const effect = {
    ...emptyEpisodeInput(),
    feelings: 'この方法で痛みが8割減った。',
    reflection: '95%の人が改善する。2倍の効果があった。10人中9人が良くなった。3年続けた。',
  };
  const found = detectEffectClaims(effect);
  expect(found.map((c) => c.field)).toEqual(['feelings', 'reflection', 'reflection', 'reflection']);
  expect(found[0].quantity).toBe('8割');
  expect(found.map((c) => c.sentence)).not.toContain('3年続けた。');
  expect(detectEffectClaims(effect)).toEqual(found);
  // 割合があっても効果語が無ければ拾わない（例: 模試の正答率）
  expect(detectEffectClaims({ ...emptyEpisodeInput(), details: '模試の正答率は6割だった。' })).toEqual([]);

  // §2-3: 参考例は問いかけの形だけ。断定形・重複・空を落とし、上限7件
  const normalized = normalizeExamples([
    '朝は何時に起きていましたか？',
    '閉店間際の半額弁当が唯一の楽しみでしたよね',
    '朝は何時に起きていましたか？',
    '',
    42,
    '一番つらかった時間帯はいつでしたか',
    'A?', 'B?', 'C?', 'D?', 'E?', 'F?', 'G?',
  ]);
  expect(normalized).not.toContain('閉店間際の半額弁当が唯一の楽しみでしたよね');
  expect(normalized[0]).toBe('朝は何時に起きていましたか？');
  expect(normalized.filter((s) => s === '朝は何時に起きていましたか？').length).toBe(1);
  expect(normalized.length).toBe(EXAMPLE_COUNT_MAX);

  // §6-2: 脚色禁止の規約が下流ブロックに必ず入る。記録の文言はそのまま
  const rec = {
    id: 1, title: '', period: '19歳', situation: '', feelings: '', details: '朝5時起床。', thoughts: '', reflection: '',
    tags: ['受験'], created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  };
  const block = formatEpisodesForPrompt([rec]);
  expect(block).toContain('朝5時起床。');
  expect(block).toContain('- 時期: 19歳');
  expect(block).not.toContain('- 状況:'); // 空欄は載せない（無い事実を作らない）
  expect(EPISODE_FACT_GUARD).toContain('記録にない出来事');
  expect(EPISODE_FACT_GUARD).toContain('感情を誇張しない');
  expect(EPISODE_FACT_GUARD).toContain('そのまま使うか、使わない');
  expect(formatEpisodesForPrompt([])).toBe('');
  expect(episodeDisplayTitle(rec)).toBe('朝5時起床。');
  expect(episodeDisplayTitle({ title: '', situation: '', details: '', period: '' })).toBe('（無題）');

  // 入力の正規化
  expect(parseEpisodeIds(['3', 3, -1, 'x', 2.5, 7])).toEqual([3, 7]);
  expect(normalizeEpisodeTags('健康, 受験、受験 仕事')).toEqual(['健康', '受験', '仕事']);

  // R-73: 25秒 × (1+1) = 50秒 ≤ maxDuration 60。ルートの文字列と vercel.json も同じ値
  expect(EXAMPLES_TIMEOUT_MS * (1 + EXAMPLES_RETRIES)).toBeLessThanOrEqual(EXAMPLES_MAX_DURATION_S * 1000);
  const routeSrc = readFileSync(join(__dirname, '../../src/app/api/episodes/examples/route.ts'), 'utf8');
  expect(routeSrc).toContain(`export const maxDuration = ${EXAMPLES_MAX_DURATION_S};`);
  const vercel = JSON.parse(readFileSync(join(__dirname, '../../vercel.json'), 'utf8'));
  expect(vercel.functions['src/app/api/episodes/examples/route.ts']?.maxDuration).toBe(EXAMPLES_MAX_DURATION_S);

  // Kindle素材の名前空間 ep-N（ana-N と同じ流儀）
  expect(parseKindleSourceKey(makeEpisodeSourceKey(12))).toEqual({ kind: 'episode', id: 12 });
  expect(parseKindleSourceKey('ep-0')).toEqual({ kind: 'library', id: 'ep-0' });
  expect(KINDLE_MATERIAL_SOURCE_META.episode.label).toBe('エピソード記録');

  // R-84/R-57: サイドバー登録・12文字以内
  const nav = ALL_NAV_ITEMS.find((i) => i.href === '/dashboard/episodes');
  expect(nav?.label).toBe('エピソード記録');
  expect((nav?.label ?? '').length).toBeLessThanOrEqual(12);
});

// ───────────────────────────────────────────────────────────────────────────
// 283: 同一リサーチの本文・要約を1枚のカードにまとめる判定（表示側・決定的）
// R-79: テスト入力は保存側から写す——
//   バッチ: src/app/api/batch-research/[id]/run/route.ts saveTopicToLibrary
//   通常DR: src/app/dashboard/deepresearch/page.tsx の SaveToLibraryButton（tags="ディープリサーチ" / "ディープリサーチ,要約"）
// ───────────────────────────────────────────────────────────────────────────
test('U56: リサーチ保存のカードまとめ（283/286）— batchタグは確実に紐付く・通常DRはタイトル一致＋時刻近接のペアリング（最も近いもの同士・同種別は組まない・余りは単独）・時間差超過/非DRはまとめない', () => {
  const T0 = Date.parse('2026-08-31T10:00:00+09:00');
  const iso = (ms: number) => new Date(ms).toISOString();
  // ── バッチ（saveTopicToLibrary の INSERT をそのまま写す）──
  const jobId = 123;
  const batchRow = (id: string, kind: 'research' | 'summary', index: number, title: string, at: number) => ({
    id,
    type: 'deepresearch',
    title,
    content: kind === 'research' ? '本文'.repeat(3000) : '要約'.repeat(400),
    metadata: JSON.stringify({ from: 'batch-research', jobId, topicIndex: index, kind, savedAt: iso(at) }),
    tags:
      kind === 'research'
        ? `ディープリサーチ,バッチ,batch:${jobId}-${index}`
        : `ディープリサーチ,要約,バッチ,batch:${jobId}-${index}s`,
    group_name: 'ディープリサーチ',
    created_at: iso(at),
  });
  // ── 通常DR（SaveToLibraryButton: type/title/content/metadata{savedAt}/tags/group_name）──
  const drRow = (id: string, title: string, tags: string, at: number) => ({
    id,
    type: 'deepresearch',
    title,
    content: 'x',
    metadata: { savedAt: iso(at) },
    tags,
    group_name: 'ディープリサーチ',
    created_at: iso(at),
  });

  // 種別の判定
  expect(artifactKindOf(batchRow('a', 'summary', 0, 'T', T0))).toBe('summary');
  expect(artifactKindOf(batchRow('a', 'research', 0, 'T', T0))).toBe('research');
  expect(artifactKindOf(drRow('a', 'T', 'ディープリサーチ,要約', T0))).toBe('summary');
  expect(artifactKindOf(drRow('a', 'T', 'ディープリサーチ,詳細', T0))).toBe('detail');
  expect(artifactKindOf(drRow('a', 'T', 'ディープリサーチ,活用アドバイス', T0))).toBe('advice');
  expect(artifactKindOf(drRow('a', 'T', 'ディープリサーチ', T0))).toBe('research');
  expect(artifactKindOf(drRow('a', 'T', 'ディープリサーチ,お気に入り', T0))).toBe('research');
  // batch キー（要約の末尾 s を落として本文と同じ鍵）
  expect(batchLinkKey(batchRow('a', 'summary', 4, 'T', T0))).toBe('batch:123-4');
  expect(batchLinkKey(batchRow('a', 'research', 4, 'T', T0))).toBe('batch:123-4');
  expect(batchLinkKey(drRow('a', 'T', 'ディープリサーチ', T0))).toBeNull();

  // 1) バッチの本文＋要約 → 1枚・確実（link=batch）・本文が先頭。一覧APIの順（新しい方が先）でも同じ
  const bS = batchRow('b-s', 'summary', 0, 'バッチ題', T0 + 60_000);
  const bR = batchRow('b-r', 'research', 0, 'バッチ題', T0);
  const c1 = groupLibraryItems([bS, bR]);
  expect(c1).toHaveLength(1);
  expect(c1[0].link).toBe('batch');
  expect(c1[0].key).toBe('batch:123-0');
  expect(c1[0].artifacts.map((a) => a.kind)).toEqual(['research', 'summary']);
  expect(c1[0].primary.id).toBe('b-r');
  expect(ARTIFACT_LABEL[c1[0].artifacts[1].kind]).toBe('要約');
  // 要約が生成失敗で本文だけ → 単体（link=null）
  expect(groupLibraryItems([bR])[0].link).toBeNull();
  // 別トピック（index違い）は混ざらない
  const b2 = batchRow('b2-r', 'research', 1, 'バッチ題', T0);
  expect(groupLibraryItems([bS, bR, b2])).toHaveLength(2);

  // 2) 通常DR: タイトル一致＋10分差＋本文/要約 → 1枚・推定（link=estimated）
  const nR = drRow('n-r', '抗酸化力の測定', 'ディープリサーチ', T0);
  const nS = drRow('n-s', '抗酸化力の測定', 'ディープリサーチ,要約', T0 + 10 * 60_000);
  const c2 = groupLibraryItems([nS, nR]);
  expect(c2).toHaveLength(1);
  expect(c2[0].link).toBe('estimated');
  expect(c2[0].artifacts.map((a) => a.item.id)).toEqual(['n-r', 'n-s']);

  // 3) 286: 同題4件（本文2＋要約2）はペアリングで2枚（283の「3件以上は個別」を廃止）。
  //    時刻が最も近いもの同士: s1(0分)–s2(+2分) と s3(+15分)–s4(+18分)
  const s1 = drRow('s1', 'SOD酵素の比較', 'ディープリサーチ', T0);
  const s2 = drRow('s2', 'SOD酵素の比較', 'ディープリサーチ,要約', T0 + 2 * 60_000);
  const s3 = drRow('s3', 'SOD酵素の比較', 'ディープリサーチ', T0 + 15 * 60_000);
  const s4 = drRow('s4', 'SOD酵素の比較', 'ディープリサーチ,要約', T0 + 18 * 60_000);
  const c3 = groupLibraryItems([s4, s3, s2, s1]);
  expect(c3).toHaveLength(2);
  expect(c3.map((c) => c.artifacts.map((a) => a.item.id))).toEqual([['s3', 's4'], ['s1', 's2']]);
  expect(c3.every((c) => c.link === 'estimated')).toBe(true);

  // 4) 同タイトル2件でも同種別（277で遮断した重複実行の残骸など）はまとめない
  const d1 = drRow('d1', '重複', 'ディープリサーチ', T0);
  const d2 = drRow('d2', '重複', 'ディープリサーチ', T0 + 60_000);
  expect(groupLibraryItems([d1, d2])).toHaveLength(2);

  // 5) 時間差が閾値を超えたらまとめない（閾値は定数1箇所）
  const f1 = drRow('f1', '遠い', 'ディープリサーチ', T0);
  const f2 = drRow('f2', '遠い', 'ディープリサーチ,要約', T0 + ESTIMATED_PAIR_WINDOW_MS + 1);
  expect(groupLibraryItems([f1, f2])).toHaveLength(2);
  const g2 = drRow('g2', '遠い', 'ディープリサーチ,要約', T0 + ESTIMATED_PAIR_WINDOW_MS);
  expect(groupLibraryItems([f1, g2])).toHaveLength(1);

  // 6) 別々の実行が離れた時刻にある同タイトル4件 → 時刻の塊ごとに判定（前の塊は2件でまとまり、後の塊は同種別でまとまらない）
  const h1 = drRow('h1', 'H', 'ディープリサーチ', T0);
  const h2 = drRow('h2', 'H', 'ディープリサーチ,要約', T0 + 60_000);
  const h3 = drRow('h3', 'H', 'ディープリサーチ', T0 + 5 * ESTIMATED_PAIR_WINDOW_MS);
  const h4 = drRow('h4', 'H', 'ディープリサーチ', T0 + 5 * ESTIMATED_PAIR_WINDOW_MS + 60_000);
  const c6 = groupLibraryItems([h4, h3, h2, h1]);
  expect(c6).toHaveLength(3);
  expect(c6.find((c) => c.link === 'estimated')?.artifacts.map((a) => a.item.id)).toEqual(['h1', 'h2']);

  // 7) DR以外（note検索など）はタイトルが同じでもまとめない
  const o1 = { ...drRow('o1', '同名', 'note検索', T0), type: 'note', group_name: 'note検索' };
  const o2 = { ...drRow('o2', '同名', 'note検索,要約', T0 + 1000), type: 'note', group_name: 'note検索' };
  expect(groupLibraryItems([o1, o2])).toHaveLength(2);

  // 8) 決定的（R-74）: 同じ入力なら同じ結果。カードの並びは入力で最初に現れた位置を保つ
  const mixed = [nS, s4, bS, nR, s3, bR, s2, s1, d1];
  const r1 = groupLibraryItems(mixed);
  const r2 = groupLibraryItems(mixed);
  expect(r1.map((c) => c.key)).toEqual(r2.map((c) => c.key));
  expect(r1.map((c) => c.key)).toEqual(['est:n-r', 'est:s3', 'batch:123-0', 'est:s1', 'd1']);
  expect(r1.flatMap((c) => c.artifacts.map((a) => a.item.id)).sort()).toEqual(mixed.map((i) => i.id).sort());

  // ── 286: ペアリングの検証（実データの例と誤結合の防止）──
  // 実例1「日本でMLM…」: 要約979字／本文2,431字・同日 → 1枚（要約タグは deepresearch/page.tsx の SaveToLibraryButton が付ける）
  const mlmTitle = '日本でMLM　マルチレベルネットワークビジネスを展開する　サプリ';
  const mlmR = { ...drRow('mlm-r', mlmTitle, 'ディープリサーチ', T0), content: 'あ'.repeat(2431) };
  const mlmS = { ...drRow('mlm-s', mlmTitle, 'ディープリサーチ,要約', T0 + 25 * 60_000), content: 'い'.repeat(979) };
  const cm = groupLibraryItems([mlmS, mlmR]);
  expect(cm).toHaveLength(1);
  expect(cm[0].link).toBe('estimated');
  expect(cm[0].artifacts.map((a) => a.item.id)).toEqual(['mlm-r', 'mlm-s']);
  // 実例2「ダイレクトセリング…」同題4枚: 本文2＋要約2 → 2枚（別々の実行が混ざらない）／本文4 → 4枚（同種別は組まない）
  const dsTitle = 'ダイレクトセリング（直接販売）およびマルチレベルマーケティング';
  const ds = [
    drRow('ds1', dsTitle, 'ディープリサーチ', T0),
    drRow('ds2', dsTitle, 'ディープリサーチ,要約', T0 + 3 * 60_000),
    drRow('ds3', dsTitle, 'ディープリサーチ', T0 + 40 * 60_000),
    drRow('ds4', dsTitle, 'ディープリサーチ,要約', T0 + 44 * 60_000),
  ];
  const cds = groupLibraryItems([...ds].reverse());
  expect(cds).toHaveLength(2);
  expect(cds.map((c) => c.artifacts.map((a) => a.item.id).sort())).toEqual([['ds3', 'ds4'], ['ds1', 'ds2']]);
  const ds4r = [0, 1, 2, 3].map((i) => drRow(`dr${i}`, dsTitle, 'ディープリサーチ', T0 + i * 60_000));
  expect(groupLibraryItems(ds4r)).toHaveLength(4);
  // 本文3＋要約3 → 3ペア＝3枚。余りは単独カード（本文3＋要約2 → 2枚＋単独1）
  const trio = [0, 1, 2].flatMap((i) => [
    drRow(`t${i}r`, 'T', 'ディープリサーチ', T0 + i * 20 * 60_000),
    drRow(`t${i}s`, 'T', 'ディープリサーチ,要約', T0 + i * 20 * 60_000 + 60_000),
  ]);
  const ct = groupLibraryItems(trio);
  expect(ct).toHaveLength(3);
  expect(ct.every((c) => c.artifacts.length === 2 && c.link === 'estimated')).toBe(true);
  expect(ct.map((c) => c.artifacts.map((a) => a.item.id))).toEqual([['t0r', 't0s'], ['t1r', 't1s'], ['t2r', 't2s']]);
  const ct2 = groupLibraryItems(trio.filter((i) => i.id !== 't2s'));
  expect(ct2).toHaveLength(3);
  expect(ct2.find((c) => c.primary.id === 't2r')?.artifacts.length).toBe(1);
  expect(ct2.find((c) => c.primary.id === 't2r')?.link).toBeNull();
  // 最も近いもの同士: 要約が2つの本文の間にあるとき、時間差の小さい方と組む
  const nr1 = drRow('nr1', 'N', 'ディープリサーチ', T0);
  const ns = drRow('ns', 'N', 'ディープリサーチ,要約', T0 + 10 * 60_000);
  const nr2 = drRow('nr2', 'N', 'ディープリサーチ', T0 + 12 * 60_000);
  const cn = groupLibraryItems([nr2, ns, nr1]);
  expect(cn.find((c) => c.link === 'estimated')?.artifacts.map((a) => a.item.id)).toEqual(['nr2', 'ns']);
  expect(cn).toHaveLength(2);
  // 同点（時間差が同じ）は本文が先に保存された組を優先し、さらに同点なら id 順（決定的）
  const e1 = drRow('e1', 'E', 'ディープリサーチ', T0 - 5 * 60_000);
  const es = drRow('es', 'E', 'ディープリサーチ,要約', T0);
  const e2 = drRow('e2', 'E', 'ディープリサーチ', T0 + 5 * 60_000);
  expect(groupLibraryItems([e2, es, e1]).find((c) => c.link === 'estimated')?.artifacts.map((a) => a.item.id)).toEqual(['e1', 'es']);
  // 本文1件に要約と詳細と活用アドバイスが付く（同じ種別は1つまで）
  const m = [
    drRow('m-r', 'M', 'ディープリサーチ', T0),
    drRow('m-s', 'M', 'ディープリサーチ,要約', T0 + 60_000),
    drRow('m-d', 'M', 'ディープリサーチ,詳細', T0 + 120_000),
    drRow('m-a', 'M', 'ディープリサーチ,活用アドバイス', T0 + 180_000),
    drRow('m-s2', 'M', 'ディープリサーチ,要約', T0 + 240_000), // 2つ目の要約は余る
  ];
  const cmm = groupLibraryItems(m);
  expect(cmm).toHaveLength(2);
  expect(cmm[0].artifacts.map((a) => a.kind)).toEqual(['research', 'summary', 'detail', 'advice']);
  expect(cmm[1].primary.id).toBe('m-s2');
  // 277の重複残骸（同題・同時刻近傍の本文2件）は組まない／窓（1時間）を超える要約は組まない
  expect(groupLibraryItems([drRow('dup1', 'D', 'ディープリサーチ', T0), drRow('dup2', 'D', 'ディープリサーチ', T0 + 1000)])).toHaveLength(2);
  expect(groupLibraryItems([drRow('w-r', 'W', 'ディープリサーチ', T0), drRow('w-s', 'W', 'ディープリサーチ,要約', T0 + ESTIMATED_PAIR_WINDOW_MS + 1)])).toHaveLength(2);
  // 決定的（R-74）: 入力順を変えても組は同じ
  const shuffled = [ds[2], ds[0], ds[3], ds[1]];
  expect(groupLibraryItems(shuffled).map((c) => c.artifacts.map((a) => a.item.id).sort()).sort()).toEqual(
    groupLibraryItems(ds).map((c) => c.artifacts.map((a) => a.item.id).sort()).sort(),
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 284: 終わらないバッチジョブを「中断」と判定する純関数（決定的・JST）
// R-79: 入力は書き込み側（/api/batch-research POST → status 'pending'、run route → 'running' + started_at、
//        完了時 'completed'/'completed_with_errors'/'failed'、致命的エラー 'paused'）の値を写す
// ───────────────────────────────────────────────────────────────────────────
test('U57: バッチジョブの中断判定（284）— running/pending＋閾値超過だけが中断・閾値内は現状維持・completedは不変・未来の予約は中断にしない・同じ入力で同じ結果・経過表示はJST', () => {
  const NOW = Date.parse('2026-09-01T12:00:00+09:00');
  const H = 60 * 60 * 1000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const job = (status: string, createdAgoMs: number, extra: Record<string, unknown> = {}) => ({
    id: 1,
    group_name: 'x',
    topics: [{ topic: 'a', mode: 'quick', status: 'pending' }],
    schedule_type: 'immediate',
    scheduled_at: null,
    status,
    created_at: iso(NOW - createdAgoMs),
    ...extra,
  });

  // 閾値は6時間（定数1箇所）
  expect(STALE_JOB_THRESHOLD_MS).toBe(6 * H);

  // running: 3ヶ月前（実データ 168/170/27/28 のケース）→ 中断
  expect(isStaleBatchJob(job('running', 98 * 24 * H), NOW)).toBe(true);
  expect(batchJobDisplayStatus(job('running', 98 * 24 * H), NOW)).toBe('stale');
  // pending: 4ヶ月前（実データ 3/4/6）→ 中断
  expect(batchJobDisplayStatus(job('pending', 119 * 24 * H), NOW)).toBe('stale');
  // 閾値ちょうど内側は実行中のまま／超えたら中断（境界）
  expect(batchJobDisplayStatus(job('running', 6 * H), NOW)).toBe('running');
  expect(batchJobDisplayStatus(job('running', 6 * H + 1), NOW)).toBe('stale');
  expect(batchJobDisplayStatus(job('running', 10 * 60 * 1000), NOW)).toBe('running');
  expect(batchJobDisplayStatus(job('pending', 5 * H), NOW)).toBe('pending');
  // running は started_at を優先（作成が古くても、直前に再開されていれば実行中）
  expect(batchJobDisplayStatus(job('running', 3 * 24 * H, { started_at: iso(NOW - 30 * 60 * 1000) }), NOW)).toBe('running');
  // pending の予約（cron）: scheduled_at が未来なら順番待ち＝中断ではない。過去に取り残されていれば中断
  expect(batchJobDisplayStatus(job('pending', 3 * 24 * H, { schedule_type: 'cron', scheduled_at: iso(NOW + 12 * H) }), NOW)).toBe('pending');
  expect(batchJobDisplayStatus(job('pending', 3 * 24 * H, { schedule_type: 'cron', scheduled_at: iso(NOW - 7 * H) }), NOW)).toBe('stale');
  // 終わっているものは何日経っても変わらない
  for (const st of ['completed', 'completed_with_errors', 'failed', 'paused']) {
    expect(batchJobDisplayStatus(job(st, 200 * 24 * H), NOW)).toBe(st);
    expect(isStaleBatchJob(job(st, 200 * 24 * H), NOW)).toBe(false);
  }
  // created_at が壊れていたら中断にしない（偽の判定をしない）
  expect(isStaleBatchJob(job('running', 0, { created_at: 'not-a-date' }), NOW)).toBe(false);

  // 決定的（R-74）: 同じ入力・同じ now で同じ結果。now が変われば結果は now にだけ依存する
  const j = job('running', 5 * H);
  expect(batchJobDisplayStatus(j, NOW)).toBe(batchJobDisplayStatus(j, NOW));
  expect(batchJobDisplayStatus(j, NOW + 2 * H)).toBe('stale');

  // 保存記事数（中断しても記事は残る）: topics の completed 数
  expect(savedTopicCount(job('running', 0, { topics: [{ status: 'completed' }, { status: 'completed' }, { status: 'pending' }] }))).toBe(2);
  expect(savedTopicCount(job('pending', 0, { topics: [] }))).toBe(0);

  // 経過表示（日／時間）と、開始時刻の JST 表示（R-86）
  expect(elapsedLabel(NOW - 98 * 24 * H, NOW)).toBe('約98日');
  expect(elapsedLabel(NOW - 7 * H, NOW)).toBe('約7時間');
  expect(elapsedLabel(NOW - 30 * 60 * 1000, NOW)).toBe('1時間未満');
  const label = staleJobLabel(job('running', 0, { created_at: '2026-05-26T05:02:10.000Z' }), NOW);
  expect(label).toContain('2026/5/26 14:02:10'); // UTC 05:02 → JST 14:02
  expect(label).toContain('開始・未完了');
  expect(label).toContain('約97日'); // 5/26 05:02 UTC → 9/1 03:00 UTC は 97日22時間
});

// ───────────────────────────────────────────────────────────────────────────
// 287: AI統合サマリーの保存名は決定的に導出（AI命名・時刻なし）／空本文は保存不可（fail-closed）
// ───────────────────────────────────────────────────────────────────────────
test('U58: AI統合サマリーの保存名と空本文判定（287）— 選んだ資料から決定的に導く・同じ入力で同じ名前・空/空白は保存不可', () => {
  expect(deriveMergeTitle(['肌老化の原因', 'ROSと抗酸化'])).toBe(`${MERGE_TITLE_PREFIX}: 肌老化の原因 他1件`);
  expect(deriveMergeTitle(['肌老化の原因'])).toBe(`${MERGE_TITLE_PREFIX}: 肌老化の原因`);
  expect(deriveMergeTitle(['A', 'B', 'C', 'D'])).toBe(`${MERGE_TITLE_PREFIX}: A 他3件`);
  expect(deriveMergeTitle([])).toBe(MERGE_TITLE_PREFIX);
  expect(deriveMergeTitle(['', null, undefined, '  '])).toBe(MERGE_TITLE_PREFIX);
  // 長い題名は40字で切る（一覧の表示が破綻しない）・空白は畳む
  const long = 'あ'.repeat(60);
  expect(deriveMergeTitle([long, 'x'])).toBe(`${MERGE_TITLE_PREFIX}: ${'あ'.repeat(40)}… 他1件`);
  expect(deriveMergeTitle(['前  後\n改行'])).toBe(`${MERGE_TITLE_PREFIX}: 前 後 改行`);
  // 決定的（R-74）
  expect(deriveMergeTitle(['X', 'Y'])).toBe(deriveMergeTitle(['X', 'Y']));
  // 空本文は保存しない
  expect(hasSavableContent('')).toBe(false);
  expect(hasSavableContent('   \n\t')).toBe(false);
  expect(hasSavableContent(null)).toBe(false);
  expect(hasSavableContent(undefined)).toBe(false);
  expect(hasSavableContent(123)).toBe(false);
  expect(hasSavableContent('## 見出し\n本文')).toBe(true);
});

// ───────────────────────────────────────────────────────────────────────────
// 290: Gemini／Claude Opus 5 の並列比較——フラグ検証・保存名/タグ/metadata・使用量表記・
//      フォールバック無効の判定（R-99）・maxDuration の一致（R-83）と積算（R-73）
// ───────────────────────────────────────────────────────────────────────────
test('U59: モデル比較（290）— compare の検証・保存名にモデル名（286ペアリングの対象外）・タグ/metadata・使用量表記・比較経路はフォールバックしない（R-99）・maxDuration 一致（R-83）と積算（R-73）', () => {
  // compare フラグ: 未指定は従来経路（null）、gemini/opus はその側、それ以外は 400 の合図（undefined）
  expect(parseCompareSide(undefined)).toBe(null);
  expect(parseCompareSide(null)).toBe(null);
  expect(parseCompareSide('')).toBe(null);
  expect(parseCompareSide('gemini')).toBe('gemini');
  expect(parseCompareSide('opus')).toBe('opus');
  expect(parseCompareSide('claude')).toBe(undefined);
  expect(parseCompareSide(1)).toBe(undefined);
  expect(parseCompareSide(true)).toBe(undefined);

  // モデルID・ラベルは ai-models.ts の定数を参照（直書き禁止・R-47）。ボタン表記にモデル名が入る（§5-1）
  expect(COMPARE_SIDE_MODEL_ID.opus).toBe(CLAUDE_OPUS_MODEL);
  expect(COMPARE_SIDE_MODEL_ID.gemini).toBe(GEMINI_TEXT_MODEL);
  expect(COMPARE_SIDE_LABEL.opus).toBe('Claude Opus 5');
  expect(COMPARE_BUTTON_LABEL).toContain(COMPARE_SIDE_LABEL.gemini);
  expect(COMPARE_BUTTON_LABEL).toContain(COMPARE_SIDE_LABEL.opus);

  // 保存名（§5-6）: モデル名を角括弧で付ける＝同題でも2モデルで別のタイトルになる。決定的（R-74）
  expect(compareSaveTitle('肌老化の原因', 'opus')).toBe('肌老化の原因［Claude Opus 5］');
  expect(compareSaveTitle('肌老化の原因', 'gemini')).toBe('肌老化の原因［Gemini 3.7 Flash］');
  expect(compareSaveTitle('肌老化の原因', 'gemini')).not.toBe(compareSaveTitle('肌老化の原因', 'opus'));
  expect(compareSaveTitle('  前  後\n改行 ', 'opus')).toBe('前 後 改行［Claude Opus 5］');
  expect(compareSaveTitle('', 'opus')).toBe('ディープリサーチ［Claude Opus 5］');
  expect(compareSaveTitle('X', 'opus')).toBe(compareSaveTitle('X', 'opus'));

  // タグ: 通常DRの「ディープリサーチ」を含む（📚リサーチ保存の一覧に載る）。要約/詳細/活用アドバイスは含まない＝種別は本文
  const opusTags = compareSaveTags('opus').split(',');
  expect(opusTags).toContain('ディープリサーチ');
  expect(opusTags).toContain('モデル比較');
  expect(opusTags).toContain(`model:${CLAUDE_OPUS_MODEL}`);
  for (const k of ['要約', '詳細', '活用アドバイス']) expect(opusTags).not.toContain(k);
  expect(compareSaveTags('gemini')).toContain(`model:${GEMINI_TEXT_MODEL}`);

  // 286のグルーピングへの影響（§5-6）: 同じお題の Gemini/Opus 本文2件は、別カード・推定ペアなし・種別は本文
  const now = '2026-09-03T00:00:00.000Z';
  const pair = [
    { id: 'g1', type: 'deepresearch', title: compareSaveTitle('同題', 'gemini'), tags: compareSaveTags('gemini'), metadata: compareSaveMetadata('gemini'), created_at: now, group_name: 'ディープリサーチ' },
    { id: 'o1', type: 'deepresearch', title: compareSaveTitle('同題', 'opus'), tags: compareSaveTags('opus'), metadata: compareSaveMetadata('opus'), created_at: now, group_name: 'ディープリサーチ' },
  ];
  const cards = groupLibraryItems(pair);
  expect(cards).toHaveLength(2);
  expect(cards.every((c) => c.link === null)).toBe(true);
  expect(pair.map((it) => artifactKindOf(it))).toEqual(['research', 'research']);
  // 通常DRの要約（同題・タグ「要約」）が後から保存されても、角括弧つきタイトルとは完全一致しないので誤って組まない
  const summary = { id: 's1', type: 'deepresearch', title: '同題', tags: 'ディープリサーチ,要約', metadata: { savedAt: now }, created_at: now, group_name: 'ディープリサーチ' };
  expect(groupLibraryItems([...pair, summary])).toHaveLength(3);

  // metadata（§5-5/§6-3）: どのモデルか＋使用量
  const meta = compareSaveMetadata('opus', { elapsedMs: 65000, chars: 4120, inputTokens: 12, outputTokens: 34 });
  expect(meta.compare).toBe(true);
  expect(meta.model).toBe(CLAUDE_OPUS_MODEL);
  expect(meta.modelLabel).toBe('Claude Opus 5');
  expect(meta.elapsedMs).toBe(65000);
  expect(meta.chars).toBe(4120);
  expect(meta.inputTokens).toBe(12);
  expect(meta.outputTokens).toBe(34);
  expect(compareSaveMetadata('gemini')).toEqual({ compare: true, model: GEMINI_TEXT_MODEL, modelLabel: 'Gemini 3.7 Flash' });

  // 使用量の表記（§6-3）
  expect(formatElapsed(0)).toBe('0秒');
  expect(formatElapsed(5400)).toBe('5秒');
  expect(formatElapsed(65000)).toBe('1分5秒');
  expect(formatElapsed(180_000)).toBe('3分0秒');
  expect(compareUsageLabel(undefined)).toBe('');
  expect(compareUsageLabel({ elapsedMs: 65000, chars: 4120 })).toBe('所要 1分5秒 ／ 4,120字');
  expect(compareUsageLabel({ elapsedMs: 65000, chars: 4120, inputTokens: 1200, outputTokens: 34 })).toBe('所要 1分5秒 ／ 4,120字 ／ 入力 1,200 tok ／ 出力 34 tok');

  // 実行状態: 片方が終わっても他方が実行中なら未完（R-39: 巻き添えにしない・待ち合わせは allSettled）
  const runs = initialCompareRuns();
  expect(allCompareSettled(runs)).toBe(false);
  runs.gemini = { status: 'done', text: 'ok' };
  expect(allCompareSettled(runs)).toBe(false);
  runs.opus = { status: 'error', text: '', error: '上限' };
  expect(allCompareSettled(runs)).toBe(true);

  // R-99: 比較経路（fallback=false）では上限・混雑でも Gemini へ切り替えない。既定（省略/true）は 235/242 どおり
  const limit = { error: { type: 'billing_error', message: 'You have reached your specified API usage limits.' } };
  expect(anthropicFailureAction(400, limit, true)).toBe('gemini');
  expect(anthropicFailureAction(400, limit)).toBe('gemini');
  expect(anthropicFailureAction(400, limit, false)).toBe('passthrough');
  expect(anthropicFailureAction(429, { error: { type: 'rate_limit_error', message: 'rate' } }, false)).toBe('passthrough');
  expect(anthropicFailureAction(529, { error: { type: 'overloaded_error', message: 'busy' } })).toBe('gemini');
  expect(anthropicFailureAction(529, { error: { type: 'overloaded_error', message: 'busy' } }, false)).toBe('passthrough');
  // 認証・リクエスト不正は元から切り替えない（R-33）——fallback の値に関係なく passthrough
  expect(anthropicFailureAction(401, { error: { type: 'authentication_error', message: 'bad key' } }, true)).toBe('passthrough');
  expect(anthropicFailureAction(400, { error: { type: 'invalid_request_error', message: 'bad' } }, true)).toBe('passthrough');

  // R-83: ルートの maxDuration（リテラル）と vercel.json が正本の定数と一致
  const route = readFileSync(join(__dirname, '../../src/app/api/deepresearch/route.ts'), 'utf8');
  expect(route).toContain(`export const maxDuration = ${DEEPRESEARCH_MAX_DURATION_S};`);
  const vercel = JSON.parse(readFileSync(join(__dirname, '../../vercel.json'), 'utf8'));
  expect(vercel.functions['src/app/api/deepresearch/route.ts'].maxDuration).toBe(DEEPRESEARCH_MAX_DURATION_S);
  // R-73: 積算 = 1本の最悪所要（maxDuration）×(1+リトライ回数) が上限内。クライアントの打ち切りはサーバーより後
  expect(COMPARE_RETRIES).toBe(0);
  expect(DEEPRESEARCH_MAX_DURATION_S * (1 + COMPARE_RETRIES)).toBeLessThanOrEqual(DEEPRESEARCH_MAX_DURATION_S);
  expect(COMPARE_CLIENT_TIMEOUT_MS).toBeGreaterThan(DEEPRESEARCH_MAX_DURATION_S * 1000);
  // 比較経路の Claude 呼び出しは fallback:false を渡し、通常経路（CLAUDE_TEXT_MODEL）の呼び出しは options なし＝235維持（§3-3）
  expect(route).toMatch(/fetchAnthropic\(\s*\{[\s\S]*?model: modelId,[\s\S]*?\},\s*\{ fallback: false \},?\s*\)/);
  expect(route).toMatch(/fetchAnthropic\(\{\s*model: CLAUDE_TEXT_MODEL,[\s\S]*?messages: \[\{ role: 'user', content: userPrompt \}\],\s*\}\);/);
});

// ───────────────────────────────────────────────────────────────────────────
// 208: 追従🗒カテゴリメモの純ロジック（context_ref の正規化・一覧クエリ・並び替え・追従枠の既定off）
// ───────────────────────────────────────────────────────────────────────────
test('U60: カテゴリメモ（208）— context_ref 正規化・トースト文言・一覧クエリはページング必須・保存値の解決・▲▼の並び替えと差分PATCH・追従枠 drmemo は既定off（R-48）', () => {
  // context_ref: 空白畳み・上限・空は null
  expect(normalizeContextRef('  肌老化の  原因\n最新 ')).toBe('肌老化の 原因 最新');
  expect(normalizeContextRef('')).toBeNull();
  expect(normalizeContextRef('   ')).toBeNull();
  expect(normalizeContextRef(123)).toBeNull();
  expect(normalizeContextRef(undefined)).toBeNull();
  expect(normalizeContextRef('あ'.repeat(DR_MEMO_CONTEXT_MAX + 50))).toHaveLength(DR_MEMO_CONTEXT_MAX);
  // トースト: カテゴリ名を必ず出す（未分類も）
  expect(drMemoToastMessage('研究アイデア')).toBe('🗒 「研究アイデア」に保存しました');
  expect(drMemoToastMessage(null)).toBe('🗒 「未分類」に保存しました');
  expect(drMemoToastMessage('  ')).toBe('🗒 「未分類」に保存しました');
  // 選択値 → category_id
  expect(categoryIdOf(DR_MEMO_UNCATEGORIZED)).toBeNull();
  expect(categoryIdOf('abc')).toBe('abc');
  // 一覧クエリ: limit が必ず付く（全件走査しない）。未分類は uncategorized=1
  const q1 = new URLSearchParams(memoListQuery(DR_MEMO_UNCATEGORIZED));
  expect(q1.get('limit')).toBe(String(DR_MEMO_PAGE_SIZE));
  expect(q1.get('uncategorized')).toBe('1');
  expect(q1.get('category_id')).toBeNull();
  expect(q1.get('offset')).toBeNull();
  const q2 = new URLSearchParams(memoListQuery('cat-1', 60));
  expect(q2.get('category_id')).toBe('cat-1');
  expect(q2.get('uncategorized')).toBeNull();
  expect(q2.get('offset')).toBe('60');
  // 保存値の解決: 存在するIDだけ採用。消えたカテゴリ・不正値は未分類
  expect(resolveCategoryChoice('b', ['a', 'b'])).toBe('b');
  expect(resolveCategoryChoice('zzz', ['a', 'b'])).toBe(DR_MEMO_UNCATEGORIZED);
  expect(resolveCategoryChoice(null, ['a'])).toBe(DR_MEMO_UNCATEGORIZED);
  // 並び替え: 隣と入れ替え・端では不変・入力を壊さない
  const list = [{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 }, { id: 'c', sort_order: 2 }];
  expect(moveItem(list, 1, -1).map((x) => x.id)).toEqual(['b', 'a', 'c']);
  expect(moveItem(list, 2, 1).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  expect(moveItem(list, 0, -1).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  expect(list.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  // 差分PATCH: 位置が変わった項目だけ
  expect(sortOrderPatches(moveItem(list, 1, -1))).toEqual([{ id: 'b', sort_order: 0 }, { id: 'a', sort_order: 1 }]);
  expect(sortOrderPatches(list)).toEqual([]);
  // 追従枠: drmemo が登録され、既定 off（R-48）。🎛表示設定の一覧（FLOATING_BUTTONS）にも載る（導線）
  expect(FLOATING_ORDER).toContain('drmemo');
  expect(FLOATING_DEFAULT.drmemo).toBe(false);
  expect(Object.values(FLOATING_DEFAULT).every((v) => v === false)).toBe(true);
  expect(FLOATING_BUTTONS.find((b) => b.key === 'drmemo')?.label).toBe('カテゴリメモ');
  // 既存の📝メモ小窓は残っている（置き換えではない）
  expect(FLOATING_BUTTONS.find((b) => b.key === 'memo')?.label).toBe('メモ小窓');
});

// ───────────────────────────────────────────────────────────────────────────
// 291: リサーチ保存の一覧の見え方（列数・密度・文字数の段階）と選択比較の判断
// ───────────────────────────────────────────────────────────────────────────
test('U61: リサーチ保存の見え方と選択比較（291）— 文字数の段階は閾値1箇所で決定的・単調・数値併記／列クラスは完全リテラルで既定は従来／タッチは1列／密度の既定は詳細／比較は2〜4件で5件目は無効化（理由つき）／列は選んだ順に種別ラベル付き', () => {
  // §3-3 閾値は昇順で最後は上限なし（1箇所）
  for (let i = 1; i < CHAR_COUNT_TIERS.length; i++) expect(CHAR_COUNT_TIERS[i].max).toBeGreaterThan(CHAR_COUNT_TIERS[i - 1].max);
  expect(CHAR_COUNT_TIERS[CHAR_COUNT_TIERS.length - 1].max).toBe(Number.POSITIVE_INFINITY);
  // 境界値: max 未満がその段階
  expect(charCountTier(0)).toBe(0);
  expect(charCountTier(999)).toBe(0);
  expect(charCountTier(1000)).toBe(1);
  expect(charCountTier(2999)).toBe(1);
  expect(charCountTier(3000)).toBe(2);
  expect(charCountTier(5999)).toBe(2);
  expect(charCountTier(6000)).toBe(3);
  expect(charCountTier(1_000_000)).toBe(3);
  // 不正値は最小段階（落ちない）
  expect(charCountTier(Number.NaN)).toBe(0);
  expect(charCountTier(-5)).toBe(0);
  // 決定的（R-74）＋単調非減少
  let prev = 0;
  for (let n = 0; n <= 10_000; n += 7) {
    const t = charCountTier(n);
    expect(charCountTier(n)).toBe(t);
    expect(t).toBeGreaterThanOrEqual(prev);
    prev = t;
  }
  // 段階ごとに濃淡が違う（同じ色を2段階に割り当てない）
  const bgs = ([0, 1, 2, 3] as const).map((t) => CHAR_COUNT_TIER_STYLE[t].bg);
  expect(new Set(bgs).size).toBe(4);
  // 色だけに意味を持たせない: ツールチップにも数値を併記
  expect(charCountTitle(1234)).toBe('1,234文字（標準）');
  expect(charCountTitle(500)).toBe('500文字（短め）');
  expect(charCountTitle(9000)).toBe('9,000文字（長文）');

  // §3-1 列クラス: 完全リテラル（文字列結合・テンプレート無し）。既定 auto は従来のクラスそのもの
  expect(LIST_COLUMN_CHOICE_DEFAULT).toBe('auto');
  expect(LIST_COLUMN_CHOICES).toEqual(['auto', 1, 2, 3, 4]);
  expect(listGridClass('auto')).toBe('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4');
  expect(listGridClass(1)).toBe('grid grid-cols-1');
  expect(listGridClass(2)).toBe('grid grid-cols-2');
  expect(listGridClass(3)).toBe('grid grid-cols-3');
  expect(listGridClass(4)).toBe('grid grid-cols-4');
  const src = readFileSync(join(__dirname, '../../src/lib/library-view.ts'), 'utf8');
  expect(src.includes('grid-cols-${'), 'クラス名を動的に組み立てない（Tailwind完全リテラル）').toBe(false);
  // タッチ端末は1列固定。カーソルのある端末は指定どおり
  expect(resolveListColumns(false, 4)).toBe(1);
  expect(resolveListColumns(false, 'auto')).toBe(1);
  expect(resolveListColumns(true, 'auto')).toBe('auto');
  expect(resolveListColumns(true, 3)).toBe(3);
  // window の無い環境では既定（落ちない）
  expect(loadListColumnChoice()).toBe('auto');
  expect(loadListDensity()).toBe('detail');
  expect(LIST_DENSITY_DEFAULT).toBe('detail');

  // §2-2 比較は2〜4件。5件目を選んでいる間は無効化して理由を出す（先頭4件に黙って切らない）
  expect(LIBRARY_COMPARE_MIN).toBe(2);
  expect(LIBRARY_COMPARE_MAX).toBe(4);
  expect(libraryCompareState(0).enabled).toBe(false);
  expect(libraryCompareState(1).enabled).toBe(false);
  expect(libraryCompareState(1).reason).toContain('2件以上');
  for (const n of [2, 3, 4]) {
    const st = libraryCompareState(n);
    expect(st.enabled).toBe(true);
    expect(st.reason).toBeNull();
    expect(st.label).toContain(`${n}件`);
  }
  const five = libraryCompareState(5);
  expect(five.enabled).toBe(false);
  expect(five.reason).toContain('4件まで');
  expect(five.reason).toContain('5件');

  // §2-4 列は選んだ順・種別は 283/286 のカードまとめから（無ければ行から判定）・無い id は落とす・上限4
  type Row = { id: string; type: string; title: string; tags: string; metadata: unknown; created_at: string; group_name: string };
  const now = '2026-09-03T00:00:00.000Z';
  const rows: Row[] = [
    { id: 'r1', type: 'deepresearch', title: 'T', tags: 'ディープリサーチ,バッチ,batch:1-0', metadata: { kind: 'research' }, created_at: now, group_name: 'ディープリサーチ' },
    { id: 's1', type: 'deepresearch', title: 'T', tags: 'ディープリサーチ,要約,バッチ,batch:1-0s', metadata: { kind: 'summary' }, created_at: now, group_name: 'ディープリサーチ' },
    { id: 'x1', type: 'deepresearch', title: 'X', tags: 'ディープリサーチ,活用アドバイス', metadata: {}, created_at: now, group_name: 'ディープリサーチ' },
    { id: 'y1', type: 'research', title: 'Y', tags: '', metadata: {}, created_at: now, group_name: 'Web情報収集' },
    { id: 'z1', type: 'research', title: 'Z', tags: '', metadata: {}, created_at: now, group_name: '' },
  ];
  const cards = groupLibraryItems(rows);
  const entries = libraryCompareEntries(['s1', 'missing', 'x1', 'r1'], rows, cards);
  expect(entries.map((e) => e.item.id)).toEqual(['s1', 'x1', 'r1']);
  expect(entries.map((e) => e.kind)).toEqual(['summary', 'advice', 'research']);
  expect(entries.map((e) => e.label)).toEqual(['要約', '活用アドバイス', '本文']);
  expect(libraryCompareEntries(['r1', 's1', 'x1', 'y1', 'z1'], rows, cards).map((e) => e.item.id)).toEqual(['r1', 's1', 'x1', 'y1']);
  expect(libraryCompareEntries([], rows, cards)).toEqual([]);
});
