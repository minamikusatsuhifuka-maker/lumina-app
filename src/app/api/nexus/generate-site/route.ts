import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface BrandData {
  brand_name?: string;
  tagline?: string;
  description?: string;
  owner_name?: string;
  owner_profile?: string;
  services?: unknown[];
  achievements?: unknown[];
  testimonials?: unknown[];
  sns_links?: Record<string, string>;
  color_theme?: string;
}

interface GenerateSiteRequest {
  brand: BrandData;
  pageType: 'top' | 'lp' | 'profile' | 'blog_index';
  kindleBooks?: unknown[];
  blogPosts?: unknown[];
}

const THEMES: Record<
  string,
  { bg: string; accent: string; text: string; card: string }
> = {
  dark: {
    bg: '#0a0a0a',
    accent: '#6366f1',
    text: '#f1f5f9',
    card: '#1e1e2e',
  },
  light: {
    bg: '#ffffff',
    accent: '#4f46e5',
    text: '#1e293b',
    card: '#f8fafc',
  },
  gradient: {
    bg: '#0f0c29',
    accent: '#a855f7',
    text: '#f1f5f9',
    card: '#1a1a2e',
  },
};

const PAGE_LABELS: Record<string, string> = {
  top: 'ブランドトップページ',
  lp: 'サービスLPページ',
  profile: 'プロフィールページ',
  blog_index: 'ブログ一覧ページ',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: GenerateSiteRequest;
  try {
    body = (await req.json()) as GenerateSiteRequest;
  } catch {
    return NextResponse.json({ error: '不正なリクエスト' }, { status: 400 });
  }

  const { brand, pageType, kindleBooks, blogPosts } = body;
  if (!brand || !pageType) {
    return NextResponse.json(
      { error: 'brandとpageTypeは必須です' },
      { status: 400 },
    );
  }

  const theme = THEMES[brand.color_theme ?? 'dark'] ?? THEMES.dark;
  const pageLabel = PAGE_LABELS[pageType] ?? 'ページ';

  const SITE_PROMPT = `あなたはプロのWebデザイナー・コピーライターです。
以下のブランド情報を元に、${pageLabel}の完全なHTMLファイルを生成してください。

【ブランド情報】
ブランド名: ${brand.brand_name ?? 'nexus'}
タグライン: ${brand.tagline ?? 'AIで、あなたの可能性を最大化する'}
説明: ${brand.description ?? ''}
オーナー名: ${brand.owner_name ?? ''}
プロフィール: ${brand.owner_profile ?? ''}
サービス: ${JSON.stringify(brand.services ?? [])}
実績: ${JSON.stringify(brand.achievements ?? [])}
お客様の声: ${JSON.stringify(brand.testimonials ?? [])}
SNSリンク: ${JSON.stringify(brand.sns_links ?? {})}

${kindleBooks && kindleBooks.length > 0 ? `【Kindle書籍】\n${JSON.stringify(kindleBooks)}` : ''}
${blogPosts && blogPosts.length > 0 ? `【最新ブログ記事】\n${JSON.stringify(blogPosts.slice(0, 6))}` : ''}

【デザイン指定】
背景色: ${theme.bg}
アクセント色: ${theme.accent}
テキスト色: ${theme.text}
カード背景: ${theme.card}

【必須要件】
1. モダンでプロフェッショナルなデザイン
2. レスポンシブ対応（スマホ・PC両対応）
3. CSS・JSを全てインラインで記述（外部ファイル不要）
4. Google Fontsは使用可（CDN経由）
5. アニメーション効果を適度に使用
6. CTAボタンは目立つデザインに
7. ヒーローセクション・実績・サービス・お客様の声・CTAの構成

完全なHTMLファイル（<!DOCTYPE html>から</html>まで）のみを出力してください。
説明文・コードブロック記号は不要です。`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: SITE_PROMPT }],
    });

    const firstBlock = response.content[0];
    let html = firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';

    // モデルがコードブロックで囲んだ場合の保険
    html = html
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    await trackUsage({
      userId,
      featureKey: 'nexus',
      stepLabel: `サイト生成:${pageType}`,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return NextResponse.json({ html, pageType });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
