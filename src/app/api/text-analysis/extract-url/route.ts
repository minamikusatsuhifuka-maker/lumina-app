import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface ExtractRequest {
  urls: string[];
}

interface ExtractResult {
  url: string;
  success: boolean;
  text?: string;
  charCount?: number;
  error?: string;
}

export async function POST(req: NextRequest) {
  // 認証チェック
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  let body: ExtractRequest;
  try {
    body = (await req.json()) as ExtractRequest;
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });
  }

  const { urls } = body;
  if (!Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'URLが必要です' }, { status: 400 });
  }
  if (urls.length > 10) {
    return NextResponse.json(
      { error: '一度に処理できるURLは10件までです' },
      { status: 400 },
    );
  }

  const results: ExtractResult[] = [];

  for (const url of urls) {
    try {
      // URLのコンテンツを取得（10秒タイムアウト）
      const fetchRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; xLUMINA/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!fetchRes.ok) {
        results.push({ url, success: false, error: `HTTP ${fetchRes.status}` });
        continue;
      }

      const html = await fetchRes.text();

      // Claudeで本文抽出（広告・ナビ・フッターを除去）
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
      const extractedText =
        firstBlock && firstBlock.type === 'text' ? firstBlock.text : '';

      results.push({
        url,
        success: true,
        text: extractedText,
        charCount: extractedText.length,
      });
    } catch (err) {
      results.push({
        url,
        success: false,
        error: String(err).slice(0, 100),
      });
    }
  }

  return NextResponse.json({ results });
}
