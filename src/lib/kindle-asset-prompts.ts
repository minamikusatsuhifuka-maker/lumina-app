// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 出版・販促アセットのプロンプト（225b・サーバ専用の純関数）
// kindle-studio の販促5APIのプロンプト資産をここへ内製化（品質実績のある文面を踏襲）。
// 入力はウィザードの本（kindle_books + kindle_chapters + book_meta）からサーバ側で組む。
// studio固有の bookType は廃し、目的（KINDLE_PURPOSES.label）で文脈を渡す。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { KindleAssetKind } from './kindle-assets';

export interface KindleAssetContext {
  bookTitle: string;
  subtitle: string;
  targetReader: string;
  purposeLabel: string;
  chapters: string[];
  // 227Bの章まとめ要点を結合したもの（本の内容の芯。無ければ空）
  essence: string;
  hasImages: boolean;
}

const bookTypeLine = (ctx: KindleAssetContext) => `書籍タイプ: 実用ガイド（この本の目的: ${ctx.purposeLabel}）`;
const chaptersText = (ctx: KindleAssetContext) =>
  ctx.chapters.length > 0 ? ctx.chapters.map((c, i) => `${i + 1}. ${c}`).join('\n') : '（章立て未定）';
const essenceLine = (ctx: KindleAssetContext) => (ctx.essence ? `本の内容の要点:\n${ctx.essence}` : '');

export function buildKindleAssetPrompt(
  kind: KindleAssetKind,
  ctx: KindleAssetContext,
): { system: string; user: string; maxTokens: number } {
  if (kind === 'description') {
    return {
      maxTokens: 6000,
      system: `あなたはAmazon KDP出版のコピーライターです。
書籍情報をもとに、Amazonの商品ページに掲載する各種テキストを作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "amazon_description": "Amazon商品説明文（HTMLタグ使用可: <b>, <br>, <h2>, <ul>, <li>。4000字以内）",
  "back_cover_text": "裏表紙テキスト（200字以内）",
  "author_bio": "著者プロフィール（100字以内）",
  "editorial_review": "書評風テキスト（100字以内）",
  "bullet_points": ["セールスポイント1", "セールスポイント2", "セールスポイント3", "セールスポイント4", "セールスポイント5"]
}

amazon_descriptionは購買意欲を高める構成にしてください:
1. 読者の悩みに共感するリード文
2. この本で得られること
3. 目次（章タイトル）
4. こんな人におすすめ
5. 購入を促すクロージング

医療に関わる内容では効果の保証・誇大表現をしない（本の記述の範囲で誠実に訴求する）。`,
      user: `以下の書籍のAmazon掲載テキストを作成してください。

書籍タイトル: ${ctx.bookTitle}
サブタイトル: ${ctx.subtitle || '（なし）'}
章立て:
${chaptersText(ctx)}
ターゲット読者: ${ctx.targetReader || '一般'}
${bookTypeLine(ctx)}
${essenceLine(ctx)}`,
    };
  }
  if (kind === 'keywords') {
    return {
      maxTokens: 4000,
      system: `あなたはAmazon KDPのSEO・キーワード戦略の専門家です。
書籍の情報をもとに、検索で見つかりやすくなるキーワード戦略を提案してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "keywords": [
    {
      "keyword": "キーワード",
      "search_volume": "高/中/低",
      "competition": "高/中/低",
      "relevance": "高/中/低",
      "recommended": true
    }
  ],
  "top7_keywords": ["KDPに登録する7つのキーワード"],
  "categories": [
    {
      "category": "カテゴリパス",
      "reason": "選定理由"
    }
  ],
  "top2_categories": ["登録推奨の2カテゴリ"],
  "seo_tips": ["タイトル・説明文のSEOアドバイス"]
}

keywordsは15〜20個を目安に、関連するキーワードを幅広く提案してください。`,
      user: `以下の書籍のキーワード戦略を提案してください。

タイトル: ${ctx.bookTitle}
テーマ・内容の要点: ${ctx.essence || '（タイトルと章立てから推測してください）'}
章立て:
${chaptersText(ctx)}
ターゲット読者: ${ctx.targetReader || '一般'}
${bookTypeLine(ctx)}`,
    };
  }
  if (kind === 'coverPrompt') {
    return {
      maxTokens: 6000,
      system: `あなたはKindle書籍の表紙デザイン専門家です。
書籍の情報をもとに、3つの異なるスタイルの表紙デザインプロンプトを作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "prompts": [
    {
      "style_name": "デザインスタイル名（例: ミニマル、イラスト、写真風）",
      "midjourney_prompt": "Midjourney用の英語プロンプト",
      "dalle_prompt": "DALL-E用の英語プロンプト",
      "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
      "typography_suggestion": "フォント・文字配置の提案（日本語）",
      "layout_description": "レイアウトの詳細説明（日本語）"
    }
  ]
}

3つのデザインは互いに異なるテイストにしてください。
Kindle表紙の推奨サイズ（1600x2560px、縦横比1:1.6）を考慮してください。
プロンプトはbook cover, kindle cover, high qualityなどのキーワードを含めてください。
実在の人物・患部の写実的描写・効果効能を示唆する演出は含めないでください。`,
      user: `以下の書籍の表紙デザインプロンプトを3案作成してください。

書籍タイトル: ${ctx.bookTitle}
テーマ・内容の要点: ${ctx.essence || '（タイトルから推測してください）'}
ターゲット読者: ${ctx.targetReader || '一般'}
${bookTypeLine(ctx)}`,
    };
  }
  if (kind === 'promotion') {
    return {
      maxTokens: 8000,
      system: `あなたはKindle書籍のマーケティング戦略家です。
書籍の情報をもとに、各SNSプラットフォーム向けのプロモーション戦略を作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "posts": [
    {
      "platform": "twitter/instagram/note",
      "content": "投稿テキスト",
      "hashtags": ["#ハッシュタグ1", "#ハッシュタグ2"],
      "best_time": "おすすめ投稿時間（例: 朝7時）",
      "image_prompt": "投稿用画像の生成プロンプト（英語）"
    }
  ],
  "launch_plan": [
    {
      "day": 1,
      "action": "実施内容",
      "platform": "対象プラットフォーム",
      "detail": "具体的な手順"
    }
  ],
  "email_template": {
    "subject": "メール件名",
    "body": "メール本文（改行は\\nで表現）"
  }
}

postsは各プラットフォーム2〜3パターンずつ作成してください。
launch_planは出版日を含む7日間のスケジュールです。
AmazonのURLは未定のため、本文には「（リンクはプロフィールへ）」等のURL非依存の表現を使ってください。
煽り・不安訴求・効果の保証はしない（医療広告ガイドライン配慮）。`,
      user: `以下の書籍のプロモーション戦略を作成してください。

書籍タイトル: ${ctx.bookTitle}
テーマ・内容の要点: ${ctx.essence || '（タイトルから推測してください）'}
ターゲット読者: ${ctx.targetReader || '一般'}
${bookTypeLine(ctx)}`,
    };
  }
  // checklist
  return {
    maxTokens: 4000,
    system: `あなたはKindle出版の品質管理マネージャーです。
書籍の情報をもとに、出版前に確認すべきチェックリストを作成してください。

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "pre_publish_checks": [
    {
      "category": "原稿/フォーマット/メタデータ/法的確認",
      "item": "チェック項目の説明",
      "status": "必須/推奨/任意",
      "done": false
    }
  ],
  "technical_checks": [
    {
      "item": "技術的チェック項目",
      "detail": "具体的な確認方法",
      "status": "必須/推奨/任意",
      "done": false
    }
  ],
  "marketing_checks": [
    {
      "item": "マーケティング準備項目",
      "detail": "具体的なアクション",
      "status": "必須/推奨/任意",
      "done": false
    }
  ],
  "estimated_publish_time": "出版までの推定所要時間"
}

書籍タイプと画像の有無に応じて、適切なチェック項目を含めてください。`,
    user: `以下の書籍の出版前チェックリストを作成してください。

書籍タイトル: ${ctx.bookTitle}
${bookTypeLine(ctx)}
章数: ${ctx.chapters.length}章
画像（表紙・章扉）: ${ctx.hasImages ? 'あり' : 'なし'}
ターゲット読者: ${ctx.targetReader || '一般'}`,
  };
}
