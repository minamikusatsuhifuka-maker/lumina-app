import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      console.error('[generate] Unauthorized');
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const { prompt, mode, style, length, audience } = body;
    console.log('[generate] Request:', { mode, style, length, audience, promptLength: prompt?.length });

    if (!prompt) {
      return new Response('Prompt is required', { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_api_key_here') {
      console.error('[generate] API key not set');
      return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const modeMap: Record<string, string> = {
      blog: 'ブログ記事', note: 'note記事', novel: '小説',
      guide: '解説本・ガイド', publish: '出版用文章',
      social: 'SNS投稿', report: 'レポート',
      homepage: 'ホームページ・ランディングページのコピー',
      product: '商品・サービスの説明文',
      email: 'メール文章',
      press: 'プレスリリース',
      sns_twitter: 'X(Twitter)投稿文（140文字以内・ハッシュタグ付き）',
      sns_instagram: 'Instagram投稿文（絵文字・ハッシュタグ付き・魅力的なキャプション）',
      sns_note: 'note記事のリード文（読者を引き込む書き出し・500字）',
      image_prompt: '画像生成AIへの英語プロンプト（Midjourney/DALL-E/Stable Diffusion対応）',
    };
    const styleMap: Record<string, string> = {
      casual: 'カジュアルで読みやすい文体',
      formal: 'フォーマルで丁寧な文体',
      literary: '文学的で表現豊かな文体',
      academic: '学術的で論理的な文体',
    };
    const lengthMap: Record<string, string> = {
      short: '約500文字', medium: '約1500文字',
      long: '約3000文字', xl: '5000文字以上',
    };
    const audienceMap: Record<string, string> = {
      general: '一般読者', beginner: '初心者・入門者',
      expert: '専門家・上級者', business: 'ビジネスパーソン',
    };

    const modeSpecificPrompts: Record<string, string> = {
      image_prompt: `あなたは画像生成AIのプロンプトエンジニアです。
入力された日本語の内容を、Midjourney/DALL-E/Stable Diffusionで
最高の画像を生成するための英語プロンプトに変換してください。

出力形式：
1. メインプロンプト（英語・詳細な描写）
2. スタイル指定（例: photorealistic, 8k, cinematic lighting）
3. ネガティブプロンプト（除外したいもの）
4. 日本語での説明（どんな画像が生成されるか）`,
      sns_twitter: `あなたはSNSマーケティングの専門家です。
X(Twitter)で拡散されやすい投稿文を作成してください。
- 140文字以内（日本語）
- インパクトのある書き出し
- 適切なハッシュタグ3〜5個
- 複数パターン（3案）を提案`,
      sns_instagram: `あなたはInstagramマーケティングの専門家です。
Instagramで反応が得られる魅力的なキャプションを作成してください。
- 絵文字を効果的に使用
- ストーリー性のある文章
- 適切なハッシュタグ10〜15個
- 複数パターン（3案）を提案`,
      sns_note: `あなたはnote記事のライティング専門家です。
読者を引き込む魅力的なリード文（書き出し）を作成してください。
- 約500字
- 読者の課題や悩みに共感する書き出し
- 記事を読み続けたくなる構成
- 複数パターン（3案）を提案`,
    };

    const systemPrompt = modeSpecificPrompts[mode] || `あなたは一流のコンテンツライターです。
文章種別: ${modeMap[mode] || 'ブログ記事'}
文体: ${styleMap[style] || 'カジュアルで読みやすい文体'}
目標文字数: ${lengthMap[length] || '約1500文字'}
対象読者: ${audienceMap[audience] || '一般読者'}
高品質で読者を引きつける文章を作成してください。事実誤認を避け、不確かな情報は「〜とされています」と表現してください。`;

    // カスタムペルソナのsystemPromptがあれば上書き
    const finalSystemPrompt = body.systemOverride || systemPrompt;

    console.log('[generate] Calling Anthropic API...');

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        stream: true,
        system: finalSystemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error('[generate] Anthropic API error:', anthropicResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Anthropic APIエラー: ${anthropicResponse.status}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[generate] Streaming response started');
    return new Response(anthropicResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[generate] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'サーバーエラーが発生しました' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
