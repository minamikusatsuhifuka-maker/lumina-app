import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

    const systemPrompt = `あなたは一流のコンテンツライターです。
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
