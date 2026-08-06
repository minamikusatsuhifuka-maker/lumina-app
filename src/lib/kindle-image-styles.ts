// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindleウィザードの画像（表紙・章扉）一元管理（226 Phase1）
// 画風プリセット・スロット定義・book_meta.images の型をここに集約する。
// クライアント（⑥の🖼セクション）とサーバ（/api/kindle/wizard/images）で共用するため
// server-only 依存を置かない。エンジン定義は image-providers/index.ts（171）が正。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type KindleImageStyleKey = 'soft-illust' | 'watercolor' | 'flat' | 'photo';

export interface KindleImageStyle {
  key: KindleImageStyleKey;
  emoji: string;
  label: string;
  // 画像生成プロンプトの末尾に付ける画風指定（日本語プロンプト運用は185アイキャッチで実績あり）
  promptBlock: string;
}

// 既定はやわらかいイラスト調（医療系の安心感・226院長確定）
export const DEFAULT_KINDLE_IMAGE_STYLE: KindleImageStyleKey = 'soft-illust';

export const KINDLE_IMAGE_STYLES: Record<KindleImageStyleKey, KindleImageStyle> = {
  'soft-illust': {
    key: 'soft-illust',
    emoji: '🎨',
    label: 'やわらかいイラスト調',
    promptBlock: '画風: やわらかく温かみのある手描き風イラスト。淡いパステル調の配色、丸みのある形、安心感のある優しい雰囲気。',
  },
  watercolor: {
    key: 'watercolor',
    emoji: '🖌️',
    label: '水彩画風',
    promptBlock: '画風: 繊細な水彩画。にじみのある柔らかい輪郭、軽やかな淡い色の重なり、静かで透明感のある雰囲気。',
  },
  flat: {
    key: 'flat',
    emoji: '📐',
    label: 'フラットデザイン',
    promptBlock: '画風: クリーンなフラットデザインのベクターイラスト。シンプルな形と調和のとれた限定的な配色、モダンで整った印象。',
  },
  photo: {
    key: 'photo',
    emoji: '📷',
    label: '写真風',
    promptBlock: '画風: 写実的な写真風。自然で柔らかい光、浅い被写界深度、清潔感のある明るいトーン。',
  },
};

export const KINDLE_IMAGE_STYLE_KEYS = Object.keys(KINDLE_IMAGE_STYLES) as KindleImageStyleKey[];

export function getKindleImageStyle(key: unknown): KindleImageStyle {
  if (typeof key === 'string' && key in KINDLE_IMAGE_STYLES) {
    return KINDLE_IMAGE_STYLES[key as KindleImageStyleKey];
  }
  return KINDLE_IMAGE_STYLES[DEFAULT_KINDLE_IMAGE_STYLE];
}

// スロット: Phase1は表紙＋章扉の固定スロットのみ（本文中図解はPhase2＝227C/228と合流）
export type KindleImageSlot = 'cover' | 'chapter';

// スロットごとのアスペクト（表紙=縦長・章扉=横長で固定。エンジン/画風のみ毎回選択可）
export const KINDLE_IMAGE_SLOT_ASPECT: Record<KindleImageSlot, 'portrait' | 'landscape'> = {
  cover: 'portrait',
  chapter: 'landscape',
};

// book_meta.images に保存する1画像分のメタ（実体はVercel Blob・base64はDBに置かない）
export interface KindleImageEntry {
  url: string;
  pathname: string;
  engine: string;
  styleKey: KindleImageStyleKey;
  prompt: string;
  updatedAt: string;
}

export interface KindleBookImages {
  cover?: KindleImageEntry;
  // key = 章ID（文字列）
  chapters?: Record<string, KindleImageEntry>;
}

// 出力Markdownの画像行（⑥結合・txt除去・Word埋め込みで共通の形）
export function buildImageLine(alt: string, url: string): string {
  return `![${alt}](${url})`;
}

// txt出力用: 単独の画像行を取り除く
export function stripImageLines(markdown: string): string {
  return markdown.replace(/^!\[[^\]]*\]\([^)]*\)\n?/gm, '');
}
