// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindleウィザードの「まとめビジュアル画像」（227【C】）
// 228: テンプレート実体（描画・高さ推定・文字収集）は媒体非依存のため
// summary-image-templates.ts へ移動し、Kindle/note で共用する。
// ここに残るのは book_meta.summaryImages の器の型のみ。既存importは再exportで不変。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export {
  SUMMARY_IMAGE_TEMPLATES,
  SUMMARY_IMAGE_TEMPLATE_KEYS,
  DEFAULT_SUMMARY_IMAGE_TEMPLATE,
  SUMMARY_IMAGE_WIDTH,
  estimateSummaryImageHeight,
  buildSummaryImageElement,
  collectSummaryImageText,
} from './summary-image-templates';
export type {
  SummaryImageTemplateKey,
  SummaryImageData,
  SummaryImageEntry,
} from './summary-image-templates';

import type { SummaryImageEntry } from './summary-image-templates';

// book_meta.summaryImages の器（Kindle固有: 章IDキー＋巻末一覧）
export interface KindleSummaryImages {
  // key = 章ID（文字列）
  chapters?: Record<string, SummaryImageEntry>;
  // 巻末「全章まとめ」一覧画像
  book?: SummaryImageEntry;
}
