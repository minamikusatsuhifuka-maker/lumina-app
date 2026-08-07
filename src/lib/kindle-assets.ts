// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindleウィザード⑥ 出版・販促アセット 一元管理（225b）
// kindle-studio（撤去予定）の販促5機能をウィザードへ吸収したもの。
// 種別・保存の型・表示/コピー共用のテキスト整形をここに集約する
// （クライアント/サーバ共用のため server-only 依存を置かない）。
// 保存先は kindle_books.book_meta.assets.<kind>（224で確立したjsonb_setマージ・他キーと同居）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type KindleAssetKind = 'description' | 'keywords' | 'coverPrompt' | 'promotion' | 'checklist';

export const KINDLE_ASSET_KINDS: KindleAssetKind[] = [
  'description',
  'keywords',
  'coverPrompt',
  'promotion',
  'checklist',
];

export const KINDLE_ASSET_META: Record<KindleAssetKind, { emoji: string; label: string; hint: string }> = {
  description: { emoji: '📦', label: 'Amazon説明文・裏表紙', hint: '商品説明文（HTML可）・裏表紙・著者プロフィール・セールスポイント5点' },
  keywords: { emoji: '🔑', label: 'KDPキーワード・カテゴリ', hint: '登録キーワード7つ・推奨2カテゴリ・SEOアドバイス' },
  coverPrompt: { emoji: '🎨', label: '表紙画像プロンプト（3案）', hint: 'Midjourney/DALL-E用プロンプト・配色・タイポグラフィ提案' },
  promotion: { emoji: '📣', label: 'SNS宣伝＋ローンチプラン', hint: 'SNS投稿文・7日間ローンチ計画・告知メール文' },
  checklist: { emoji: '📋', label: '出版前チェックリスト', hint: '原稿/技術/マーケの確認項目と推定所要時間' },
};

// book_meta.assets.<kind> に保存する1件分（dataの中身はkindごとのJSON）
export interface KindleAssetEntry {
  generatedAt: string;
  data: Record<string, unknown>;
}

export type KindleBookAssets = Partial<Record<KindleAssetKind, KindleAssetEntry>>;

// ── 表示・コピー共用のテキスト整形 ─────────────────────────────
// ⑥の展開表示（pre-wrap）と📋コピー（copyRichMarkdown）を同じ1本のシリアライザで賄う。
// HTML断片（amazon_description）はそのまま文字列として出す＝KDP入力欄へ貼る用途を優先。

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

export function kindleAssetToText(kind: KindleAssetKind, data: Record<string, unknown>): string {
  if (kind === 'description') {
    const bullets = list(data.bullet_points);
    return [
      '## Amazon商品説明文（HTMLタグはKDPの説明欄にそのまま貼れます）',
      s(data.amazon_description),
      '',
      '## 裏表紙テキスト',
      s(data.back_cover_text),
      '',
      '## 著者プロフィール',
      s(data.author_bio),
      '',
      '## 書評風テキスト',
      s(data.editorial_review),
      '',
      '## セールスポイント',
      ...bullets.map((b) => `- ${b}`),
    ].join('\n');
  }
  if (kind === 'keywords') {
    const kws = (Array.isArray(data.keywords) ? data.keywords : []) as Array<Record<string, unknown>>;
    return [
      '## KDP登録キーワード（7つ）',
      ...list(data.top7_keywords).map((k, i) => `${i + 1}. ${k}`),
      '',
      '## 登録推奨カテゴリ（2つ）',
      ...list(data.top2_categories).map((c) => `- ${c}`),
      '',
      '## SEOアドバイス',
      ...list(data.seo_tips).map((t) => `- ${t}`),
      '',
      '## キーワード候補一覧',
      ...kws.map((k) => `- ${s(k.keyword)}（検索量:${s(k.search_volume)}／競合:${s(k.competition)}／関連:${s(k.relevance)}${k.recommended ? '・おすすめ' : ''}）`),
    ].join('\n');
  }
  if (kind === 'coverPrompt') {
    const prompts = (Array.isArray(data.prompts) ? data.prompts : []) as Array<Record<string, unknown>>;
    return prompts
      .map((p, i) =>
        [
          `## 案${i + 1}: ${s(p.style_name)}`,
          `- Midjourney: ${s(p.midjourney_prompt)}`,
          `- DALL-E: ${s(p.dalle_prompt)}`,
          `- 配色: ${list(p.color_palette).join(' ')}`,
          `- タイポグラフィ: ${s(p.typography_suggestion)}`,
          `- レイアウト: ${s(p.layout_description)}`,
        ].join('\n'),
      )
      .join('\n\n');
  }
  if (kind === 'promotion') {
    const posts = (Array.isArray(data.posts) ? data.posts : []) as Array<Record<string, unknown>>;
    const plan = (Array.isArray(data.launch_plan) ? data.launch_plan : []) as Array<Record<string, unknown>>;
    const mail = (data.email_template ?? {}) as Record<string, unknown>;
    return [
      '## SNS投稿文',
      ...posts.flatMap((p) => [
        `### ${s(p.platform)}（おすすめ時間: ${s(p.best_time)}）`,
        s(p.content),
        list(p.hashtags).join(' '),
        '',
      ]),
      '## 7日間ローンチプラン',
      ...plan.map((d) => `- Day${d.day}: ${s(d.action)}（${s(d.platform)}）— ${s(d.detail)}`),
      '',
      '## 告知メール文',
      `件名: ${s(mail.subject)}`,
      '',
      s(mail.body),
    ].join('\n');
  }
  // checklist
  const section = (title: string, items: unknown) => [
    `## ${title}`,
    ...((Array.isArray(items) ? items : []) as Array<Record<string, unknown>>).map(
      (it) => `- [${s(it.status) || '推奨'}] ${s(it.item)}${s(it.detail) || s(it.category) ? `（${s(it.detail) || s(it.category)}）` : ''}`,
    ),
    '',
  ];
  return [
    ...section('出版前チェック', data.pre_publish_checks),
    ...section('技術チェック', data.technical_checks),
    ...section('マーケティング準備', data.marketing_checks),
    `推定所要時間: ${s(data.estimated_publish_time)}`,
  ].join('\n');
}
