// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// note記事強化（228）の型・共通ヘルパ 一元管理
// まとめ（227方式）・配置つき画像（226/227C横展開）・note貼り付けキットの状態を
// NoteEnhanceState として本文とは別レイヤで持つ（fail-closed: 失敗しても本文は無傷）。
// 器は媒体側が持つ: 経路B=feature_result_drafts.payload / 経路A=モーダルstate＋library.metadata。
// 画像実体は既存ギャラリー経路（/api/gallery→Vercel Blob）に保存する＝保存経路を増やさない。
// クライアント/サーバ共用のため server-only 依存を置かない。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { FigureTemplateKey, SummaryImageTemplateKey } from './summary-image-templates';

// 配置スロット4種（観点10原則の配置応用。cta はAI画像でなく「まとめ画像」を置くスロット）
export type NotePlacementSlot = 'hook' | 'evidence' | 'rest' | 'cta';

export interface NotePlacementSlotMeta {
  key: NotePlacementSlot;
  emoji: string;
  label: string;
  // 配置の役割（UI表示＋配置提案プロンプトの両方で使う）
  role: string;
  // 根拠となる原則名（観点10原則から）
  principles: string;
}

export const NOTE_PLACEMENT_SLOTS: Record<NotePlacementSlot, NotePlacementSlotMeta> = {
  hook: {
    key: 'hook',
    emoji: '🪞',
    label: '冒頭フック',
    role: '冒頭フック直後: 共感・自分ごと化のイメージ画像（離脱防止）',
    principles: '自分ごと化・損失回避',
  },
  evidence: {
    key: 'evidence',
    emoji: '🧭',
    label: '主張の裏づけ',
    role: '中盤の主張部: 内容を象徴する情景で納得感を支える（数値・文字は入れない）',
    principles: '社会的証明・具体性',
  },
  rest: {
    key: 'rest',
    emoji: '🍃',
    label: '視覚的休憩',
    role: '長文ブロックの切れ目: 視覚的休憩の挿絵（認知負荷の低減）',
    principles: '認知負荷の軽減',
  },
  cta: {
    key: 'cta',
    emoji: '🧾',
    label: 'まとめ画像',
    role: 'CTA・結び直前: 要点まとめ画像（行動の明確化。AI画像でなくプログラム描画のまとめ画像を置く）',
    principles: '一貫性・小さな一歩',
  },
};

export const NOTE_PLACEMENT_SLOT_KEYS = Object.keys(NOTE_PLACEMENT_SLOTS) as NotePlacementSlot[];

// 記事単位のまとめ（noteは章概念がないため1記事1まとめ）
export interface NoteSummaryState {
  points: string[];
  updatedAt: string;
  source: 'auto' | 'edited';
}

// まとめ画像（227C方式b・プログラム描画）。url は gallery 保存後の blob_url
export interface NoteSummaryImageState {
  url: string;
  template: SummaryImageTemplateKey;
  // 生成時点のまとめ updatedAt（不一致=古い画像→🔄再生成を促す）
  sourceUpdatedAt: string;
  updatedAt: string;
}

// 配置1件分（自動提案→プレビューで調整・削除できる。完全自動固定にしない）
export interface NotePlacementImage {
  id: string;
  slot: NotePlacementSlot;
  // このブロック（splitMarkdownBlocks の index）の直後に挿入
  afterBlock: number;
  // 役割の説明（AI提案・編集可）
  purpose: string;
  // 根拠の原則名（観点10原則から。224と同じく提案に必ず添える）
  principle: string;
  // 画像プロンプト（人間確認型・編集可。cta スロットは空＝まとめ画像を使う）
  prompt: string;
  // 生成済みなら gallery の blob_url
  url?: string;
  engine?: string;
  styleKey?: string;
  updatedAt?: string;
}

// 図表1件分（228a・記事図表の主力）。文言は編集後データのみ＝プログラム描画（227C準拠）
export interface NoteFigure {
  id: string;
  template: FigureTemplateKey;
  title: string;
  // 描画データ（SummaryImageData.groups と同形。テンプレごとの意味は FIGURE_TEMPLATES.hint）
  groups: { heading?: string; points: string[] }[];
  // このブロックの直後に挿入
  afterBlock: number;
  purpose?: string;
  principle?: string;
  // 生成済みなら gallery の blob_url
  url?: string;
  // データ編集の最終時刻と、url生成時点のデータ時刻（不一致=古い画像→🔄再生成を促す）
  dataUpdatedAt?: string;
  renderedAt?: string;
}

export interface NoteEnhanceState {
  summary?: NoteSummaryState;
  summaryImage?: NoteSummaryImageState;
  placements: NotePlacementImage[];
  placementRanAt?: string;
  // 228a: 図表（AI画像とは別レーン。プログラム描画のみ）
  figures?: NoteFigure[];
  figuresRanAt?: string;
}

export function emptyNoteEnhance(): NoteEnhanceState {
  return { placements: [], figures: [] };
}

// 旧データ・metadata経由の揺れを吸収して NoteEnhanceState に正規化
export function normalizeNoteEnhance(raw: unknown): NoteEnhanceState {
  if (!raw || typeof raw !== 'object') return emptyNoteEnhance();
  const o = raw as Partial<NoteEnhanceState>;
  return {
    summary: o.summary && Array.isArray(o.summary.points) ? o.summary : undefined,
    summaryImage: o.summaryImage && typeof o.summaryImage.url === 'string' ? o.summaryImage : undefined,
    placements: Array.isArray(o.placements)
      ? o.placements.filter(
          (p): p is NotePlacementImage =>
            !!p && typeof p === 'object' && typeof (p as NotePlacementImage).id === 'string',
        )
      : [],
    placementRanAt: typeof o.placementRanAt === 'string' ? o.placementRanAt : undefined,
    figures: Array.isArray(o.figures)
      ? o.figures.filter(
          (f): f is NoteFigure =>
            !!f && typeof f === 'object' && typeof (f as NoteFigure).id === 'string' && Array.isArray((f as NoteFigure).groups),
        )
      : [],
    figuresRanAt: typeof o.figuresRanAt === 'string' ? o.figuresRanAt : undefined,
  };
}

// 段落ブロック分割（配置APIの番号付けとクライアントのマーカー挿入で同じ定義を使う＝ズレ防止）
export function splitMarkdownBlocks(markdown: string): string[] {
  return markdown
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

// 記事の長さに応じた挿絵の目安枚数（約1,200字あたり1枚・1〜5枚。まとめ画像は別枠+1）
export function recommendedImageCount(chars: number): number {
  return Math.min(5, Math.max(1, Math.round(chars / 1200)));
}

// note貼り付けキットの画像ファイル名規約（挿入順の連番＋種別名。半角のみ）。
// 種別 = 配置スロット（hook等）または図表テンプレ（steps等）
export function noteImageFileName(order: number, kind: string): string {
  return `${String(order).padStart(2, '0')}_${kind}.png`;
}
