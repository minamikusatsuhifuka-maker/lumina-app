import { test, expect } from '@playwright/test';
// 319: 追加リサーチ（純関数・静的 import R-112）
import {
  FOLLOWUP_CONTEXT_LIMIT,
  FOLLOWUP_MAX_SOURCES,
  FOLLOWUP_PROMPT_CHIPS,
  FOLLOWUP_REJECT_EMPTY_PROMPT,
  FOLLOWUP_REJECT_MISSING,
  FOLLOWUP_WRITING_RULES,
  buildFollowUpOrder,
  followUpCountsOf,
  followUpMetadata,
  followUpOriginLabel,
  followUpStartState,
  followUpTitle,
  parseFollowUp,
  parseFollowUpHandoff,
  parseFollowUpRefs,
} from '../../src/lib/followup-research';
// 320: 生成結果から直接図解・画像（相関図・handoff・自動STEP1・記憶）
import * as vis320 from '../../src/lib/visuals';
import * as tpl320 from '../../src/lib/visual-templates';
import { renderMarkdown } from '../../src/lib/markdown-renderer';
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
import * as modelCompare from '../../src/lib/model-compare';
import * as modelPricing from '../../src/lib/model-pricing';
import * as openaiResearch from '../../src/lib/openai-research';
import { findUngroundedTerms, findBannedExpressions, splitByPriority } from '../../src/lib/content-verify';
import { buildDiffRows, describeDiffStats } from '../../src/lib/text-diff';
import { sanitizeForDb } from '../../src/lib/sanitize';
import { guardImagePrompt, IMAGE_GUARD_SUFFIX } from '../../src/lib/image-guards';
import { cleanChapterBody } from '../../src/lib/kindle-text';
// 307: 動的 import() では '@/lib/…' のパス解決が効かない（transitive な alias import が Cannot find module）ため静的に読む
import * as mandalaKindle from '../../src/lib/mandala-kindle';
import * as mandalaPresets from '../../src/lib/mandala-presets';
import * as mandalaNote from '../../src/lib/mandala-note';
import * as noteFormat from '../../src/lib/note-format';
import * as mandalaResearch from '../../src/lib/mandala-research';
// 311是正: mandala-shared は mandala-presets（@/ alias）を読むようになった＝動的 import() では解決できない（R-112）
import * as mandalaShared from '../../src/lib/mandala-shared';
import * as stickyBar from '../../src/lib/sticky-action-bar';
import * as visuals from '../../src/lib/visuals';
import * as mandalaGenerate from '../../src/lib/mandala-generate';
import * as mergeReport from '../../src/lib/merge-report';
import * as presentationPack from '../../src/lib/presentation-pack';
import { groupLibraryItems as groupLibraryItems317, isPairableItem } from '../../src/lib/library-groups';
import * as visualTemplates from '../../src/lib/visual-templates';
import { estimateImageCost, imageCostActual, IMAGE_PRICING_CHECKED_ON, IMAGE_MODEL_IDS } from '../../src/lib/model-pricing';
import { IMAGE_GUARD_SUFFIX_WITH_TEXT, guardImagePromptWithText } from '../../src/lib/image-guards';
import * as mandalaX from '../../src/lib/mandala-x';
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
import { promoteHeadingsForNote, markdownToWordHtml, richCopyParts, stripRichCopyGaps, RICH_COPY_GAP_HTML, RICH_COPY_P_OPEN } from '../../src/lib/rich-copy';
import { NO_PREAMBLE_PROMPT_RULE } from '../../src/lib/markdown-renderer';
// 295: 🧠AI参照素材への横展開（保存先キーだけ画面別・判断は共有）
import { CL_LIST_COLUMN_CHOICE_DEFAULT, CL_LIST_COLUMN_KEY, CL_LIST_DENSITY_KEY } from '../../src/lib/library-view';
import { CL_SEARCH_SCOPE_KEY, LIBRARY_SEARCH_SCOPE_KEY, TA_SEARCH_SCOPE_KEY } from '../../src/lib/library-filters';
import { CONTEXT_ORIGIN_LABEL, contextOriginKind, originLabel } from '../../src/lib/context-origin';
// 297: 用途カテゴリ
import { normalizePurposeName } from '../../src/lib/purpose-categories';
import { MAX_PURPOSE_NAME_LENGTH, PURPOSE_BULK_LIMIT, purposeBulkResultMessage, purposeBulkState, purposeDeleteConfirmMessage } from '../../src/lib/purpose-categories-shared';
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
  LIST_COLUMN_KEY,
  LIST_DENSITY_DEFAULT,
  LIST_DENSITY_KEY,
  TA_LIST_COLUMN_CHOICE_DEFAULT,
  TA_LIST_COLUMN_KEY,
  TA_LIST_DENSITY_KEY,
  charCountTier,
  charCountTitle,
  libraryCompareEntries,
  libraryCompareState,
  listGridClass,
  loadListColumnChoice,
  loadListDensity,
  resolveListColumns,
} from '../../src/lib/library-view';
// 292: Opus出力のHTMLタグ露出はプロンプト側で是正
import { NO_HTML_PROMPT_RULE } from '../../src/lib/markdown-renderer';
// 293: 検索とフィルタの判断（📚/🗂共有）
import {
  KIND_FILTERS,
  SEARCH_PLACEHOLDER,
  SEARCH_SCOPE_DEFAULT,
  UNCATEGORIZED,
  UNCATEGORIZED_LABEL,
  cardHasMatch,
  categoryCounts,
  kindCounts,
  loadSearchScope,
  matchesCategory,
  matchesSearch,
  normalizeSearchText,
  subCategoryOf,
  zeroResultMessage,
} from '../../src/lib/library-filters';

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

  // 保存された並びを採用（カスタマイズが反映される）。
  // 303 §5（R-77）: 保存に無い定義上のホーム項目は既定位置へ**合流**する（末尾に回さない・非表示にしない）。
  // 保存 [DR, dashboard, TA] に対し、定義順 [dashboard, orchestrator, automation, saved, memo, guide] の未収載分は
  // 「定義順で直前にある保存済み項目の直後」へ入る＝dashboard の直後に orchestrator…guide が定義順で並ぶ
  const order = ['/dashboard/deepresearch', '/dashboard', '/dashboard/text-analysis'];
  expect(resolveHomeHrefs(JSON.stringify(order))).toEqual([
    '/dashboard/deepresearch',
    '/dashboard',
    '/dashboard/orchestrator',
    '/dashboard/automation-strategy',
    '/dashboard/saved',
    '/dashboard/memo',
    '/dashboard/guide',
    '/dashboard/text-analysis',
  ]);
  // 明示的に外した項目（墓標）は合流しない。保存側の形（JSON 配列）をそのまま渡す（R-79）
  expect(resolveHomeHrefs(JSON.stringify(order), JSON.stringify(['/dashboard/guide', '/dashboard/memo']))).toEqual([
    '/dashboard/deepresearch',
    '/dashboard',
    '/dashboard/orchestrator',
    '/dashboard/automation-strategy',
    '/dashboard/saved',
    '/dashboard/text-analysis',
  ]);
  // 保存に全部入っていれば並びはそのまま（合流するものが無い）
  const full = ['/dashboard/guide', '/dashboard/memo', '/dashboard/saved', '/dashboard/automation-strategy', '/dashboard/orchestrator', '/dashboard'];
  expect(resolveHomeHrefs(JSON.stringify(full))).toEqual(full);

  // 実在しない href・文字列以外の要素は落とす（定義から消えた項目が保存に残っていても壊れない）。
  // 有効分が残ればそれ＋合流、全滅なら既定を返す
  expect(resolveHomeHrefs(JSON.stringify(['/nope', 42, '/dashboard']))).toEqual(DEFAULT_HOME_HREFS);
  expect(resolveHomeHrefs(JSON.stringify(['/nope']))).toEqual(DEFAULT_HOME_HREFS);
  // 壊れた墓標は無視（合流は通常どおり）
  expect(resolveHomeHrefs(JSON.stringify(full), 'broken')).toEqual(full);
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
  expect(parseCompareSide('gpt'), '314: 3列目').toBe('gpt');
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
  expect(route).toMatch(/fetchAnthropic\(\s*\{[\s\S]*?model: modelId,[\s\S]*?\},\s*\{ fallback: false, signal: abort\.signal \},?\s*\)/);
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

// ───────────────────────────────────────────────────────────────────────────
// 292: テキスト分析の保存一覧への横展開（判断の共有）と Opus出力のHTMLタグ露出の是正（プロンプト側）
// ───────────────────────────────────────────────────────────────────────────
test('U62: 横展開（292）— 判断は library-view を共有し別の閾値・別の判定を持たない・既定は1列/詳細（現状維持）・保存先キーは画面別・283/286グルーピングを持ち込まない／NO_HTML_PROMPT_RULE が DR（system＋user）とOpusのハンドブック経路に入り、表示側でタグを剥がしていない', () => {
  // §2-3/§2-5: 既定と保存先
  expect(TA_LIST_COLUMN_CHOICE_DEFAULT).toBe(1);
  expect(TA_LIST_COLUMN_KEY).not.toBe(LIST_COLUMN_KEY);
  expect(TA_LIST_DENSITY_KEY).not.toBe(LIST_DENSITY_KEY);
  // window の無い環境では既定（1列／詳細）
  expect(loadListColumnChoice(TA_LIST_COLUMN_KEY, TA_LIST_COLUMN_CHOICE_DEFAULT)).toBe(1);
  expect(loadListDensity(TA_LIST_DENSITY_KEY)).toBe('detail');
  // 📚側の既定は変わらない（引数省略＝従来）
  expect(loadListColumnChoice()).toBe('auto');
  expect(loadListDensity()).toBe('detail');
  // SavedAnalysisList は library-view の判断と CharCountBadge を使い、自前の閾値・列クラス・グルーピングを持たない
  const sal = readFileSync(join(__dirname, '../../src/components/text-analysis/SavedAnalysisList.tsx'), 'utf8');
  expect(sal).toContain("from '@/lib/library-view'");
  expect(sal).toContain("import { CharCountBadge } from '@/components/LibraryItemRow'");
  expect(sal).toContain('LibraryCompareView');
  expect(sal).not.toMatch(/CHAR_COUNT_TIERS\s*=|function charCountTier|grid-cols-\$\{/);
  expect(sal, '283/286 のグルーピングをテキスト分析へ持ち込まない（§2-5）').not.toContain('groupLibraryItems');
  expect(sal, '5件目は無効化＋理由（R-101）＝同じ判断関数').toContain('libraryCompareState(selectedIds.size)');
  // 比較の列の種別は文字列（分析タイプをそのまま通せる）
  const entry: { item: { id: string }; kind: string; label: string } = { item: { id: '1' }, kind: 'transcription', label: '全文書き起こし' };
  expect(entry.kind).toBe('transcription');

  // §3-3: 是正はプロンプト側。共通の1行が DR の system と user の両方、Opus を使うハンドブック経路に入っている
  expect(NO_HTML_PROMPT_RULE).toContain('<span>');
  expect(NO_HTML_PROMPT_RULE).toContain('**太字**');
  const dr = readFileSync(join(__dirname, '../../src/app/api/deepresearch/route.ts'), 'utf8');
  expect((dr.match(/\$\{NO_HTML_PROMPT_RULE\}/g) ?? []).length, 'DR は system と user の両方').toBeGreaterThanOrEqual(2);
  for (const f of ['src/app/api/clinic/handbook-improve/auto-revise/route.ts', 'src/app/api/clinic/handbook-improve/compare-models/route.ts']) {
    expect(readFileSync(join(__dirname, '../../', f), 'utf8'), `${f} に NO_HTML_PROMPT_RULE`).toContain('${NO_HTML_PROMPT_RULE}');
  }
  // 表示側（MarkdownBody）にタグ除去の変換を足していない（R-71 の趣旨・§3-3）
  const mb = readFileSync(join(__dirname, '../../src/components/MarkdownBody.tsx'), 'utf8');
  expect(mb).not.toMatch(/\.replace\(|<\\?\/?span/);
});

// ───────────────────────────────────────────────────────────────────────────
// 293: 検索範囲・種別/AIカテゴリの件数・適用中の条件（純関数・決定的）
// ───────────────────────────────────────────────────────────────────────────
test('U63: 検索とフィルタ（293）— 既定は「すべて」／正規化は小文字＋NFKC／タイトルのみは本文・タグを見ない／件数は件＝成果物で決定的（入力順に依らない）／未分類は必ず末尾／0件文言／説明文は実装と一致／既存データの一括AI分類を自動で呼ばない', () => {
  // §3-1 既定＝現状維持（すべて）。window の無い環境でも既定
  expect(SEARCH_SCOPE_DEFAULT).toBe('all');
  expect(loadSearchScope('lumina_library_search_scope')).toBe('all');
  // §2-2 正規化: 全角英数・半角カナ・大文字
  expect(normalizeSearchText('ＡＢＣ Ｄ')).toBe('abc d');
  expect(normalizeSearchText('ｶﾀｶﾅ')).toBe('カタカナ');
  expect(normalizeSearchText(null)).toBe('');
  // 一致判定: タイトルのみは本文・タグを見ない。すべて＝タイトル・本文・タグ（従来どおり）
  const row = { title: '保湿剤の基礎', content: 'ワセリンは閉塞性', tags: 'ディープリサーチ,要約' };
  expect(matchesSearch(row, '', 'title')).toBe(true);
  expect(matchesSearch(row, '保湿', 'title')).toBe(true);
  expect(matchesSearch(row, 'ワセリン', 'title')).toBe(false);
  expect(matchesSearch(row, 'ワセリン', 'all')).toBe(true);
  expect(matchesSearch(row, '要約', 'title')).toBe(false);
  expect(matchesSearch(row, '要約', 'all')).toBe(true);
  expect(matchesSearch({ ...row, tags: ['A', 'B'] }, 'b', 'all')).toBe(true);
  expect(matchesSearch(row, 'ﾜｾﾘﾝ', 'all'), '半角カナでも一致').toBe(true);
  // §4-3 種別の件数（件＝行）。同じ入力なら同じ数・入力順を変えても同じ
  type Row = { id: string; type: string; title: string; tags: string; metadata: unknown; created_at: string; group_name: string };
  const now = '2026-09-03T00:00:00.000Z';
  const mk = (id: string, tags: string, meta: unknown = {}): Row => ({ id, type: 'deepresearch', title: 'T', tags, metadata: meta, created_at: now, group_name: 'ディープリサーチ' });
  const rows: Row[] = [
    mk('r1', 'ディープリサーチ,バッチ,batch:1-0', { kind: 'research', subCategory: '保湿' }),
    mk('s1', 'ディープリサーチ,要約,バッチ,batch:1-0s', { kind: 'summary' }),
    mk('r2', 'ディープリサーチ', { subCategory: '保湿' }),
    mk('d1', 'ディープリサーチ,詳細', JSON.stringify({ subCategory: '日焼け' })),
    mk('a1', 'ディープリサーチ,活用アドバイス', {}),
  ];
  const kc = kindCounts(rows, artifactKindOf);
  expect(kc).toEqual({ research: 2, summary: 1, detail: 1, advice: 1 });
  expect(kindCounts([...rows].reverse(), artifactKindOf)).toEqual(kc);
  expect(KIND_FILTERS).toEqual(['all', 'research', 'summary', 'detail', 'advice']);
  // §5 AIカテゴリ: metadata（オブジェクト／TEXT）から subCategory。件数は多い順→名前順、未分類は必ず末尾（0件でも）
  expect(rows.map((r) => subCategoryOf(r.metadata))).toEqual(['保湿', '', '保湿', '日焼け', '']);
  const cc = categoryCounts(rows.map((r) => subCategoryOf(r.metadata)));
  expect(cc.items).toEqual([
    { value: '保湿', label: '保湿', count: 2 },
    { value: '日焼け', label: '日焼け', count: 1 },
    { value: UNCATEGORIZED, label: UNCATEGORIZED_LABEL, count: 2 },
  ]);
  expect(cc.overflow).toBe(0);
  expect(categoryCounts([...rows].reverse().map((r) => subCategoryOf(r.metadata)))).toEqual(cc);
  const capped = categoryCounts(['a', 'b', 'c', 'b'], 1);
  expect(capped.items.map((c) => c.value)).toEqual(['b', UNCATEGORIZED]);
  expect(capped.overflow).toBe(2);
  expect(categoryCounts([]).items).toEqual([{ value: UNCATEGORIZED, label: UNCATEGORIZED_LABEL, count: 0 }]);
  expect(matchesCategory('', null)).toBe(true);
  expect(matchesCategory('', UNCATEGORIZED)).toBe(true);
  expect(matchesCategory('保湿', UNCATEGORIZED)).toBe(false);
  expect(matchesCategory('保湿', '保湿')).toBe(true);
  // §4-1 283 §4-5 に揃える: 1件でも条件に合えばカードを出す
  const cards = groupLibraryItems(rows);
  const batchCard = cards.find((c) => c.key === 'batch:1-0')!;
  expect(cardHasMatch(batchCard, new Set(['s1']))).toBe(true);
  expect(cardHasMatch(batchCard, new Set(['r2']))).toBe(false);
  // §6-2 0件文言: 条件があるときは「絞りすぎ」と解除の案内
  expect(zeroResultMessage(0)).toBe('条件に一致するものがありません');
  expect(zeroResultMessage(3)).toContain('3件の条件');
  expect(zeroResultMessage(3)).toContain('すべて解除');
  // §3-2 説明文は実装と一致: 📚の all はタイトル・本文・タグ、🗂の all はタイトル・ファイル名・本文（route の ILIKE 対象）
  expect(SEARCH_PLACEHOLDER.library.all).toContain('タイトル・本文・タグ');
  expect(SEARCH_PLACEHOLDER.library.all).not.toMatch(/カテゴリ|フォルダ/);
  const taRoute = readFileSync(join(__dirname, '../../src/app/api/text-analysis/saves/route.ts'), 'utf8');
  expect(taRoute).toMatch(/auto_title ILIKE[\s\S]*file_name ILIKE[\s\S]*content ILIKE/);
  expect(SEARCH_PLACEHOLDER.ta.all).toContain('タイトル・ファイル名・本文');
  expect(taRoute, 'qScope=title で本文を外す').toContain("searchParams.get('qScope') !== 'title'");
  expect(taRoute, '種別の絞り込み').toContain("searchParams.get('analysisType')");
  expect(taRoute, '種別の件数集計').toMatch(/SELECT analysis_type, MIN\(analysis_label\) AS label, COUNT\(\*\)::int AS count/);
  const lib = readFileSync(join(__dirname, '../../src/app/dashboard/library/page.tsx'), 'utf8');
  expect(lib).toContain('SEARCH_PLACEHOLDER.library[searchRange]');
  expect(lib).toContain('matchesSearch(i, search, searchRange)');
  // §5-4 既存データの一括AI分類を自動で呼ばない: 判断ファイル・条件チップは fetch を持たず、📚の一括分類は従来の2ボタン（confirm つき）だけ
  const filters = readFileSync(join(__dirname, '../../src/lib/library-filters.ts'), 'utf8');
  expect(filters).not.toContain('fetch(');
  expect(readFileSync(join(__dirname, '../../src/components/ActiveConditionChips.tsx'), 'utf8')).not.toContain('fetch(');
  expect((lib.match(/auto-categorize/g) ?? []).length, '📚の auto-categorize 呼び出しは従来の2箇所（一括・未分類再分類）のまま').toBe(2);
  const sal = readFileSync(join(__dirname, '../../src/components/text-analysis/SavedAnalysisList.tsx'), 'utf8');
  expect((sal.match(/fetch\('\/api\/text-analysis\/auto-categorize'/g) ?? []).length, '🗂の auto-categorize 呼び出しは従来の1箇所（🤖ボタン・confirm つき）のまま').toBe(1);
});

// ───────────────────────────────────────────────────────────────────────────
// 294: Opus前置きの禁止（プロンプト側）／リッチコピーの text/html に空行を明示（R-104）
// ───────────────────────────────────────────────────────────────────────────
test('U64: 294 — 前置き禁止は NO_HTML_PROMPT_RULE に含まれ全経路に効く／表示側は無変更／text/html は空行を明示の空段落で持ち <p> の暗黙余白を切る／text/plain は不変／note用は空段落を外し見出し繰り上げは従来どおり', () => {
  // §2-2: 同じ定数に追加＝埋め込み先（DR system＋user・auto-revise・compare-models）は無変更で効く
  expect(NO_HTML_PROMPT_RULE).toContain(NO_PREAMBLE_PROMPT_RULE);
  expect(NO_PREAMBLE_PROMPT_RULE).toMatch(/前置き/);
  expect(NO_PREAMBLE_PROMPT_RULE, '締めの言葉も同じ扱い').toMatch(/以上です/);
  expect(NO_PREAMBLE_PROMPT_RULE, '英語混入を防ぐため日本語出力を明示').toMatch(/日本語で書く/);
  const dr = readFileSync(join(__dirname, '../../src/app/api/deepresearch/route.ts'), 'utf8');
  expect((dr.match(/\$\{NO_HTML_PROMPT_RULE\}/g) ?? []).length, 'DR は system と user の両方（292のまま）').toBeGreaterThanOrEqual(2);
  for (const f of ['src/app/api/clinic/handbook-improve/auto-revise/route.ts', 'src/app/api/clinic/handbook-improve/compare-models/route.ts']) {
    expect(readFileSync(join(__dirname, '../../', f), 'utf8'), `${f} に NO_HTML_PROMPT_RULE`).toContain('${NO_HTML_PROMPT_RULE}');
  }
  // §2-4 / R-102: 表示側で先頭の英文を削らない（MarkdownBody・renderMarkdown に前置き除去の変換が無い）
  const mb = readFileSync(join(__dirname, '../../src/components/MarkdownBody.tsx'), 'utf8');
  expect(mb).not.toMatch(/\.replace\(|I'll|前置き/);
  const renderer = readFileSync(join(__dirname, '../../src/lib/markdown-renderer.ts'), 'utf8');
  expect(renderer, 'renderMarkdown 側に先頭英文の除去を足していない').not.toMatch(/\/\^\[A-Za-z\]|^\s*\/\/.*前置き.*除去/m);

  // §3: text/html の行構造 = text/plain の行構造
  const md = '## はじめに\n一文目。\n二文目。\n\n## 表\n| a | b |\n|---|---|\n| 1 | 2 |\n\n出典: 厚労省 https://www.mhlw.go.jp/\n\n## まとめ\n以上。';
  const { html, plain } = richCopyParts(md);
  // §3-4 / §4: text/plain は一切変更しない（LaTeX 無しなら原文そのまま）
  expect(plain).toBe(md);
  // 空行（MDの空行3つ）が明示の空段落として同数残る／md-gap は残らない
  expect((html.match(new RegExp(RICH_COPY_GAP_HTML.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length).toBe(3);
  expect(html).not.toContain('md-gap');
  // <p> は全て余白0（暗黙の余白に頼らない＝二重余白を作らない）。素の <p> は残らない
  expect(html).not.toMatch(/<p>/);
  expect(html).toContain(`${RICH_COPY_P_OPEN}一文目。</p>\n${RICH_COPY_P_OPEN}二文目。</p>`);
  expect(html).toMatch(/<p style="margin:0;font-size:10pt;color:#666666;">出典:/);
  // 232の体裁は不変: 見出し（##→h3）・表の罫線
  expect(html).toContain('<h3>はじめに</h3>');
  expect(html).toContain('<table style="border-collapse:collapse;">');
  expect(html).toMatch(/<td style="border:1px solid #888;/);
  // 単独行画像の <img> 復元（232）は <p> の余白付与より前に走る＝壊れない
  expect(markdownToWordHtml('![図](https://example.com/a.png)')).toContain('<img src="https://example.com/a.png" alt="図"');
  expect(markdownToWordHtml('![図](https://example.com/a.png)')).not.toContain('![図]');

  // note用（266）: 空段落だけ外れ、見出し繰り上げは従来どおり（h3→h2）
  const note = promoteHeadingsForNote(stripRichCopyGaps(html));
  expect(note).not.toContain(RICH_COPY_GAP_HTML);
  expect((note.match(/<h2\b/g) ?? []).length).toBe(3);
  expect(note).not.toContain('<h1');
  // stripRichCopyGaps は空段落以外を触らない
  expect(stripRichCopyGaps('<h3>x</h3>\n<p style="margin:0;">y</p>')).toBe('<h3>x</h3>\n<p style="margin:0;">y</p>');
  // copyRichMarkdownForNote が実際にこの2段を通している（ソース固定）
  const rc = readFileSync(join(__dirname, '../../src/lib/rich-copy.ts'), 'utf8');
  expect(rc).toContain('promoteHeadingsForNote(stripRichCopyGaps(markdownToWordHtml(markdown)))');
  // 共有ヘルパー本体（案A）: copyRichMarkdown は richCopyParts を使い plain は sanitizeLatex(markdown) のまま
  expect(rc).toMatch(/export async function copyRichMarkdown\(markdown: string\)[\s\S]*?const plain = sanitizeLatex\(markdown\);[\s\S]*?richCopyParts\(markdown\)/);
});

// ───────────────────────────────────────────────────────────────────────────
// 295: 🧠AI参照素材への横展開（291・292・293 の判断を共有し、別の閾値・別の判定を作らない）
// ───────────────────────────────────────────────────────────────────────────
test('U65: AI参照素材の横展開（295）— 保存先キーは画面別で既定は1列/詳細/すべて／文字数の段階・列数判定・比較の判断は同じ関数（別実装なし）／生成元の判定は決定的で一覧のバッジと比較の列ヘッダーが同じ語／検索の説明文は実装と一致／ページングは30件のまま／API は qScope=title で本文を外す', () => {
  // §2-1/§2-2/§2-6: 画面別キー（📚🗂と混ざらない）・既定は現状維持（1列・詳細・すべて）
  expect(CL_LIST_COLUMN_CHOICE_DEFAULT).toBe(1);
  expect(new Set([LIST_COLUMN_KEY, TA_LIST_COLUMN_KEY, CL_LIST_COLUMN_KEY]).size).toBe(3);
  expect(new Set([LIST_DENSITY_KEY, TA_LIST_DENSITY_KEY, CL_LIST_DENSITY_KEY]).size).toBe(3);
  expect(new Set([LIBRARY_SEARCH_SCOPE_KEY, TA_SEARCH_SCOPE_KEY, CL_SEARCH_SCOPE_KEY]).size).toBe(3);
  expect(loadListColumnChoice(CL_LIST_COLUMN_KEY, CL_LIST_COLUMN_CHOICE_DEFAULT), 'window の無い環境では既定').toBe(1);
  expect(loadListDensity(CL_LIST_DENSITY_KEY)).toBe('detail');
  expect(loadSearchScope(CL_SEARCH_SCOPE_KEY)).toBe('all');
  // 説明文は実際の検索対象（/api/context-saves: topic・context_text。タグは対象外）と一致し、従来文言「トピック名・内容」を保つ
  expect(SEARCH_PLACEHOLDER.cl.all).toContain('トピック名・内容で検索');
  expect(SEARCH_PLACEHOLDER.cl.title).toContain('内容は対象外');
  expect(SEARCH_PLACEHOLDER.cl.all).not.toContain('タグ');

  // §2-4: 生成元の判定は決定的（同じ入力→同じ結果・タグ順に依らない）。一覧のバッジと比較の列ヘッダーが同じ表
  expect(contextOriginKind(null)).toBe('deepresearch');
  expect(contextOriginKind([])).toBe('deepresearch');
  expect(contextOriginKind(['group:x', 'batch:12-0'])).toBe('batch');
  expect(contextOriginKind(['batch:12-0', 'group:x'])).toBe('batch');
  expect(contextOriginKind(['batchless', 'group:batch:1'])).toBe('deepresearch');
  expect(originLabel(['batch:1'])).toEqual(CONTEXT_ORIGIN_LABEL.batch);
  expect(originLabel(['ディープリサーチ'])).toEqual({ icon: '🔭', label: 'ディープリサーチ' });
  expect(CONTEXT_ORIGIN_LABEL.batch.label).toBe('ディープリサーチ（バッチ）');

  // §1-3/§2-3: パネルは共有部品・共有判断だけを使い、自前の閾値・列クラス・比較判定・生成元判定を持たない
  const panel = readFileSync(join(__dirname, '../../src/components/context-library/ContextLibraryPanel.tsx'), 'utf8');
  expect(panel).toContain("from '@/lib/library-view'");
  expect(panel).toContain("from '@/lib/library-filters'");
  expect(panel).toContain("from '@/lib/context-origin'");
  expect(panel).toContain("import { CharCountBadge } from '@/components/LibraryItemRow'");
  expect(panel).toContain("import LibraryCompareView from '@/components/library/LibraryCompareView'");
  expect(panel).toContain("import { ActiveConditionChips } from '@/components/ActiveConditionChips'");
  expect(panel).toContain('libraryCompareState(selectedIds.size)');
  expect(panel).toContain('listGridClass(resolvedListCols)');
  expect(panel).toContain('zeroResultMessage(activeConditions.length)');
  expect(panel).not.toMatch(/CHAR_COUNT_TIERS\s*=|function charCountTier|grid-cols-\$\{|function originLabel/);
  expect(panel, '新しい選択モードを作らない＝既存の selectedIds（☑選んで削除）を流用').not.toMatch(/compareSelectedIds|compareMode/);
  // §3-1: ページングは30件のまま（列数を増やしても変えない）
  expect(panel).toMatch(/const PAGE_SIZE = 30;/);
  expect(panel).toContain("p.set('limit', String(PAGE_SIZE))");
  // §2-7: 新規のAI分類は実装しない（既存の自動カテゴライズ呼び出しは従来の1箇所＝🤖ボタン・confirm つき）
  expect((panel.match(/\/api\/context-library\/auto-categorize|\/api\/context-saves\/auto-categorize/g) ?? []).length).toBeLessThanOrEqual(1);
  // §2-6: API は qScope=title で本文（context_text）を検索対象から外す。既定は従来どおり両方
  const api = readFileSync(join(__dirname, '../../src/app/api/context-saves/route.ts'), 'utf8');
  expect(api).toContain("searchParams.get('qScope') !== 'title'");
  expect((api.match(/context_text ILIKE \$\{qBody\}/g) ?? []).length, '一覧と件数の両方のクエリに効く').toBe(2);
  expect(api).not.toMatch(/context_text ILIKE \$\{qLike\}/);
});

// ───────────────────────────────────────────────────────────────────────────
// 296: 選択モードを既定にする（安全策3点: 件数入りの確認1回・選択の非永続化・全選択なし）
// ───────────────────────────────────────────────────────────────────────────
test('U66: 選択の既定（296）— 3画面ともモード切替の状態を持たず常時チェック／削除の確認は confirmBulkDelete 1本で件数入り（R-56）／選択状態を localStorage・sessionStorage に保存しない／「全選択」の実装が無い／チェックは stopPropagation で展開へ伝えない（R-81）', () => {
  const lib = readFileSync(join(__dirname, '../../src/app/dashboard/library/page.tsx'), 'utf8');
  const sal = readFileSync(join(__dirname, '../../src/components/text-analysis/SavedAnalysisList.tsx'), 'utf8');
  const ctx = readFileSync(join(__dirname, '../../src/components/context-library/ContextLibraryPanel.tsx'), 'utf8');
  const row = readFileSync(join(__dirname, '../../src/components/LibraryItemRow.tsx'), 'utf8');
  // モード切替の状態・ボタンが無い（📚 mergeMode の useState／🧠 deleteMode）
  expect(lib).not.toMatch(/useState\(false\);?\s*\/\/.*選択モード|const \[mergeMode, setMergeMode\]/);
  expect(lib).toContain('mergeMode={true');
  expect(lib, 'ボタンの文字列リテラルが無い（撤去の注記コメントは除く）').not.toMatch(/'✓ 選択モード'|'✕ 選択モード終了'/);
  expect(ctx).not.toMatch(/const \[deleteMode, setDeleteMode\]|data-ctx-select-mode|'☑ 選んで削除'/);
  // 操作バーは1件以上で出す
  expect(lib).toContain('{selectedIds.size > 0 && (');
  expect(ctx).toContain('{!bundleSelectMode && selectedIds.size > 0 && (');
  expect(sal).toContain('{selectedIds.size > 0 && (');
  // 削除の確認は共通1本（件数・種類・戻せない）。他に confirm を重ねない（R-56）
  for (const [src, label] of [[lib, '資料'], [sal, '保存テキスト'], [ctx, 'AI参照素材']] as const) {
    expect(src).toContain(`confirmBulkDelete(ids.length, '${label}')`);
  }
  const helper = readFileSync(join(__dirname, '../../src/lib/bulk-delete-confirm.ts'), 'utf8');
  expect(helper).toContain('`${count}件の${label}を削除します');
  expect(helper).toContain('元に戻せません');
  // 選択状態を保存しない（Kindle handoff の sessionStorage は選択の保存ではなく受け渡し＝別物）
  for (const src of [lib, sal, ctx]) {
    expect(src).not.toMatch(/(localStorage|sessionStorage)\.setItem\((?!'lumina_kindle_selected')[^)]*select/i);
    expect(src).not.toMatch(/setSelectedIds\(new Set\(JSON\.parse/);
  }
  // 全選択が無い（🗂の「表示中を全選択」・🧠の「表示中N件を全選択」は撤去）
  // 撤去の注記コメントは除いてコード部分だけを見る
  const codeOnly = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const src of [lib, sal, ctx]) {
    expect(codeOnly(src)).not.toMatch(/全選択|handleSelectAllVisible|toggleSelectAllVisible|data-ctx-select-all/);
  }
  // R-81: チェックボックスはクリックを上へ伝えない
  expect((row.match(/data-library-check=\{item\.id\}[\s\S]{0,200}?onClick=\{stopCardClick\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect(row).toMatch(/data-library-artifact-check=\{a\.item\.id\}[\s\S]{0,200}?onClick=\{stopCardClick\}/);
  expect(ctx).toMatch(/data-ctx-delete-check=\{item\.id\}[\s\S]{0,700}?onClick=\{stopCardClick\}/);
});

// ───────────────────────────────────────────────────────────────────────────
// 297: 🎯用途カテゴリ（マイフォルダとは別テーブル・別体系・3画面で共有）
// ───────────────────────────────────────────────────────────────────────────
test('U67: 用途カテゴリ（297）— 名前の正規化／削除の確認文は件数と「記事は削除されません」／スキーマは冪等DDLのみ（既存テーブルへの ALTER なし）／マイフォルダの実装（lib/custom-folders・components/custom-folders）は無変更／3画面が同じ部品・同じ hook を使い「フォルダ」の語を用途の文言に使わない／記事削除時に用途の所属も外す', () => {
  // 名前の正規化（前後空白・連続空白・上限）
  expect(normalizePurposeName('  note用  ')).toBe('note用');
  expect(normalizePurposeName('a   b')).toBe('a b');
  expect(normalizePurposeName('')).toBeNull();
  expect(normalizePurposeName(null)).toBeNull();
  expect(normalizePurposeName('あ'.repeat(40))!.length).toBe(MAX_PURPOSE_NAME_LENGTH);
  // 削除の確認文（284・296と同じ形）
  const msg = purposeDeleteConfirmMessage('note用', 3);
  expect(msg).toContain('3件');
  expect(msg).toContain('記事は削除されません');
  expect(msg).not.toContain('フォルダ');
  // スキーマ: CREATE TABLE/INDEX IF NOT EXISTS だけ（停止条件①の例外に収まる）。既存テーブルの ALTER は無い
  const lib = readFileSync(join(__dirname, '../../src/lib/purpose-categories.ts'), 'utf8');
  expect((lib.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length).toBe(2);
  expect(lib).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_purpose_category_items_uniq/);
  expect(lib).toMatch(/ON DELETE CASCADE/);
  expect(lib).not.toMatch(/ALTER TABLE|DROP TABLE|TRUNCATE/);
  // マイフォルダの表を読み書きしない（コメント・型の import は除く）
  const libCode = lib.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  expect(libCode).not.toMatch(/custom_folder_items|FROM custom_folders|INTO custom_folders|UPDATE custom_folders/);
  // 3画面の記事を跨ぐ: 件数は3テーブルと JOIN（孤児を数えない）
  for (const t of ['text_analysis_saves', 'library', 'context_saves']) expect(lib).toContain(`JOIN ${t} `);
  // マイフォルダの実装は無変更（297のコミットで触らない＝文言の目印で固定）
  const cf = readFileSync(join(__dirname, '../../src/lib/custom-folders.ts'), 'utf8');
  expect(cf).not.toMatch(/purpose/i);
  for (const f of ['CustomFolderBar.tsx', 'FolderPickerPopover.tsx', 'FolderBadges.tsx', 'useCustomFolders.ts', 'folderStyles.ts']) {
    expect(readFileSync(join(__dirname, '../../src/components/custom-folders/', f), 'utf8'), `${f} に用途の実装を混ぜない`).not.toMatch(/purpose/i);
  }
  // 3画面が同じ部品・同じ hook（新規に画面ごとの体系を作らない）
  const screens = [
    'src/app/dashboard/library/page.tsx',
    'src/components/text-analysis/SavedAnalysisList.tsx',
    'src/components/context-library/ContextLibraryPanel.tsx',
  ].map((f) => readFileSync(join(__dirname, '../../', f), 'utf8'));
  for (const s of screens) {
    expect(s).toContain("from '@/components/purpose-categories/usePurposeCategories'");
    expect(s).toContain('<PurposeCategoryBar');
    expect(s).toContain('<PurposePickerPopover');
    expect(s).toContain('<PurposeBadges');
    expect(s).toContain("key: 'purpose'");
  }
  // 用途の部品は「フォルダ」の語を使わない（§3-1）。色はマイフォルダ（金）と別（青緑）
  for (const f of ['PurposeCategoryBar.tsx', 'PurposePickerPopover.tsx', 'PurposeBadges.tsx', 'purposeStyles.ts']) {
    const src = readFileSync(join(__dirname, '../../src/components/purpose-categories/', f), 'utf8');
    const visible = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(visible, `${f}: 表示文言に「フォルダ」を使わない`).not.toContain('フォルダ');
  }
  const styles = readFileSync(join(__dirname, '../../src/components/purpose-categories/purposeStyles.ts'), 'utf8');
  expect(styles).toContain("PURPOSE_ACCENT = '#0d9488'");
  expect(styles.replace(/^\s*\/\/.*$/gm, ''), 'マイフォルダの金色を用途の色に使わない（コメントは除く）').not.toContain('#f59e0b');
  // R-108: クライアント部品はサーバー専用モジュール（lib/purpose-categories＝neon を含む）から値を import しない（型のみ）
  for (const f of ['PurposeCategoryBar.tsx', 'PurposePickerPopover.tsx', 'PurposeBadges.tsx', 'usePurposeCategories.ts']) {
    const src = readFileSync(join(__dirname, '../../src/components/purpose-categories/', f), 'utf8');
    const valueImports = src.match(/^import (?!type )[^;]*from '@\/lib\/purpose-categories';/gm) ?? [];
    expect(valueImports, `${f}: lib/purpose-categories からは import type のみ`).toEqual([]);
    expect(src).not.toMatch(/from '@\/lib\/db'/);
  }
  const shared = readFileSync(join(__dirname, '../../src/lib/purpose-categories-shared.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  expect(shared, 'shared は DB 非依存（コメントは除く）').not.toMatch(/@\/lib\/db|neon|sanitize|^import /m);
  // 記事削除時に用途の所属も外す（3つの削除API）
  for (const f of ['src/app/api/library/route.ts', 'src/app/api/text-analysis/saves/route.ts', 'src/app/api/context-saves/route.ts']) {
    const src = readFileSync(join(__dirname, '../../', f), 'utf8');
    expect(src, `${f}: 単体削除で外す`).toContain('detachItemFromPurposes(');
    expect(src, `${f}: 一括削除で外す`).toContain('detachItemsFromPurposes(');
    expect(src, `${f}: 一覧に所属IDを付与`).toContain('purpose_category_ids');
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 298: 用途カテゴリの一括付け外し
// ───────────────────────────────────────────────────────────────────────────
test('U68: 用途の一括付け外し（298）— 上限は一括削除と同値で超過は無効化＋理由（R-101）／結果文言は決定的で失敗分を隠さない（R-39）／3画面が同じパネル・同じ hook（bulk は1リクエスト）／付ける・外すに confirm を足していない／二重発火は ref／サーバーは記事ごとに独立実行（トランザクションで包まない）', () => {
  expect(PURPOSE_BULK_LIMIT).toBe(500);
  expect(purposeBulkState(0).enabled).toBe(false);
  expect(purposeBulkState(1).enabled).toBe(true);
  expect(purposeBulkState(500).enabled).toBe(true);
  const over = purposeBulkState(501);
  expect(over.enabled).toBe(false);
  expect(over.reason).toContain('500件まで');
  expect(over.reason).toContain('501件選択中');
  // 結果文言（決定的・失敗を隠さない）
  expect(purposeBulkResultMessage('add', { changed: 3, unchanged: 0, failed: 0 })).toBe('✅ 3件に付けました');
  expect(purposeBulkResultMessage('add', { changed: 2, unchanged: 1, failed: 0 })).toBe('✅ 2件に付けました・1件は既に付いていました');
  expect(purposeBulkResultMessage('remove', { changed: 2, unchanged: 1, failed: 0 })).toBe('✅ 2件から外しました・1件は元から付いていませんでした');
  const partial = purposeBulkResultMessage('add', { changed: 2, unchanged: 0, failed: 1 });
  expect(partial).toContain('⚠️');
  expect(partial).toContain('2件に付けました');
  expect(partial).toContain('1件は失敗しました');
  expect(partial).toContain('成功した分は反映されています');
  // 3画面が同じパネル・同じ hook。confirm を足していない
  const screens = ['src/app/dashboard/library/page.tsx', 'src/components/text-analysis/SavedAnalysisList.tsx', 'src/components/context-library/ContextLibraryPanel.tsx'];
  for (const f of screens) {
    const src = readFileSync(join(__dirname, '../../', f), 'utf8');
    expect(src, `${f}: 共通パネル`).toContain('<PurposeBulkPanel');
    expect(src, `${f}: 操作バーの入口`).toContain('data-purpose-bulk-open');
    expect(src, `${f}: hook の bulkAssign（1リクエスト）`).toContain('purposes.bulkAssign(');
    const bulkFn = src.slice(src.indexOf('const handleBulkPurposes'), src.indexOf('const handleBulkPurposes') + 900);
    expect(bulkFn, `${f}: 付け外しに confirm を足さない`).not.toMatch(/confirm\(/);
    expect(bulkFn, `${f}: 成功分だけ反映（changed＋unchanged）`).toContain('out.changedKeys, ...out.unchangedKeys');
  }
  const panelSrc = readFileSync(join(__dirname, '../../src/components/purpose-categories/PurposeBulkPanel.tsx'), 'utf8');
  expect(panelSrc).toContain('busyRef.current = true');
  expect(panelSrc).not.toMatch(/window\.confirm|confirm\(/);
  expect(panelSrc).toContain('data-purpose-bulk-add');
  expect(panelSrc).toContain('data-purpose-bulk-remove');
  expect(panelSrc, 'クライアント部品はサーバー専用 lib から値を import しない（R-108）').not.toMatch(/^import (?!type )[^;]*from '@\/lib\/purpose-categories';/m);
  // サーバー: 記事ごとに独立実行し、トランザクションで包まない（R-39）。上限は共有定数
  const lib = readFileSync(join(__dirname, '../../src/lib/purpose-categories.ts'), 'utf8');
  const bulk = lib.slice(lib.indexOf('export async function bulkSetItemPurposes'));
  expect(bulk).not.toContain('sql.transaction');
  expect(bulk).toContain('ON CONFLICT DO NOTHING');
  expect(bulk).toContain('failedKeys.push(key)');
  const api = readFileSync(join(__dirname, '../../src/app/api/purpose-categories/route.ts'), 'utf8');
  expect(api).toContain("action === 'bulk'");
  expect(api).toContain('itemIds.length > PURPOSE_BULK_LIMIT');
  // 一括の hook も最後の要求の応答だけ採用（297 の競合対処が効く）
  const hook = readFileSync(join(__dirname, '../../src/components/purpose-categories/usePurposeCategories.ts'), 'utf8');
  const bulkHook = hook.slice(hook.indexOf('const bulkAssign'));
  expect(bulkHook).toContain('++seq.current');
  expect(bulkHook).toContain('adopt(my, data.categories)');
});

// ───────────────────────────────────────────────────────────────────────────
// 300: 即時ツールチップ（title 属性をカーソルが乗った瞬間に出す共通部品）
// ───────────────────────────────────────────────────────────────────────────
test('U69: 即時ツールチップ（300）— 位置は下・入らなければ上・左右は画面端の内側（純関数）／空の title は出さない／部品にタイマー無し（遅延ゼロ）・DOM直更新／R-80: rootZoom/toLayoutPx を再利用し新しい zoom 計算を書かない／タッチ端末は useFinePointer で何も付けない／257のホバープレビューの遅延（280/80ms）は不変', async () => {
  const tipLib = await import('../../src/lib/instant-tooltip');
  const { computeTipPlacement, isTipText, INSTANT_TIP_GAP, INSTANT_TIP_MARGIN } = tipLib;
  const vp = { width: 1280, height: 720 };
  const tip = { width: 120, height: 28 };
  // 通常: ボタンの下・中央揃え
  const p1 = computeTipPlacement({ left: 500, top: 100, width: 80, height: 30 }, vp, tip);
  expect(p1.side).toBe('bottom');
  expect(p1.top).toBe(100 + 30 + INSTANT_TIP_GAP);
  expect(p1.left).toBe(500 + 40 - 60);
  // 下端: 入らなければ上
  const p2 = computeTipPlacement({ left: 500, top: 690, width: 80, height: 24 }, vp, tip);
  expect(p2.side).toBe('top');
  expect(p2.top).toBe(690 - INSTANT_TIP_GAP - 28);
  // 右端・左端: 画面の余白の内側に収める
  const p3 = computeTipPlacement({ left: 1240, top: 100, width: 36, height: 30 }, vp, tip);
  expect(p3.left).toBe(1280 - INSTANT_TIP_MARGIN - 120);
  const p4 = computeTipPlacement({ left: 2, top: 100, width: 36, height: 30 }, vp, tip);
  expect(p4.left).toBe(INSTANT_TIP_MARGIN);
  // zoom 時は呼び出し側が gap/margin を zoom 倍して渡す（視覚px で統一）
  const p5 = computeTipPlacement({ left: 500, top: 100, width: 80, height: 30 }, vp, tip, INSTANT_TIP_GAP * 1.4, INSTANT_TIP_MARGIN * 1.4);
  expect(p5.top).toBeCloseTo(130 + INSTANT_TIP_GAP * 1.4, 5);
  expect(isTipText('')).toBe(false);
  expect(isTipText('   ')).toBe(false);
  expect(isTipText(null)).toBe(false);
  expect(isTipText('全文表示')).toBe(true);

  // 部品のソース固定: タイマー無し・DOM 直更新・R-80 の再利用・タッチ端末の分岐
  const comp = readFileSync(join(__dirname, '../../src/components/InstantTooltip.tsx'), 'utf8');
  expect(comp, 'setTimeout を使わない（遅延ゼロ）').not.toContain('setTimeout');
  expect(comp, 'requestAnimationFrame を挟まない（イベントと同じタイミングで出す）').not.toContain('requestAnimationFrame');
  expect(comp, 'React state を介さず DOM を直接更新する').not.toContain('useState');
  expect(comp).toContain("import { rootZoom, toLayoutPx } from '@/lib/hover-preview'");
  expect(comp).toContain('toLayoutPx(p.left, zoom)');
  expect(comp).toContain('toLayoutPx(p.top, zoom)');
  expect(comp, '独自の zoom 計算を書かない').not.toMatch(/getComputedStyle\([^)]*\)\.zoom/);
  expect(comp).toContain("import { useFinePointer } from '@/lib/pointer-device'");
  expect(comp).toContain('if (!mounted || !fine) return;');
  expect(comp).toContain("e.pointerType !== 'mouse'");
  // 消えるタイミング: クリック（pointerdown/click）・スクロール・キー・ウィンドウ外
  for (const ev of ["'pointerdown'", "'click'", "'scroll'", "'keydown'", "'mouseleave'", "'blur'"]) expect(comp).toContain(ev);
  // title は退避して戻す（React が付け直した title は上書きしない）
  expect(comp).toContain("el.removeAttribute('title')");
  expect(comp).toContain("!el.hasAttribute('title')) el.setAttribute('title', t)");
  // 1箇所マウント（ルートレイアウト）
  const layout = readFileSync(join(__dirname, '../../src/app/layout.tsx'), 'utf8');
  expect(layout).toContain('<InstantTooltip />');
  // 257 のホバープレビューの遅延は不変（本便は別物）
  const hp = await import('../../src/lib/hover-preview');
  expect(hp.HOVER_PREVIEW_DELAY_MS).toBe(280);
  expect(hp.HOVER_PREVIEW_PREFETCH_MS).toBe(80);
  expect(tipLib, '本便の lib は遅延の定数を持たない').not.toHaveProperty('INSTANT_TIP_DELAY_MS');
});

test('U70: マンダラ（301）— アウトライン順は定数1箇所（0,1,2,3,5,6,7,8）でグリッドはその関数から中央を差し込む（R-74）・第2階層の中央は導出され保存されない（R-92）・入力順に依存しない・scope の許容値は定数1箇所・チャート名＝中央タイトル・削除確認文に件数（R-56）・保存成功文言は行から（R-95）・プレビューに生MDなし（R-18）・shared は DB 非依存（R-108）・DDLは冪等のみ/CASCADE/中央保存禁止・FullscreenReader の editor は opt-in（R-88）・nav-items 登録（R-84）', async () => {
  const m = mandalaShared;
  type Cell = import('../../src/lib/mandala-shared').MandalaCell;
  const mk = (position: number, depth: 1 | 2 = 1, parent: string | null = null, title = ''): Cell => ({
    id: `c${depth}-${parent ?? 'r'}-${position}`,
    chart_id: 'ch',
    parent_cell_id: parent,
    depth,
    position,
    title,
    body: '',
    meta: {},
    created_at: '',
    updated_at: '',
  });

  // ⑤ 順序の正本は1箇所
  expect(m.MANDALA_OUTLINE_POSITIONS).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  expect(m.MANDALA_CENTER).toBe(4);
  expect(m.MANDALA_DEPTH1_COUNT).toBe(9);

  // 第1階層: 入力を逆順で渡してもアウトラインは固定順・中央は含まれない
  const depth1 = [8, 7, 6, 5, 4, 3, 2, 1, 0].map((p) => mk(p, 1, null, `T${p}`));
  const outline = m.mandalaOutline(depth1);
  expect(outline.map((e) => e.position)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  expect(outline.every((e) => e.depth === 1 && e.parentPosition === null)).toBe(true);
  expect(outline.some((e) => e.position === 4)).toBe(false);
  // グリッド: 9枠・index 4 が中央（保存済み行）・周囲はアウトライン順そのもの
  const slots = m.mandalaGridSlots(depth1);
  expect(slots.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(slots[4].cell?.title).toBe('T4');
  expect(slots[4].derived).toBe(false);
  expect(slots.filter((s) => s.position !== 4).map((s) => s.cell?.id)).toEqual(outline.map((e) => e.cell.id));

  // ② 第2階層: 親 T1 の子。中央（4）は来ても捨てる・導出枠に親のタイトル
  const parent = depth1.find((c) => c.position === 1)!;
  const kids = [5, 0, 4, 8].map((p) => mk(p, 2, parent.id, `K${p}`));
  const all = [...kids, ...depth1];
  const o2 = m.mandalaOutline(all);
  expect(o2.map((e) => `${e.depth}:${e.position}`)).toEqual(['1:0', '1:1', '2:0', '2:5', '2:8', '1:2', '1:3', '1:5', '1:6', '1:7', '1:8']);
  expect(o2.filter((e) => e.depth === 2).every((e) => e.parentPosition === 1)).toBe(true);
  const g2 = m.mandalaGridSlots(all, parent.id);
  expect(g2[4].derived).toBe(true);
  expect(g2[4].cell).toBeNull();
  expect(g2[4].derivedTitle).toBe('T1');
  expect(g2[0].cell?.title).toBe('K0');
  expect(g2[5].cell?.title).toBe('K5');
  expect(g2[8].cell?.title).toBe('K8');
  expect(g2[1].cell).toBeNull();
  expect(m.mandalaOutline([...all].reverse()), '入力順を変えても同じ').toEqual(o2);
  expect(m.mandalaGridSlots(all).map((s) => s.cell?.id), '第1階層のグリッドに第2階層が混ざらない').toEqual(m.mandalaGridSlots(depth1).map((s) => s.cell?.id));

  // ① scope の許容値は定数1箇所（文字列・固定列挙にしない）
  expect(m.MANDALA_LINK_SCOPES).toEqual(['library', 'text_analysis', 'context', 'episode']);
  expect(m.isMandalaLinkScope('episode')).toBe(true);
  expect(m.isMandalaLinkScope('mandala')).toBe(false);
  expect(m.isMandalaLinkScope(null)).toBe(false);
  // ④ 他画面から参照するときの scope 名
  expect(m.MANDALA_ITEM_SCOPE).toBe('mandala');

  // §3-5 チャート名＝中央タイトル。空は（無題）
  expect(m.chartDisplayTitle('')).toBe('（無題）');
  expect(m.chartDisplayTitle(undefined)).toBe('（無題）');
  expect(m.chartDisplayTitle('  テーマ ')).toBe('テーマ');
  expect(m.cellDisplayTitle({ title: '', position: 3 })).toBe('（無題） 左');
  // 空のマスは正常状態。空白だけは空
  expect(m.isCellFilled({ title: '', body: '  \n' })).toBe(false);
  expect(m.isCellFilled({ title: '', body: 'a' })).toBe(true);
  expect(m.isCellFilled(null)).toBe(false);
  expect(m.filledCount(all, 1)).toBe(9);
  // 行数で数える（テストデータの第2階層中央 K4 も1行。実DBでは CHECK 制約で存在しない）
  expect(m.filledCount(all)).toBe(13);

  // §3-2 削除の確認文（1本・件数入り・元に戻せない）
  const msg = m.mandalaDeleteConfirmMessage('', 5, 0);
  expect(msg).toContain('5/9');
  expect(msg).toContain('リンク済み: 0件');
  expect(msg).toContain('（無題）');
  expect(msg).toContain('元に戻せません');

  // R-95 保存成功の文言は行から。空は「空にしました」
  expect(m.cellSavedMessage({ title: '', body: '', position: 3 })).toBe('マス「左」を空にしました');
  expect(m.cellSavedMessage({ title: '見出し', body: 'あいう', position: 0 })).toBe('「見出し」を保存しました（3文字）');

  // 入力の整形（タイトル1行・本文は改行保持・上限）
  expect(m.normalizeCellInput({ title: ' a\nb ', body: 'x\r\ny' })).toEqual({ title: 'a b', body: 'x\ny' });
  expect(m.normalizeCellInput({ title: 42, body: null })).toEqual({ title: '', body: '' });
  expect(m.normalizeCellInput({ title: 't'.repeat(300) }).title.length).toBe(m.MANDALA_TITLE_MAX);
  expect(m.isUuidLike('00000000-0000-4000-8000-000000000000')).toBe(true);
  expect(m.isUuidLike('bad')).toBe(false);

  // R-18 プレビューは記号を落とす
  expect(m.cellPreviewText('## 見出し\n\n- **太字**の項目\n---\n本文')).toBe('見出し 太字の項目 本文');
  expect(m.cellPreviewText('あ'.repeat(200)).length).toBe(m.MANDALA_PREVIEW_MAX + 1);
  expect(m.cellPreviewText('')).toBe('');

  // R-108: shared は DB 非依存、画面はサーバ専用 lib を import しない
  // R-111: 判定は import 構文ごと（コメント中の語に当てない）
  const shared = readFileSync(join(__dirname, '../../src/lib/mandala-shared.ts'), 'utf8');
  expect(shared).not.toMatch(/from '@\/lib\/(db|sanitize)'/);
  expect(shared).not.toMatch(/from '@neondatabase/);
  for (const f of [
    'src/components/mandala/MandalaGrid.tsx',
    'src/components/mandala/MandalaCellEditor.tsx',
    'src/app/dashboard/mandala/page.tsx',
    'src/app/dashboard/mandala/[id]/page.tsx',
  ]) {
    const src = readFileSync(join(__dirname, '../..', f), 'utf8');
    expect(src, `${f} はサーバ専用 lib を import しない`).not.toMatch(/from '@\/lib\/mandala-server'/);
    expect(src, `${f} は @/lib/db を import しない`).not.toMatch(/from '@\/lib\/db'/);
  }
  // ⑤ グリッドの描画順が実際にアウトライン関数から取られている（将来のためだけの未使用コードにしない）
  const grid = readFileSync(join(__dirname, '../../src/components/mandala/MandalaGrid.tsx'), 'utf8');
  expect(grid).toContain('mandalaGridSlots(cells, parentCellId)');

  // §4-2 サーバ DDL: 3テーブル・冪等のみ（ALTER なし）・CASCADE 3本・中央保存禁止・9マス同時（CTE 1文）・同一内容は書かない
  const server = readFileSync(join(__dirname, '../../src/lib/mandala-server.ts'), 'utf8');
  expect(server.match(/CREATE TABLE IF NOT EXISTS/g)?.length).toBe(3);
  expect(server.match(/CREATE (UNIQUE )?INDEX IF NOT EXISTS/g)?.length).toBe(5);
  expect(server).not.toMatch(/ALTER TABLE/);
  // DDL の CASCADE は3本（cells→charts・cells→親cell・links→cells）。コメント中の語は数えない
  expect(server.match(/REFERENCES mandala_[a-z_]+\(id\) ON DELETE CASCADE/g)?.length).toBe(3);
  expect(server).toContain('position <> 4');
  expect(server).toContain('generate_series(0, 8)');
  expect(server).toContain('IS DISTINCT FROM');
  expect(server, 'scope を CHECK/enum で固定しない（①）').not.toMatch(/scope\s+text\s+NOT NULL\s+CHECK/);
  expect(server).toContain("meta       jsonb NOT NULL DEFAULT '{}'::jsonb");

  // §3-4 FullscreenReader: editor は opt-in。既定の整形本文（renderMarkdown）は残る
  const reader = readFileSync(join(__dirname, '../../src/components/text-analysis/FullscreenReader.tsx'), 'utf8');
  expect(reader).toContain('editor?: ReactNode');
  expect(reader).toContain('editor != null ?');
  expect(reader).toContain('dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}');
  const editorComp = readFileSync(join(__dirname, '../../src/components/mandala/MandalaCellEditor.tsx'), 'utf8');
  expect(editorComp, '全画面は共通 FullscreenReader を呼ぶ（R-91）').toContain("import FullscreenReader from '@/components/text-analysis/FullscreenReader'");
  expect(editorComp, '二重発火は ref で閉じる（R-87）').toContain('if (savingRef.current) return;');
  expect(editorComp, '保存成功の表示は行から（R-95）').toContain('cellSavedMessage(row)');

  // R-84: nav-items に登録・12文字以内（R-57）・絵文字が他メニューと被らない
  const nav = await import('../../src/lib/nav-items');
  const item = nav.ALL_NAV_ITEMS.find((i) => i.href === '/dashboard/mandala');
  expect(item?.label).toBe('マンダラ');
  expect(item!.label.length).toBeLessThanOrEqual(12);
  expect(nav.ALL_NAV_ITEMS.filter((i) => i.icon === item!.icon)).toHaveLength(1);
});

test('U71: マンダラ 302 — scope の表示・遷移先は MANDALA_LINK_SCOPES と1対1（別の列挙なし）・件数と一次情報は純関数で決定的（R-74・空のマスは分母に入れない）・比較の上限9と列数は別（R-94）・1件は無効化と理由（R-101）・空のマスは比較に出ない・退避の復元条件（同じなら出さない）・ピッカーの4種の応答を1つに揃える・軽い一覧API（light=1／qScope=title）・比較部品は CompareGrid/batch-compare を流用（R-91）・4画面の ?open= はオプトイン', async () => {
  const m = mandalaShared;
  type Cell = import('../../src/lib/mandala-shared').MandalaCell;
  const mk = (position: number, title = '', body = ''): Cell => ({ id: `c${position}`, chart_id: 'ch', parent_cell_id: null, depth: 1, position, title, body, meta: {}, created_at: '', updated_at: '' });
  const lk = (id: number, cell_id: string, scope: string, item_key = 'k'): import('../../src/lib/mandala-shared').MandalaLinkLite => ({ id, cell_id, scope, item_key, created_at: '' });

  // ① scope: 表示・遷移先は許容値と1対1。遷移先は既存画面＋?open=
  expect(Object.keys(m.MANDALA_SCOPE_META).sort()).toEqual([...m.MANDALA_LINK_SCOPES].sort());
  expect(m.scopeMetaOf('library').openHref('abc')).toBe('/dashboard/library?open=abc');
  expect(m.scopeMetaOf('text_analysis').openHref('12')).toBe('/dashboard/saved?open=12');
  expect(m.scopeMetaOf('context').openHref('34')).toBe('/dashboard/context-library?open=34');
  expect(m.scopeMetaOf('episode').openHref('56')).toBe('/dashboard/episodes?open=56');
  expect(m.scopeMetaOf('unknown').icon).toBe('🔗');
  expect(m.linkDisplayTitle({ title: null, exists: false })).toBe(m.MANDALA_LINK_MISSING_LABEL);
  expect(m.linkDisplayTitle({ title: '  ', exists: true })).toBe('（無題）');

  // ② 件数・一次情報（入力順に依存しない・空のマスは分母に入れない）
  const cells = [mk(0, 'A', 'a'), mk(1, '', ''), mk(2, 'C', ''), mk(4, 'テーマ', '')];
  const links = [lk(1, 'c0', 'episode'), lk(2, 'c0', 'library'), lk(3, 'c1', 'episode'), lk(4, 'c2', 'context')];
  const counts = m.linkCountsByCell(links);
  expect(counts.get('c0')).toEqual({ total: 2, episode: 1 });
  expect(counts.get('c2')).toEqual({ total: 1, episode: 0 });
  expect(m.linkCountsByCell([...links].reverse())).toEqual(counts);
  // c1 は空（リンクがあっても分母に入れない）。埋まっている c0/c2/c4 のうち📔があるのは c0 だけ
  expect(m.primaryInfoSummary(cells, links)).toEqual({ withPrimary: 1, filled: 3 });
  expect(m.primaryInfoSummary(cells, [])).toEqual({ withPrimary: 0, filled: 3 });
  expect(m.linkBulkResultMessage({ added: 3, unchanged: 1, failed: 0 })).toBe('✅ 3件をリンクしました・1件は既にリンク済み');
  expect(m.linkBulkResultMessage({ added: 1, unchanged: 0, failed: 2 })).toContain('❌ 2件は失敗しました');

  // ③ 比較: 上限は全9マス、列数は別（batch-compare の 4 で折り返す）。1件は無効化＋理由、空は出ない、選んだ順
  expect(m.MANDALA_COMPARE_MAX).toBe(9);
  expect(m.mandalaCompareState(1)).toMatchObject({ enabled: false });
  expect(m.mandalaCompareState(1).reason).toContain('2件以上');
  expect(m.mandalaCompareState(2).enabled).toBe(true);
  expect(m.mandalaCompareState(10)).toMatchObject({ enabled: false });
  expect(m.toggleCellSelection(['a'], 'b')).toEqual(['a', 'b']);
  expect(m.toggleCellSelection(['a', 'b'], 'a')).toEqual(['b']);
  expect(m.toggleCellSelection(['1', '2', '3'], '4', 3)).toEqual(['1', '2', '3']);
  expect(m.compareCellsOf(cells, ['c2', 'c1', 'c0', 'zz']).map((c) => c.id)).toEqual(['c2', 'c0']);
  const bc = await import('../../src/lib/batch-compare');
  expect(bc.resolveCompareColumns(9, true, 'auto'), '9件でも列数は4で頭打ち（幅で折り返す）').toBe(4);

  // ④ 退避: 同じなら提案しない・鍵はマスの id
  expect(m.mandalaStashKey('x')).toBe('mandala_draft:x');
  expect(m.shouldOfferRestore(null, { title: '', body: '' })).toBe(false);
  expect(m.shouldOfferRestore({ title: '', body: 'a', at: '' }, { title: '', body: 'a' })).toBe(false);
  expect(m.shouldOfferRestore({ title: '', body: 'b', at: '' }, { title: '', body: 'a' })).toBe(true);
  expect(m.isStashSameAsSaved({ title: 't', body: 'b' }, { title: 't', body: 'b' })).toBe(true);

  // ⑤ ピッカー: 4種の応答を1つの形に。検索元は軽い一覧API
  expect(m.pickerItemsOf('library', [{ id: 'u1', title: 'L', type: 'research', created_at: 'd', char_count: 10 }])).toEqual([{ scope: 'library', key: 'u1', title: 'L', sub: 'research', charCount: 10, createdAt: 'd' }]);
  expect(m.pickerItemsOf('text_analysis', { items: [{ id: 7, auto_title: '', file_name: 'f.txt', analysis_label: '要約', char_count: '5', created_at: 'd' }] })[0]).toMatchObject({ key: '7', title: 'f.txt', sub: '要約', charCount: 5 });
  expect(m.pickerItemsOf('context', { items: [{ id: 3, topic: 'T', category: 'general', char_count: 2, created_at: 'd' }] })[0]).toMatchObject({ key: '3', title: 'T' });
  expect(m.pickerItemsOf('episode', { items: [{ id: 9, title: '', situation: '状況の文', details: 'xx', created_at: 'd' }] })[0]).toMatchObject({ key: '9', title: '状況の文', charCount: 6 });
  expect(m.pickerItemsOf('library', { nope: 1 })).toEqual([]);
  expect(m.pickerSearchUrl('library', 'a b')).toContain('light=1');
  expect(m.pickerSearchUrl('text_analysis', '')).toContain('qScope=title');
  expect(m.pickerSearchUrl('context', 'x')).toContain('qScope=title');
  expect(m.pickerSearchUrl('episode', 'x')).toMatch(/^\/api\/episodes\?/);
  expect(m.pickerSearchUrl('mandala', 'x')).toBe('');

  // ⑥ ソース固定（R-111: 構文ごと）: 比較部品は共通部品と判断を流用し、独自の列クラスを書かない
  const cmp = readFileSync(join(__dirname, '../../src/components/mandala/MandalaCompareView.tsx'), 'utf8');
  expect(cmp).toContain("from '@/components/deepresearch/CompareGrid'");
  expect(cmp).toContain("from '@/lib/batch-compare'");
  expect(cmp).toContain('compareGridClass(cols, colChoice)');
  expect(cmp).not.toMatch(/grid-cols-\d/);
  expect(cmp).toContain("from '@/components/MarkdownBody'");
  // scope の列挙を画面側に作らない
  const linksComp = readFileSync(join(__dirname, '../../src/components/mandala/MandalaLinks.tsx'), 'utf8');
  expect(linksComp).toContain('MANDALA_LINK_SCOPES.map(');
  expect(linksComp).not.toMatch(/\[\s*'library'\s*,/);
  // ?open= はオプトイン（4画面）・📚の light=1 もオプトイン
  for (const f of ['src/app/dashboard/library/page.tsx', 'src/components/text-analysis/SavedAnalysisList.tsx', 'src/components/context-library/ContextLibraryPanel.tsx', 'src/app/dashboard/episodes/page.tsx']) {
    expect(readFileSync(join(__dirname, '../..', f), 'utf8'), `${f} は ?open= を読む`).toContain(".get('open')");
  }
  const libRoute = readFileSync(join(__dirname, '../../src/app/api/library/route.ts'), 'utf8');
  expect(libRoute).toContain("searchParams.get('light') === '1'");
  // shared は DB 非依存のまま・チャート画面は純関数で件数を導出
  const shared = readFileSync(join(__dirname, '../../src/lib/mandala-shared.ts'), 'utf8');
  expect(shared).not.toMatch(/from '@\/lib\/(db|sanitize)'/);
  const pageSrc = readFileSync(join(__dirname, '../../src/app/dashboard/mandala/[id]/page.tsx'), 'utf8');
  expect(pageSrc).toContain('linkCountsByCell(links)');
  expect(pageSrc).toContain('primaryInfoSummary(chart.cells, links)');
  expect(pageSrc).not.toMatch(/data-mandala-select-all/);
});

test('U72: マンダラ ⌘+Enter 保存（302 §6-4）— 一覧（小窓）に登録・2キー（R-60）・実行キー（run）の一覧は不変（U15）・編集要素のハンドラは保存ボタンと同じ save() を通し isComposing/keyCode 229 を無視・画面全体の keydown で Enter を拾わない', async () => {
  const { SHORTCUT_SECTIONS } = await import('../../src/lib/shortcuts');
  const sec = SHORTCUT_SECTIONS.find((s) => s.scope === 'mandala');
  expect(sec, 'マンダラのセクションが登録されていること').toBeTruthy();
  expect(sec!.items.map((i) => i.keys.join('+'))).toEqual(['⌘+Enter']);
  expect(sec!.items[0].keys.length).toBeLessThanOrEqual(2);
  expect(sec!.items[0].desc).toContain('保存');
  expect(sec!.items[0].note).toContain('変換中');
  // run セクションは不変（実行の ⌘+Enter とは別セクション）
  expect(SHORTCUT_SECTIONS.find((s) => s.scope === 'run')!.items.map((i) => i.keys.join('+'))).toEqual(['⌘+Enter', '⌘+⌫', '⌘+⇧+V']);
  const src = readFileSync(join(__dirname, '../../src/components/mandala/MandalaCellEditor.tsx'), 'utf8');
  // 同じ経路: キー押下は save() を呼ぶだけ（別の保存処理・fetch を書かない）
  expect(src.match(/fetch\('\/api\/mandala\/cells'/g)?.length, '保存の fetch は1箇所').toBe(1);
  expect(src).toContain("(e.metaKey || e.ctrlKey) && (e.key === 'Enter'");
  expect(src).toContain('if (dirtyRef.current) void save();');
  expect(src).toContain('e.nativeEvent.isComposing || e.keyCode === 229');
  // リスナーは編集要素だけ: window/document の keydown で Enter を見ない（Esc のパネル閉じだけ）
  const windowKeyHandlers = src.match(/addEventListener\('keydown'[^\n]*/g) ?? [];
  expect(windowKeyHandlers.length).toBe(1);
  // window に付けている唯一の keydown ハンドラ（onKey）は Esc だけを見る（R-111: 構文ごとに当てる）
  const onKeyBody = src.match(/const onKey = \(e: KeyboardEvent\) => \{[^}]*\}/)?.[0] ?? '';
  expect(onKeyBody).toContain("e.key !== 'Escape'");
  expect(onKeyBody).not.toContain('Enter');
  expect(src).toContain('onKeyDown={onEditorKeyDown}');
  // 小窓のスコープ判定はパネルの目印で
  const palette = readFileSync(join(__dirname, '../../src/components/ShortcutPalette.tsx'), 'utf8');
  expect(palette).toContain("visible('[data-mandala-panel]')");
});

test('U73: マンダラ バッジのホバーポップアップ（304）— 上限8件と畳み・📔からは episode が先頭（安定）・遅延150〜250ms・猶予あり・z は既存体系（サイドパネルとリーダーの間）・位置は273の関数を流用（新しい位置計算なし）・箱は押せる（pointer-events:none にしない）・アンカーに title を書かない・InstantTooltip のソースは301のまま（R-110/R-111）', async () => {
  const m = mandalaShared;
  const hp = await import('../../src/lib/hover-popover');
  type L = import('../../src/lib/mandala-shared').MandalaLinkResolved;
  const lk = (id: number, scope: string): L => ({ id, cell_id: 'c', scope, item_key: String(id), created_at: '', note: '', title: `t${id}`, exists: true, char_count: 1, item_created_at: null });
  const links = [lk(1, 'library'), lk(2, 'episode'), lk(3, 'context'), lk(4, 'episode'), ...Array.from({ length: 7 }, (_, i) => lk(10 + i, 'text_analysis'))];
  expect(m.MANDALA_POPOVER_MAX).toBe(8);
  const r1 = m.popoverRowsOf(links, 'links');
  expect(r1.rows.map((l) => l.id)).toEqual([1, 2, 3, 4, 10, 11, 12, 13]);
  expect(r1.rest).toBe(3);
  const r2 = m.popoverRowsOf(links, 'episode');
  expect(r2.rows.map((l) => l.id).slice(0, 2), '📔からは episode が先頭・同種内は元の順').toEqual([2, 4]);
  expect(r2.rows.map((l) => l.id)).toEqual([2, 4, 1, 3, 10, 11, 12, 13]);
  expect(m.popoverRowsOf(links.slice(0, 3), 'links').rest).toBe(0);
  expect(m.popoverKeyOf('abc')).toBe('mandala-links:abc');
  // 遅延・猶予・レイヤー
  expect(hp.HOVER_POPOVER_DELAY_MS).toBeGreaterThanOrEqual(150);
  expect(hp.HOVER_POPOVER_DELAY_MS).toBeLessThanOrEqual(250);
  expect(hp.HOVER_POPOVER_CLOSE_GRACE_MS).toBeGreaterThanOrEqual(100);
  expect(hp.HOVER_POPOVER_Z).toBeGreaterThan(9000);
  expect(hp.HOVER_POPOVER_Z).toBeLessThan(10000);
  // 位置は 273 の関数そのもの（同じ入力→同じ出力）
  const hv = await import('../../src/lib/hover-preview');
  const anchor = { left: 900, top: 100, width: 40, height: 16 };
  const vp = { width: 1280, height: 720 };
  const box = { width: 340, height: 200 };
  expect(hp.computePopoverPlacement(anchor, vp, box)).toEqual(hv.computePreviewPlacement(anchor, vp, box));
  // 257 の遅延は不変（設定を混ぜない・R-110）
  expect(hv.HOVER_PREVIEW_DELAY_MS).toBe(280);
  // ソース固定（R-111: 構文ごと）
  const comp = readFileSync(join(__dirname, '../../src/components/HoverPopover.tsx'), 'utf8');
  expect(comp).toContain("import { rootZoom, toLayoutPx, type PreviewRect } from '@/lib/hover-preview'");
  expect(comp).toContain('toLayoutPx(placement.left, zoom)');
  expect(comp).toContain('toLayoutPx(placement.top, zoom)');
  expect(comp).not.toMatch(/pointerEvents:\s*'none'/);
  expect(comp).not.toMatch(/\btitle=/);
  expect(comp).toContain("window.addEventListener('scroll', onScroll, true)");
  expect(comp).not.toContain('HOVER_PREVIEW_DELAY_MS');
  const lib = readFileSync(join(__dirname, '../../src/lib/hover-popover.ts'), 'utf8');
  expect(lib).toContain('return computePreviewPlacement(anchor, viewport, boxVisual);');
  // グリッドのバッジ: title を書かず aria-label。ポップアップの中身も title 無し
  const grid = readFileSync(join(__dirname, '../../src/components/mandala/MandalaGrid.tsx'), 'utf8');
  // バッジ行（304 の説明コメント〜「マスの説明（title）」の説明コメントまで）に title= が無いこと。
  // 305是正① で並びが変わっても範囲がずれないよう、境界はコメント文で取る（R-111）
  const badgeStart = grid.indexOf('304: 件数のあるバッジは');
  const badgeEnd = grid.indexOf('304: マスの説明（title）');
  expect(badgeStart).toBeGreaterThan(0);
  expect(badgeEnd).toBeGreaterThan(badgeStart);
  const badgeBlock = grid.slice(badgeStart, badgeEnd);
  expect(badgeBlock).not.toMatch(/\btitle=/);
  expect(badgeBlock).toContain('aria-label=');
  const linksComp = readFileSync(join(__dirname, '../../src/components/mandala/MandalaLinks.tsx'), 'utf8');
  const popBlock = linksComp.slice(linksComp.indexOf('export function MandalaLinkPopoverContent'));
  expect(popBlock).not.toMatch(/\btitle=/);
  expect(popBlock).toContain('<ScopeBadge scope={l.scope} compact noTitle />');
  // InstantTooltip は本便で無変更（301 の状態のまま）
  const tip = readFileSync(join(__dirname, '../../src/components/InstantTooltip.tsx'), 'utf8');
  expect(tip).not.toMatch(/popover/i);
  expect(tip).toContain('restore(anchor);');
  expect(tip).toContain('if (suppressed === next) { hide(); return; }');
  // チャート画面はホバー時取得＋キャッシュ（先読みしない）で、パネルと同じ GET を使う
  const pageSrc = readFileSync(join(__dirname, '../../src/app/dashboard/mandala/[id]/page.tsx'), 'utf8');
  expect(pageSrc).toContain("fetch(`/api/mandala/links?cellId=${encodeURIComponent(cellId)}`");
  // 308: 📈（from='reaction'）は meta から描くので取得しない。リンク系はそのまま取得
  // 309/311: 📝📈🔍 は記録・meta から描くので取得しない（取得はリンク系だけ）。文字列の完全一致ではなく形で固定（R-111）
  expect(pageSrc).toMatch(/onOpen: \(_key, \{ cell, from \}\) => \{ if \([^)]*'links'[^)]*'episode'[^)]*\) void fetchResolved\(cell\.id\); \}/);
});

test('U74: サイドバーのメニュー検索・追加順・新着・合流（303）— 正規化（大小・全半角・カナ/かな・空白）・表示名と元の名前の両方に一致・見出しは一致項目のあるカテゴリだけ・非表示の印・追加順は新しい順で同日は定義順・全項目に実在する addedAt（書き忘れは型とここで止まる）・新着は14日以内で15日目に消える（JST日付差）・合流は純関数で決定的', async () => {
  const ns = await import('../../src/lib/nav-search');
  const ni = await import('../../src/lib/nav-items');
  // 正規化
  expect(ns.normalizeNavQuery('ﾏﾝﾀﾞﾗ')).toBe('まんだら');
  expect(ns.normalizeNavQuery('マンダラ')).toBe('まんだら');
  expect(ns.normalizeNavQuery('Ａｉ メモ')).toBe('aiめも');
  expect(ns.normalizeNavQuery('AI Memo')).toBe('aimemo');
  expect(ns.normalizeNavQuery('')).toBe('');
  // 一致: 表示名でも元の名前でも
  const item = { href: '/x', label: 'マンダラ', icon: '🔲', addedAt: '2026-09-08' };
  expect(ns.matchesNavItem(item, '思考の骨格', 'まんだら')).toBe(true);
  expect(ns.matchesNavItem(item, '思考の骨格', '骨格')).toBe(true);
  expect(ns.matchesNavItem(item, '思考の骨格', 'ﾏﾝ')).toBe(true);
  expect(ns.matchesNavItem(item, '思考の骨格', 'dashboard')).toBe(false);
  expect(ns.matchesNavItem(item, '思考の骨格', '')).toBe(true);
  // カテゴリの絞り込み: 一致項目のある見出しだけ。ホームは実並び＋外した定義上の項目は hidden
  const homeHrefs = ['/dashboard', '/dashboard/mandala'];
  const hits = ns.filterNavCategories(ni.navCategories, 'まんだら', (i) => i.label, homeHrefs, ni.ITEM_BY_HREF);
  expect(hits.map((h) => h.category)).toEqual(['ホーム', '情報収集・調査']);
  expect(hits[0].hits.map((h) => h.item.href)).toEqual(['/dashboard/mandala']);
  const guideHits = ns.filterNavCategories(ni.navCategories, '使い方', (i) => i.label, homeHrefs, ni.ITEM_BY_HREF);
  expect(guideHits[0].hits).toEqual([{ item: ni.ITEM_BY_HREF.get('/dashboard/guide'), hidden: true }]);
  expect(ns.filterNavCategories(ni.navCategories, 'zzzz該当なし', (i) => i.label, homeHrefs, ni.ITEM_BY_HREF)).toEqual([]);
  // 追加順: 新しい順・同日は定義順・入力は不変
  const sorted = ns.sortByAddedDesc(ni.ALL_NAV_ITEMS);
  // 306 で「ホーム編集」（2026-09-09）が最新になった
  // 315: 図解生成（2026-09-09・コンテンツ作成）が同日のホーム編集（管理・設定）より定義順で先
  expect(sorted[0].href).toBe('/dashboard/visuals');
  expect(sorted[1].href).toBe('/dashboard/settings/menu');
  expect(sorted[2].href).toBe('/dashboard/mandala');
  for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1].addedAt >= sorted[i].addedAt).toBe(true);
  const sameDay = sorted.filter((i) => i.addedAt === '2026-03-22').map((i) => i.href);
  expect(sameDay).toEqual(ni.ALL_NAV_ITEMS.filter((i) => i.addedAt === '2026-03-22').map((i) => i.href));
  expect(ni.ALL_NAV_ITEMS[0].href).toBe('/dashboard');
  // 全項目に実在する addedAt（書き忘れは型で止まるが、形式の誤りはここで止める）
  for (const it of ni.ALL_NAV_ITEMS) expect(ns.isValidAddedAt(it.addedAt), `${it.href} の addedAt が YYYY-MM-DD の実在日付`).toBe(true);
  expect(ns.isValidAddedAt('2026-02-30')).toBe(false);
  expect(ns.isValidAddedAt('2026/09/08')).toBe(false);
  // 新着: 追加当日0日〜14日目は付き、15日目に消える（JST 日付差）。未来は新着扱い
  expect(ns.isNewMenu('2026-09-08', '2026-09-08')).toBe(true);
  expect(ns.isNewMenu('2026-09-08', '2026-09-22')).toBe(true);
  expect(ns.isNewMenu('2026-09-08', '2026-09-23')).toBe(false);
  expect(ns.isNewMenu('2026-09-08', '2026-09-07')).toBe(true);
  expect(ns.isNewMenu('bad', '2026-09-08')).toBe(false);
  expect(ns.NAV_NEW_LABEL.length).toBeLessThanOrEqual(12);
  expect(ns.formatAddedShort('2026-09-08')).toBe('9/8');
  expect(ns.formatAddedTitle('2026-09-08')).toBe('追加: 2026/9/8');
  expect(ns.parseNavOrder('added')).toBe('added');
  expect(ns.parseNavOrder('junk')).toBe('standard');
  // 合流（純関数）: 保存に無い項目を既定位置へ。墓標は除外。決定的
  const merged = ni.mergeHomeHrefs(['b', 'x', 'd'], ['c'], ['a', 'b', 'c', 'd', 'e']);
  expect(merged).toEqual(['a', 'b', 'x', 'd', 'e']);
  expect(ni.mergeHomeHrefs(['b', 'x', 'd'], ['c'], ['a', 'b', 'c', 'd', 'e'])).toEqual(merged);
  expect(ni.mergeHomeHrefs([], [], ['a', 'b'])).toEqual(['a', 'b']);
  // 型で止まる: NavItem に addedAt が必須（ソース固定・R-111）
  const src = readFileSync(join(__dirname, '../../src/lib/nav-items.ts'), 'utf8');
  expect(src).toContain('export type NavItem = { href: string; label: string; icon: string; addedAt: string };');
  // 標準の順序は変えていない（サイドバーは navCategories をそのまま描く）
  const sidebar = readFileSync(join(__dirname, '../../src/components/DashboardSidebar.tsx'), 'utf8');
  expect(sidebar).toContain("navCategories.filter(cat => cat.category !== 'ホーム').map(cat => (");
  expect(sidebar).not.toContain('data-kb-search');
});

test('U75: マンダラ 81マス（305）— 入れ子の目次は平坦形と同じ順（親→子（固定順）→次の親）で第1階層だけの結果は不変・展開の集計は決定的（空の子は数えない）・「親 › 子」のラベル・導出枠は親と同一 id・削除確認文に子マス件数・切替の解析・展開は1文で position 4 を除き NOT EXISTS で二重に作らない（ソース固定・R-111）・9マスの描画経路は不変', async () => {
  const m = mandalaShared;
  type Cell = import('../../src/lib/mandala-shared').MandalaCell;
  const mk = (position: number, depth: 1 | 2 = 1, parent: string | null = null, title = '', body = ''): Cell => ({ id: `c${depth}-${parent ?? 'r'}-${position}`, chart_id: 'ch', parent_cell_id: parent, depth, position, title, body, meta: {}, created_at: '', updated_at: '' });
  const depth1 = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => mk(p, 1, null, `T${p}`));
  const p1 = depth1[1];
  const p5 = depth1[5];
  const kids1 = [8, 5, 0].map((p) => mk(p, 2, p1.id, `K1-${p}`));
  const kids5 = [0, 1, 2, 3, 5, 6, 7, 8].map((p) => mk(p, 2, p5.id, p % 2 === 0 ? `K5-${p}` : ''));
  const all = [...kids5, ...depth1, ...kids1];
  // 入れ子＝平坦形（301・U70）と同じ順
  const nested = m.mandalaOutlineNested(all);
  expect(nested.map((n) => n.position)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  expect(nested[1].children.map((e) => e.position)).toEqual([0, 5, 8]);
  expect(nested[4].children.map((e) => e.position), "index 4 = position 5（[0,1,2,3,5,...] の並び）").toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  expect(nested[0].children).toEqual([]);
  const flat = m.mandalaOutline(all).map((e) => e.cell.id);
  const rebuilt = nested.flatMap((n) => [n.cell.id, ...n.children.map((e) => e.cell.id)]);
  expect(rebuilt, '入れ子を平坦にすると平坦形と一致').toEqual(flat);
  // 第1階層だけ: children は全部空・平坦形は不変
  expect(m.mandalaOutlineNested(depth1).every((n) => n.children.length === 0)).toBe(true);
  expect(m.mandalaOutline(depth1).map((e) => e.position)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  // 導出枠は親と同一 id
  const slots = m.mandalaGridSlots(all, p1.id);
  expect(slots[4].derived).toBe(true);
  expect(slots[4].derivedCell?.id).toBe(p1.id);
  expect(slots[4].derivedTitle).toBe('T1');
  expect(m.mandalaGridSlots(all)[4].derivedCell).toBeNull();
  // 集計（決定的・空の子は数えない）
  const links = [{ id: 1, cell_id: kids5[0].id, scope: 'episode', item_key: 'e', created_at: '' }, { id: 2, cell_id: kids5[1].id, scope: 'episode', item_key: 'e', created_at: '' }];
  expect(m.expansionSummary(all, links)).toEqual({ expandedBlocks: 2, childFilled: 3 + 4, childWithPrimary: 1 });
  expect(m.expansionSummary([...all].reverse(), links)).toEqual(m.expansionSummary(all, links));
  expect(m.expansionSummary(depth1, [])).toEqual({ expandedBlocks: 0, childFilled: 0, childWithPrimary: 0 });
  expect(m.MANDALA_CHILD_TOTAL).toBe(64);
  expect(m.isBlockExpanded(all, p1.id)).toBe(true);
  expect(m.isBlockExpanded(all, depth1[0].id)).toBe(false);
  // ラベル
  expect(m.cellPathLabel(kids1[0], all)).toBe('上 › 右下');
  expect(m.cellPathLabel(depth1[0], all)).toBe('左上');
  // 削除確認文
  expect(m.mandalaDeleteConfirmMessage('t', 3, 1, 16)).toContain('子マス（81マス）: 16件');
  expect(m.mandalaDeleteConfirmMessage('t', 3, 1)).not.toContain('子マス');
  // 切替
  expect(m.parseMandalaView('81')).toBe('81');
  expect(m.parseMandalaView('x')).toBe('9');
  // ソース固定: 展開は1文・position 4 を除く・NOT EXISTS・23505 は作成済み扱い。新ルートを作らず既存ルートの POST
  const server = readFileSync(join(__dirname, '../../src/lib/mandala-server.ts'), 'utf8');
  expect(server).toContain('FROM generate_series(0, 8) AS p');
  expect(server).toContain('WHERE p <> ${MANDALA_CENTER}');
  expect(server).toContain('AND NOT EXISTS (SELECT 1 FROM mandala_cells e WHERE e.parent_cell_id = ${parentCellId}::uuid)');
  expect(server).toContain("?.code !== '23505') throw e");
  expect(server.match(/CREATE TABLE IF NOT EXISTS/g)?.length, 'スキーマ変更なし').toBe(3);
  const route = readFileSync(join(__dirname, '../../src/app/api/mandala/[id]/route.ts'), 'utf8');
  expect(route).toContain("if (body?.action !== 'expand')");
  // 9マスの描画経路は不変（density 省略＝normal）
  const pageSrc = readFileSync(join(__dirname, '../../src/app/dashboard/mandala/[id]/page.tsx'), 'utf8');
  expect(pageSrc).toContain("view === '81' ? (");
  const nineBlock = pageSrc.slice(pageSrc.indexOf('// 9マス表示は 301 の描画経路そのまま'), pageSrc.indexOf('{popover.layer}'));
  expect(nineBlock).not.toContain('density=');
  const grid = readFileSync(join(__dirname, '../../src/components/mandala/MandalaGrid.tsx'), 'utf8');
  expect(grid).toContain("density = 'normal'");
  // 81 の描画順はアウトライン関数から（入れ子）
  const eightyOne = readFileSync(join(__dirname, '../../src/components/mandala/Mandala81.tsx'), 'utf8');
  expect(eightyOne).toContain('mandalaOutlineNested(cells)');
  expect(eightyOne).not.toMatch(/\btitle=/);
});

test('U76: ホームの保存形式（306）— 旧形式（href配列・書き込み側 JSON.stringify の形）を1つも欠けず順序不変で読む・新形式（区切りオブジェクト）を往復できる・合流は区切りを跨いで既定位置に入り項目だけなら mergeHomeHrefs と一致（R-88）・resolveHomeHrefs は従来と同値・読み込みは不正で何も返さず理由・区切り名は12文字・サイドバーに登録（addedAt）', async () => {
  const ni = await import('../../src/lib/nav-items');
  // 旧形式: 書き込み側（旧 EditableHome の save＝JSON.stringify(hrefs)）の形をそのまま写す
  const legacy = JSON.stringify(['/dashboard/deepresearch', '/dashboard', '/nope', '/dashboard/text-analysis']);
  const parsed = ni.parseHomeLayout(legacy)!;
  expect(parsed).toEqual([{ kind: 'item', href: '/dashboard/deepresearch' }, { kind: 'item', href: '/dashboard' }, { kind: 'item', href: '/dashboard/text-analysis' }]);
  expect(ni.homeHrefsOf(parsed)).toEqual(['/dashboard/deepresearch', '/dashboard', '/dashboard/text-analysis']);
  // 新形式: 区切りオブジェクト。往復で同じ
  const withDiv: import('../../src/lib/nav-items').HomeEntry[] = [
    { kind: 'item', href: '/dashboard' },
    { kind: 'divider', id: 'div-a', label: '研究' },
    { kind: 'item', href: '/dashboard/mandala' },
  ];
  const serialized = ni.serializeHomeLayout(withDiv);
  expect(JSON.parse(serialized)).toEqual(['/dashboard', { type: 'divider', id: 'div-a', label: '研究' }, '/dashboard/mandala']);
  expect(ni.parseHomeLayout(serialized)).toEqual(withDiv);
  // id 無しの区切りは位置から補う・ラベルは12文字に切る・壊れた値は null
  expect(ni.parseHomeLayout(JSON.stringify([{ type: 'divider', label: 'あ'.repeat(20) }]))).toEqual([{ kind: 'divider', id: 'div-0', label: 'あ'.repeat(12) }]);
  expect(ni.parseHomeLayout('broken')).toBeNull();
  expect(ni.parseHomeLayout('{"a":1}')).toBeNull();
  // 合流は区切りを跨いで既定位置（定義順で直前にある保存済み項目の行の直後）
  const merged = ni.mergeHomeLayout(
    [{ kind: 'item', href: '/dashboard' }, { kind: 'divider', id: 'd', label: 'x' }, { kind: 'item', href: '/dashboard/saved' }, { kind: 'item', href: '/dashboard/text-analysis' }],
    ['/dashboard/guide'],
  );
  expect(merged.map((e) => (e.kind === 'item' ? e.href : `div:${e.id}`))).toEqual([
    '/dashboard', '/dashboard/orchestrator', '/dashboard/automation-strategy', 'div:d', '/dashboard/saved', '/dashboard/memo', '/dashboard/text-analysis',
  ]);
  // 項目だけなら 303 の mergeHomeHrefs と一致（第1階層の結果は不変・R-88）
  const itemsOnly = ['/dashboard/deepresearch', '/dashboard', '/dashboard/text-analysis'];
  expect(ni.homeHrefsOf(ni.mergeHomeLayout(itemsOnly.map((href) => ({ kind: 'item', href })), ['/dashboard/guide']))).toEqual(ni.mergeHomeHrefs(itemsOnly, ['/dashboard/guide']));
  expect(ni.resolveHomeHrefs(JSON.stringify(itemsOnly), JSON.stringify(['/dashboard/guide']))).toEqual(ni.mergeHomeHrefs(itemsOnly, ['/dashboard/guide']));
  // 項目が無い保存値（区切りだけ）は既定に倒す
  expect(ni.resolveHomeLayout(JSON.stringify([{ type: 'divider', label: 'x' }]))).toEqual(ni.DEFAULT_HOME_HREFS.map((href) => ({ kind: 'item', href })));
  // 読み込み: 不正は ok:false＋理由（何も返さない）。実在しない経路は落として件数
  expect(ni.importHomeLayout('not json')).toMatchObject({ ok: false });
  expect(ni.importHomeLayout('{"version":1}')).toMatchObject({ ok: false });
  expect(ni.importHomeLayout(JSON.stringify({ version: 1, items: ['/nope'], removed: [] }))).toMatchObject({ ok: false });
  const imp = ni.importHomeLayout(ni.exportHomeLayout(withDiv, ['/dashboard/guide']));
  expect(imp).toMatchObject({ ok: true, removed: ['/dashboard/guide'], dropped: 0 });
  if (imp.ok) expect(imp.entries).toEqual(withDiv);
  const imp2 = ni.importHomeLayout(JSON.stringify({ version: 1, items: ['/dashboard', '/nope'], removed: ['/nope'] }));
  expect(imp2).toMatchObject({ ok: true, dropped: 1, removed: [] });
  expect(ni.HOME_DIVIDER_LABEL_MAX).toBe(12);
  expect(ni.normalizeDividerLabel(' a\nb ')).toBe('a b');
  // R-84: 登録と addedAt
  const item = ni.ALL_NAV_ITEMS.find((i) => i.href === '/dashboard/settings/menu');
  expect(item?.label).toBe('ホーム編集');
  expect(item?.addedAt).toBe('2026-09-09');
  // サイドバーからインライン編集の DnD が消え、編集は専用ページへのリンク
  const sidebar = readFileSync(join(__dirname, '../../src/components/DashboardSidebar.tsx'), 'utf8');
  expect(sidebar).not.toContain("from '@dnd-kit/core'");
  expect(sidebar).toContain('href="/dashboard/settings/menu"');
  expect(sidebar).toContain('data-nav-divider={e.id}');
  // 専用ページは既存の @dnd-kit/core を流用（新依存なし）
  const pageSrc = readFileSync(join(__dirname, '../../src/app/dashboard/settings/menu/page.tsx'), 'utf8');
  expect(pageSrc).toContain("from '@dnd-kit/core'");
  expect(pageSrc).toContain("from '@/lib/nav-search'");
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { dependencies: Record<string, string> };
  expect(Object.keys(pkg.dependencies).filter((k) => k.startsWith('@dnd-kit/')).sort()).toEqual(['@dnd-kit/core', '@dnd-kit/modifiers']);
});

test('U77: マンダラ→Kindle目次（307）— 8マス＋子ありが章8・節（親ごと最大8）に mandalaOutlineNested と同順で変換される・空のマスは除外され件数が返る・未展開の親は章のみ・章0は拒否理由・著者メモはマスの本文と完全一致（整形なし）・削除済みリンクは紐づかず件数・🧠と type 不適合は参照のみ・上限超過は参照のみに回し件数・同じ入力→同じ出力（プレビュー＝保存・R-74）・出どころ記録の検証は fail-closed・並べ替え後の cellIds 再構築・純関数は DB 非依存（R-108／R-111）・create は CTE 1文と nonce 遮断（R-87）・ウィザードの既定は素材（R-88）', async () => {
  const m = mandalaShared;
  const k = mandalaKindle;
  type Cell = import('../../src/lib/mandala-shared').MandalaCell;
  type Link = import('../../src/lib/mandala-shared').MandalaLinkResolved;
  const mk = (position: number, depth: 1 | 2 = 1, parent: string | null = null, title = '', body = ''): Cell => ({ id: `c${depth}-${parent ?? 'r'}-${position}`, chart_id: 'ch', parent_cell_id: parent, depth, position, title, body, meta: {}, created_at: '', updated_at: '' });
  const link = (id: number, cell: Cell, scope: string, item_key: string, exists = true, title = `L${id}`, char_count = 100): Link => ({ id, cell_id: cell.id, scope, item_key, created_at: '', note: '', title: exists ? title : null, exists, char_count: exists ? char_count : null, item_created_at: null });

  // ① フル構成: 中央＋周囲8（すべて埋まる）＋親1に子8・親5に子3（1つ空）。順序はアウトライン関数のまま
  const center = mk(4, 1, null, 'テーマ', '');
  const depth1 = [0, 1, 2, 3, 5, 6, 7, 8].map((p) => mk(p, 1, null, `章${p}`, `本文${p}\n\n- 箇条書き **強調**`));
  const p1 = depth1[1];
  const p5 = depth1[4];
  const kids1 = [0, 1, 2, 3, 5, 6, 7, 8].map((p) => mk(p, 2, p1.id, `節1-${p}`, `節本文1-${p}`));
  const kids5 = [mk(0, 2, p5.id, '節5-0', ''), mk(1, 2, p5.id, '', ''), mk(8, 2, p5.id, '', '節本文5-8')];
  const all = [...kids5, ...depth1, center, ...kids1].reverse();
  const nested = m.mandalaOutlineNested(all);
  const r = k.mandalaToKindleOutline(center, nested, []);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  expect(r.bookTitle).toBe('テーマ');
  expect(r.untitledTheme).toBe(false);
  expect(r.chapters.map((c) => c.position), '章の順＝アウトライン順').toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  expect(r.chapters.map((c) => c.chapter_num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(r.chapters[1].sections.map((s) => s.position), '節の順＝子の固定順').toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  expect(r.chapters[1].sections.length).toBe(k.MANDALA_KINDLE_SECTION_MAX);
  expect(r.chapters[4].sections.map((s) => s.position), '空の子（1）は除外').toEqual([0, 8]);
  expect(r.chapters[0].sections, '未展開の親は章のみ・節なし').toEqual([]);
  expect(r.counts).toMatchObject({ chapters: 8, sections: 10, excludedEmpty: 1, missingLinks: 0, materials: 0, referenceOnly: 0 });
  // 著者メモ＝本文と完全一致（Markdown のまま）。節も参照も無い章は summary も本文と完全一致
  for (const c of r.chapters) expect(c.memo).toBe(all.find((x) => x.id === c.cellId)!.body);
  expect(r.chapters[0].summary).toBe(depth1[0].body);
  // 節のある章は memo が先頭にそのまま・節は「### 」＋本文
  expect(r.chapters[1].summary.startsWith(p1.body)).toBe(true);
  expect(r.chapters[1].summary).toContain('### 節1-0\n\n節本文1-0');
  expect(r.chapters[1].sections[0].memo).toBe('節本文1-0');
  expect(r.cellIds.chapter['2']).toBe(p1.id);
  expect(r.cellIds.section['2']).toEqual(kids1.map((c) => c.id));
  expect(r.cellIds.section['1']).toEqual([]);

  // ② 空のマスの除外と件数・未展開・章0の拒否・中央が空
  const sparse = [mk(4), mk(0, 1, null, '', ''), mk(1, 1, null, '', ''), mk(2, 1, null, 'だけ'), mk(3, 1, null, '', '本文だけ'), mk(5), mk(6), mk(7), mk(8), mk(0, 2, 'c1-r-0', '', '')];
  const r2 = k.mandalaToKindleOutline(m.centerCell(sparse), m.mandalaOutlineNested(sparse), []);
  expect(r2.ok).toBe(true);
  if (!r2.ok) throw new Error('unreachable');
  expect(r2.untitledTheme, '中央が空なら（無題）で進みその旨を返す').toBe(true);
  expect(r2.bookTitle).toBe(m.MANDALA_UNTITLED);
  expect(r2.chapters.map((c) => c.position)).toEqual([2, 3]);
  expect(r2.counts.excludedEmpty, '空の親6＋空の親の子1').toBe(7);
  // includeEmpty: 空も含める（8章・空の親の子も節に）
  const r2b = k.mandalaToKindleOutline(m.centerCell(sparse), m.mandalaOutlineNested(sparse), [], { includeEmpty: true });
  expect(r2b.ok && r2b.chapters.length).toBe(8);
  expect(r2b.ok && r2b.chapters[0].sections.length).toBe(1);
  expect(r2b.ok && r2b.counts.excludedEmpty).toBe(0);
  const empty = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => mk(p));
  const r3 = k.mandalaToKindleOutline(m.centerCell(empty), m.mandalaOutlineNested(empty), []);
  expect(r3.ok).toBe(false);
  expect(!r3.ok && r3.reason).toBe(k.MANDALA_KINDLE_REJECT_NO_CHAPTERS);
  expect(r3.counts.chapters).toBe(0);

  // ③ リンク: 4種＋削除済み。既定の判定は scope だけ（context は参照のみ）。削除済みは紐づかず件数
  const links: Link[] = [
    link(1, depth1[0], 'library', 'aaaaaaaa-0000-4000-8000-000000000001', true, '資料A', 1000),
    link(2, depth1[0], 'text_analysis', '12', true, '分析B', 2000),
    link(3, depth1[0], 'context', '7', true, '参照C', 300),
    link(4, depth1[0], 'episode', '5', true, '記録D', 400),
    link(5, depth1[0], 'library', 'aaaaaaaa-0000-4000-8000-000000000002', false),
    link(6, kids1[0], 'episode', '9', true, '記録E', 50),
    link(7, depth1[2], 'episode', '5', true, '記録D', 400), // 別の章で同じ素材＝重複させない
  ];
  const r4 = k.mandalaToKindleOutline(center, nested, links);
  expect(r4.ok).toBe(true);
  if (!r4.ok) throw new Error('unreachable');
  expect(r4.chapters[0].refs.map((x) => x.kind)).toEqual(['material', 'material', 'reference', 'material', 'missing']);
  expect(r4.chapters[0].source_ids, 'scope+item_key をそのまま素材キーへ（ana-N／ep-N）').toEqual(['aaaaaaaa-0000-4000-8000-000000000001', 'ana-12', 'ep-5']);
  expect(r4.chapters[1].source_ids, '節の素材は章に集まる').toEqual(['ep-9']);
  expect(r4.chapters[2].source_ids).toEqual(['ep-5']);
  expect(r4.sourceIds).toEqual(['aaaaaaaa-0000-4000-8000-000000000001', 'ana-12', 'ep-5', 'ep-9']);
  expect(r4.counts).toMatchObject({ missingLinks: 1, materials: 4, materialEpisodes: 2, referenceOnly: 1, materialOverflow: 0 });
  expect(r4.chapters[0].summary, '参照一覧は末尾・削除済みは載せない').toContain('- 素材: 参照C（🧠 AI参照素材）（参照のみ）');
  expect(r4.chapters[0].summary).toContain('- 体験: 記録D（📔 エピソード記録）');
  expect(r4.chapters[0].summary).not.toContain('000000000002');
  expect(r4.chapters[0].summary.startsWith(depth1[0].body)).toBe(true);
  // サーバの判定（type 不適合）を差し込める: library を不適合にすると参照のみ
  const r4b = k.mandalaToKindleOutline(center, nested, links, { materialKeyOf: (l) => (l.scope === 'library' ? null : k.defaultMaterialKeyOf(l)) });
  expect(r4b.ok && r4b.counts.referenceOnly).toBe(2);
  expect(r4b.ok && r4b.sourceIds).toEqual(['ana-12', 'ep-5', 'ep-9']);
  // 上限（件数・字数）を超えた分は参照のみに回し件数で出す（黙って落とさない・R-101）
  const r4c = k.mandalaToKindleOutline(center, nested, links, { materialLimit: 2 });
  expect(r4c.ok && r4c.sourceIds).toEqual(['aaaaaaaa-0000-4000-8000-000000000001', 'ana-12']);
  // 参照のみはリンクごとに数える（同じ ep-5 が2章で溢れれば2件）。素材は本全体で重複なし
  expect(r4c.ok && r4c.counts).toMatchObject({ materials: 2, referenceOnly: 4, materialOverflow: 3 });
  const r4d = k.mandalaToKindleOutline(center, nested, links, { materialCharLimit: 3000 });
  expect(r4d.ok && r4d.sourceIds).toEqual(['aaaaaaaa-0000-4000-8000-000000000001', 'ana-12']);
  // ④ 同じ入力→同じ出力（プレビューと保存が同じ関数を通る前提）
  expect(JSON.stringify(k.mandalaToKindleOutline(center, nested, links))).toBe(JSON.stringify(r4));
  expect(JSON.stringify(k.mandalaToKindleOutline(center, m.mandalaOutlineNested([...all].reverse()), [...links].reverse()))).toBe(JSON.stringify(r4));
  // 件数行: 0件の行は出さない
  expect(k.mandalaKindleCountLines(r.counts).map((l) => l.key)).toEqual(['chapters', 'excludedEmpty', 'materials']);
  expect(k.mandalaKindleCountLines(r4.counts).map((l) => l.key)).toEqual(['chapters', 'excludedEmpty', 'missingLinks', 'materials', 'referenceOnly']);

  // ⑤ 出どころ記録（方式1）: 検証は fail-closed・並べ替え後の再構築・文言
  const u = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const rec = { source: 'mandala', chartId: u(170), chartTitle: 'テーマ', cellIds: { chapter: { '1': u(1), '2': u(2) }, section: { '1': [], '2': [u(21), u(22)] } }, importedAt: '2026-09-09T01:02:03.000Z', nonce: 'mk-abcdef12' };
  expect(k.validateMandalaBookSource(rec)?.chartId).toBe(rec.chartId);
  expect(k.validateMandalaBookSource({ ...rec, nonce: '' })).toBeNull();
  expect(k.validateMandalaBookSource({ ...rec, chartId: 'x' })).toBeNull();
  expect(k.validateMandalaBookSource({ ...rec, importedAt: 'not-a-date' })).toBeNull();
  expect(k.validateMandalaBookSource({ ...rec, source: 'other' })).toBeNull();
  expect(k.parseMandalaBookSource({ mandala: rec })?.cellIds).toEqual(rec.cellIds);
  expect(k.parseMandalaBookSource({ mandala: { ...rec, cellIds: { chapter: { '1': 'bad' } } } })?.cellIds.chapter, '不正な id は落とす').toEqual({});
  expect(k.parseMandalaBookSource({})).toBeNull();
  expect(k.parseMandalaBookSource(null)).toBeNull();
  const rebuilt = k.rebuildMandalaCellIds([
    { chapter_num: 1, mandala_cell_id: p1.id, mandala_section_cell_ids: kids1.map((c) => c.id) },
    { chapter_num: 2, mandala_cell_id: depth1[0].id, mandala_section_cell_ids: [] },
    { chapter_num: 3 },
  ]);
  expect(rebuilt.chapter).toEqual({ '1': p1.id, '2': depth1[0].id });
  expect(rebuilt.section['1'].length).toBe(8);
  expect(k.mandalaOriginLabel({ chartTitle: '' }, '2026/09/09 10:02')).toBe('マンダラ『（無題）』から起こした（2026/09/09 10:02）');
  expect(k.mandalaBooksLabel(2)).toBe('📕 起こした本: 2件');

  // ⑥ ソース固定（構文ごと・R-111）: 純関数は DB 非依存／create は CTE 1文＋nonce 遮断／ウィザードの既定は素材／入口2箇所
  const lib = readFileSync(join(__dirname, '../../src/lib/mandala-kindle.ts'), 'utf8');
  expect(lib).not.toMatch(/from '@\/lib\/db'/);
  expect(lib).not.toMatch(/from '@neondatabase\/serverless'/);
  expect(lib).not.toMatch(/from '@\/lib\/mandala-server'/);
  expect(lib).not.toMatch(/from '@\/lib\/kindle-materials'/);
  const create = readFileSync(join(__dirname, '../../src/app/api/kindle/wizard/create/route.ts'), 'utf8');
  expect(create).toMatch(/WITH b AS \(\s*INSERT INTO kindle_books/);
  expect(create).toMatch(/INSERT INTO kindle_chapters \(book_id, chapter_number, title, summary, target_word_count, status\)\s*SELECT b\.id/);
  expect(create).toMatch(/book_meta->'mandala'->>'nonce' = \$\{mandala\.nonce\}/);
  expect(create).toMatch(/validateMandalaBookSource\(body\.mandala\)/);
  expect(create).not.toMatch(/DELETE FROM kindle_books WHERE id = \$\{bookId\}/);
  const preview = readFileSync(join(__dirname, '../../src/app/api/mandala/[id]/kindle/route.ts'), 'utf8');
  expect(preview).toMatch(/mandalaToKindleOutline\(centerCell\(chart\.cells\), mandalaOutlineNested\(chart\.cells\), links/);
  expect(preview).toMatch(/fetchKindleMaterials\(guard\.userId/);
  const wizard = readFileSync(join(__dirname, '../../src/app/dashboard/kindle-wizard/page.tsx'), 'utf8');
  expect(wizard).toMatch(/useState<KindleInputMode>\('materials'\)/);
  expect(wizard).toMatch(/data-kw-input-mode=\{m\.key\}/);
  expect(wizard).toMatch(/proceedFromMandala/);
  expect(wizard, '保存はプレビューの chapters をそのまま（別の変換を持たない）').toMatch(/chapters: res\.chapters\.map\(\(c\) => \(\{\s*chapter_num: c\.chapter_num,\s*title: c\.title,\s*summary: c\.summary,/);
  expect(wizard).toMatch(/const creatingRef = useRef\(false\)/);
  const chartPage = readFileSync(join(__dirname, '../../src/app/dashboard/mandala/[id]/page.tsx'), 'utf8');
  expect(chartPage).toMatch(/href=\{`\/dashboard\/kindle-wizard\?mandala=\$\{encodeURIComponent\(id\)\}`\}/);
  expect(chartPage).toMatch(/data-mandala-books=\{books\.length\}/);
  const server = readFileSync(join(__dirname, '../../src/lib/mandala-server.ts'), 'utf8');
  expect(server, '起こした本は本の側の記録から導出（mandala_charts.meta に書かない・R-107）').toMatch(/FROM kindle_books\s*WHERE user_id = \$\{userId\}\s*AND book_meta->'mandala'->>'source' = 'mandala'/);
  // 316: チャート meta の書き換えは updateChartMeta（キー単位マージ・R-113）の1箇所だけ。Kindle の経路（307）は書かない（R-107）
  expect(server.match(/UPDATE mandala_charts SET meta/g)?.length ?? 0, 'チャート meta の UPDATE は updateChartMeta の1箇所').toBe(1);
  expect(server).toMatch(/UPDATE mandala_charts SET meta = \(COALESCE\(meta, '\{\}'::jsonb\) - \$\{remove\}::text\[\]\) \|\| \$\{JSON\.stringify\(set\)\}::jsonb/);
  const kindleRoute = readFileSync(join(__dirname, '../../src/app/api/mandala/[id]/kindle/route.ts'), 'utf8');
  expect(kindleRoute).not.toContain('updateChartMeta');
  const kindleCreate = readFileSync(join(__dirname, '../../src/app/api/kindle/wizard/create/route.ts'), 'utf8');
  expect(kindleCreate).not.toContain('updateChartMeta');
});

test('U78: マンダラ 有料note記事の型・反応記録・無料比率（308）— プリセット定義は1箇所で周囲8のタイトルと tier が定義どおり・中央は空・KB ID のコメント・反応の入力検証（非負整数・100字・全部空＝null・不正は理由）・購入率は purchases÷views で views 未記録なら null（保存しない・R-74）・同一内容の判定（R-87）・反応記録 n/m は埋まったマスだけ・無料比率は中央を除き子マスは親の区分・両方0なら null・meta が空なら区分/反応/比率が何も出ない（§7）・meta はキー単位マージ（`meta - keys || patch`・丸ごと置換なし）・作成の既定は body なし・Kindle 目次は meta を読まない（U77 不変）', async () => {
  const m = mandalaShared;
  const pr = mandalaPresets;
  type Cell = import('../../src/lib/mandala-shared').MandalaCell;
  const mk = (position: number, depth: 1 | 2 = 1, parent: string | null = null, title = '', body = '', meta: Record<string, unknown> = {}): Cell => ({ id: `c${depth}-${parent ?? 'r'}-${position}`, chart_id: 'ch', parent_cell_id: parent, depth, position, title, body, meta, created_at: '', updated_at: '' });

  // ① プリセット定義（§2-1）
  expect(pr.MANDALA_PRESET_KEYS).toEqual(['paid_note']);
  expect(pr.isMandalaPresetKey('paid_note')).toBe(true);
  expect(pr.isMandalaPresetKey('other')).toBe(false);
  const rows = pr.presetCellRows('paid_note');
  expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(rows[4], '中央は空・meta なし').toEqual({ position: 4, title: '', meta: {} });
  expect(rows.filter((r) => r.meta.tier === 'free').map((r) => r.position)).toEqual([0, 1, 2, 3, 5]);
  expect(rows.filter((r) => r.meta.tier === 'paid').map((r) => r.position)).toEqual([6, 7, 8]);
  expect(rows[0].title).toContain('導入');
  expect(rows[5].title).toContain('CTA');
  expect(rows[6].title).toContain('手順');
  expect(rows[7].title).toContain('テンプレート');
  expect(rows[8].title).toContain('結び');
  expect(rows.every((r) => r.position === 4 || r.title.trim() !== '')).toBe(true);
  const presetSrc = readFileSync(join(__dirname, '../../src/lib/mandala-presets.ts'), 'utf8');
  for (const id of ['N-06', 'N-07', 'N-08', 'N-09']) expect(presetSrc, `KB ${id} のコメント`).toContain(id);
  expect(presetSrc).not.toMatch(/from '@\/lib\/db'/);
  expect(presetSrc).not.toMatch(/from '@\/lib\/mandala-server'/);
  expect(m.MANDALA_TIER_LABELS).toEqual({ free: '無料', paid: '有料' });
  expect(m.cellTier(mk(0, 1, null, '', '', { tier: 'paid' }))).toBe('paid');
  expect(m.cellTier(mk(0, 1, null, '', '', { tier: 'x' }))).toBeNull();
  expect(m.cellTier(mk(0))).toBeNull();
  expect(m.chartPreset({ preset: 'paid_note' })).toBe('paid_note');
  expect(m.chartPreset({})).toBeNull();

  // ② 反応の入力検証（§3-1・§3-2）
  expect(m.normalizeReactionInput({ views: 120, likes: '8', shares: '', purchases: 3, memo: ' 一言 ' })).toEqual({ ok: true, reaction: { views: 120, likes: 8, purchases: 3, memo: '一言' } });
  expect(m.normalizeReactionInput({ views: '', likes: null, memo: '' })).toEqual({ ok: true, reaction: null });
  expect(m.normalizeReactionInput({})).toEqual({ ok: true, reaction: null });
  expect(m.normalizeReactionInput(null)).toEqual({ ok: true, reaction: null });
  expect(m.normalizeReactionInput({ views: -1 })).toMatchObject({ ok: false });
  expect(m.normalizeReactionInput({ views: 1.5 })).toMatchObject({ ok: false });
  expect(m.normalizeReactionInput({ likes: 'abc' })).toMatchObject({ ok: false });
  expect(m.normalizeReactionInput({ memo: 'あ'.repeat(101) })).toMatchObject({ ok: false });
  expect(m.normalizeReactionInput({ memo: 'あ'.repeat(100) })).toMatchObject({ ok: true, reaction: { memo: 'あ'.repeat(100) } });
  expect(m.normalizeReactionInput({ memo: 5 })).toMatchObject({ ok: false });
  // 読み出しは fail-closed（形が崩れていれば null・非負整数だけ拾う）
  expect(m.parseReaction({ reaction: { views: 10, likes: -2, memo: '', recordedAt: '2026-09-09T00:00:00.000Z' } })).toEqual({ views: 10, recordedAt: '2026-09-09T00:00:00.000Z' });
  expect(m.parseReaction({ reaction: { recordedAt: 'x' } })).toBeNull();
  expect(m.parseReaction({})).toBeNull();
  expect(m.parseReaction({ reaction: 'x' })).toBeNull();
  // 購入率（導出のみ）
  expect(m.purchaseRate({ views: 200, purchases: 25 })).toBe(0.125);
  expect(m.purchaseRate({ views: 0, purchases: 1 })).toBeNull();
  expect(m.purchaseRate({ purchases: 1 })).toBeNull();
  expect(m.purchaseRate({ views: 10 })).toBeNull();
  expect(m.formatRate(0.125)).toBe('12.5%');
  expect(m.formatRate(2 / 3)).toBe('66.7%');
  // 同一内容（記録日時を除く）
  expect(m.isSameReaction({ views: 1, memo: 'a' }, { views: 1, memo: 'a' })).toBe(true);
  expect(m.isSameReaction({ views: 1 }, { views: 2 })).toBe(false);
  expect(m.isSameReaction(null, null)).toBe(true);
  expect(m.isSameReaction(null, { views: 1 })).toBe(false);

  // ③ 反応記録 n/m（埋まった第1階層だけ・決定的）
  const filledWith = mk(0, 1, null, 'a', '', { reaction: { views: 1, recordedAt: 'z' } });
  const emptyWith = mk(1, 1, null, '', '', { reaction: { views: 1, recordedAt: 'z' } });
  const filledNo = mk(2, 1, null, 'b');
  const childWith = mk(0, 2, filledWith.id, 'k', '', { reaction: { views: 1, recordedAt: 'z' } });
  expect(m.reactionSummary([childWith, filledNo, emptyWith, filledWith])).toEqual({ withReaction: 1, filled: 2 });
  expect(m.reactionSummary([filledWith, emptyWith, filledNo, childWith])).toEqual({ withReaction: 1, filled: 2 });
  expect(m.hasReaction(emptyWith)).toBe(true);
  expect(m.hasReaction(filledNo)).toBe(false);

  // ④ 無料比率（中央を除く・子マスは親の区分・両方0なら null）
  const center = mk(4, 1, null, 'T', 'x'.repeat(999));
  const f0 = mk(0, 1, null, 'a', 'x'.repeat(300), { tier: 'free' });
  const f1 = mk(1, 1, null, 'b', 'x'.repeat(100), { tier: 'free' });
  const p6 = mk(6, 1, null, 'c', 'x'.repeat(300), { tier: 'paid' });
  const none = mk(2, 1, null, 'd', 'x'.repeat(5000));
  const kidF = mk(0, 2, f0.id, 'k', 'x'.repeat(200));
  const kidP = mk(0, 2, p6.id, 'k', 'x'.repeat(100));
  const r = m.freeRatio([kidP, center, none, p6, f1, f0, kidF]);
  expect(r).toEqual({ freeChars: 600, paidChars: 400, ratio: 0.6 });
  expect(m.freeRatio([center, f0, f1, p6, none, kidF, kidP])).toEqual(r);
  expect(m.freeRatio([mk(0, 1, null, 'a', '', { tier: 'free' }), mk(6, 1, null, 'b', '', { tier: 'paid' })]).ratio).toBeNull();
  expect(m.freeRatioLabel(0.6)).toBe('無料 60%（目安 60〜70%）');
  expect(m.shouldShowFreeRatio({ preset: 'paid_note' }, [])).toBe(true);
  expect(m.shouldShowFreeRatio({}, [f0])).toBe(true);
  // §7: meta が空の既存チャートでは何も増えない
  const plain = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => mk(p, 1, null, `t${p}`, 'body'));
  expect(m.shouldShowFreeRatio({}, plain)).toBe(false);
  expect(m.reactionSummary(plain)).toEqual({ withReaction: 0, filled: 9 });
  expect(plain.every((c) => m.cellTier(c) === null && !m.hasReaction(c))).toBe(true);

  // ⑤ ソース固定（構文ごと・R-111）: meta はキー単位マージ・丸ごと置換なし・作成は preset のときだけ別文・既定は不変
  const server = readFileSync(join(__dirname, '../../src/lib/mandala-server.ts'), 'utf8');
  expect(server).toMatch(/SET meta = \(meta - \$\{remove\}::text\[\]\) \|\| \$\{JSON\.stringify\(set\)\}::jsonb/);
  expect(server).not.toMatch(/SET meta = \$\{JSON\.stringify\([a-zA-Z.]+\)\}::jsonb/);
  expect(server).toMatch(/INSERT INTO mandala_cells \(chart_id, user_id, depth, position\)\s*SELECT c\.id, \$\{userId\}, 1, p FROM c, generate_series\(0, 8\) AS p/);
  expect(server).toMatch(/INSERT INTO mandala_cells \(chart_id, user_id, depth, position, title, meta\)/);
  expect(server.match(/CREATE TABLE IF NOT EXISTS/g)?.length, 'スキーマ変更なし').toBe(3);
  expect(server).not.toMatch(/ALTER TABLE/);
  const route = readFileSync(join(__dirname, '../../src/app/api/mandala/cells/route.ts'), 'utf8');
  // 312: note 側は x を除いた入力を、X 側は reaction.x を、それぞれの検証関数へ（グループ単位）
  expect(route).toMatch(/normalizeReactionInput\(noteRaw\)/);
  expect(route).toMatch(/normalizeReactionXInput\(\(raw\.x \?\? null\)/);
  expect(route).toMatch(/isMandalaTier\(body\.tier\)/);
  const listPage = readFileSync(join(__dirname, '../../src/app/dashboard/mandala/page.tsx'), 'utf8');
  expect(listPage).toMatch(/useState<'' \| MandalaPresetKey>\(''\)/);
  expect(listPage).toMatch(/: \{ method: 'POST' \}/);
  const editor = readFileSync(join(__dirname, '../../src/components/mandala/MandalaCellEditor.tsx'), 'utf8');
  const reactionBlock = editor.slice(editor.indexOf('<details'), editor.indexOf('</details>'));
  expect(reactionBlock, '反応欄の入力に ⌘+Enter（onEditorKeyDown）を付けない').not.toContain('onEditorKeyDown');
  // Kindle 目次は meta を読まない（U77 の入力形＝MandalaOutlineNode/リンク。meta の語が変換関数に無い）
  const kindle = readFileSync(join(__dirname, '../../src/lib/mandala-kindle.ts'), 'utf8');
  expect(kindle).not.toMatch(/\.meta\b/);
});

test('U79: マンダラ→note記事（309）— 1文1行の整形は句点「。」「！」「？」の直後で改行し、見出し・箇条書き・引用・括弧内・URL・コードは分割せず、段落の空行を保ち、冪等（整形済みを通しても不変）・検査関数が同じ規則・無料（1マス）はタイトル・本文・素材・子マスが目次順で本文空なら拒否理由・有料（全体）は tier で無料／有料に分かれ有料ラインは最初の paid の直前で tier 無しは無料扱い・空マスの除外と削除済みリンクの件数・出どころに chartId/cellIds/mode・プレビューと投入が同じ出力・有料ラインの目印の補正・出どころの読み出しは fail-closed・①の構造規約に1文1行が入り samples/full の両方を整形する（ソース固定・R-111）', async () => {
  const nf = noteFormat;
  const mn = mandalaNote;
  const m = mandalaShared;
  // ① 整形
  const src = '## 見出し。ここは分割しない\n\n朝は乾燥します。だから保湿します！本当ですか？はい。\n「そうですか。なるほど」と答えた。次の文。\n- 箇条書き。分割しない。\n> 引用。分割しない。\nhttps://example.com/a.b?c=d。分割しない。\n\n```\nコード。分割しない。\n```\n最後の文（補足。ここも）です。';
  const out = nf.formatOneSentencePerLine(src);
  expect(out.split('\n')).toEqual([
    '## 見出し。ここは分割しない',
    '',
    '朝は乾燥します。',
    'だから保湿します！',
    '本当ですか？',
    'はい。',
    '「そうですか。なるほど」と答えた。',
    '次の文。',
    '- 箇条書き。分割しない。',
    '> 引用。分割しない。',
    'https://example.com/a.b?c=d。分割しない。',
    '',
    '```',
    'コード。分割しない。',
    '```',
    '最後の文（補足。ここも）です。',
  ]);
  expect(nf.formatOneSentencePerLine(out), '冪等').toBe(out);
  expect(nf.formatOneSentencePerLine('')).toBe('');
  expect(nf.formatOneSentencePerLine('文末に閉じ括弧。」続き。')).toBe('文末に閉じ括弧。」\n続き。');
  expect(nf.formatOneSentencePerLine('強調です。**次**。')).toBe('強調です。\n**次**。');
  expect(nf.formatOneSentencePerLine('**太字で終わる。**次。')).toBe('**太字で終わる。**\n次。');
  expect(nf.formatOneSentencePerLine('*斜体。*続き。')).toBe('*斜体。*\n続き。');
  expect(nf.formatOneSentencePerLine('省略…。続き。')).toBe('省略…。\n続き。');
  expect(nf.formatOneSentencePerLine('1. 番号付き。分割しない。')).toBe('1. 番号付き。分割しない。');
  expect(nf.isOneSentencePerLine(out)).toBe(true);
  expect(nf.findMultiSentenceLines(src).map((v) => v.line), '括弧内の句点は違反にならない').toEqual([3, 4]);
  expect(nf.ONE_SENTENCE_PER_LINE_RULE).toContain('1文ごとに改行');
  // 310追加: 見出し規約の整形（h1→##・####以下→###・コードフェンス内は不変・冪等）と検査
  const h = '# タイトル\n\n## 大見出し\n\n### 小見出し\n\n#### 深い\n\n##### もっと深い\n\n```\n# コード内\n```\n本文 #ではない\n#タグ（空白なし）';
  const hOut = nf.enforceNoteHeadingLevels(h);
  expect(hOut.split('\n')).toEqual(['## タイトル', '', '## 大見出し', '', '### 小見出し', '', '### 深い', '', '### もっと深い', '', '```', '# コード内', '```', '本文 #ではない', '#タグ（空白なし）']);
  expect(nf.enforceNoteHeadingLevels(hOut), '冪等').toBe(hOut);
  expect(nf.findBadHeadingLines(h).map((v) => v.line)).toEqual([1, 7, 9]);
  expect(nf.findBadHeadingLines(hOut)).toEqual([]);
  expect(nf.NOTE_HEADING_RULE).toContain('#（h1）は使わない');

  // ② 変換の材料
  type Cell = import('../../src/lib/mandala-shared').MandalaCell;
  type Link = import('../../src/lib/mandala-shared').MandalaLinkResolved;
  const u = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const mk = (n: number, position: number, depth: 1 | 2 = 1, parent: string | null = null, title = '', body = '', meta: Record<string, unknown> = {}): Cell => ({ id: u(n), chart_id: u(900), parent_cell_id: parent, depth, position, title, body, meta, created_at: '', updated_at: '' });
  const link = (id: number, cell: Cell, scope: string, item_key: string, exists = true, title = `L${id}`, char_count = 10): Link => ({ id, cell_id: cell.id, scope, item_key, created_at: '', note: '', title: exists ? title : null, exists, char_count: exists ? char_count : null, item_created_at: null });
  const center = mk(4, 4, 1, null, 'テーマ', '読者は保湿を続けられる');
  const c0 = mk(10, 0, 1, null, '導入', '骨子0。', { tier: 'free' });
  const c1 = mk(11, 1, 1, null, '着地点', '骨子1。', { tier: 'free' });
  const c2 = mk(12, 2, 1, null, '', '', { tier: 'free' }); // 空＝除外
  const c3 = mk(13, 3, 1, null, 'タイトルだけ', ''); // tier 無し＝無料扱い
  const c6 = mk(16, 6, 1, null, '手順', '骨子6。', { tier: 'paid' });
  const c7 = mk(17, 7, 1, null, '成果物', '骨子7。', { tier: 'paid' });
  const k0a = mk(20, 0, 2, c0.id, '節A', '節Aの本文。');
  const k0b = mk(21, 1, 2, c0.id, '', ''); // 空の子＝除外
  const cells = [c7, k0b, c6, center, c3, c2, c1, c0, k0a];
  const chart = { id: u(900), meta: { preset: 'paid_note' }, cells };
  const links: Link[] = [
    link(1, c0, 'library', u(31), true, '資料A', 100),
    link(2, c0, 'episode', '5', true, '記録D', 50),
    link(3, c0, 'library', u(32), false),
    link(4, k0a, 'context', '7', true, '参照C', 30),
    link(5, c6, 'text_analysis', '12', true, '分析B', 5000),
  ];
  const bodies = new Map([[`library:${u(31)}`, '資料Aの本文'], ['context:7', '参照Cの本文'], ['text_analysis:12', 'x'.repeat(5000)]]);
  const nested = m.mandalaOutlineNested(cells);
  // 無料（1マス）
  const free = mn.mandalaNoteFree(chart, c0.id, nested, links, { bodies });
  expect(free.ok && free.mode === 'free_cell').toBe(true);
  if (!free.ok || free.mode !== 'free_cell') throw new Error('unreachable');
  expect(free.title).toBe('導入');
  expect(free.memo).toBe('骨子0。');
  expect(free.sections.map((s) => s.title), '子マスは節として順に・空は除外').toEqual(['節A']);
  expect(free.refs.map((r) => r.kind)).toEqual(['material', 'experience', 'missing']);
  expect(free.sections[0].refs[0]).toMatchObject({ kind: 'material', body: '参照Cの本文' });
  expect(free.counts).toEqual({ excludedEmpty: 1, missingLinks: 1, materials: 2, referenceOnly: 0, experiences: 1 });
  expect(free.source).toMatchObject({ source: 'mandala', chartId: u(900), mode: 'free_cell', cellId: c0.id, cellIds: [c0.id, k0a.id], cellLabel: '左上', cellTitle: '導入', chartTitle: 'テーマ' });
  const rejected = mn.mandalaNoteFree(chart, c3.id, nested, links);
  expect(rejected.ok, '本文が空で素材も無いマスは拒否').toBe(false);
  expect(!rejected.ok && rejected.reason).toBe(mn.MANDALA_NOTE_REJECT_EMPTY_BODY);
  // 309是正①: 本文が空でも有効なリンク素材があれば起こせる（タイトルを切り口に素材だけで）。削除済みだけなら拒否
  const withLink = mn.mandalaNoteFree(chart, c3.id, nested, [...links, link(9, c3, 'library', u(31), true, '資料A', 100)], { bodies });
  expect(withLink.ok && withLink.mode === 'free_cell' && withLink.memo).toBe('');
  expect(withLink.ok && withLink.counts.materials).toBe(1);
  expect(mn.mandalaNoteToSource(withLink)!.content).toContain('（骨子なし。タイトルを切り口に、素材・体験メモにある事実だけで書く）');
  expect(mn.mandalaNoteFree(chart, c3.id, nested, [...links, link(9, c3, 'library', u(32), false)]).ok, '削除済みのリンクだけでは拒否').toBe(false);
  expect(mn.hasUsableLinks(links, c0.id)).toBe(true);
  expect(mn.hasUsableLinks(links, c3.id)).toBe(false);
  // 有料の entries も同じ基準: 空のマス（c2）にリンクを付ければ含まれる
  const paidWithLink = mn.mandalaNotePaid(chart, nested, [...links, link(10, c2, 'episode', '5', true, '記録D', 50)]);
  expect(paidWithLink.ok && paidWithLink.mode === 'paid_chart' && paidWithLink.entries.some((e) => e.cellId === c2.id)).toBe(true);
  expect(mn.mandalaNoteFree(chart, u(999), nested, links).ok).toBe(false);
  // 中央マスも可
  expect(mn.mandalaNoteFree(chart, center.id, nested, links).ok).toBe(true);
  // 上限超過は参照のみ
  const tight = mn.mandalaNoteFree(chart, c6.id, nested, links, { bodies, materialCharLimit: 100 });
  expect(tight.ok && tight.mode === 'free_cell' && tight.refs[0].kind).toBe('reference');
  expect(tight.ok && tight.counts.referenceOnly).toBe(1);
  // 有料（全体）
  const paid = mn.mandalaNotePaid(chart, nested, links, { bodies });
  if (!paid.ok || paid.mode !== 'paid_chart') throw new Error('unreachable');
  expect(paid.title).toBe('テーマ');
  expect(paid.after).toBe('読者は保湿を続けられる');
  expect(paid.entries.map((e) => [e.title, e.tier])).toEqual([['導入', 'free'], ['着地点', 'free'], ['タイトルだけ', 'free'], ['手順', 'paid'], ['成果物', 'paid']]);
  expect(paid.paidLineIndex, '最初の paid の直前').toBe(3);
  expect(paid.counts.excludedEmpty, '空の親1＋空の子1').toBe(2);
  expect(paid.counts.missingLinks).toBe(1);
  expect(paid.source.cellIds).toEqual([c0.id, k0a.id, c1.id, c3.id, c6.id, c7.id]);
  expect(paid.source.mode).toBe('paid_chart');
  expect(paid.ratio, '無料比率は 308 の freeRatio そのまま（tier 無しのマスは数えない）').toEqual(m.freeRatio(cells));
  expect(paid.ratio.ratio).toBeCloseTo(14 / 22, 5);
  // tier 無しだけのチャートは paid 無し＝有料ラインを置かない。preset も tier も無ければ有料記事にできない
  const plainCells = cells.map((c) => ({ ...c, meta: {} }));
  const plainPaid = mn.mandalaNotePaid({ id: u(900), meta: {}, cells: plainCells }, m.mandalaOutlineNested(plainCells), []);
  expect(plainPaid.ok && plainPaid.mode === 'paid_chart' && plainPaid.paidLineIndex).toBeNull();
  expect(mn.canMakePaidNote({}, plainCells)).toBe(false);
  expect(mn.canMakePaidNote({ preset: 'paid_note' }, plainCells)).toBe(true);
  expect(mn.canMakePaidNote({}, cells)).toBe(true);
  const empty = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => mk(100 + p, p));
  expect(mn.mandalaNotePaid({ id: u(900), meta: {}, cells: empty }, m.mandalaOutlineNested(empty), []).ok).toBe(false);
  // 写し（①の参照資料ブロック）: 目印・区分・素材の本文・体験メモは参照だけ
  const text = mn.mandalaNoteToSource(paid)!;
  expect(text.title).toBe('テーマ');
  expect(text.content.startsWith('## 読者の着地点（After）\n\n読者は保湿を続けられる')).toBe(true);
  const markerAt = text.content.indexOf(mn.MANDALA_PAID_LINE_MARKER);
  expect(markerAt).toBeGreaterThan(0);
  expect(text.content.indexOf('## 手順【有料】')).toBeGreaterThan(markerAt);
  expect(text.content.indexOf('## タイトルだけ【無料】')).toBeLessThan(markerAt);
  expect(text.content).toContain('### 素材: 資料A\n資料Aの本文');
  expect(text.content).toContain('- 体験メモ（📔 エピソード記録）: 記録D');
  expect(text.content).not.toContain('L3');
  expect(text.paidLineBefore).toBe('手順');
  expect(text.ratioHint).toContain('目安 60〜70%');
  const freeText = mn.mandalaNoteToSource(free)!;
  expect(freeText.content.startsWith('## 導入\n\n骨子0。')).toBe(true);
  expect(freeText.content).toContain('### 節A\n\n節Aの本文。');
  expect(freeText.paidLineBefore).toBeNull();
  // プレビューと投入が同じ出力（同じ入力→同じ JSON。入力順を変えても同じ）
  expect(JSON.stringify(mn.mandalaNotePaid(chart, m.mandalaOutlineNested([...cells].reverse()), [...links].reverse(), { bodies }))).toBe(JSON.stringify(paid));
  // 有料ラインの目印の補正（無ければ最初の paid 項目の大見出しの直前・2本以上は1本に）
  const body = '## 導入\n\n文。\n\n## 手順の話\n\n文。';
  const ensured = mn.ensurePaidLineMarker(body, '手順');
  expect(ensured).toMatchObject({ inserted: true, missing: false });
  expect(ensured.body).toBe(`## 導入\n\n文。\n\n${mn.MANDALA_PAID_LINE_MARKER}\n\n## 手順の話\n\n文。`);
  expect(mn.ensurePaidLineMarker(ensured.body, '手順')).toMatchObject({ inserted: false, missing: false, body: ensured.body });
  expect(mn.ensurePaidLineMarker(`${mn.MANDALA_PAID_LINE_MARKER}\nA\n${mn.MANDALA_PAID_LINE_MARKER}\nB`, null).body.split('\n').filter((l) => l === mn.MANDALA_PAID_LINE_MARKER).length).toBe(1);
  expect(mn.ensurePaidLineMarker(body, '無い見出し')).toMatchObject({ inserted: false, missing: true, body });
  // 出どころの読み出し（fail-closed）と文言
  const meta = JSON.stringify({ from: 'dr-hub', mandala: { ...paid.source, generatedAt: '2026-09-09T00:00:00.000Z' } });
  const parsed = mn.parseMandalaArticleSource(meta)!;
  expect(parsed.chartId).toBe(u(900));
  expect(parsed.mode).toBe('paid_chart');
  expect(parsed.cellIds.length).toBe(6);
  expect(mn.parseMandalaArticleSource(JSON.stringify({ mandala: { source: 'mandala', chartId: 'x', mode: 'free_cell' } }))).toBeNull();
  expect(mn.parseMandalaArticleSource(JSON.stringify({ mandala: { source: 'mandala', chartId: u(1), mode: 'other' } }))).toBeNull();
  expect(mn.parseMandalaArticleSource('broken')).toBeNull();
  expect(mn.parseMandalaArticleSource({ mandala: { ...free.source } })?.cellLabel).toBe('左上');
  expect(mn.mandalaArticleOriginLabel(free.source)).toBe('マンダラ『テーマ』の『左上: 導入』から');
  expect(mn.mandalaArticleOriginLabel(paid.source)).toBe('マンダラ『テーマ』全体から');
  expect(mn.mandalaArticlesLabel(2)).toBe('📝 記事: 2件');
  expect([...mn.articleCountsByCell([{ id: 'a', title: '', mode: 'free_cell', cellId: c0.id, created_at: '' }, { id: 'b', title: '', mode: 'paid_chart', cellId: null, created_at: '' }, { id: 'c', title: '', mode: 'free_cell', cellId: c0.id, created_at: '' }]).entries()]).toEqual([[c0.id, 2]]);

  // ③ ソース固定（構文ごと・R-111）
  expect(readFileSync(join(__dirname, '../../src/lib/note-format.ts'), 'utf8')).not.toMatch(/from '@\/lib\/(db|markdown-renderer|rich-copy)'/);
  const noteLib = readFileSync(join(__dirname, '../../src/lib/mandala-note.ts'), 'utf8');
  expect(noteLib).not.toMatch(/from '@\/lib\/(db|mandala-server|episodes-server)'/);
  const styles = readFileSync(join(__dirname, '../../src/lib/persona-styles.ts'), 'utf8');
  // 310: 一段目（プロンプト）は共通規約 NOTE_COMMON_RULES に1回だけ（①の構造規約からは移した＝経路ごとに書き分けない）
  expect(styles).not.toMatch(/ONE_SENTENCE_PER_LINE_RULE/);
  const noteStyles = readFileSync(join(__dirname, '../../src/lib/note-styles.ts'), 'utf8');
  expect(noteStyles.match(/\$\{ONE_SENTENCE_PER_LINE_RULE\}/g)?.length, '共通規約に1回だけ').toBe(1);
  const route = readFileSync(join(__dirname, '../../src/app/api/dr-hub/persona/route.ts'), 'utf8');
  expect(route.match(/formatOneSentencePerLine\(/g)?.length, 'samples と full の両方で整形').toBe(2);
  expect(route, 'ガード優先宣言より後ろに骨子の追記（R-69）').toMatch(/\$\{personaStructureRules\(PERSONA_HEADING_RANGE\[length\]\)\}\n\$\{mandalaPromptBlock\(mandala\)\}/);
  expect(route).toMatch(/if \(body\.mandala && typeof body\.mandala === 'object'\)/);
  expect(route).toMatch(/const \{ titles, body: articleBody \} = parsePersonaArticleOutput\(raw\)/.test(route) ? /never/ : /formatOneSentencePerLine\(parsedOut\.body\)/);
  const hub = readFileSync(join(__dirname, '../../src/app/dashboard/dr-hub/page.tsx'), 'utf8');
  expect(hub, '保存前とリッチコピー前に同じ整形').toMatch(/content=\{formatOneSentencePerLine\(article\.content\)\}/);
  expect(hub).toMatch(/handleRichCopy\(formatOneSentencePerLine\(article\.content\), 'persona-note'\)/);
  // ②分割ほか他経路への適用は 310 で実施（U80 で固定）
});

test('U80: 「1文1行」整形の横展開（310・R-114）— ②分割・275 書籍→記事・269 remix・note-bundle・note-quick の5経路で formatOneSentencePerLine が checkMedicalAd の前に呼ばれる（構文ごとのソース固定・R-111）・旧 note記事生成は画面のストリーミング完了時（done）に整形し途中経過は変えない・SaveToLibraryButton（note-article のとき）と copyRichMarkdownForNote の内側で呼ばれる・共通規約 NOTE_COMMON_RULES に ONE_SENTENCE_PER_LINE_RULE が1回だけ・Kindle本文の生成経路（generate-chapter／chapters／outline／wizard）とHP・SNS・プレゼン・喩え話には整形が含まれない', async () => {
  const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
  const before = (src: string, callRe: RegExp, guardRe: RegExp, label: string) => {
    const call = src.search(callRe);
    const guard = src.search(guardRe);
    expect(call, `${label}: 整形の呼び出しがある`).toBeGreaterThanOrEqual(0);
    expect(guard, `${label}: ガードがある`).toBeGreaterThanOrEqual(0);
    expect(call, `${label}: 整形はガードの前`).toBeLessThan(guard);
  };
  // 5経路（サーバ）
  // 310追加: 2関数とも（見出し規約 enforceNoteHeadingLevels ∘ 1文1行 formatOneSentencePerLine）
  before(read('app/api/dr-hub/split/route.ts'), /const article = enforceNoteHeadingLevels\(formatOneSentencePerLine\(await generateWithModel\(/, /checkMedicalAd\(article\)/, '②分割');
  before(read('app/api/kindle/to-note/route.ts'), /const content = enforceNoteHeadingLevels\(formatOneSentencePerLine\(await generateWithModel\(/, /checkMedicalAd\(content\)/, '275 書籍→記事');
  before(read('app/api/kindle/note-remix/route.ts'), /const articleBody = enforceNoteHeadingLevels\(formatOneSentencePerLine\(parsedOut\.body\)\)/, /checkMedicalAd\(articleBody\)/, '269 remix');
  const bundle = read('app/api/note-bundle/article/route.ts');
  before(bundle, /const formatted = enforceNoteHeadingLevels\(formatOneSentencePerLine\(content\)\)/, /checkMedicalAd\(formatted\)/, 'note-bundle');
  expect(bundle, 'note-bundle は整形後の本文を返す').toMatch(/content: formatted,/);
  const quick = read('app/api/note-quick/article/route.ts');
  before(quick, /const content = enforceNoteHeadingLevels\(formatOneSentencePerLine\(gen\.text\)\)/, /checkMedicalAd\(content\)/, 'note-quick');
  expect(quick.search(/formatOneSentencePerLine\(gen\.text\)/), 'note-quick: verifyContent より前').toBeLessThan(quick.search(/verifyContent\(content/));
  // ①（309）も同じ2関数（samples/full）
  const persona = read('app/api/dr-hub/persona/route.ts');
  expect(persona.match(/enforceNoteHeadingLevels\(formatOneSentencePerLine\(/g)?.length).toBe(2);
  // 旧 note記事生成: 画面の done で整形。途中経過（type==='text'）の setArticle は生の accumulated のまま
  const oldPage = read('app/dashboard/note-article/page.tsx');
  expect(oldPage).toMatch(/accumulated = enforceNoteHeadingLevels\(formatOneSentencePerLine\(accumulated\)\);\n\s*setArticle\(accumulated\);\n\s*setEditedArticle\(accumulated\);/);
  const streamLoop = oldPage.slice(oldPage.indexOf("if (json.type === 'text')"), oldPage.indexOf("} else if (json.type === 'error')"));
  expect(streamLoop, '途中経過は整形しない').not.toMatch(/formatOneSentencePerLine|enforceNoteHeadingLevels/);
  // 共通層
  const saveBtn = read('components/SaveToLibraryButton.tsx');
  expect(saveBtn).toMatch(/const contentToSave = type === 'note-article' \? enforceNoteHeadingLevels\(formatOneSentencePerLine\(content\)\) : content;/);
  expect(saveBtn).toMatch(/content: contentToSave,/);
  const richCopy = read('lib/rich-copy.ts');
  expect(richCopy).toMatch(/export async function copyRichMarkdownForNote\(markdownRaw: string\)[^]*?const markdown = enforceNoteHeadingLevels\(formatOneSentencePerLine\(markdownRaw\)\);/);
  const wordCopy = richCopy.slice(richCopy.indexOf('export async function copyRichMarkdown('), richCopy.indexOf('export function promoteHeadingsForNote'));
  expect(wordCopy, '共有の copyRichMarkdown（Word体裁）には当てない').not.toMatch(/formatOneSentencePerLine|enforceNoteHeadingLevels/);
  // 一段目（プロンプト）は共通規約に1回だけ
  expect(read('lib/note-styles.ts').match(/\$\{ONE_SENTENCE_PER_LINE_RULE\}/g)?.length).toBe(1);
  expect(read('lib/note-styles.ts').match(/\$\{NOTE_HEADING_RULE\}/g)?.length, '見出し規約も共通規約に1回だけ').toBe(1);
  expect(read('lib/persona-styles.ts'), '①の PERSONA_HEADING_GUARD は残置').toContain('export const PERSONA_HEADING_GUARD');
  expect(read('lib/persona-styles.ts')).not.toMatch(/ONE_SENTENCE_PER_LINE_RULE/);
  // 当ててはいけない側: Kindle本文・HP・SNS・プレゼン・喩え話
  for (const p of ['app/api/kindle/generate-chapter/route.ts', 'app/api/kindle/chapters/route.ts', 'app/api/kindle/outline/route.ts', 'app/api/kindle/wizard/create/route.ts']) {
    expect(read(p), `${p} に整形なし`).not.toMatch(/note-format|formatOneSentencePerLine|enforceNoteHeadingLevels/);
  }
  const apiDir = join(__dirname, '../../src/app/api');
  const { readdirSync, statSync } = await import('node:fs');
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const full = join(dir, f); return statSync(full).isDirectory() ? walk(full) : [full]; });
  const usingFormat = walk(apiDir).filter((f) => f.endsWith('.ts') && /formatOneSentencePerLine|enforceNoteHeadingLevels/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(apiDir.length + 1));
  expect(usingFormat.sort(), '整形を呼ぶ API は note 記事の6経路（①②275/269/bundle/quick）だけ').toEqual([
    'dr-hub/persona/route.ts', 'dr-hub/split/route.ts', 'kindle/note-remix/route.ts', 'kindle/to-note/route.ts', 'note-bundle/article/route.ts', 'note-quick/article/route.ts',
  ].sort());
});

test('U81: マンダラ 未調査マスからのリサーチ発注（311）— 発注文はテーマ・このマス・隣接・親・経路の定型1文を決定的に組み立て逆順入力で一致・空マスは拒否理由・テキスト分析は本文があるマスだけ・付帯情報の検証は fail-closed・バッチ行と handoff への写しは薄い・進行状況は meta.research から running/failed/stale（6時間）を導出・未調査＝埋まっていてリンク0件で進行中でない（子マス含む・中央除外）・まとめて発注は上限8で超過は理由（R-101）・完了フックは302の addLinks を通し付帯情報が無ければ何もしない（ソース固定・R-111）・純関数は DB 非依存', async () => {
  const r = mandalaResearch;
  const m = mandalaShared;
  type Cell = import('../../src/lib/mandala-shared').MandalaCell;
  const u = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const mk = (n: number, position: number, depth: 1 | 2 = 1, parent: string | null = null, title = '', body = '', meta: Record<string, unknown> = {}): Cell => ({ id: u(n), chart_id: u(900), parent_cell_id: parent, depth, position, title, body, meta, created_at: '', updated_at: '' });
  const center = mk(4, 4, 1, null, '保湿を続ける', 'x'.repeat(500));
  const c0 = mk(10, 0, 1, null, '導入', '骨子0。');
  const c1 = mk(11, 1, 1, null, '着地点', '');
  const c2 = mk(12, 2, 1, null, '', '');
  const c6 = mk(16, 6, 1, null, '手順', '骨子6。');
  const k0 = mk(20, 0, 2, c0.id, '節A', '節Aの本文');
  const k1 = mk(21, 1, 2, c0.id, '節B', '');
  const cells = [k1, c6, center, c2, c1, c0, k0];
  const chart = { id: u(900), cells };
  // ① 発注文（決定的・逆順一致）
  const o = r.buildResearchOrder(chart, c0.id, 'deepresearch');
  expect(o.ok).toBe(true);
  if (!o.ok) throw new Error('unreachable');
  expect(o.label).toBe('左上');
  expect(o.theme).toBe('保湿を続ける');
  expect(o.adjacentTitles, '兄弟のタイトルだけ（空マスは除く・中央は除く）').toEqual(['着地点', '手順']);
  expect(o.parentTitle).toBeNull();
  expect(o.text.startsWith(`# テーマ: 保湿を続ける\n${'x'.repeat(300)}…\n\n# このマス（左上）: 導入\n骨子0。\n\n# 文脈\n- 隣接: 着地点／手順\n\n# 指示\n`)).toBe(true);
  expect(o.text.endsWith(r.MANDALA_RESEARCH_INSTRUCTION.deepresearch)).toBe(true);
  expect(JSON.stringify(r.buildResearchOrder({ id: u(900), cells: [...cells].reverse() }, c0.id, 'deepresearch'))).toBe(JSON.stringify(o));
  const ok0 = r.buildResearchOrder(chart, k0.id, 'text_analysis');
  expect(ok0.ok && ok0.label).toBe('左上 › 左上');
  expect(ok0.ok && ok0.parentTitle).toBe('導入');
  expect(ok0.ok && ok0.adjacentTitles).toEqual(['節B']);
  expect(ok0.ok && ok0.text).toContain('- 親マス: 導入');
  expect(ok0.ok && ok0.text.endsWith(r.MANDALA_RESEARCH_INSTRUCTION.text_analysis)).toBe(true);
  // タイトルだけのマスは DR は可（本文なしの注記）・分析は不可
  const t1 = r.buildResearchOrder(chart, c1.id, 'deepresearch');
  expect(t1.ok && t1.text).toContain('（本文なし。タイトルを論点として扱う）');
  expect(r.buildResearchOrder(chart, c1.id, 'text_analysis')).toMatchObject({ ok: false, reason: r.MANDALA_RESEARCH_REJECT_NO_BODY });
  expect(r.buildResearchOrder(chart, c2.id, 'deepresearch')).toMatchObject({ ok: false, reason: r.MANDALA_RESEARCH_REJECT_EMPTY });
  expect(r.buildResearchOrder(chart, u(999), 'deepresearch').ok).toBe(false);
  // ② 付帯情報と写し
  expect(r.parseResearchRef({ source: 'research', chartId: u(900), cellId: c0.id, kind: 'deepresearch' })).toEqual({ source: 'research', chartId: u(900), cellId: c0.id, kind: 'deepresearch' });
  expect(r.parseResearchRef({ source: 'mandala', chartId: u(900), cellId: c0.id, kind: 'deepresearch' })).toBeNull();
  expect(r.parseResearchRef({ source: 'research', chartId: 'x', cellId: c0.id, kind: 'deepresearch' })).toBeNull();
  expect(r.parseResearchRef({ source: 'research', chartId: u(900), cellId: c0.id, kind: 'other' })).toBeNull();
  expect(r.parseResearchRef(null)).toBeNull();
  const topic = r.researchOrderToBatchTopic(o, 'quick');
  expect(topic).toEqual({ topic: o.text, mode: 'quick', mandala: { source: 'research', chartId: u(900), cellId: c0.id, kind: 'deepresearch' } });
  expect(r.researchOrderToBatchTopic(o, 'deep', '  直した発注文 ').topic).toBe('直した発注文');
  expect(r.researchOrderToBatchTopic(o, 'deep', '   ').topic, '空にしたら既定に戻す').toBe(o.text);
  const handoff = r.researchOrderToTextAnalysisHandoff(o);
  expect(handoff).toEqual({ text: o.text, topic: '導入', mandala: { source: 'research', chartId: u(900), cellId: c0.id, kind: 'text_analysis' } });
  expect(r.researchBatchGroupName('保湿', 3)).toBe('🔲 マンダラ『保湿』の調査（3件）');
  // ③ 進行状況
  const now = Date.parse('2026-09-09T10:00:00.000Z');
  const running = { research: { kind: 'deepresearch', startedAt: '2026-09-09T09:00:00.000Z', jobId: 5, index: 0 } };
  const stale = { research: { kind: 'deepresearch', startedAt: '2026-09-09T03:00:00.000Z' } };
  const failed = { research: { kind: 'text_analysis', startedAt: '2026-09-09T09:30:00.000Z', failedAt: '2026-09-09T09:40:00.000Z', reason: 'x' } };
  expect(r.researchState(running, now)).toBe('running');
  expect(r.researchState(stale, now)).toBe('stale');
  expect(r.researchState(failed, now)).toBe('failed');
  expect(r.researchState({}, now)).toBe('none');
  expect(r.researchState({ research: { kind: 'nope', startedAt: 'x' } }, now), '形が崩れていれば none').toBe('none');
  expect(r.parseResearchMeta(running)).toMatchObject({ kind: 'deepresearch', jobId: 5, index: 0 });
  expect(r.canOrderResearch(running, now)).toBe(false);
  expect(r.canOrderResearch(stale, now)).toBe(true);
  expect(r.canOrderResearch(failed, now)).toBe(true);
  expect(r.MANDALA_RESEARCH_STALE_MS).toBe(6 * 60 * 60 * 1000);
  // ④ 未調査（埋まっていてリンク0件・進行中でない・子マス含む・中央除外）と集計
  const counts = m.linkCountsByCell([{ id: 1, cell_id: c6.id, scope: 'library', item_key: 'a', created_at: '' }]);
  const cellsWithState = [k1, { ...c6 }, center, c2, { ...c1, meta: running }, c0, { ...k0, meta: stale }];
  expect(r.uncoveredCells(cellsWithState, counts, now).map((c) => c.id), '順序は depth→position').toEqual([c0.id, k0.id, k1.id]);
  expect(r.uncoveredCells([...cellsWithState].reverse(), counts, now).map((c) => c.id)).toEqual([c0.id, k0.id, k1.id]);
  expect(r.researchSummary(cellsWithState, counts, now)).toEqual({ uncovered: 3, inProgress: 1, failed: 0, stale: 1 });
  expect(r.bulkOrderState(0).enabled).toBe(false);
  expect(r.bulkOrderState(8).enabled).toBe(true);
  expect(r.bulkOrderState(9)).toMatchObject({ enabled: false });
  expect(r.bulkOrderState(9).reason).toContain('8件まで');
  expect(r.MANDALA_RESEARCH_BULK_MAX).toBe(8);
  // ⑤ ソース固定（構文ごと・R-111）
  const lib = readFileSync(join(__dirname, '../../src/lib/mandala-research.ts'), 'utf8');
  expect(lib).not.toMatch(/from '@\/lib\/(db|mandala-server)'/);
  const server = readFileSync(join(__dirname, '../../src/lib/mandala-server.ts'), 'utf8');
  expect(server, '完了フックは 302 の addLinks を通す').toMatch(/export async function linkResearchResult[^]*?await addLinks\(userId, ref\.cellId, \[\{ scope, item_key: itemKey \}\]\)/);
  expect(server, 'マスが無ければスキップ').toMatch(/if \(!res\) return \{ ok: false, skipped: 'cell_missing'/);
  expect(server.match(/INSERT INTO mandala_cell_links/g)?.length, 'リンクの INSERT は addLinks の1箇所だけ').toBe(1);
  const run = readFileSync(join(__dirname, '../../src/app/api/batch-research/[id]/run/route.ts'), 'utf8');
  expect(run, '付帯情報があるときだけ（parseResearchRef が null なら何もしない）').toMatch(/const mandalaRef = parseResearchRef\(item\.mandala\);\s*if \(mandalaRef\) \{/);
  expect(run).toMatch(/await linkResearchResult\(job\.user_id, mandalaRef, 'library', libraryResearchId\)/);
  expect(run).toMatch(/await linkResearchResult\(job\.user_id, mandalaRef, 'context', String\(ctxRows\[0\]\.id\)\)/);
  const saves = readFileSync(join(__dirname, '../../src/app/api/text-analysis/saves/route.ts'), 'utf8');
  expect(saves).toMatch(/const mandalaRef = parseResearchRef\(body\.mandala\);[^]*?if \(mandalaRef\) \{[^]*?linkResearchResult\(userId, mandalaRef, 'text_analysis'/);
  const create = readFileSync(join(__dirname, '../../src/app/api/batch-research/route.ts'), 'utf8');
  expect(create, '付帯情報は検証して形が合うときだけ残す').toMatch(/const mandala: MandalaResearchRef \| null = parseResearchRef\(t\?\.mandala\);/);
  expect(create, '進行中なら登録前に 409').toMatch(/status: 409/);
  const dialog = readFileSync(join(__dirname, '../../src/components/mandala/MandalaResearchDialog.tsx'), 'utf8');
  expect(dialog, '費用の目安を捏造しない').not.toMatch(/円|\$[0-9]/);
  expect(dialog).toMatch(/fetch\('\/api\/batch-research', \{/);
  expect(dialog).toMatch(/fetch\(`\/api\/batch-research\/\$\{jobId\}\/run`/);
});

test('U82: マンダラ→X投稿と反応の書き戻し（312）— マス1つ→投稿群（気づき・素材・体験メモ・本数の既定3・1〜5）・チャート→シリーズ（周囲マスが目次順に1マス1投稿・最大8・子マスなし・空は除外・2未満は拒否）・出どころに chartId/cellIds/mode・逆順入力で一致・③への写しは薄い1関数・URL を本文からセルフリプライ欄へ移す（冪等・コード側）・reaction.x はキー単位マージで note 側が消えない（両方空でキー削除）・出どころの検証は fail-closed・ソース固定（③のプロンプト追記はガード優先の後ろ・保存側の URL/上限検査はマンダラ経由だけ・R-111）', async () => {
  const x = mandalaX;
  const m = mandalaShared;
  type Cell = import('../../src/lib/mandala-shared').MandalaCell;
  type Link = import('../../src/lib/mandala-shared').MandalaLinkResolved;
  const u = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const mk = (n: number, position: number, depth: 1 | 2 = 1, parent: string | null = null, title = '', body = '', meta: Record<string, unknown> = {}): Cell => ({ id: u(n), chart_id: u(900), parent_cell_id: parent, depth, position, title, body, meta, created_at: '', updated_at: '' });
  const link = (id: number, cell: Cell, scope: string, item_key: string, exists = true, title = `L${id}`): Link => ({ id, cell_id: cell.id, scope, item_key, created_at: '', note: '', title: exists ? title : null, exists, char_count: exists ? 100 : null, item_created_at: null });
  const center = mk(4, 4, 1, null, '保湿を続ける', '主題の本文');
  const c0 = mk(10, 0, 1, null, '気づき0', '本文0 https://example.com/a 参照。');
  const c1 = mk(11, 1, 1, null, '気づき1', '');
  const c2 = mk(12, 2, 1, null, '', '');
  const c6 = mk(16, 6, 1, null, '気づき6', '本文6');
  const k0 = mk(20, 0, 2, c0.id, '節A', '子の本文');
  const cells = [k0, c6, center, c2, c1, c0];
  const chart = { id: u(900), cells };
  const links: Link[] = [link(1, c0, 'library', u(31), true, '資料A'), link(2, c0, 'episode', '5', true, '記録D'), link(3, c0, 'context', '7', false)];
  const bodies = new Map([[`library:${u(31)}`, '資料本文 https://example.com/b']]);
  // ① マス→投稿群
  const cell = x.mandalaXCell(chart, c0.id, links, { bodies });
  expect(cell.ok && cell.mode === 'cell').toBe(true);
  if (!cell.ok || cell.mode !== 'cell') throw new Error('unreachable');
  expect(cell.count, '既定3').toBe(3);
  expect(cell.post.title).toBe('気づき0');
  expect(cell.post.memo).toBe(c0.body);
  expect(cell.post.refs.map((r) => r.kind)).toEqual(['material', 'experience', 'missing']);
  expect(cell.post.replyUrls, '本文と素材の URL がセルフリプライ候補').toEqual(['https://example.com/a', 'https://example.com/b']);
  expect(cell.counts).toEqual({ excludedEmpty: 0, missingLinks: 1, materials: 1, referenceOnly: 0, experiences: 1 });
  expect(cell.source).toMatchObject({ source: 'mandala', chartId: u(900), mode: 'cell', cellId: c0.id, cellIds: [c0.id], cellLabel: '左上', cellTitle: '気づき0', count: 3 });
  expect(x.mandalaXCell(chart, c0.id, links, { count: 9 }).ok && (x.mandalaXCell(chart, c0.id, links, { count: 9 }) as { count: number }).count, '上限5に丸める').toBe(5);
  expect((x.mandalaXCell(chart, c0.id, links, { count: '1' }) as { count: number }).count).toBe(1);
  expect(x.mandalaXCell(chart, c2.id, links)).toMatchObject({ ok: false, reason: x.MANDALA_X_REJECT_EMPTY });
  expect(x.mandalaXCell(chart, center.id, links).ok, '中央も可').toBe(true);
  // ② チャート→シリーズ（目次順・子なし・空除外）
  const nested = m.mandalaOutlineNested(cells);
  const series = x.mandalaXSeries(chart, nested, links, { bodies });
  if (!series.ok || series.mode !== 'series') throw new Error('unreachable');
  expect(series.posts.map((p) => [p.position, p.title])).toEqual([[0, '気づき0'], [1, '気づき1'], [6, '気づき6']]);
  expect(series.posts.some((p) => p.cellId === k0.id), '子マスは含めない').toBe(false);
  expect(series.counts.excludedEmpty).toBe(1);
  expect(series.theme).toBe('保湿を続ける');
  expect(series.source).toMatchObject({ mode: 'series', cellIds: [c0.id, c1.id, c6.id], cellId: null, count: 3 });
  expect(JSON.stringify(x.mandalaXSeries({ id: u(900), cells: [...cells].reverse() }, m.mandalaOutlineNested([...cells].reverse()), [...links].reverse(), { bodies }))).toBe(JSON.stringify(series));
  expect(JSON.stringify(x.mandalaXCell({ id: u(900), cells: [...cells].reverse() }, c0.id, [...links].reverse(), { bodies }))).toBe(JSON.stringify(cell));
  const one = [center, c0];
  expect(x.mandalaXSeries({ id: u(900), cells: one }, m.mandalaOutlineNested(one), []).ok, '2マス未満は拒否').toBe(false);
  expect(x.canMakeXSeries(one)).toBe(false);
  expect(x.canMakeXSeries(cells)).toBe(true);
  expect(x.MANDALA_X_SERIES_MAX).toBe(8);
  // ③ 写し（③の article）
  const art = x.mandalaXToArticle(cell)!;
  expect(art.title).toBe('気づき0');
  expect(art.content.startsWith('# テーマ: 保湿を続ける\n\n## 気づき（左上）: 気づき0\n本文0 https://example.com/a 参照。')).toBe(true);
  expect(art.content).toContain('- 体験メモ（📔 エピソード記録）: 記録D');
  expect(art.content).toContain('### 素材: 資料A\n資料本文');
  expect(art.content).not.toContain('L3');
  const s2 = x.mandalaXToArticle(series, 1)!;
  expect(s2.title).toBe('気づき1');
  expect(s2.content).toContain('（シリーズ 2/3 本目・1マス＝1投稿）');
  expect(s2.content).toContain('（本文なし。タイトルを気づきとして扱う）');
  expect(x.mandalaXToArticle(series, 9)).toBeNull();
  // ④ URL をリプライ欄へ（冪等）
  const moved = x.moveUrlsToReply('要点。\nhttps://example.com/a\n次の文 https://example.com/b です。');
  expect(moved).toEqual({ body: '要点。\n\n次の文  です。', urls: ['https://example.com/a', 'https://example.com/b'] });
  expect(x.moveUrlsToReply(moved.body)).toEqual({ body: moved.body, urls: [] });
  expect(x.extractUrls('（https://example.com/c）と「https://example.com/c」')).toEqual(['https://example.com/c']);
  expect(x.mandalaXPromptBlock('cell', 3)).toContain('1投稿1気づき');
  expect(x.mandalaXPromptBlock('series', 1, 0, 3)).toContain('シリーズ 1/3 本目');
  // ⑤ 出どころ（fail-closed）と文言・件数
  const ref = x.parseMandalaXRef({ ...cell.source, index: 0 })!;
  expect(ref.mode).toBe('cell');
  expect(x.parseMandalaXRef({ source: 'mandala', chartId: u(900), mode: 'cell' }), 'cell は cellId 必須').toBeNull();
  expect(x.parseMandalaXRef({ source: 'mandala', chartId: u(900), mode: 'series', cellIds: [c0.id, 'x'] })?.cellIds).toEqual([c0.id]);
  expect(x.parseMandalaXRef({ source: 'research', chartId: u(900), mode: 'cell', cellId: c0.id })).toBeNull();
  expect(x.mandalaXOriginLabel(cell.source)).toBe('マンダラ『保湿を続ける』の『左上: 気づき0』から');
  expect(x.mandalaXOriginLabel({ ...series.source, index: 1 })).toBe('マンダラ『保湿を続ける』のシリーズ 3本（2本目）');
  expect([...x.xPostCountsByCell([
    { id: 'a', title: '', mode: 'cell', cellId: c0.id, cellIds: [c0.id], created_at: '' },
    { id: 'b', title: '', mode: 'series', cellId: null, cellIds: [c0.id, c1.id], created_at: '' },
  ]).entries()]).toEqual([[c0.id, 2], [c1.id, 1]]);
  expect(x.mandalaXPostsLabel(4)).toBe('🐦 投稿: 4本');
  // ⑥ 反応 X（別グループ・キー単位マージ）
  const now = '2026-09-09T10:00:00.000Z';
  const noteOnly = m.mergeReaction(null, { note: { views: 10, memo: 'n' } }, now)!;
  expect(noteOnly).toEqual({ views: 10, memo: 'n', recordedAt: now });
  const both = m.mergeReaction(noteOnly, { x: { impressions: 500, shares: 3, profileClicks: 2, memo: 'x' } }, '2026-09-09T11:00:00.000Z')!;
  expect(both, 'X を書いても note 側が消えない').toMatchObject({ views: 10, memo: 'n', recordedAt: now, x: { impressions: 500, shares: 3, profileClicks: 2, memo: 'x', recordedAt: '2026-09-09T11:00:00.000Z' } });
  const noteCleared = m.mergeReaction(both, { note: null }, now)!;
  expect(noteCleared.views, 'note 側だけ消える').toBeUndefined();
  expect(noteCleared.x?.impressions).toBe(500);
  expect(m.mergeReaction(noteCleared, { x: null }, now), '両方空ならキー削除').toBeNull();
  expect(m.mergeReaction(both, {}, now), '何も指定しなければ不変').toEqual(both);
  expect(m.parseReaction({ reaction: { x: { impressions: 1, likes: -1, recordedAt: 'z' } } })).toEqual({ recordedAt: '', x: { impressions: 1, recordedAt: 'z' } });
  expect(m.hasReaction({ meta: { reaction: { x: { reposts: 2 } } } })).toBe(true);
  expect(m.hasNoteReaction(m.parseReaction({ reaction: { x: { reposts: 2 } } }))).toBe(false);
  expect(m.normalizeReactionXInput({ impressions: '120', likes: '', profileClicks: 4, memo: ' 一言 ' })).toEqual({ ok: true, x: { impressions: 120, profileClicks: 4, memo: '一言' } });
  expect(m.normalizeReactionXInput({ impressions: '-1' })).toMatchObject({ ok: false });
  expect(m.normalizeReactionXInput({})).toEqual({ ok: true, x: null });
  expect(m.MANDALA_REACTION_X_KEYS).toEqual(['impressions', 'likes', 'reposts', 'shares', 'profileClicks']);
  // ⑦ ソース固定
  const lib = readFileSync(join(__dirname, '../../src/lib/mandala-x.ts'), 'utf8');
  expect(lib).not.toMatch(/from '@\/lib\/(db|mandala-server)'/);
  const route = readFileSync(join(__dirname, '../../src/app/api/dr-hub/x-post/route.ts'), 'utf8');
  expect(route, 'プロンプト追記はガード優先ブロックの後ろ（R-69）').toMatch(/- 記事にない事実・数値・出典を書かない[^\n]*\n\$\{mandalaMode \? `\\n\$\{mandalaXPromptBlock\(/);
  expect(route).toMatch(/if \(mandalaMode\) \{\s*const moved = moveUrlsToReply\(result\.single\);/);
  const save = readFileSync(join(__dirname, '../../src/app/api/dr-hub/x-post/save/route.ts'), 'utf8');
  expect(save, 'URL・上限の検査はマンダラ経由（付帯情報あり）だけ＝既存の保存は不変').toMatch(/if \(mandalaRef\) \{[^]*?if \(hasUrl\(bodyPart\)\)[^]*?bodyPart\.length > X_HARD_LIMIT/);
  const server = readFileSync(join(__dirname, '../../src/lib/mandala-server.ts'), 'utf8');
  expect(server).toMatch(/const merged = mergeReaction\(existing, \{ note: patch\.reaction, x: patch\.reactionX \}/);
  expect(server).not.toMatch(/set\.reaction = \{ \.\.\.patch\.reaction, recordedAt/);
});

test('U83: マンダラ 311是正 — 未記入＝型由来（meta.tier）でタイトルが型の初期値のまま（presetCellRows と一致）かつ本文空（純関数）・タイトル変更／本文追加で解除・tier の無い同名マスと子マスは未記入にならない・記述あり（isCellWritten）は n/9・📔と📈の分母・未調査・隣接の文脈から未記入を除く・「埋まっている」（isCellFilled＝Kindle/記事化/X）は不変・発注は未記入→テーマ無しの順で理由を返し中央が空なら単発・まとめとも無効（R-101）・presets は shared を型だけ読む（循環参照なし）', async () => {
  const m = mandalaShared;
  const r = mandalaResearch;
  const p = mandalaPresets;
  type Cell = import('../../src/lib/mandala-shared').MandalaCell;
  const u = (n: number) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const mk = (n: number, position: number, depth: 1 | 2 = 1, parent: string | null = null, title = '', body = '', meta: Record<string, unknown> = {}): Cell => ({ id: u(n), chart_id: u(900), parent_cell_id: parent, depth, position, title, body, meta, created_at: '2026-09-09T00:00:00.000Z', updated_at: '2026-09-09T00:00:00.000Z' });
  const rows = p.presetCellRows('paid_note');
  expect(rows.map((x) => x.position), '作成時の9マス分（中央は型に無い位置＝空）').toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(rows[4]).toEqual({ position: 4, title: '', meta: {} });
  expect(p.presetInitialTitlesAt(0)).toEqual([rows[0].title]);
  expect(p.presetInitialTitlesAt(4)).toEqual([]);
  // ① 未記入の純関数
  const ph0 = mk(10, 0, 1, null, rows[0].title, '', { tier: 'free' });
  const ph6 = mk(16, 6, 1, null, rows[6].title, '', { tier: 'paid' });
  expect(m.isPresetPlaceholder(ph0), '型の初期タイトルのまま＋本文空＝未記入').toBe(true);
  expect(m.isPresetPlaceholder(ph6)).toBe(true);
  expect(m.isPresetPlaceholder({ ...ph0, title: `  ${rows[0].title}  ` }), '前後の空白は無視').toBe(true);
  expect(m.isPresetPlaceholder({ ...ph0, title: '導入（書き換えた）' }), 'タイトルを書き換えたら解除').toBe(false);
  expect(m.isPresetPlaceholder({ ...ph0, body: '骨子。' }), '本文を書いたら解除').toBe(false);
  expect(m.isPresetPlaceholder({ ...ph0, meta: {} }), 'tier の無い（型由来でない）同名マスは未記入ではない').toBe(false);
  expect(m.isPresetPlaceholder({ ...ph0, position: 1 }), '別の位置の初期タイトルとは一致しない').toBe(false);
  expect(m.isPresetPlaceholder(mk(20, 0, 2, ph0.id, rows[0].title, '')), '子マス（meta に tier 無し）は未記入にならない').toBe(false);
  expect(m.isPresetPlaceholder(null)).toBe(false);
  expect(m.isCellFilled(ph0), '「埋まっている」は不変（Kindle目次・記事化・X の対象判定）').toBe(true);
  expect(m.isCellWritten(ph0), '記述あり＝埋まっていて未記入でない').toBe(false);
  expect(m.isCellWritten({ ...ph0, body: '骨子。' })).toBe(true);
  expect(m.isCellWritten(mk(12, 2, 1, null, '', ''))).toBe(false);
  // ② 件数: n/9・📔 n/m・📈 n/m の分母から未記入を除く。中央空
  const center = mk(4, 4);
  const w0 = { ...ph0, body: '骨子0。' };
  const w1 = { ...mk(11, 1, 1, null, '着地点（書いた）', '', { tier: 'free' }), meta: { tier: 'free', reaction: { views: 1, recordedAt: '2026-09-09T00:00:00.000Z' } } };
  const phR = { ...mk(12, 2, 1, null, rows[2].title, '', { tier: 'free' }), meta: { tier: 'free', reaction: { views: 5, recordedAt: '2026-09-09T00:00:00.000Z' } } };
  const cells: Cell[] = [ph6, phR, w1, center, w0];
  expect(m.filledCount(cells, 1), '記述あり 2（w0・w1）。未記入 2 と中央空は数えない').toBe(2);
  const links = [{ id: 1, cell_id: phR.id, scope: 'episode', item_key: 'e1', created_at: '' }, { id: 2, cell_id: w0.id, scope: 'episode', item_key: 'e2', created_at: '' }] as import('../../src/lib/mandala-shared').MandalaLinkLite[];
  expect(m.primaryInfoSummary(cells, links), '📔 の分母・分子とも未記入を除く').toEqual({ withPrimary: 1, filled: 2 });
  expect(m.reactionSummary(cells), '📈 の分母・分子とも未記入を除く（未記入に付いた反応は数えない）').toEqual({ withReaction: 1, filled: 2 });
  expect(m.freeRatio(cells).ratio, '比率は本文の文字数＝未記入は 0 字で影響なし（表示は不変）').toBe(1);
  // ③ 未調査・隣接の文脈から未記入を除く
  const counts = m.linkCountsByCell(links);
  const now = Date.parse('2026-09-09T12:00:00.000Z');
  expect(r.uncoveredCells(cells, counts, now).map((c) => c.id), '未調査＝記述あり・リンク0（w1 だけ。未記入 ph6 は除く）').toEqual([w1.id]);
  // ④ 発注の理由: 未記入 → テーマ無し の順。中央が空なら記述のあるマスでも無効（単発・まとめ）
  const chartNoTheme = { id: u(900), cells };
  expect(r.buildResearchOrder(chartNoTheme, ph6.id, 'deepresearch')).toMatchObject({ ok: false, reason: r.MANDALA_RESEARCH_REJECT_PLACEHOLDER });
  expect(r.MANDALA_RESEARCH_REJECT_PLACEHOLDER.startsWith('まだ記述がありません')).toBe(true);
  expect(r.buildResearchOrder(chartNoTheme, w0.id, 'deepresearch')).toMatchObject({ ok: false, reason: r.MANDALA_RESEARCH_REJECT_NO_THEME });
  expect(r.MANDALA_RESEARCH_REJECT_NO_THEME.startsWith('中央にテーマを書いてください')).toBe(true);
  expect(r.hasResearchTheme(cells)).toBe(false);
  expect(r.cellOrderState(cells, ph6)).toEqual({ enabled: false, reason: r.MANDALA_RESEARCH_REJECT_PLACEHOLDER });
  expect(r.cellOrderState(cells, w0)).toEqual({ enabled: false, reason: r.MANDALA_RESEARCH_REJECT_NO_THEME });
  expect(r.cellOrderState(cells, mk(13, 3))).toEqual({ enabled: false, reason: r.MANDALA_RESEARCH_REJECT_EMPTY });
  expect(r.bulkOrderState(3, false), 'まとめて発注はテーマ無しで件数に関わらず無効').toEqual({ enabled: false, reason: r.MANDALA_RESEARCH_REJECT_NO_THEME });
  expect(r.bulkOrderState(0, false).reason).toBe(r.MANDALA_RESEARCH_REJECT_NO_THEME);
  expect(r.bulkOrderState(3).enabled, '既定はテーマあり（既存の呼び出しは不変）').toBe(true);
  // テーマを書くと通る。隣接の文脈に未記入（ph6・phR）は載らない
  const themed = { id: u(900), cells: cells.map((c) => (c.id === center.id ? { ...c, title: '保湿を続ける' } : c)) };
  expect(r.hasResearchTheme(themed.cells)).toBe(true);
  const o = r.buildResearchOrder(themed, w0.id, 'deepresearch');
  expect(o.ok).toBe(true);
  if (!o.ok) throw new Error('unreachable');
  expect(o.adjacentTitles, '隣接＝記述のあるマスだけ').toEqual(['着地点（書いた）']);
  expect(r.buildResearchOrder(themed, ph6.id, 'deepresearch'), 'テーマがあっても未記入は拒否').toMatchObject({ ok: false, reason: r.MANDALA_RESEARCH_REJECT_PLACEHOLDER });
  expect(r.cellOrderState(themed.cells, w0)).toEqual({ enabled: true, reason: null });
  expect(JSON.stringify(r.buildResearchOrder({ id: u(900), cells: [...themed.cells].reverse() }, w0.id, 'deepresearch')), '逆順入力で一致').toBe(JSON.stringify(o));
  // ⑤ ソース固定: presets → shared は型だけ（実行時の循環参照なし）。shared → presets は値。一覧 SQL は written CTE で同じ判定
  const presetSrc = readFileSync(join(__dirname, '../../src/lib/mandala-presets.ts'), 'utf8');
  expect(presetSrc).toMatch(/^import type \{[^}]*\} from '@\/lib\/mandala-shared';/m);
  expect(presetSrc).not.toMatch(/^import \{[^}]*\} from '@\/lib\/mandala-shared';/m);
  const sharedSrc = readFileSync(join(__dirname, '../../src/lib/mandala-shared.ts'), 'utf8');
  expect(sharedSrc).toMatch(/^import \{ presetInitialTitlesAt \} from '@\/lib\/mandala-presets';/m);
  const serverSrc = readFileSync(join(__dirname, '../../src/lib/mandala-server.ts'), 'utf8');
  expect(serverSrc, '一覧の件数は written CTE（未記入を除く）から数える').toMatch(/WITH written AS \([^]*?x\.meta \? 'tier'[^]*?FROM written w WHERE w\.chart_id = ch\.id AND w\.depth = 1\) AS filled_count/);
  expect(serverSrc, '発注の印はサーバでも未記入とテーマ無しを拒否').toMatch(/if \(isPresetPlaceholder\(cur\)\) return \{ ok: false, reason: 'empty', message: MANDALA_RESEARCH_REJECT_PLACEHOLDER \};/);
  expect(serverSrc).toMatch(/reason: 'no_theme', message: MANDALA_RESEARCH_REJECT_NO_THEME/);
  const batchSrc = readFileSync(join(__dirname, '../../src/app/api/batch-research/route.ts'), 'utf8');
  expect(batchSrc, 'バッチ登録は INSERT の前に未記入・テーマ無しを 400').toMatch(/placeholders\.length > 0\) return NextResponse\.json\([^]*?status: 400[^]*?INSERT INTO batch_research_jobs/);
});

test('U84: テキスト分析の実行ボタン配置（313）— 狭幅は容器幅（0 は非表示・640 未満）・キーボード中（テキスト入力にフォーカス）は出さない・無効化の理由は R-101 の順（分析中→本文空→タイプ0）・下余白はバーの実測高さ＋余白・セーフエリアは padding-bottom の env()・ソース固定: 実行ボタンは1要素＝ハンドラ1つ（R-88）・共通部品は body へ portal し R-80 の zoom 補正・追従ボタンは CSS 変数で上へ逃げる', async () => {
  const b = stickyBar;
  // ① 狭幅判定は容器の幅（display:none＝0 は「狭幅ではない」＝別タブでは出ない）
  expect(b.isStickyBarNarrow(0)).toBe(false);
  expect(b.isStickyBarNarrow(390)).toBe(true);
  expect(b.isStickyBarNarrow(639)).toBe(true);
  expect(b.isStickyBarNarrow(640)).toBe(false);
  expect(b.STICKY_BAR_NARROW_MAX_WIDTH).toBe(640);
  expect(b.shouldShowStickyBar(true, false)).toBe(true);
  expect(b.shouldShowStickyBar(true, true), 'キーボード中は出さない').toBe(false);
  expect(b.shouldShowStickyBar(false, false)).toBe(false);
  // ② キーボードを呼ぶ要素
  expect(b.isTextEntryTarget({ tagName: 'TEXTAREA' })).toBe(true);
  expect(b.isTextEntryTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
  expect(b.isTextEntryTarget({ tagName: 'INPUT' })).toBe(true);
  expect(b.isTextEntryTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
  expect(b.isTextEntryTarget({ tagName: 'BUTTON' })).toBe(false);
  expect(b.isTextEntryTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  expect(b.isTextEntryTarget(null)).toBe(false);
  // ③ 無効化の理由（R-101）・余白・セーフエリア
  expect(b.runDisabledReason({ loading: false, hasText: false, typeCount: 0 })).toBe('分析するテキストを入力してください');
  expect(b.runDisabledReason({ loading: false, hasText: true, typeCount: 0 })).toBe('分析タイプを1つ以上選択してください');
  expect(b.runDisabledReason({ loading: true, hasText: true, typeCount: 2 })).toContain('分析中');
  expect(b.runDisabledReason({ loading: false, hasText: true, typeCount: 2 })).toBeNull();
  expect(b.stickyBarReserve(0)).toBe(0);
  expect(b.stickyBarReserve(58.4)).toBe(59 + b.STICKY_BAR_RESERVE_EXTRA);
  expect(b.stickyBarPaddingBottom()).toContain('env(safe-area-inset-bottom');
  // ④ ソース固定（R-111）
  const panel = readFileSync(join(__dirname, '../../src/components/text-analysis/TextAnalysisPanel.tsx'), 'utf8');
  expect(panel.match(/data-kb-run/g)?.length, '実行ボタンは1要素（313改訂: 操作行の先頭に1つ）').toBe(1);
  expect(panel.match(/onClick=\{handleAnalyze\}/g)?.length, 'ハンドラは1つ（複製しない・R-88）').toBe(1);
  // 313改訂: 固定バーはこの画面から撤去（部品 StickyActionBar は残す＝🔭DR・横展開候補用）
  expect(panel).not.toContain('StickyActionBar');
  // 313再改訂（院長判断）: 「📋 クリアして貼付」を復元（ボタン＋⌘⇧V は同じ handleClearAndPaste・R-76 の順序は lib）。「📋 ペースト」は🗂から外す
  expect(panel.match(/data-clear-paste/g)?.length, 'クリアして貼付は1つ').toBe(1);
  expect(panel).toMatch(/onClick=\{\(\) => void handleClearAndPaste\(\)\}/);
  expect(panel).toMatch(/onClearPaste: \(\) => void handleClearAndPaste\(\)/);
  expect(panel).toMatch(/const result = await clearAndPaste\(\{/);
  expect(panel).not.toContain('PasteButton');
  expect(panel).not.toContain('data-paste-button');
  expect(panel).toMatch(/<span\s+data-ta-actions[^]*?\{runButton\}/);
  expect(panel).not.toMatch(/\{\/\* 実行ボタン \*\/\}/);
  const bar = readFileSync(join(__dirname, '../../src/components/StickyActionBar.tsx'), 'utf8');
  expect(bar).toContain('createPortal(');
  expect(bar).toMatch(/toLayoutPx\(r\.left, z\)/);
  expect(bar).toContain('paddingBottom: stickyBarPaddingBottom()');
  expect(bar).toMatch(/setProperty\(STICKY_BAR_HEIGHT_VAR/);
  const theme = readFileSync(join(__dirname, '../../src/components/ThemeProvider.tsx'), 'utf8');
  expect(theme, '追従ボタン（↑ 等）はバーの高さ分だけ上へ逃げる').toMatch(/floatingBottom\(slot: number\): string \{[^]*?var\(--lumina-sticky-bar-h, 0px\)/);
  expect(b.STICKY_BAR_HEIGHT_VAR).toBe('--lumina-sticky-bar-h');
});

test('U85: 並列比較の確認ダイアログ・費用/所要時間の目安・GPT-6 Astra・独立実行（314）— 費用は同じ入力で同じ金額・Gemini の単価は 2026/12/31 と 2027/1/1（JST）で切り替わる・Opus/GPT は出力2倍・確認日が添え書きに入る・所要時間の目安（GPT は未計測）と「完了しない見込み」（90%）・既定の選択は Gemini＋Opus で使えない/見込み超えは外す・最少2つ（R-101）・タイムアウトの積算（R-73: サーバ個別＜maxDuration＜クライアント・リトライ0）・maxDuration 600 が route/vercel.json と一致（R-83）・未提供（403/404/model不明）とツール拒否の判定・ソース固定（モデルごとに別リクエスト・timeout イベント・GPT は fetch 直叩きで SDK なし）', () => {
  const m = modelCompare;
  const p = modelPricing;
  const o = openaiResearch;
  // ① 単価の有効期日（JST）と確認日
  expect(p.PRICING_CHECKED_ON).toBe('2026-09-09');
  expect(p.unitPriceOn('gemini-3.7-flash', '2026-12-31')).toMatchObject({ inputPerM: 0.75, outputPerM: 3.75 });
  expect(p.unitPriceOn('gemini-3.7-flash', '2027-01-01')).toMatchObject({ inputPerM: 1.5, outputPerM: 7.5 });
  expect(p.unitPriceOn('claude-opus-5', '2026-09-09')).toMatchObject({ inputPerM: 5, outputPerM: 25, reasoningInOutput: true });
  expect(p.unitPriceOn('gpt-6-astra', '2026-09-09')).toMatchObject({ inputPerM: 10, outputPerM: 50, reasoningInOutput: true });
  expect(p.unitPriceOn('nope', '2026-09-09')).toBeNull();
  expect(p.pricingNote('2026-09-09')).toContain('2026-09-09');
  expect(p.pricingNote('2026-09-09')).toContain('上限ではありません');
  // ② 推定: 入力＝お題＋定型、出力＝分量の目標。Opus/GPT は出力2倍。同じ入力→同じ金額（決定的）
  const g = p.estimateCost('gemini-3.7-flash', 'standard', 100, '2026-09-09')!;
  expect(g.inputTokens).toBe(100 + p.COMPARE_INPUT_OVERHEAD_TOKENS['gemini-3.7-flash']);
  expect(p.estimateCost('gpt-6-astra', 'quick', 100, '2026-09-09')!.inputTokens, 'Web 検索の結果が入力に数えられる（B35 実測 22,963 tok）').toBe(100 + 23000);
  expect(g.outputTokens).toBe(3000);
  expect(g.usd).toBeCloseTo((1600 / 1e6) * 0.75 + (3000 / 1e6) * 3.75, 8);
  const op = p.estimateCost('claude-opus-5', 'standard', 100, '2026-09-09')!;
  expect(op.outputTokens, '思考分を2倍').toBe(6000);
  expect(p.estimateCost('gpt-6-astra', 'deep', 0, '2026-09-09')!.outputTokens).toBe(10000);
  expect(p.estimateCost('claude-opus-5', 'quick', 100, '2026-09-09')!.usd).toBe(p.estimateCost('claude-opus-5', 'quick', 100, '2026-09-09')!.usd);
  expect(p.estimateCost('gemini-3.7-flash', 'standard', 100, '2027-01-01')!.usd, '単価の切り替えで金額が変わる').toBeCloseTo(g.usd * 2, 8);
  expect(p.costOf('claude-opus-5', 6755, 3692, '2026-09-09')).toBeCloseTo(0.033775 + 0.0923, 6);
  expect(p.formatUsd(0.004)).toBe('$0.01 未満');
  expect(p.formatUsd(0.126)).toBe('約 $0.13');
  // ③ 所要時間の目安と「完了しない見込み」
  expect(p.estimatedSeconds('gpt-6-astra', 'standard')).toBeNull();
  expect(p.estimatedSecondsLabel('gpt-6-astra', 'quick'), 'quick は B35 の実測').toBe('約40秒');
  expect(p.estimatedSecondsLabel('gpt-6-astra', 'standard')).toBe('未計測');
  expect(p.estimatedSecondsLabel('gemini-3.7-flash', 'standard')).toBe('約25秒');
  expect(p.estimatedSecondsLabel('claude-opus-5', 'deep')).toBe('約5分');
  expect(p.isLikelyToTimeout('claude-opus-5', 'deep', 300), '300秒なら deep の目安（300）は 90%（270）超＝見込み超え').toBe(true);
  expect(p.isLikelyToTimeout('claude-opus-5', 'deep', m.DEEPRESEARCH_MAX_DURATION_S), '600秒なら内側').toBe(false);
  expect(p.isLikelyToTimeout('gpt-6-astra', 'deep', 300), '未計測は警告しない').toBe(false);
  // ④ 既定の選択・最少2つ（R-101）
  const all = { gemini: true, opus: true, gpt: true };
  expect(m.defaultCompareSelection('standard', all)).toEqual(['gemini', 'opus']);
  expect(m.defaultCompareSelection('standard', { gemini: true, opus: false, gpt: true }), '使えないモデルは外す').toEqual(['gemini']);
  expect(m.defaultCompareSelection('deep', all, 300), '見込み超えは既定で外す').toEqual(['gemini']);
  expect(m.compareStartState(['gemini'])).toEqual({ enabled: false, reason: m.COMPARE_MIN_SIDES_REASON });
  expect(m.compareStartState(['gemini', 'opus']).enabled).toBe(true);
  expect(m.compareStartState(['gemini', 'opus', 'gpt']).enabled).toBe(true);
  expect(m.normalizeCompareSides(['gpt', 'gemini', 'gpt', 'x'])).toEqual(['gemini', 'gpt']);
  expect(m.compareSaveCountLabel(3)).toContain('3 件');
  expect(m.COMPARE_SIDE_MODEL_ID.gpt).toBe('gpt-6-astra');
  expect(m.COMPARE_SIDE_LABEL.gpt).toBe('GPT-6 Astra');
  expect(m.COMPARE_BUTTON_LABEL).toContain('GPT-6 Astra');
  expect(m.COMPARE_STATUS_LABEL.timeout).toContain('中断');
  expect(m.isCompareRerunnable({ status: 'timeout', text: '' })).toBe(true);
  expect(m.isCompareRerunnable({ status: 'done', text: 'x' })).toBe(false);
  const runs = m.initialCompareRuns(['gpt', 'gemini']);
  expect(m.compareRunSides(runs), '列の順は固定').toEqual(['gemini', 'gpt']);
  expect(m.allCompareSettled(runs)).toBe(false);
  runs.gemini!.status = 'timeout';
  runs.gpt!.status = 'done';
  expect(m.allCompareSettled(runs), '中断も「終わった」に含める').toBe(true);
  // ⑤ タイムアウトの積算（R-73）と maxDuration の一致（R-83）
  expect(m.DEEPRESEARCH_MAX_DURATION_S).toBe(600);
  expect(m.COMPARE_RETRIES).toBe(0);
  expect(m.COMPARE_SERVER_TIMEOUT_MS * (1 + m.COMPARE_RETRIES), 'サーバ個別タイムアウト（リトライ込み）は maxDuration の内側').toBeLessThan(m.DEEPRESEARCH_MAX_DURATION_S * 1000);
  expect(m.COMPARE_CLIENT_TIMEOUT_MS, 'クライアントの打ち切りはサーバより後').toBeGreaterThan(m.DEEPRESEARCH_MAX_DURATION_S * 1000);
  const route = readFileSync(join(__dirname, '../../src/app/api/deepresearch/route.ts'), 'utf8');
  expect(route).toContain('export const maxDuration = 600;');
  const vercel = JSON.parse(readFileSync(join(__dirname, '../../vercel.json'), 'utf8'));
  expect(vercel.functions['src/app/api/deepresearch/route.ts'].maxDuration).toBe(600);
  // ⑥ OpenAI: 未提供とツール拒否の判定（純関数）
  expect(o.isOpenAIUnavailable(404, null)).toBe(true);
  expect(o.isOpenAIUnavailable(403, { error: { message: 'no access' } })).toBe(true);
  expect(o.isOpenAIUnavailable(400, { error: { code: 'model_not_found', message: 'The model `gpt-6-astra` does not exist' } })).toBe(true);
  expect(o.isOpenAIUnavailable(400, { error: { param: 'tools[0]', message: 'Unsupported tool web_search' } })).toBe(false);
  expect(o.isOpenAIToolRejected(400, { error: { param: 'tools[0]', message: 'Unsupported tool' } })).toBe(true);
  expect(o.isOpenAIToolRejected(429, { error: { message: 'rate' } })).toBe(false);
  expect(o.describeOpenAIError(404, null)).toBe(o.OPENAI_UNAVAILABLE_MESSAGE);
  expect(o.describeOpenAIError(429, { error: { message: 'slow down' } })).toContain('slow down');
  // ⑦ ソース固定（R-111）: モデルごとに別リクエスト・timeout イベント・fetch 直叩き（SDK なし）・比較経路は fallback:false のまま
  expect(route).toMatch(/const timeoutTimer = setTimeout\(\(\) => \{\s*timedOut = true;\s*abort\.abort\(\);\s*\}, COMPARE_SERVER_TIMEOUT_MS\);/);
  expect(route).toMatch(/send\(\{ type: 'timeout', message: COMPARE_TIMEOUT_MESSAGE/);
  expect(route).toMatch(/\} else if \(compareSide === 'gpt'\) \{[^]*?streamOpenAIResearch\(\{/);
  expect(route).toMatch(/\{ fallback: false, signal: abort\.signal \}/);
  const openai = readFileSync(join(__dirname, '../../src/lib/openai-research.ts'), 'utf8');
  expect(openai).toContain("fetch(OPENAI_RESPONSES_URL");
  expect(openai).not.toMatch(/from 'openai'/);
  expect(openai, 'キーの値をログに出さない').not.toMatch(/console\.[a-z]+\([^)]*apiKey/);
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
  expect(pkg.dependencies?.openai, 'SDK を足していない').toBeUndefined();
  const page = readFileSync(join(__dirname, '../../src/app/dashboard/deepresearch/page.tsx'), 'utf8');
  expect(page, '比較ボタンはダイアログを開くだけ（通常の開始は不変）').toMatch(/data-compare-run\s+onClick=\{\(\) => setCompareDialogOpen\(true\)\}/);
  expect(page).toMatch(/data-kb-run\s+onClick=\{\(\) => research\(\)\}/);
  expect(page, '列ごとに1本の fetch（モデルをまとめない）').toMatch(/sides\.map\(\(side\) => runCompareSide\(side, q, runId\)\)/);
  expect((page.match(/fetch\('\/api\/deepresearch',/g) ?? []).length, '比較の fetch は runCompareSide の1箇所').toBe(1);
});

test('U86: 記事→図解（315）— 元テキストに無い語句の検出（正規化・2文字以上・部分一致）と編集後の再判定・ビフォーアフター型は候補から弾く・NG表現（決定的）で描けない・5種テンプレートの描画文字列がプランと完全一致（固定記号と番号を除く）・同じ入力→同じ要素木（決定的）・折り返しは行数で見積もる（R-72）・向きの最小高さ・イメージのプロンプト（既定は文字なし・aiText はプランの文字列をそのまま）と専用ガード（医療3条項は同文）・GPT Image 2.5 の単価と確認日・費用の目安・冪等キー・保存の出どころ（settings.visual）・サイドバー登録＋addedAt（R-84）', async () => {
  const v = visuals;
  const t = visualTemplates;
  const src = '朝の保湿は洗顔のあと5分以内に行う。化粧水をなじませてから乳液で蓋をする。夜はクレンジングのあとに同じ手順。週に1回は角質ケアを足す。冬は加湿器で室内の湿度を保つ。';
  const plan: import('../../src/lib/visuals').VisualPlan = { id: 'v1', type: 'steps', title: '朝の保湿', groups: [{ points: ['洗顔のあと5分以内に行う', '化粧水をなじませて', '乳液で蓋をする'] }] };
  // ① 実在しない語句（正規化＝空白・記号・全半角を無視）
  expect(v.findForeignPhrases(plan, src)).toEqual([]);
  expect(v.findForeignPhrases({ ...plan, groups: [{ points: ['洗顔の あと５分以内に行う'] }] }, src), '空白・全角数字の違いは同一視').toEqual([]);
  expect(v.findForeignPhrases({ ...plan, title: '朝のスキンケア' }, src), '言い換えは検出').toEqual(['朝のスキンケア']);
  expect(v.findForeignPhrases({ ...plan, groups: [{ heading: '効果', points: ['必ず治る'] }] }, src)).toEqual(['効果', '必ず治る']);
  expect(v.findForeignPhrases({ ...plan, groups: [{ points: ['5'] }] }, src), '1文字は実在扱い').toEqual([]);
  // 315是正①: 語句単位（付属語を落とす）。元テキストの語句を付属語でつないだ見出しは通り、言い換えの語だけ落ちる
  expect(v.tokenizeContentWords('朝と夜の保湿について')).toEqual(['保湿']);
  expect(v.tokenizeContentWords('化粧水をなじませてから乳液で蓋をする'), '多字の付属語（から・する）と、両側が非ひらがなの1字助詞（で・を）で割る。ひらがな語の内部（なじませて）は割らない・1文字（蓋）は捨てる').toEqual(['化粧水をなじませて', '乳液']);
  expect(v.tokenizeContentWords('こすらないでぬるめの湯温にする'), 'ひらがな語の内部は割らない（粒度より「語が元文字列の部分文字列であること」を優先）').toEqual(['こすら', 'でぬるめの湯温']);
  for (const s0 of ['化粧水をなじませてから乳液で蓋をする', '朝と夜の保湿について', 'こすらないでぬるめの湯温にする']) for (const tk of v.tokenizeContentWords(s0)) expect(v.normalizeForMatch(s0).includes(tk), `語は元文字列の部分文字列: ${tk}`).toBe(true);
  expect(v.findForeignPhrases({ ...plan, title: '朝と夜' }, src), '「朝と夜」は通る（朝・夜は1文字・「と」は付属語）').toEqual([]);
  expect(v.findForeignPhrases({ ...plan, title: '洗顔のあとの保湿と角質ケア' }, src), '元テキストの語句をつないだ見出しは通る').toEqual([]);
  expect(v.findForeignTokens({ ...plan, title: '朝のスキンケアと保湿' }, src), '無い内容語だけを示す').toEqual({ '朝のスキンケアと保湿': ['スキンケア'] });
  expect(v.checkPlan({ ...plan, title: '朝のスキンケア' }, src).foreignTokens).toEqual({ '朝のスキンケア': ['スキンケア'] });
  expect(JSON.stringify(v.findForeignTokens(plan, src)), '同じ入力→同じ結果').toBe(JSON.stringify(v.findForeignTokens(plan, src)));
  // 315是正②: cmap（format 4）の最小パーサで欠字を検出（合成フォント: 'A'〜'C' と '₃' だけを持つ）
  const fc = await import('../../src/lib/font-coverage');
  const mkFont = (ranges: [number, number][]) => {
    const segs = [...ranges, [0xffff, 0xffff] as [number, number]];
    const segX2 = segs.length * 2;
    const cmapLen = 4 + 8 + 14 + segX2 * 4 + 2;
    const buf = new ArrayBuffer(12 + 16 + cmapLen);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x00010000); dv.setUint16(4, 1);
    const tag = 'cmap'; for (let i = 0; i < 4; i++) dv.setUint8(12 + i, tag.charCodeAt(i));
    dv.setUint32(12 + 8, 28); dv.setUint32(12 + 12, cmapLen);
    const c = 28; dv.setUint16(c, 0); dv.setUint16(c + 2, 1); dv.setUint16(c + 4, 3); dv.setUint16(c + 6, 1); dv.setUint32(c + 8, 12);
    const sub = c + 12; dv.setUint16(sub, 4); dv.setUint16(sub + 2, 14 + segX2 * 4 + 2); dv.setUint16(sub + 6, segX2);
    const endP = sub + 14, startP = endP + segX2 + 2, deltaP = startP + segX2, rangeP = deltaP + segX2;
    segs.forEach(([s, e], i) => { dv.setUint16(endP + i * 2, e); dv.setUint16(startP + i * 2, s); dv.setInt16(deltaP + i * 2, s === 0xffff ? 1 : 1); dv.setUint16(rangeP + i * 2, 0); });
    return buf;
  };
  const font = mkFont([[0x41, 0x43], [0x2083, 0x2083]]);
  expect([...fc.fontCodepoints(font)].sort((a, b) => a - b)).toEqual([0x41, 0x42, 0x43, 0x2083]);
  expect(fc.uncoveredChars('A B₃ Dα', [font]), '無い文字だけ（空白は数えない・重複なし）').toEqual(['D', 'α']);
  expect(fc.uncoveredChars('ABC₃', [font])).toEqual([]);
  expect(fc.fontCodepoints(new ArrayBuffer(3)).size, '読めない構造は空集合（fail-closed）').toBe(0);
  expect(fc.missingGlyphMessage(['α'])).toContain('U+03B1');
  const og = readFileSync(join(__dirname, '../../src/lib/og-fonts.ts'), 'utf8');
  expect(og, 'フォールバックの順は Math → Symbols 2 → Sans').toContain("['Noto Sans Math', 'Noto Sans Symbols 2', 'Noto Sans']");
  const renderRoute = readFileSync(join(__dirname, '../../src/app/api/visuals/render/route.ts'), 'utf8');
  expect(renderRoute, '欠字が残れば描かない（400）').toMatch(/if \(missing\.length > 0\) return NextResponse\.json\(\{ error: missingGlyphMessage\(missing\)/);
  const imageRouteSrc = readFileSync(join(__dirname, '../../src/app/api/visuals/image/route.ts'), 'utf8');
  expect(imageRouteSrc, '文字を重ねる方式は生成前に欠字を止める（課金してから失敗にしない）').toMatch(/if \(!settings\.aiText\) \{\s*const cov = await fetchJpFontsWithFallback/);
  const c1 = v.checkPlan({ ...plan, title: '朝のスキンケア' }, src);
  expect(c1.ok).toBe(false);
  expect(v.planBlockReason(c1)).toBe(v.VISUAL_BLOCK_REASON_FOREIGN);
  expect(v.checkPlan(plan, src).ok, '直せば描ける（再判定）').toBe(true);
  // NG表現（決定的・content-verify）
  const cBanned = v.checkPlan({ ...plan, groups: [{ points: ['必ず治る'] }] }, `${src} 必ず治る`);
  expect(cBanned.banned.length).toBeGreaterThan(0);
  expect(v.planBlockReason(cBanned)).toBe(v.VISUAL_BLOCK_REASON_BANNED);
  expect(v.planBlockReason(v.checkPlan({ ...plan, title: '', groups: [] }, src))).toBe(v.VISUAL_BLOCK_REASON_EMPTY);
  // ② AI 出力の検証: 型・ビフォーアフター・上限
  const parsed = v.parseVisualPlans({ visuals: [
    { type: 'steps', title: '朝の保湿', groups: [{ points: ['a', 'b'] }] },
    { type: 'beforeafter', title: '前後', groups: [{ points: ['x'] }, { points: ['y'] }] },
    { type: 'nope', title: 'x', groups: [{ points: ['x'] }] },
    { type: 'image', title: '冬の保湿', groups: [{ points: ['加湿器'] }], imagePrompt: '冬の部屋' },
    { type: 'table', title: '', groups: [] },
  ] });
  expect(parsed.plans.map((p) => p.type)).toEqual(['steps', 'image']);
  expect(parsed.plans[1].imagePrompt).toBe('冬の部屋');
  expect(parsed.rejected.map((r) => r.reason)[0]).toContain('ビフォーアフター');
  expect(v.parseVisualPlans({ visuals: Array.from({ length: 9 }, (_, i) => ({ type: 'flow', title: `t${i}`, groups: [{ points: ['p'] }] })) }).plans.length, '上限6').toBe(6);
  // ③ 5種テンプレート: 描画文字列＝プランの文字列（固定記号・番号を除く）・決定的
  const plans: import('../../src/lib/visuals').VisualPlan[] = [
    { id: 't', type: 'table', title: '保湿の比較表', groups: [{ heading: '朝', points: ['化粧水', '乳液'] }, { heading: '夜', points: ['クレンジング', '乳液'] }] },
    { id: 'f', type: 'flow', title: '朝の流れ', groups: [{ points: ['洗顔', '化粧水', '乳液', '日焼け止め', '仕上げ'] }] },
    { id: 'c', type: 'compare', title: '朝と夜', groups: [{ heading: '朝', points: ['5分以内'] }, { heading: '夜', points: ['クレンジング'] }] },
    { id: 's', type: 'steps', title: '手順', groups: [{ heading: '基本', points: ['洗顔', '化粧水'] }] },
    { id: 'k', type: 'concept', title: '保湿', groups: [{ heading: '朝', points: ['洗顔'] }, { heading: '夜', points: ['クレンジング'] }, { heading: '週1', points: ['角質ケア'] }] },
  ];
  for (const p of plans) {
    for (const o of v.VISUAL_ORIENTATIONS) {
      const a = t.buildVisualElement(p, o);
      const verified = t.verifyRenderedText(p, a.element);
      expect(verified, `${p.type}/${o} の文字列が一致`).toMatchObject({ ok: true, missing: [], extra: [] });
      expect(JSON.stringify(t.buildVisualElement(p, o)), '同じ入力→同じ要素木').toBe(JSON.stringify(a));
      expect(a.canvas.width).toBe(v.VISUAL_CANVAS_WIDTH[o]);
      expect(a.canvas.height, '向きの最小高さ').toBeGreaterThanOrEqual(v.minCanvasHeight(o));
    }
  }
  const longPlan = { ...plans[3], groups: [{ points: Array.from({ length: 8 }, (_, i) => String.fromCharCode(0x3042 + i).repeat(120)) }] };
  expect(t.estimateVisualHeight(longPlan, 'landscape'), '長い要素は行数ぶん高くなる（省略しない・R-72）').toBeGreaterThan(t.estimateVisualHeight(plans[3], 'landscape'));
  expect(v.wrapText('あいうえおかきくけこ', 4)).toEqual(['あいうえ', 'おかきく', 'けこ']);
  expect(v.lineCount('', 10)).toBe(1);
  // 重ね: 画像の上にタイトルと文字。文字列はプランどおり
  const imgPlan: import('../../src/lib/visuals').VisualPlan = { id: 'i', type: 'image', title: '冬の保湿', groups: [{ heading: '加湿器', points: ['湿度を保つ'] }] };
  const overlay = t.buildOverlayElement(imgPlan, 'data:image/png;base64,AAAA', { width: 1536, height: 1024 });
  expect(t.collectElementText(overlay)).toEqual(['冬の保湿', '加湿器', '湿度を保つ']);
  expect(JSON.stringify(overlay)).toContain('data:image/png;base64,AAAA');
  // ④ イメージのプロンプト: 既定は文字なし・aiText はそのまま列挙。ガードは後勝ち（サーバで連結）・専用ガードの医療3条項は同文
  const p0 = v.buildVisualImagePrompt(imgPlan, { aiText: false, extraPrompt: '' });
  expect(p0).toContain(v.VISUAL_IMAGE_NO_TEXT_RULE);
  expect(p0).not.toContain('【文字列】');
  const p1 = v.buildVisualImagePrompt(imgPlan, { aiText: true, extraPrompt: '青を基調' });
  expect(p1).toContain('【文字列】');
  expect(p1).toContain('- 冬の保湿');
  expect(p1).toContain('- 湿度を保つ');
  expect(p1).toContain('追加の指示: 青を基調');
  expect(guardImagePrompt(p0).endsWith(IMAGE_GUARD_SUFFIX)).toBe(true);
  expect(guardImagePromptWithText(p1).endsWith(IMAGE_GUARD_SUFFIX_WITH_TEXT)).toBe(true);
  const medical = '実在の人物や特定できる顔を描かない。患部・症状の写実的描写や効果効能を示唆する演出をしない。';
  expect(IMAGE_GUARD_SUFFIX).toContain(medical);
  expect(IMAGE_GUARD_SUFFIX_WITH_TEXT, '医療の条項は同文（緩和なし）').toContain(medical);
  expect(IMAGE_GUARD_SUFFIX_WITH_TEXT).toContain('一字一句');
  // ⑤ 単価・確認日・費用の目安（決定的）・冪等キー
  expect(IMAGE_PRICING_CHECKED_ON).toBe('2026-09-09');
  expect(IMAGE_MODEL_IDS.flare).toBe('gpt-image-2.5-flare');
  const e = estimateImageCost('medium', 'landscape', 200);
  expect(e.outputTokens).toBe(1584);
  expect(e.usd).toBeCloseTo((1584 / 1e6) * 30 + (200 / 1e6) * 5, 8);
  expect(estimateImageCost('low', 'square', 0).usd).toBeCloseTo(0.00816, 6);
  expect(estimateImageCost('high', 'square', 0).usd).toBeCloseTo(0.1248, 6);
  expect(estimateImageCost('medium', 'landscape', 200)).toEqual(e);
  expect(imageCostActual({ output_tokens: 1000, input_tokens: 100, input_tokens_details: { text_tokens: 100, image_tokens: 0 } })).toBeCloseTo(0.03 + 0.0005, 8);
  expect(imageCostActual(null)).toBeNull();
  const settings = { ...v.VISUAL_IMAGE_DEFAULT_SETTINGS };
  expect(v.visualImageIdempotencyKey(imgPlan, settings)).toBe(v.visualImageIdempotencyKey({ ...imgPlan }, { ...settings }));
  expect(v.visualImageIdempotencyKey(imgPlan, settings)).not.toBe(v.visualImageIdempotencyKey(imgPlan, { ...settings, quality: 'high' }));
  // ⑥ 出どころ（settings.visual・キー単位）・保存名・件数ラベル・結合
  const gs = v.buildVisualGallerySettings({ kind: 'render', plan, orientation: 'landscape', sources: [{ scope: 'library', id: '12', title: '記事A' }], width: 1600, height: 900, model: 'og-render', generatedAt: '2026-09-09T00:00:00.000Z' });
  expect(gs.visual.sourceKeys).toEqual(['library:12']);
  expect(gs.size).toBe('1600x900');
  expect(v.visualSaveTitle(plan, 'image-original')).toContain('（元画像）');
  expect(v.visualCountLabel(3)).toBe('🖼 3');
  expect(v.joinVisualSources([{ scope: 'library', id: '1', title: 'A' }, { scope: 'library', id: '2', title: 'B' }], ['本文A', '本文B'])).toBe('# A\n\n本文A\n\n---\n\n# B\n\n本文B');
  expect(v.VISUAL_SOURCE_MAX_ITEMS).toBe(3);
  expect(v.buildVisualPlanPrompt('本文').prompt).toContain('beforeafter を使わない');
  // ⑦ サイドバー登録（R-84）・ソース固定（R-108: 純関数は DB を読まない）
  const ni = await import('../../src/lib/nav-items');
  const item = ni.ALL_NAV_ITEMS.find((i) => i.href === '/dashboard/visuals');
  expect(item, 'サイドバーに登録されている').toBeTruthy();
  expect(item?.addedAt).toBe('2026-09-09');
  for (const f of ['visuals.ts', 'visual-templates/index.ts', 'model-pricing.ts']) {
    const srcFile = readFileSync(join(__dirname, `../../src/lib/${f}`), 'utf8');
    expect(srcFile).not.toMatch(/from '@\/lib\/(db|mandala-server|visuals-server)'/);
  }
  const imageRoute = readFileSync(join(__dirname, '../../src/app/api/visuals/image/route.ts'), 'utf8');
  expect(imageRoute, 'ガードはサーバで後から連結（R-69）').toMatch(/settings\.aiText \? guardImagePromptWithText\(buildVisualImagePrompt\(plan, settings\)\) : guardImagePrompt\(buildVisualImagePrompt\(plan, settings\)\)/);
  expect(imageRoute).toMatch(/IMAGE_TIMEOUT_MS = 240_000/);
  expect(imageRoute).toContain('export const maxDuration = 300;');
  const openaiImage = readFileSync(join(__dirname, '../../src/lib/openai-image.ts'), 'utf8');
  expect(openaiImage).not.toMatch(/from 'openai'/);
  expect(openaiImage).not.toMatch(/console\.[a-z]+\([^)]*apiKey/);
  const gallery = readFileSync(join(__dirname, '../../src/app/api/gallery/route.ts'), 'utf8');
  expect(gallery, '保存元はオプトイン（既定は従来の image-gen）').toContain("const source = body.source === 'visuals' ? 'visuals' : 'image-gen';");
});

test('U88: 記事→マンダラ生成（316）— evidence が本文に無い要点／小項目は捨てて件数（空白・改行の正規化だけ・言い換えは通さない）・relations.to が 4／自分／範囲外／捨てた要点なら捨てる・上限超えは切らず捨てる（R-101）・要点2件未満で失敗（fail-closed）・同じ入力→同じ結果・引用は Markdown 引用で末尾・meta の読み書き（generated/relations/origin）・再生成は edited があれば無効化＋理由（R-76）・既定モード（3,000字）・費用の目安・添字→position の写し・maxTokens 下限2048と R-73', () => {
  const g = mandalaGenerate;
  const article = '朝の保湿は洗顔のあと5分以内に行う。\n化粧水をなじませてから乳液で蓋をする。夜はクレンジングのあとに同じ手順で保湿する。週に1回は角質ケアを足す。冬は加湿器で室内の湿度を保つ。乾燥が強い日は保湿剤を重ねづけする。';
  const stage1 = {
    center: { title: '保湿の基本', body: '朝と夜の保湿の手順。' },
    points: [
      { position: 0, title: '朝の保湿', body: '洗顔後すぐに保湿する。化粧水のあと乳液で蓋をする。', evidence: '洗顔のあと5分以内に行う', relations: [{ to: 1, label: '同じ手順' }, { to: 4, label: '中央は不可' }, { to: 0, label: '自分は不可' }, { to: 7, label: '存在しない要点' }] },
      { position: 1, title: '夜の保湿', body: 'クレンジング後に同じ手順で保湿する。', evidence: '同じ 手順で\n保湿する', relations: [] },
      { position: 2, title: '角質ケア', body: '週に1回は角質ケアを足す。', evidence: '週に1回は角質ケアを足す', relations: [{ to: 0, label: 'あ'.repeat(16) }] },
      { position: 3, title: '言い換えの要点', body: '加湿器を使う。', evidence: '冬場は加湿器で部屋の湿度を維持する', relations: [] },
      { position: 5, title: 'これはとても長い見出しで15字を超えている', body: '本文。', evidence: '乾燥が強い日は保湿剤を重ねづけする', relations: [] },
      { position: 6, title: '文が多い', body: '一。二。三。四。五。六。七。', evidence: '乾燥が強い日は保湿剤を重ねづけする', relations: [] },
    ],
  };
  const r = g.validateStage1(stage1, article);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  expect(r.points.map((p) => p.title), '言い換え・上限超え・文数超えは捨てる').toEqual(['朝の保湿', '夜の保湿', '角質ケア']);
  expect(r.dropped.points).toBe(3);
  expect(r.dropped.reasons.some((x) => x.includes('引用が記事本文に見つかりません'))).toBe(true);
  expect(r.points[0].relations, '4・自分・捨てた要点への関連は捨てる').toEqual([{ to: 1, label: '同じ手順' }]);
  expect(r.points[2].relations, 'ラベル16字は捨てる').toEqual([]);
  expect(r.dropped.relations).toBe(4);
  expect(r.points[1].evidence, '空白・改行の違いは通す（正規化のみ）').toBe('同じ 手順で\n保湿する');
  expect(JSON.stringify(g.validateStage1(stage1, article)), '同じ入力→同じ結果').toBe(JSON.stringify(r));
  const few = g.validateStage1({ center: { title: 'x', body: '' }, points: [stage1.points[0], stage1.points[3]] }, article);
  expect(few.ok, '根拠のある要点が1件＝失敗').toBe(false);
  expect(g.validateStage1({ center: { title: 'あ'.repeat(21), body: '' }, points: stage1.points }, article).ok, '中央20字超は失敗').toBe(false);
  // position 未指定は 0,1,2,3,5… の順に割り当て
  const auto = g.validateStage1({ center: { title: 't', body: '' }, points: stage1.points.slice(0, 3).map(({ position: _p, ...rest }) => rest) }, article);
  expect(auto.ok && auto.points.map((p) => p.position)).toEqual([0, 1, 2]);
  // 添字→position（プロンプトは添字で書かせる）
  const remapped = g.remapRelationIndexes({ center: {}, points: [{ title: 'a', relations: [{ to: 1, label: 'x' }] }, { title: 'b' }, { title: 'c', relations: [{ to: 4, label: 'y' }] }] }) as { points: { position: number; relations: { to: number }[] }[] };
  expect(remapped.points.map((p) => p.position)).toEqual([0, 1, 2]);
  expect(remapped.points[0].relations[0].to).toBe(1);
  expect(remapped.points[2].relations[0].to, '添字4＝position 5').toBe(5);
  // 第2段階
  const s2 = g.validateStage2({ items: [
    { title: '化粧水', body: '化粧水をなじませる。', evidence: '化粧水をなじませてから乳液で蓋をする' },
    { title: '言い換え', body: '…', evidence: '化粧水を肌に染み込ませる' },
    { title: 'これはとても長い見出しで15字を超えている', body: '…', evidence: '週に1回は角質ケアを足す' },
    ...Array.from({ length: 9 }, (_, i) => ({ title: `項目${i}`, body: '本文。', evidence: '週に1回は角質ケアを足す' })),
  ] }, article);
  expect(s2.ok).toBe(true);
  if (!s2.ok) throw new Error('unreachable');
  expect(s2.items.length, '最大8（9件目以降は捨てる）').toBe(8);
  expect(s2.items.map((i) => i.position)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  expect(s2.dropped.items).toBe(1 + 1 + 2);
  expect(g.validateStage2({ items: [{ title: 'x', body: 'y', evidence: '本文に無い' }] }, article).ok).toBe(false);
  // 引用の書き方・meta・origin・再生成
  expect(g.cellBodyWithEvidence('本文。', '引用文')).toBe('本文。\n\n> 引用: 引用文');
  const meta = { generated: { source: { scope: 'library', item_key: '12', title: '記事A' }, model: 'gemini-3.7-flash', mode: '81', generatedAt: '2026-09-09T00:00:00.000Z', dropped: { points: 1, items: 2 } }, relations: [{ from: 0, to: 1, label: '同じ手順' }, { from: 2, to: 0, label: '補足' }] };
  const gm = g.parseGeneratedMeta(meta)!;
  expect(gm.mode).toBe('81');
  expect(gm.dropped).toEqual({ points: 1, items: 2 });
  expect(g.parseGeneratedMeta({})).toBeNull();
  expect(g.relationsOf(g.parseRelations(meta), 0)).toEqual([{ position: 1, label: '同じ手順', direction: 'out' }, { position: 2, label: '補足', direction: 'in' }]);
  expect(g.relationsOf(g.parseRelations(meta), 5)).toEqual([]);
  expect(g.relationsFromPoints(r.points)).toEqual([{ from: 0, to: 1, label: '同じ手順' }]);
  const ai = { meta: { origin: 'ai' } };
  const ed = { meta: { origin: 'edited' } };
  expect(g.cellOrigin(ai)).toBe('ai');
  expect(g.cellOrigin({ meta: {} })).toBeNull();
  expect(g.hasAiOrigin([{ meta: {} }, ai])).toBe(true);
  expect(g.regenerateState([ai, ai]).enabled).toBe(true);
  expect(g.regenerateState([ai, ed])).toMatchObject({ enabled: false });
  expect(g.regenerateState([ai, ed]).reason).toContain('編集');
  expect(g.generatedSourceHref({ scope: 'library', item_key: '12', title: '' })).toBe('/dashboard/library?open=12');
  expect(g.generatedBadgeLabel(gm)).toContain('記事から生成');
  // 既定モード・費用・maxTokens／タイムアウト（R-73）
  expect(g.defaultGenerateMode(2999)).toBe('9');
  expect(g.defaultGenerateMode(3000)).toBe('81');
  expect(g.estimateGenerateCost(3000, '9', '2026-09-09')).toBeCloseTo(((3000 + 1500) / 1e6) * 0.75 + (2500 / 1e6) * 3.75, 8);
  expect(g.estimateGenerateCost(3000, '81', '2026-09-09')!).toBeGreaterThan(g.estimateGenerateCost(3000, '9', '2026-09-09')!);
  expect(g.GEN_STAGE1_MAX_TOKENS).toBeGreaterThanOrEqual(2048);
  expect(g.GEN_STAGE2_MAX_TOKENS).toBeGreaterThanOrEqual(2048);
  expect(g.GEN_STAGE_TIMEOUT_MS, 'リトライ0・個別タイムアウトは maxDuration の内側').toBeLessThan(g.GEN_MAX_DURATION_S * 1000);
  expect(g.buildStage1Prompt(article).prompt).toContain('補わない');
  expect(g.buildStage2Prompt(article, r.points[0]).prompt).toContain('原文そのまま');
  // ソース固定: ルートの maxDuration とサーバ側 saveCell の origin 書き換え・純関数は DB を読まない
  for (const f of ['generate/route.ts', 'generate/point/route.ts']) {
    const src = readFileSync(join(__dirname, `../../src/app/api/mandala/${f}`), 'utf8');
    expect(src).toContain(`export const maxDuration = ${g.GEN_MAX_DURATION_S};`);
  }
  const server = readFileSync(join(__dirname, '../../src/lib/mandala-server.ts'), 'utf8');
  expect(server, 'PATCH で内容差分があれば ai→edited（同じ UPDATE 文・キー単位）').toMatch(/meta = CASE WHEN meta->>'origin' = 'ai' THEN meta \|\| '\{"origin":"edited"\}'::jsonb ELSE meta END/);
  const lib = readFileSync(join(__dirname, '../../src/lib/mandala-generate.ts'), 'utf8');
  expect(lib).not.toMatch(/from '@\/lib\/(db|mandala-server)'/);
  // R-97: 「> 引用: …」は renderMarkdown で blockquote になり、生の「>」が出ない。連続行は1つにまとまる
  const html = renderMarkdown(g.cellBodyWithEvidence('本文です。', '洗顔のあと5分以内に行う'));
  expect(html).toContain('<blockquote>引用: 洗顔のあと5分以内に行う</blockquote>');
  expect(html).not.toContain('&gt; 引用');
  expect(renderMarkdown('> 一行目\n> 二行目')).toContain('<blockquote>一行目<br/>二行目</blockquote>');
});

test('U89: AIでまとめるの二段出力とプレゼン素材パック（317）— 目標の文字数と maxTokens（下限2048）・タイムアウトはリトライ込みで maxDuration の内側で明示の終端（R-73/R-118・ルート/定数の一致 R-83）・要約＋詳細のタグと metadata・type=merge の要約＋詳細が library-groups でペアになる・素材の既定と目安・用語集の実在検証・引用集の決定的抽出・🎁 n の導出・ページ分割・新テンプレート4種（関連図の円周配置と上限8/12・タイムラインは when を解釈しない・数値は引用と完全一致・1枚サマリーの2向きと埋め込み）の文字一致と決定性・種類の絞り込み', async () => {
  const m = mergeReport;
  const p = presentationPack;
  const v = visuals;
  const t = visualTemplates;
  // ① 二段出力の定数
  expect(m.modesOf('both')).toEqual(['summary', 'detail']);
  expect(m.modesOf('summary')).toEqual(['summary']);
  expect(m.MERGE_TARGET.summary).toEqual({ min: 1000, max: 2000 });
  expect(m.MERGE_TARGET.detail).toEqual({ min: 5000, max: 8000 });
  expect(m.MERGE_MAX_TOKENS.summary).toBeGreaterThanOrEqual(2048);
  expect(m.MERGE_MAX_TOKENS.detail).toBeGreaterThanOrEqual(12000);
  expect(m.mergeTargetState(1500, 'summary')).toEqual({ inRange: true, label: '目標内' });
  expect(m.mergeTargetState(900, 'summary').inRange).toBe(false);
  expect(m.mergeTargetState(9000, 'detail').label).toContain('超');
  expect(m.mergeLengthInstruction('detail')).toContain('5,000〜8,000字');
  expect(m.MERGE_TIMEOUT_MS * 1, 'リトライ込みの内部タイムアウトは maxDuration の内側').toBeLessThan(m.MERGE_MAX_DURATION_S * 1000);
  const mergeRoute = readFileSync(join(__dirname, '../../src/app/api/merge/route.ts'), 'utf8');
  expect(mergeRoute).toContain(`export const maxDuration = ${m.MERGE_MAX_DURATION_S};`);
  expect(mergeRoute, '時間切れは明示の終端（timedOut・R-118）').toMatch(/if \(e\?\.timedOut\) return NextResponse\.json\(\{ error: e\.message, timedOut: true/);
  expect(mergeRoute, 'mode 未指定は従来どおり（max_tokens 8000・長さ指示なし）').toContain("max_tokens: mode ? MERGE_MAX_TOKENS[mode] : 8000");
  expect(m.mergeTagsOf('summary')).toBe('統合レポート,要約');
  expect(m.mergeTagsOf('detail')).toBe('統合レポート');
  expect(m.mergeSaveMetadata(['a', 'b'], 'detail')).toEqual({ summaryOf: { sourceIds: ['a', 'b'] }, mergeKind: 'detail' });
  // ② ペア保存: type='merge' の要約＋詳細（同題・同時刻）が1枚のカード（本文＝詳細・要約）
  const now = '2026-09-09T12:00:00.000Z';
  const pair = [
    { id: 'd1', type: 'merge', title: '統合サマリー: X 他1件', tags: m.mergeTagsOf('detail'), metadata: m.mergeSaveMetadata(['a'], 'detail'), created_at: now, group_name: '統合レポート' },
    { id: 's1', type: 'merge', title: '統合サマリー: X 他1件', tags: m.mergeTagsOf('summary'), metadata: m.mergeSaveMetadata(['a'], 'summary'), created_at: now, group_name: '統合レポート' },
  ];
  expect(isPairableItem(pair[0])).toBe(true);
  expect(isPairableItem({ id: 'z', type: 'note-article', title: 'x', tags: '', metadata: {}, created_at: now, group_name: 'x' })).toBe(false);
  const cards = groupLibraryItems317(pair);
  expect(cards, '1枚のカードに本文と要約').toHaveLength(1);
  expect(cards[0].artifacts.map((a) => a.kind)).toEqual(['research', 'summary']);
  expect(cards[0].link).toBe('estimated');
  // ③ 素材パック: 既定・目安・用語集・引用集・🎁 n・ページ分割
  expect(p.PACK_DEFAULT_KINDS).toEqual(['relation', 'onepage', 'slides']);
  expect(p.PACK_KINDS.length).toBe(15);
  expect(p.packEstimateUsd('citations', 5000)).toBe(0);
  expect(p.packEstimateUsd('slides', 5000)!).toBeGreaterThan(0);
  expect(p.packEstimateUsd('image', 5000)!).toBeGreaterThan(p.packEstimateUsd('slides', 5000)!);
  const src = '角層は水分を保つバリアの役割を持つ。冬は空気の乾燥で角層の水分が失われやすい。加湿器で湿度を40%以上に保つ。';
  const g = p.validateGlossary({ terms: [
    { term: '角層', definition: '水分を保つバリア', evidence: '角層は水分を保つバリアの役割を持つ' },
    { term: '角層', definition: '重複', evidence: '角層は水分を保つバリアの役割を持つ' },
    { term: '真皮', definition: 'まとめに無い語', evidence: '角層は水分を保つバリアの役割を持つ' },
    { term: '加湿器', definition: '湿度を保つ', evidence: '加湿器で部屋を潤す' },
  ] }, src);
  expect(g.terms.map((x) => x.term), '実在しない語・引用・重複は捨てる').toEqual(['角層']);
  expect(g.dropped).toBe(3);
  expect(p.glossaryMarkdown(g.terms)).toContain('| 角層 | 水分を保つバリア | 角層は水分を保つバリアの役割を持つ |');
  const cites = p.extractCitations([{ title: '資料A', text: '角層は水分を保つ。加湿器で湿度を40%以上に保つ。「こすらない」が基本。短い。' }, { title: '資料B', text: '加湿器で湿度を40%以上に保つ。' }]);
  expect(cites, '数字か「」を含む文だけ・重複なし・出典つき・決定的').toEqual([
    { quote: '加湿器で湿度を40%以上に保つ。', source: '資料A' },
    { quote: '「こすらない」が基本。', source: '資料A' },
  ]);
  expect(JSON.stringify(p.extractCitations([{ title: 'A', text: src }]))).toBe(JSON.stringify(p.extractCitations([{ title: 'A', text: src }])));
  expect(p.citationsMarkdown(cites)).toContain('- 「加湿器で湿度を40%以上に保つ。」（出典: 資料A）');
  expect(p.packCountsOf([{ id: 'x', metadata: { pack: { of: ['d1', 's1'], kind: 'slides' } } }, { id: 'y', metadata: JSON.stringify({ pack: { of: ['d1'], kind: 'qa' } }) }, { id: 'z', metadata: {} }])).toEqual({ d1: 2, s1: 1 });
  expect(p.splitIntoSlidePages('## 一\n本文1\n\n## 二\n本文2').map((x) => x.title)).toEqual(['一', '二']);
  expect(p.packTitle('slides', '統合サマリー: X 他1件')).toBe('スライド構成案: X 他1件');
  expect(p.packMetadata(['d1'], 'qa', { count: 5 })).toEqual({ pack: { of: ['d1'], kind: 'qa', count: 5 } });
  expect(p.buildSlidesPrompt('本文').prompt, '公開される種類は医療広告ガードが末尾（後勝ち）').toMatch(/医療広告ガイドライン[^]*$/);
  expect(p.PACK_PUBLIC_KINDS).toEqual(['slides', 'qa', 'glossary']);
  // ④ 新テンプレート4種
  const relation: import('../../src/lib/visuals').VisualPlan = { id: 'r', type: 'relation', title: '保湿の関係', groups: [
    { heading: '角層', points: ['→ 乾燥: 失われる', '→ 角層: 自己辺', '→ 無いノード: x'] },
    { heading: '乾燥', points: ['→ 加湿器: 対策', '→ 角層'] },
    { heading: '加湿器', points: [] },
  ] };
  const re = v.relationEdgesOf(relation);
  expect(re.edges).toEqual([{ from: 0, to: 1, label: '失われる' }, { from: 1, to: 2, label: '対策' }, { from: 1, to: 0, label: '' }]);
  expect(re.dropped.length, '自己辺・存在しない相手は捨てる').toBe(2);
  expect(t.expectedStringsOf(relation), '描く文字＝ノード名＋辺ラベル').toEqual(['保湿の関係', '角層', '乾燥', '加湿器', '失われる', '対策']);
  const many = { ...relation, groups: Array.from({ length: 9 }, (_, i) => ({ heading: `N${i}`, points: Array.from({ length: 3 }, (_, j) => `→ N${(i + j + 1) % 9}: e${i}${j}`) })) };
  const parsedMany = v.parseVisualPlans({ visuals: [many] }).plans[0];
  expect(parsedMany.groups.length, 'ノードは上限（parse で切る）').toBeLessThanOrEqual(8);
  expect(v.relationEdgesOf(many).edges.length, '辺は上限12').toBeLessThanOrEqual(12);
  const timeline: import('../../src/lib/visuals').VisualPlan = { id: 'tl', type: 'timeline', title: '経緯', groups: [{ heading: '2024年春', points: ['開始'] }, { heading: '翌月', points: ['拡大', '補足あり'] }, { heading: '未定', points: ['予定'] }] };
  expect(t.expectedStringsOf(timeline)).toEqual(['経緯', '2024年春', '開始', '翌月', '拡大', '補足あり', '未定', '予定']);
  const figures: import('../../src/lib/visuals').VisualPlan = { id: 'fg', type: 'figures', title: '湿度を保つ', groups: [
    { heading: '湿度', points: ['40%以上', '加湿器で湿度を40%以上に保つ'] },
    { heading: '改変された数値', points: ['45%以上', '加湿器で湿度を40%以上に保つ'] },
    { heading: '引用が本文に無い', points: ['3回', '週に3回の洗顔'] },
  ] };
  const issues = v.typedPlanIssues(figures, src);
  expect(Object.keys(issues), '数値が引用と完全一致しない／引用が本文に無いものを検出').toEqual(['45%以上', '週に3回の洗顔']);
  expect(v.checkPlan(figures, src).ok).toBe(false);
  expect(v.checkPlan({ ...figures, groups: [figures.groups[0]] }, src).ok).toBe(true);
  expect(t.expectedStringsOf(figures)).toEqual(['湿度を保つ', '40%以上', '湿度', '45%以上', '改変された数値', '3回', '引用が本文に無い']);
  const onepage: import('../../src/lib/visuals').VisualPlan = { id: 'op', type: 'onepage', title: '保湿の要点', groups: [{ heading: '要点', points: ['朝は5分以内', '夜も同じ手順', '週1回の角質ケア'] }, { heading: '一言', points: ['続けることが大切'] }] };
  expect(t.expectedStringsOf(onepage)).toEqual(['保湿の要点', '朝は5分以内', '夜も同じ手順', '週1回の角質ケア', '続けることが大切']);
  for (const plan of [relation, timeline, { ...figures, groups: [figures.groups[0]] }, onepage]) {
    for (const o of v.VISUAL_ORIENTATIONS) {
      const a = t.buildVisualElement(plan, o);
      expect(t.verifyRenderedText(plan, a.element), `${plan.type}/${o} の文字一致`).toMatchObject({ ok: true });
      expect(JSON.stringify(t.buildVisualElement(plan, o)), '同じ入力→同じ要素木').toBe(JSON.stringify(a));
      expect(a.canvas.height).toBeGreaterThanOrEqual(v.minCanvasHeight(o));
      // satori の規則（B38 で発覚・実描画で throw）: 子が文字列以外（空配列 [] でも）の div は display: flex/none/contents 必須。
      // 関連図の辺・時系列の軸線が該当していた。全要素木を機械検査する
      const bad: string[] = [];
      const walk = (el: unknown, path: string) => {
        if (!el || typeof el !== 'object') return;
        const node = el as { type?: string; props?: { style?: Record<string, unknown>; children?: unknown } };
        const ch = node.props?.children;
        if (node.type === 'div' && ch && typeof ch !== 'string' && !['flex', 'none', 'contents'].includes(String(node.props?.style?.display ?? ''))) bad.push(path);
        const arr = Array.isArray(ch) ? ch : ch == null ? [] : [ch];
        arr.forEach((c, i) => walk(c, `${path}/${node.type}[${i}]`));
      };
      walk(a.element, '');
      expect(bad, `${plan.type}/${o}: display 無しで要素の子を持つ div が無い`).toEqual([]);
    }
  }
  const withEmbed = t.buildVisualElement({ ...onepage, embedImage: 'data:image/png;base64,AAAA' }, 'portrait');
  expect(JSON.stringify(withEmbed.element), '埋め込み図あり').toContain('data:image/png;base64,AAAA');
  expect(t.verifyRenderedText({ ...onepage, embedImage: 'data:image/png;base64,AAAA' }, withEmbed.element).ok).toBe(true);
  expect(withEmbed.canvas.height, '埋め込みぶん高さは減らない（縦長の最小高さで頭打ちになり得る）').toBeGreaterThanOrEqual(t.buildVisualElement(onepage, 'portrait').canvas.height);
  expect(t.buildVisualElement({ ...onepage, embedImage: 'data:image/png;base64,AAAA' }, 'landscape').canvas.height).toBeGreaterThan(t.buildVisualElement(onepage, 'landscape').canvas.height);
  // 関連図の円周配置は決定的（ノード順で角度）: 1番目のノードが上（y 最小）
  const relEl = JSON.stringify(t.buildVisualElement(relation, 'square').element);
  expect(relEl).toContain('rotate(');
  // ⑤ 種類の絞り込み（プラン抽出）
  const filtered = v.parseVisualPlans({ visuals: [{ type: 'table', title: 't', groups: [{ points: ['a'] }] }, { type: 'relation', title: 'r', groups: [{ heading: 'n', points: [] }] }] }, 'v', ['relation']);
  expect(filtered.plans.map((x) => x.type)).toEqual(['relation']);
  expect(filtered.rejected[0].reason).toContain('選んでいない型');
  expect(v.buildVisualPlanPrompt('本文', { types: ['relation', 'figures'] }).prompt).toContain('type は次の2種のみ');
  expect(v.VISUAL_TYPES.length, '320: 相関図を足して11種').toBe(11);
  // ⑥ ソース固定: 素材の保存は library に別行（新テーブルなし）・script は API を通さない
  const packRoute = readFileSync(join(__dirname, '../../src/app/api/pack/route.ts'), 'utf8');
  expect(packRoute).toContain('INSERT INTO library');
  expect(packRoute).not.toMatch(/CREATE TABLE/);
  expect(packRoute).toContain("kind === 'script'");
  const pres = readFileSync(join(__dirname, '../../src/lib/presentation.ts'), 'utf8');
  expect(pres).toContain("'text'");
});

test('U90: 選択バー（318）はソース固定 — 📚🗂🧠の3画面が同じ SelectionBar を使い、画面専用の選択バー（fixed の楕円・件選択中の直書き）が残っていない・writing-mode を使わない・ラベルは12字以内（R-57）・削除は赤の枠線で塗りつぶさない・各操作は既存ハンドラを渡すだけ', () => {
  const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
  const bar = read('components/SelectionBar.tsx');
  expect(bar).not.toMatch(/writingMode|writing-mode/);
  expect(bar).toMatch(/position: 'sticky'/);
  expect(bar, '上端を越えたら fixed（main は overflowY:auto の非スクロール容器で sticky が効かない）・R-80 の zoom 補正').toMatch(/position: 'fixed', top, left: stuck\.left, width: stuck\.width/);
  expect(bar).toMatch(/toLayoutPx\(r\.left, zoom\)/);
  expect(bar).toMatch(/flexWrap: 'wrap'/);
  expect(bar).toMatch(/danger: \{ background: 'transparent', color: '#dc2626', border: '1px solid #dc2626' \}/);
  expect(bar).toMatch(/opacity: disabled \? 0\.5 : 1/);
  expect(bar).toMatch(/title=\{title\}/);
  const screens = ['app/dashboard/library/page.tsx', 'components/text-analysis/SavedAnalysisList.tsx', 'components/context-library/ContextLibraryPanel.tsx'];
  for (const p of screens) {
    const src = read(p);
    expect(src, `${p}: 共通部品を import`).toMatch(/import SelectionBar from '@\/components\/SelectionBar';/);
    expect(src.match(/<SelectionBar/g)?.length, `${p}: SelectionBar は1つ`).toBe(1);
    expect(src, `${p}: 画面専用の「件選択中」直書きが無い`).not.toMatch(/\{selectedIds\.size\}件(を)?選択中<\/span>/);
    expect(src).not.toMatch(/writingMode|writing-mode/);
    expect(src, `${p}: 削除は共通部品の danger（赤の枠線）に渡す`).toMatch(/danger=\{\{ key: 'delete', label: '🗑 削除', attrs: \{ 'data-bulk-delete': '' \}/);
    // ラベルは12字以内（R-57・アイコン込み）
    for (const m of src.matchAll(/label: '([^']+)'/g)) {
      const inBar = src.slice(Math.max(0, m.index! - 4000), m.index!).includes('<SelectionBar');
      if (inBar) expect(Array.from(m[1]).length, `${p}: ラベル「${m[1]}」は12字以内`).toBeLessThanOrEqual(12);
    }
  }
  const lib = read('app/dashboard/library/page.tsx');
  expect(lib, '📚: 下部固定の楕円バーは撤去').not.toMatch(/position: 'fixed', bottom: 24, left: '50%'/);
  expect(lib, '📚: Kindle の handoff は1つのハンドラ').toMatch(/const handleKindleSelect = \(\) => \{/);
  expect(lib.match(/lumina_kindle_selected/g)?.length).toBe(1);
  expect(lib).toMatch(/onClick: handleKindleSelect/);
  expect(lib).toMatch(/onClick: generateMergeReport/);
  expect(lib).toMatch(/onClick: openCompare/);
  expect(lib).toMatch(/onClick: bulkDeleteSelected/);
  const sal = read('components/text-analysis/SavedAnalysisList.tsx');
  for (const h of ['handleCompareSelect', 'handleCrossSelect', 'handleKindleSelect', 'handleBulkDownload', 'handleBulkDelete']) expect(sal, `🗂: ${h} をそのまま渡す`).toMatch(new RegExp(`onClick: ${h}[,\\s]`));
  const ctx = read('components/context-library/ContextLibraryPanel.tsx');
  expect(ctx).toMatch(/onClick: handleCompareSelect/);
  expect(ctx).toMatch(/onClick: bulkDeleteSelected/);
});


test('U91: 追加リサーチ（319）— 発注文は前提資料→指示→書き方の順で決定的（逆順入力で一致・本文は改変しない）・上限超え／件数超え／空プロンプト／資料なしは無効化＋理由（末尾を切らない R-101）・タイトルは先頭30字＋元資料・metadata.followUp は往復で同じ形（不正は null）・「🔭 追加: n」の導出・ソース固定（DR経路はオプトイン＋中断イベント／保存APIがフック／継承は既存関数で INSERT 無し／client lib は DB 非依存／4入口＋選択バー）', () => {
  const a = { scope: 'library' as const, id: 'b2', title: '資料B', text: '売上は 123 億円。\n株式会社テスト。' };
  const b = { scope: 'text_analysis' as const, id: '10', title: '分析A', text: 'まとめ：3社の比較。' };
  const prompt = 'これらの企業の直近4年の年間売上を調べて';
  const o1 = buildFollowUpOrder([a, b], prompt);
  const o2 = buildFollowUpOrder([b, a], prompt);
  expect(o1.ok && o2.ok).toBe(true);
  if (!o1.ok || !o2.ok) return;
  expect(o1.text, '逆順入力で一致（決定的・R-74）').toBe(o2.text);
  const iSrc = o1.text.indexOf('【前提資料】（2件）');
  const iInst = o1.text.indexOf('【指示】');
  const iRule = o1.text.indexOf('【書き方】');
  expect(iSrc, '前提資料が先頭').toBe(0);
  expect(iInst).toBeGreaterThan(iSrc);
  expect(iRule).toBeGreaterThan(iInst);
  expect(o1.text, '本文はそのまま（数値・固有名詞を改変しない・R-75）').toContain('売上は 123 億円。\n株式会社テスト。');
  expect(o1.text).toContain('資料B（📚 リサーチ保存・20字）');
  expect(o1.text).toContain('分析A（🗂 テキスト分析・');
  expect(o1.text.slice(iInst)).toContain(prompt);
  for (const r of FOLLOWUP_WRITING_RULES) expect(o1.text).toContain(`- ${r}`);
  expect(o1.text, '「未確認」の明示を求める').toContain('未確認');
  expect(o1.sourceChars).toBe(a.text.length + b.text.length);
  // 上限超え＝末尾を切らず無効化＋理由（R-101）。件数超え・空プロンプトも理由つき
  const big = { ...a, text: 'あ'.repeat(FOLLOWUP_CONTEXT_LIMIT + 1) };
  const over = buildFollowUpOrder([big], prompt);
  expect(over.ok).toBe(false);
  if (!over.ok) expect(over.reason).toMatch(/上限を超えています.*60,001 字.*60,000 字/);
  const exact = buildFollowUpOrder([{ ...a, text: 'あ'.repeat(FOLLOWUP_CONTEXT_LIMIT) }], prompt);
  expect(exact.ok, '上限ちょうどは通る').toBe(true);
  const many = buildFollowUpOrder([a, b, { ...a, id: 'c' }, { ...a, id: 'd' }], prompt);
  expect(many.ok).toBe(false);
  if (!many.ok) expect(many.reason).toContain(`${FOLLOWUP_MAX_SOURCES}件まで`);
  const empty = buildFollowUpOrder([a], '   ');
  expect(empty.ok).toBe(false);
  if (!empty.ok) expect(empty.reason).toBe(FOLLOWUP_REJECT_EMPTY_PROMPT);
  expect(buildFollowUpOrder([], prompt).ok).toBe(false);
  // ダイアログの可否（順序固定）: 件数超え → 資料なし → 上限 → 空プロンプト
  expect(followUpStartState([{ chars: 10 }, { chars: 10 }, { chars: 10 }, { chars: 10 }], prompt).reason).toContain('3件まで');
  expect(followUpStartState([{ chars: 0, missing: true }], prompt).reason).toBe(FOLLOWUP_REJECT_MISSING);
  expect(followUpStartState([{ chars: FOLLOWUP_CONTEXT_LIMIT + 1 }], prompt).reason).toContain('上限を超えています');
  expect(followUpStartState([{ chars: 100 }], '').reason).toBe(FOLLOWUP_REJECT_EMPTY_PROMPT);
  expect(followUpStartState([{ chars: 100 }], prompt)).toEqual({ enabled: true, reason: null });
  // チップは文字列（4〜6個）・重複なし
  expect(FOLLOWUP_PROMPT_CHIPS.length).toBeGreaterThanOrEqual(4);
  expect(FOLLOWUP_PROMPT_CHIPS.length).toBeLessThanOrEqual(6);
  expect(new Set(FOLLOWUP_PROMPT_CHIPS).size).toBe(FOLLOWUP_PROMPT_CHIPS.length);
  // タイトル: 先頭30字 — 元資料
  expect(followUpTitle('あ'.repeat(40), ['資料B'])).toBe(`${'あ'.repeat(30)} — 資料B`);
  expect(followUpTitle(prompt, ['資料B', '分析A'])).toBe(`${prompt} — 資料B・分析A`);
  expect(followUpTitle('', ['X'])).toBe('追加リサーチ — X');
  // metadata.followUp の往復（キー単位・R-113）。of は scope→id の順・直前の元資料だけ
  const meta = followUpMetadata({ sources: [b, a], prompt, mode: 'deep', model: 'gemini-3.7-flash', at: '2026-09-10T00:00:00.000Z', inherit: true });
  expect(meta.of.map((o) => `${o.scope}:${o.item_key}`)).toEqual(['library:b2', 'text_analysis:10']);
  const parsed = parseFollowUp(JSON.stringify({ followUp: meta, savedAt: 'x' }));
  expect(parsed).toEqual(meta);
  expect(parseFollowUp({ followUp: meta })).toEqual(meta);
  expect(parseFollowUp('{"followUp":{"of":[]}}'), '空の of は無視').toBeNull();
  expect(parseFollowUp('{"followUp":{"of":[{"scope":"context","item_key":"1"}],"prompt":"p","mode":"quick","model":"m","at":"t"}}'), '対象外 scope は無視').toBeNull();
  expect(parseFollowUp('{"pack":{"of":["x"]}}')).toBeNull();
  expect(parseFollowUp('not json')).toBeNull();
  expect(followUpOriginLabel(meta)).toBe('🔭 資料B・分析A を元に');
  // 「🔭 追加: n」の導出（scope ごと）
  const rows = [{ metadata: JSON.stringify({ followUp: meta }) }, { metadata: { followUp: { ...meta, of: [meta.of[0]] } } }, { metadata: '{}' }];
  expect(followUpCountsOf(rows, 'library')).toEqual({ b2: 2 });
  expect(followUpCountsOf(rows, 'text_analysis')).toEqual({ '10': 1 });
  // 参照と handoff の検証は fail-closed
  expect(parseFollowUpRefs([{ scope: 'library', id: 'x' }, { scope: 'library', id: 'x' }])).toEqual([{ scope: 'library', id: 'x' }]);
  expect(parseFollowUpRefs([{ scope: 'context', id: 'x' }])).toBeNull();
  expect(parseFollowUpRefs([])).toBeNull();
  expect(parseFollowUpHandoff(JSON.stringify({ sources: [{ scope: 'library', id: 'x', title: 't', chars: 5 }], prompt: ' p ', mode: 'bad', target: 'compare' }))).toEqual({ sources: [{ scope: 'library', id: 'x', title: 't', chars: 5 }], prompt: 'p', mode: 'standard', target: 'compare', inherit: true, at: '' });
  expect(parseFollowUpHandoff(JSON.stringify({ sources: [], prompt: 'p' }))).toBeNull();
  expect(parseFollowUpHandoff('{')).toBeNull();
  // ソース固定
  const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
  const lib = read('lib/followup-research.ts');
  expect(lib, 'client lib は DB 非依存（R-108）').not.toMatch(/@\/lib\/db|neondatabase/);
  const dr = read('app/api/deepresearch/route.ts');
  expect(dr, 'DR 経路は followUp のオプトイン（R-88）').toMatch(/followUp\?: unknown/);
  expect(dr, '発注文は純関数で組む').toMatch(/buildFollowUpOrder\(sources, /);
  expect(dr, '削除済みは資料なしで 400').toMatch(/FOLLOWUP_REJECT_MISSING/);
  expect(dr, '前提資料はトピックの代わり（後段の規約は共通＝DR経路が後勝ち R-69）').toMatch(/const topicBlock = followUpOrderText \?\? `トピック：\$\{topic\}`/);
  expect(dr, '時間切れは中断の終端イベント（R-118）').toMatch(/type: 'timeout', message: FOLLOWUP_TIMEOUT_MESSAGE/);
  expect(dr, 'サーバ個別タイムアウトは比較と同じ定数').toMatch(/reject\(new Error\('followup-timeout'\)\), COMPARE_SERVER_TIMEOUT_MS\)/);
  expect(read('lib/mandala-research.ts'), '311 は不変（追加リサーチを持ち込まない）').not.toMatch(/followup|followUp/);
  const libRoute = read('app/api/library/route.ts');
  expect(libRoute, '保存APIがフック点（R-115）').toMatch(/const followUp = parseFollowUp\(metadata\);\s*if \(followUp\?\.inherit\)/);
  expect(libRoute).toMatch(/applyFollowUpInheritance\(userId, id, followUp\.of\)/);
  const server = read('lib/followup-research-server.ts');
  expect(server, '継承は既存の付与関数だけ（別の INSERT を作らない）').not.toMatch(/INSERT INTO/i);
  expect(server).toMatch(/setItemPurposes\(userId, 'library', libraryId, purposeIds\)/);
  expect(server).toMatch(/setItemFolders\(userId, 'library', libraryId, folderIds\)/);
  expect(server, '前提資料は 315/317 と同じ取得').toMatch(/fetchVisualSources\(userId, scope, ids\)/);
  const dialog = read('components/deepresearch/FollowUpResearchDialog.tsx');
  expect(dialog, 'ダイアログは AI を呼ばない（開始は handoff）').not.toMatch(/\/api\/deepresearch/);
  expect(dialog, '新タブ handoff は localStorage の一回限りキー（R-121）').toMatch(/localStorage\.setItem\(FOLLOWUP_HANDOFF_KEY/);
  expect(dialog, 'チップは文字列を入れるだけ').toMatch(/onClick=\{\(\) => setPrompt\(chip\)\}/);
  expect(dialog, '二重発火は ref（R-87）').toMatch(/if \(startedRef\.current \|\| !state\.enabled/);
  const page = read('app/dashboard/deepresearch/page.tsx');
  expect(page, '受け側は読んだら消す').toMatch(/localStorage\.removeItem\(FOLLOWUP_HANDOFF_KEY\)/);
  expect(page, '比較の各列にも followUp を載せる').toMatch(/extraMetadata=\{followUp \? \{ followUp: followUpMetadata/);
  for (const p of ['components/LibraryItemRow.tsx', 'components/text-analysis/SavedAnalysisList.tsx', 'components/text-analysis/TextAnalysisPanel.tsx', 'app/dashboard/deepresearch/page.tsx']) {
    expect(read(p), `${p}: 入口は同じ部品`).toMatch(/FollowUpResearchButton/);
  }
  for (const p of ['app/dashboard/library/page.tsx', 'components/text-analysis/SavedAnalysisList.tsx']) {
    const src = read(p);
    expect(src, `${p}: 選択バーの入口（上限3・R-101）`).toMatch(/key: 'followup', label: '🔭 追加リサーチ'.*disabled: selectedIds\.size > FOLLOWUP_MAX_SOURCES, reason: followUpTooManyReason\(selectedIds\.size\)/);
    expect(src, `${p}: 選択バーのダイアログは同じ部品`).toMatch(/<FollowUpResearchDialog refs=\{followUpRefs\}/);
  }
});


test('U92: 生成結果から直接図解・画像（320）— 相関図は label 必須（欠けた辺は捨てて赤い印・辺は relation と同じ解析）・描画の線は全辺同じ太さ/色/不透明度（強弱は文字）・描画文字列＝タイトル＋要因＋ラベル・抽出プロンプトは「明記された関係のみ」・種類の既定は関連図/表/画像・URL は保存済み ?scope=&id=／未保存 ?from=handoff（types と autoplan=1）・handoff の検証は fail-closed・未保存の出どころは sources が空のときだけ・「AIに文字も描かせる」の記憶は初期オフ・ソース固定（一回限りキーの共通実装／自動STEP1は1回・自動描画なし／3画面の入口）', () => {
  const v = vis320;
  const t = tpl320;
  const src = '湿度と乾燥は逆相関で、加湿器は乾燥を減らす。睡眠不足は肌荒れと正の相関（強）がある。';
  const plan: import('../../src/lib/visuals').VisualPlan = {
    id: 'c1', type: 'correlation', title: '湿度と乾燥',
    groups: [
      { heading: '湿度', points: ['→ 乾燥: 逆相関', '→ 加湿器'] },
      { heading: '乾燥', points: [] },
      { heading: '加湿器', points: ['→ 乾燥: 乾燥を減らす'] },
    ],
  };
  // ① 辺: label 必須。無い辺は捨て（unlabeled）、typedPlanIssues が理由を返す＝描けない
  const ce = v.correlationEdgesOf(plan);
  expect(ce.edges.map((e) => [e.from, e.to, e.label])).toEqual([[0, 1, '逆相関'], [2, 1, '乾燥を減らす']]);
  expect(ce.unlabeled).toEqual(['→ 加湿器']);
  expect(v.relationEdgesOf(plan).edges.length, '関連図は label 省略可（不変）').toBe(3);
  expect(v.edgesOfPlan(plan).length).toBe(2);
  expect(v.edgesOfPlan({ ...plan, type: 'relation' }).length).toBe(3);
  const issues = v.typedPlanIssues(plan, src);
  expect(issues['→ 加湿器']).toEqual([v.CORRELATION_LABEL_REQUIRED]);
  expect(v.checkPlan(plan, src).ok, 'ラベル無しの辺があると描けない').toBe(false);
  const fixed = { ...plan, groups: [{ heading: '湿度', points: ['→ 乾燥: 逆相関'] }, { heading: '乾燥', points: [] }, { heading: '加湿器', points: ['→ 乾燥: 乾燥を減らす'] }] };
  expect(v.checkPlan(fixed, src).ok, '直せば描ける').toBe(true);
  // 元テキストに無い相関の語句は赤い印（語句単位の実在チェックが points に効く＝AI が相関を捏造する経路を塞ぐ）
  const forged = { ...fixed, groups: [{ heading: '湿度', points: ['→ 乾燥: 強い因果'] }, { heading: '乾燥', points: [] }] };
  expect(v.findForeignPhrases(forged, src)).toEqual(['→ 乾燥: 強い因果']);
  expect(v.checkPlan(forged, src).ok).toBe(false);
  // ② 描画: 線（回転した div）は全辺同じ高さ・色・不透明度＝強弱を視覚化しない。関連図と同じ値
  const walk = (el: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] => {
    if (!el || typeof el !== 'object') return out;
    const e = el as { props?: { style?: Record<string, unknown>; children?: unknown } };
    const st = e.props?.style;
    if (st && typeof st.transform === 'string' && /rotate\(/.test(st.transform)) out.push(st);
    const ch = e.props?.children;
    if (Array.isArray(ch)) ch.forEach((c) => walk(c, out));
    else if (ch && typeof ch === 'object') walk(ch, out);
    return out;
  };
  const built = t.buildVisualElement(fixed, 'landscape');
  const lines = walk(built.element);
  expect(lines.length, '辺の数だけ線がある').toBe(2);
  const sig = (st: Record<string, unknown>) => JSON.stringify({ h: st.height, bg: st.background, op: st.opacity });
  expect(new Set(lines.map(sig)).size, '全辺同じ太さ・色・不透明度').toBe(1);
  const rel = walk(t.buildVisualElement({ ...fixed, type: 'relation' }, 'landscape').element);
  expect(sig(rel[0]), '関連図と同じ線').toBe(sig(lines[0]));
  expect(JSON.stringify(t.buildVisualElement(fixed, 'landscape')), '決定的').toBe(JSON.stringify(built));
  expect(t.expectedStringsOf(fixed), '描画文字列＝タイトル＋要因＋ラベル').toEqual(['湿度と乾燥', '湿度', '乾燥', '加湿器', '逆相関', '乾燥を減らす']);
  expect(t.estimateVisualHeight(fixed, 'landscape')).toBe(t.estimateVisualHeight({ ...fixed, type: 'relation' }, 'landscape'));
  // ③ 型の登録・抽出プロンプト
  expect(v.VISUAL_TYPES).toContain('correlation');
  expect(v.VISUAL_DETERMINISTIC_TYPES).toContain('correlation');
  expect(v.isVisualType('correlation')).toBe(true);
  const pr = v.buildVisualPlanPrompt(src, { types: ['correlation'] }).prompt;
  expect(pr).toContain('- correlation:');
  expect(pr).toContain('本文に明記された関係のみ');
  expect(pr).toContain('推測の相関は出さない');
  expect(pr, '型を絞ると他の型の行は出ない').not.toContain('- relation:');
  expect(v.parseVisualPlans({ visuals: [{ type: 'correlation', title: 'x', groups: [{ heading: 'a', points: ['→ b: 正の相関'] }, { heading: 'b', points: [] }] }, { type: 'table', title: 'y', groups: [{ points: ['p'] }] }] }, 'v', ['correlation']).plans.map((p) => p.type), 'allowedTypes で絞る').toEqual(['correlation']);
  // ④ 種類ダイアログ・URL・handoff
  expect(v.VISUAL_QUICK_DEFAULT_TYPES).toEqual(['relation', 'table', 'image']);
  expect(v.VISUAL_TYPE_PICKER_ORDER.length).toBe(v.VISUAL_TYPES.length);
  for (const ty of v.VISUAL_TYPES) expect(v.VISUAL_TYPE_PICKER_NOTE[ty], `${ty} に一言`).toBeTruthy();
  expect(v.normalizeVisualTypes(['image', 'table', 'image', 'nope', 'correlation'])).toEqual(['image', 'table', 'correlation']);
  expect(v.visualsHrefFor({ saved: { scope: 'library', id: 'abc' }, types: ['image', 'relation'] })).toBe('/dashboard/visuals?scope=library&id=abc&types=image%2Crelation&autoplan=1');
  expect(v.visualsHrefFor({ saved: null, types: ['table'] })).toBe('/dashboard/visuals?from=handoff&types=table&autoplan=1');
  expect(v.visualsHrefFor({ saved: null, types: [], autoplan: false })).toBe('/dashboard/visuals?from=handoff');
  const h = v.parseVisualsHandoff(JSON.stringify({ title: 'T', text: `  ${src}  `, from: 'deepresearch', at: '2026-09-10T00:00:00.000Z' }));
  expect(h).toEqual({ title: 'T', text: src, from: 'deepresearch', at: '2026-09-10T00:00:00.000Z' });
  expect(v.parseVisualsHandoff(JSON.stringify({ title: 'T', text: '短い', from: 'deepresearch' })), '20字未満は無効').toBeNull();
  expect(v.parseVisualsHandoff(JSON.stringify({ title: 'T', text: src, from: 'note' })), '出どころ不明は無効').toBeNull();
  expect(v.parseVisualsHandoff('{')).toBeNull();
  // ⑤ 未保存の出どころは sources が空のときだけ載る（保存済みなら sources が正）
  const base = { kind: 'render' as const, plan: fixed, orientation: 'landscape' as const, width: 1, height: 1, model: 'og-render', generatedAt: 'g' };
  const us = { title: 'T', chars: 30, at: 'a', from: 'compare' as const };
  expect(v.buildVisualGallerySettings({ ...base, sources: [], unsavedSource: us }).visual.unsavedSource).toEqual(us);
  expect(v.buildVisualGallerySettings({ ...base, sources: [{ scope: 'library', id: 'x', title: 't' }], unsavedSource: us }).visual.unsavedSource).toBeUndefined();
  expect(v.buildVisualGallerySettings({ ...base, sources: [] }).visual.unsavedSource).toBeUndefined();
  // ⑥ 記憶: 初期既定はオフ
  expect(v.VISUAL_IMAGE_DEFAULT_SETTINGS.aiText).toBe(false);
  expect(v.parseStoredAiText('1')).toBe(true);
  expect(v.parseStoredAiText('0')).toBe(false);
  expect(v.parseStoredAiText(null)).toBe(false);
  // ⑦ ソース固定
  const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
  const page = read('app/dashboard/visuals/page.tsx');
  expect(page, '一回限りキーは共通実装（R-121）').toMatch(/readOneTimeHandoff\(VISUALS_HANDOFF_KEY, parseVisualsHandoff\)/);
  expect(page, '自動STEP1は ref で1回（R-87）').toMatch(/if \(!autoplanWanted \|\| autoplanDoneRef\.current\) return;[\s\S]*?autoplanDoneRef\.current = true;\s*void extract\(\);/);
  expect((page.match(/void render\(/g) ?? []).length, '描画は院長のボタンからだけ（自動で描かない）').toBe(1);
  expect((page.match(/void generateImage\(/g) ?? []).length, '画像生成は確認ダイアログからだけ').toBe(1);
  expect(page, '記憶キーへ書く').toMatch(/localStorage\.setItem\(VISUAL_AI_TEXT_STORAGE_KEY, on \? '1' : '0'\)/);
  const dlg = read('components/visuals/VisualQuickButton.tsx');
  expect(dlg, '入口は AI も描画も呼ばない').not.toMatch(/\/api\/visuals/);
  expect(dlg).toMatch(/writeOneTimeHandoff\(VISUALS_HANDOFF_KEY, handoff\)/);
  expect(dlg).toMatch(/if \(startedRef\.current \|\| !canGo\) return;/);
  for (const p of ['app/dashboard/deepresearch/page.tsx', 'components/text-analysis/TextAnalysisPanel.tsx', 'components/deepresearch/ModelCompareView.tsx']) expect(read(p), `${p}: 入口は同じ部品`).toMatch(/<VisualQuickButton/);
  expect(read('components/deepresearch/ModelCompareView.tsx'), '比較は完了した列だけ（run.status === done の中）').toMatch(/run\.status === 'done' && run\.text && \([\s\S]*?<VisualQuickButton/);
  const tplSrc = read('lib/visual-templates/index.ts');
  expect(tplSrc, '相関図は関連図のテンプレートを共用（見た目を変えない）').toMatch(/plan\.type === 'relation' \|\| plan\.type === 'correlation' \? relationTemplate/);
  expect(tplSrc).not.toMatch(/strokeWidth|stroke-width/);
  for (const p of ['lib/presentation-pack.ts', 'lib/followup-research.ts', 'lib/visuals.ts', 'components/visuals/VisualQuickButton.tsx']) expect(read(p), `${p}: sessionStorage を新タブ handoff に使わない`).not.toMatch(/sessionStorage\.setItem/);
});


test('U93: 結果画面の操作行（321）— 縦書きの根本は flex の縮小（writing-mode は無い）：globals.css で「ボタンは常に横書き（nowrap）」・操作行は flex-wrap／🔭DR 結果は共通部品 ResultActionBar（主操作1つだけ塗りつぶし・機能ごとの多色なし）／中の要素のハンドラ・data 属性は不変（ソース固定）／バーのボタンとメニューのラベルは12字以内（R-57）／メニューは Esc・外側クリックで閉じる・トリガーは button', () => {
  const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
  const css = read('app/globals.css');
  expect(css, 'ボタンは常に横書き').toMatch(/button,\s*\na\[role="button"\] \{\s*white-space: nowrap;\s*\}/);
  expect(css, '操作行の統一（高さ・角丸）').toMatch(/\[data-result-action-bar\] button,\s*\n\[data-result-action-bar\] a \{[\s\S]*?height: 32px !important;[\s\S]*?border-radius: 8px !important;/);
  expect(css, '主操作だけ塗りつぶし（indigo）').toMatch(/\[data-result-action-bar\] button\[data-save-library\]:not\(:disabled\) \{\s*background: #4f46e5 !important;/);
  const barCss = css.slice(css.indexOf('[data-result-action-bar]'));
  expect((barCss.match(/#[0-9a-fA-F]{6}\b/g) ?? []).filter((c) => c.toLowerCase() !== '#4f46e5' && c.toLowerCase() !== '#fff'), '機能ごとの多色を使わない').toEqual([]);
  expect(css, 'writing-mode の宣言は無い（縦書きの原因は縮小）').not.toMatch(/writing-mode\s*:/);
  const bar = read('components/ResultActionBar.tsx');
  expect(bar).not.toMatch(/writingMode|writing-mode/);
  expect(bar, '1段目・2段目は flex-wrap').toMatch(/flexWrap: 'wrap'/);
  expect(bar, 'Esc で閉じる').toMatch(/if \(e\.key === 'Escape'\) setOpen\(false\);/);
  expect(bar, '外側クリックで閉じる').toMatch(/!rootRef\.current\.contains\(t\)\) setOpen\(false\)/);
  expect(bar, 'トリガーは button（キーボードで開閉）').toMatch(/<button\s+type="button"\s+data-result-menu-trigger=\{menu\.key\}\s+aria-haspopup="menu"\s+aria-expanded=\{open\}/);
  expect(bar, '中で開く操作（AI参照素材の保存パネル）は閉じない').toMatch(/t\.closest\('\[data-context-modal\]'\)\) return;/);
  const dr = read('app/dashboard/deepresearch/page.tsx');
  expect(dr).toMatch(/<ResultActionBar\s+attrs=\{\{ 'data-dr-result-actions': '' \}\}/);
  expect((dr.match(/<ResultActionBar/g) ?? []).length).toBe(1);
  // 各操作のハンドラ・data 属性は不変（要素をそのまま置き直しただけ）
  for (const h of [
    "onClick={() => copyRichMarkdown(report)}", "onClick={() => setShowRefine(true)}", "onClick={download}", "onClick={downloadDocx}", "onClick={sendToWrite}",
    "onClick={() => handleSendToTextAnalysis(report, topic)}", "onClick={() => handleSendToMedicalStudio(report, topic)}", "onClick={() => handleSendToBusinessStudio(report, topic)}",
    "onClick={() => handleSendToNexusBlog(report, topic)}", "onClick={() => handleSendToNoteArticle(report, topic)}", 'href="/dashboard/dr-hub"', "onClick={handleOpenContextModal}", "onClick={handleConfirmSaveContext}",
    "data-context-modal", 'dataKey="report"', "onSaved={setReportSavedId}", "autoSaveSignal={autoStockSignal}", "onClick={() => setFontSize(f => Math.max(11, f - 1))}", "onClick={() => setFontSize(f => Math.min(20, f + 1))}",
  ]) expect(dr, `ハンドラ・属性が残る: ${h}`).toContain(h);
  expect(dr, '🧠 記憶するは2段目に別置き（保存ボタンの隣には出さない）').toMatch(/showMemorize=\{false\}/);
  expect(dr).toMatch(/extra=\{<MemorizeButton title=/);
  const save = read('components/SaveToLibraryButton.tsx');
  expect(save, '主操作の目印').toMatch(/<button\s+data-save-library/);
  expect(save, 'MemorizeButton は切り出し（既定は従来どおり隣に出す）').toMatch(/\{showMemorize && <MemorizeButton title=\{title\} content=\{content\} groupName=\{groupName\} \/>\}/);
  // ラベル 12字以内（R-57）: 1段目のボタンとメニューのトリガー
  const seg = dr.slice(dr.indexOf('<ResultActionBar'), dr.indexOf('extra={<MemorizeButton'));
  for (const m of seg.matchAll(/label: '([^']+)'/g)) expect(Array.from(m[1]).length + 2, `メニュー「${m[1]} ▾」は12字以内`).toBeLessThanOrEqual(12);
  for (const l of ['📋 コピー', '✏️ AIで修正', '🔭 追加リサーチ', '🖼 図解・画像を作る', '📚 リサーチ保存に追加', '🧠 記憶する', '⬇ ダウンロード ▾', '➡ 送る ▾']) expect(Array.from(l).length, `「${l}」は12字以内`).toBeLessThanOrEqual(12);
  expect(dr, '1段目の追加リサーチは短いラベル').toContain('label="🔭 追加リサーチ"');
});


test('U94: 関連図の是正とつながり確認（322）— 院長の再現入力（3ノード・2辺・3つ目は要素欄空）で全ノード・辺・ラベルが余白内／線の箱は中点中心（satori は中心回転）／n=1 中央・n=2 左右・n=8 円周・長い名前は折り返し・全要素が画面内（verifyRenderedBounds）／外れた座標は理由（要素名と座標）／相手ノードが無い辺は描かず理由・表記ゆれは寄せる／edgeOff の辺は描かない（プランには残る）／根拠の決定的抽出と根拠なしの件数／why は40字で表示だけ（図の文字列に入らない）／同じ入力→同じ要素木／ソース固定（描画ルートの境界検査・🗂の操作行は ResultActionBar・ハンドラ不変）', () => {
  const v = vis320;
  const t = tpl320;
  const src = 'トリプトファンはセロトニンに変換され、セロトニンはメラトニンに変換される。トリプトファンからメラトニンへ。';
  const plan: import('../../src/lib/visuals').VisualPlan = { id: 'r', type: 'relation', title: 'トリプトファンからメラトニンへ', groups: [{ heading: 'トリプトファン', points: ['→ セロトニン: 変換'] }, { heading: 'セロトニン', points: ['→ メラトニン: 変換'] }, { heading: 'メラトニン', points: [] }] };
  // ① 院長の再現入力: 3ノード（辺の無いノードも）・2辺・ラベル2つ、すべて余白内。線の箱は中点中心
  const lay = t.relationLayout(plan, 1600);
  expect(lay.nodes.map((n) => n.label)).toEqual(['トリプトファン', 'セロトニン', 'メラトニン']);
  expect(lay.edges.length).toBe(2);
  expect(lay.labels.map((l) => l.text)).toEqual(['変換', '変換']);
  for (const e of lay.edges) {
    const [a, b] = e.endpoints;
    expect(Math.abs(e.box.x + e.box.w / 2 - (a.x + b.x) / 2), '線の箱の中心＝辺の中点（x）').toBeLessThanOrEqual(1);
    expect(Math.abs(e.box.y + e.box.h / 2 - (a.y + b.y) / 2), '線の箱の中心＝辺の中点（y）').toBeLessThanOrEqual(1);
  }
  expect(t.verifyRenderedBounds(plan, 'landscape')).toEqual({ ok: true, reasons: [] });
  expect(t.verifyRenderedBounds(plan, 'portrait')).toEqual({ ok: true, reasons: [] });
  expect(t.verifyRenderedBounds(plan, 'square')).toEqual({ ok: true, reasons: [] });
  expect(t.verifyRenderedText(plan, t.buildVisualElement(plan, 'landscape').element).ok).toBe(true);
  // ② n=1 中央・n=2 左右・n=8 円周・長い名前は折り返し（箱が高くなる）
  const mk = (names: string[]): import('../../src/lib/visuals').VisualPlan => ({ id: 'n', type: 'relation', title: 'T', groups: names.map((h, i) => ({ heading: h, points: i + 1 < names.length ? [`→ ${names[i + 1]}: 関係`] : [] })) });
  const l1 = t.relationLayout(mk(['A']), 1600);
  expect(Math.abs(l1.nodes[0].cx - l1.inner / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(l1.nodes[0].cy - l1.area / 2)).toBeLessThanOrEqual(1);
  const l2 = t.relationLayout(mk(['A', 'B']), 1600);
  expect(l2.nodes[0].cx, 'n=2 は左右').toBeLessThan(l2.inner / 2);
  expect(l2.nodes[1].cx).toBeGreaterThan(l2.inner / 2);
  expect(Math.abs(l2.nodes[0].cy - l2.nodes[1].cy)).toBeLessThanOrEqual(1);
  const l8 = t.relationLayout(mk(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']), 900);
  expect(l8.nodes.length).toBe(8);
  const longName = 'とても長いノードの名前で折り返しが必要になる例です';
  const lLong = t.relationLayout(mk([longName, 'B', 'C']), 900);
  expect(lLong.nodes[0].rect.h, '長い名前は折り返して箱が高くなる（R-72）').toBeGreaterThan(64);
  for (const pl of [mk(['A']), mk(['A', 'B']), mk(['A', 'B', 'C']), mk(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']), mk([longName, 'B', 'C'])]) {
    for (const o of ['landscape', 'square', 'portrait'] as const) expect(t.verifyRenderedBounds(pl, o), `${pl.groups.length}ノード・${o}`).toEqual({ ok: true, reasons: [] });
  }
  // 外れた座標は理由（要素名と座標）
  const broken = t.relationLayout(plan, 1600);
  broken.nodes[0].rect = { ...broken.nodes[0].rect, x: -40 };
  const nb = t.verifyLayoutBounds(broken);
  expect(nb.ok).toBe(false);
  expect(nb.reasons[0]).toMatch(/ノード「トリプトファン」が画面外（x=-40/);
  // ③ 相手ノードが無い辺は描かず理由。表記ゆれ（全角・空白）は寄せる
  const miss = { ...plan, groups: [{ heading: 'トリプトファン', points: ['→ セロトニン２: 変換'] }, { heading: 'セロトニン', points: [] }] };
  expect(v.relationEdgesOf(miss).edges).toEqual([]);
  expect(v.relationEdgesOf(miss).missing).toEqual([{ point: '→ セロトニン２: 変換', from: 0, target: 'セロトニン２' }]);
  expect(v.typedPlanIssues(miss, src)['→ セロトニン２: 変換']).toEqual([v.missingTargetReason('セロトニン２')]);
  expect(v.checkPlan(miss, src).ok, '相手が無い辺があると描けない（赤い印）').toBe(false);
  const yure = { ...plan, groups: [{ heading: 'セロ トニン', points: ['→ ｾﾛﾄﾆﾝ: x'] }, { heading: 'ｾﾛﾄﾆﾝ', points: ['→ セロトニン: y'] }, { heading: 'セロトニン', points: [] }] };
  // 3つの見出しは正規化すると同じ名前（最初に一致した見出しへ）。self を除く辺が成立する
  expect(v.relationEdgesOf({ groups: [{ heading: 'セロ トニン', points: [] }, { heading: 'トリプトファン', points: ['→ ｾﾛﾄﾆﾝ: x'] }] }).edges).toEqual([{ from: 1, to: 0, label: 'x' }]);
  expect(v.relationEdgesOf(yure).missing).toEqual([]);
  // ④ edgeOff: 外した辺は描かない・一覧には残る（on=false）・根拠の抽出
  const off = { ...plan, edgeOff: [v.edgeKey(1, 2)] };
  expect(v.edgesOfPlan(off).map((e) => v.edgeKey(e.from, e.to))).toEqual(['0-1']);
  expect(t.relationLayout(off, 1600).edges.length).toBe(1);
  expect(t.expectedStringsOf(off), '外した辺のラベルは描画文字列に入らない').toEqual(['トリプトファンからメラトニンへ', 'トリプトファン', 'セロトニン', 'メラトニン', '変換']);
  const rows = v.relationEdgeRows(off, src);
  expect(rows.map((r) => [r.key, r.from, r.to, r.label, r.on])).toEqual([['0-1', 'トリプトファン', 'セロトニン', '変換', true], ['1-2', 'セロトニン', 'メラトニン', '変換', false]]);
  expect(rows[0].evidence).toBe('トリプトファンはセロトニンに変換され、セロトニンはメラトニンに変換される。');
  expect(v.edgeEvidence('AとBは無関係。', 'A', 'C', '')).toBeNull();
  expect(v.edgeEvidence('湿度が下がると乾燥する。湿度と乾燥は逆相関。', '湿度', '乾燥', '逆相関'), 'ラベル込みの文を優先').toBe('湿度と乾燥は逆相関。');
  expect(v.edgesWithoutEvidenceCount(v.relationEdgeRows({ ...plan, groups: [{ heading: 'A', points: ['→ B: x'] }, { heading: 'B', points: [] }] }, 'A だけの文。'))).toBe(1);
  expect(v.edgesWithoutEvidenceLabel(2)).toContain('根拠のない辺が 2 本');
  expect(v.edgesWithoutEvidenceLabel(0)).toBeNull();
  expect(v.normalizeEdgeOff(['0-1', 'x', '0-1', '2-3'])).toEqual(['0-1', '2-3']);
  expect(v.normalizeEdgeOff([])).toBeUndefined();
  // ⑤ why: 40字で表示だけ（図の文字列・実在チェックに入らない）
  const parsed = v.parseVisualPlans({ visuals: [{ type: 'relation', why: 'あ'.repeat(60), title: 'トリプトファンからメラトニンへ', groups: [{ heading: 'トリプトファン', points: ['→ セロトニン: 変換'] }, { heading: 'セロトニン', points: [] }] }] });
  expect(parsed.plans[0].why?.length).toBe(v.VISUAL_WHY_MAX);
  expect(v.collectPlanStrings(parsed.plans[0])).not.toContain(parsed.plans[0].why!);
  expect(t.expectedStringsOf(parsed.plans[0])).not.toContain(parsed.plans[0].why!);
  expect(v.checkPlan(parsed.plans[0], src).ok, 'why は実在チェックの対象外').toBe(true);
  expect(v.buildVisualPlanPrompt(src).prompt).toContain('"why"');
  // ⑥ 決定的
  expect(JSON.stringify(t.buildVisualElement(plan, 'landscape'))).toBe(JSON.stringify(t.buildVisualElement(plan, 'landscape')));
  // ⑦ ソース固定
  const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
  const route = read('app/api/visuals/render/route.ts');
  expect(route, '文字一致に加えて境界検査（外れたら 500 で理由）').toMatch(/const bounds = verifyRenderedBounds\(plan, orientation\);\s*if \(!bounds\.ok\) return NextResponse\.json\(\{ error: `図の要素が画面外に出ます: \$\{bounds\.reasons\.join\('／'\)\}`, bounds \}, \{ status: 500 \}\);/);
  const tpl = read('lib/visual-templates/index.ts');
  expect(tpl, '線は中点中心で回転（transformOrigin の宣言に頼らない）').not.toMatch(/transformOrigin:/);
  expect(tpl).toMatch(/left: e\.box\.x, top: e\.box\.y, width: e\.box\.w, height: e\.box\.h, background: GREEN, transform: `rotate\(\$\{e\.angle\}deg\)`/);
  const ta = read('components/text-analysis/TextAnalysisPanel.tsx');
  expect((ta.match(/<ResultActionBar/g) ?? []).length, '🗂 成果物の操作行は共通部品1箇所').toBe(1);
  expect(ta, '従来の下部の操作行は無い').not.toContain('{/* アクション */}');
  for (const h of ['onClick={onSave}', 'onClick={onCopy}', 'onClick={onDownloadTxt}', 'onClick={onDownloadMd}', 'onClick={onDownloadDocx}', 'onClick={onSimplify}', 'onClick={onRefine}', '<VisualQuickButton', '<FollowUpResearchButton', 'data-save-library']) expect(ta, `ハンドラ・要素が残る: ${h}`).toContain(h);
  expect(ta, '再分析は入力欄へ入れるだけ（新しい生成経路なし）').toMatch(/const reanalyzeFrom = \(text: string\) => \{\s*setInputText\(text\);/);
  const vp = read('app/dashboard/visuals/page.tsx');
  expect(vp).toMatch(/data-vis-why=\{plan\.id\}/);
  expect(vp).toMatch(/relationEdgeRows\(plan, sourceText\)/);
  expect(vp, '✓を外すと edgeOff に入る（プランに残す）').toMatch(/edgeOff: off\.size > 0 \? Array\.from\(off\) : undefined/);
});
