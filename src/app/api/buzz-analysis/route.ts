import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';
import { streamWithModel, type AIModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Depth = 'light' | 'standard' | 'deep';

// 深さ別の出力目安と max_tokens
const DEPTH_CONFIG: Record<Depth, { maxTokens: number; charTarget: string }> = {
  light: { maxTokens: 3500, charTarget: '2000字程度' },
  standard: { maxTokens: 6500, charTarget: '4000字程度' },
  deep: { maxTokens: 12000, charTarget: '8000字程度' },
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const userId = (session.user as any).id ?? '';

  const {
    url,
    depth = 'standard',
    model = 'claude',
  } = (await req.json()) as { url: string; depth?: Depth; model?: AIModel };

  // URL バリデーション
  if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    return new Response(JSON.stringify({ error: 'URLが正しくありません（http/https）' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Step 1: URLから本文抽出（extract-url と同等のロジックを内製化）
  let extractedText = '';
  try {
    const fetchRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; xLUMINA/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!fetchRes.ok) {
      return new Response(
        JSON.stringify({ error: `URLの取得に失敗しました（HTTP ${fetchRes.status}）` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const html = await fetchRes.text();

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `以下のHTMLから、記事・ブログ・ニュースの本文テキストのみを抽出してください。

除外するもの：
- ナビゲーションメニュー
- 広告・バナー
- フッター・ヘッダー
- SNSボタン・シェアボタン
- コメント欄
- サイドバー
- Cookie通知

抽出するもの：
- 記事タイトル
- 本文（段落ごとに改行）
- 著者・日付（あれば）

プレーンテキストのみで出力してください（HTMLタグ不要）。

URL: ${url}

HTML:
${html.slice(0, 20000)}`,
        },
      ],
    });

    const firstBlock = response.content[0];
    extractedText = firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';

    if (!extractedText.trim()) {
      return new Response(JSON.stringify({ error: '本文を抽出できませんでした' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 抽出に使ったトークンも記録
    await trackUsage({
      userId,
      featureKey: 'buzz-analysis',
      stepLabel: `[extract] ${url.slice(0, 40)}`,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      model: 'claude-sonnet-4-6',
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `URLコンテンツ取得エラー: ${String(err?.message || err).slice(0, 200)}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const { maxTokens, charTarget } = DEPTH_CONFIG[depth];

  // Step 2: バズり要素分析
  const systemPrompt = `あなたは note や Web 記事の「バズり要素」を分析する優秀なコンテンツマーケターです。読者心理、文体、構成、SEO 要素を多角的に分析し、自分の記事に活かせる学びを言語化してください。

絶対に守るルール：
1. URLは生のURLのみ記載（例: https://example.com）
2. HTMLタグは一切使用禁止
3. Markdownのリンク記法も禁止（[テキスト](URL)形式も使わない）
4. 客観的に分析し、推測は「〜と考えられる」と明示
5. 必ず最後の「🔑 重要キーワード」まで完結させる（出力目安: ${charTarget}）`;

  const userPrompt = `以下の記事を分析し、バズり要素を言語化してください。

# 記事URL
${url}

# 記事本文
${extractedText}

# 分析の観点

## 📋 記事概要
- タイトル
- テーマ・トピック
- 想定読者ペルソナ
- 推定文字数

## 🎯 バズり要素分析

### 1. 構成パターン
- 導入の引き込み方
- 本文の流れ・章立て
- クライマックスの作り方
- 結論への落とし込み

### 2. 口調・文体の特徴
- 一人称、語尾
- 読者との距離感
- 感情表現の使い方
- リズム・テンポ

### 3. マーケティング要素
- タイトルの工夫（数字、強い言葉、好奇心トリガー）
- 見出しの作り方
- CTA（行動喚起）の配置
- SEO キーワード推定

### 4. 心理学的トリガー
- 共感、希少性、社会的証明、権威性などの活用
- 読者の感情をどう動かしているか

## 💡 学びポイント・応用方法
- この記事から学べる5つの再現可能な技
- 自分の記事に応用する具体的なアイデア

## 🔑 重要キーワード
（記事を象徴する10〜15個のキーワード）

# 注意
- 客観的に分析、推測は「〜と考えられる」と明示
- 出力目安: ${charTarget}
- 必ず最後まで完結させてください`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        // 投資予測と同じく streamWithModel で SSE 配信（Claude/Gemini 共通）
        const usage = await streamWithModel(
          model,
          userPrompt,
          systemPrompt,
          controller,
          encoder,
          maxTokens,
          'standard',
        );

        await trackUsage({
          userId,
          featureKey: 'buzz-analysis',
          stepLabel: url.slice(0, 50),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          model: 'claude-sonnet-4-6',
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'done',
              usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens },
            })}\n\n`,
          ),
        );
      } catch (error: any) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: String(error?.message || error) })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
