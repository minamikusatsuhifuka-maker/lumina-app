import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';
import { streamWithModel, type AIModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Length = 'short' | 'medium' | 'long';

const LENGTH_CONFIG: Record<Length, { label: string; chars: string; maxTokens: number }> = {
  short: { label: '短め', chars: '1500〜2500字', maxTokens: 5000 },
  medium: { label: '標準', chars: '3000〜4500字', maxTokens: 8500 },
  long: { label: '長め', chars: '5000〜7000字', maxTokens: 13000 },
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
    theme,
    buzzReferences = [],
    deepResearch = '',
    tonePreference = '',
    personalNotes = '',
    length = 'medium',
    model = 'claude',
    selectedPatterns = [],
  } = (await req.json()) as {
    theme: string;
    buzzReferences?: string[];
    deepResearch?: string;
    tonePreference?: string;
    personalNotes?: string;
    length?: Length;
    model?: AIModel;
    selectedPatterns?: Array<{
      title?: string;
      category?: string;
      framework?: string;
      content?: string;
    }>;
  };

  if (!theme || typeof theme !== 'string' || !theme.trim()) {
    return new Response(JSON.stringify({ error: 'テーマを入力してください' }), {
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

  const config = LENGTH_CONFIG[length];

  // 参考情報セクション組み立て（空欄は省略）
  const buzzList = Array.isArray(buzzReferences)
    ? buzzReferences.filter(b => typeof b === 'string' && b.trim()).slice(0, 10)
    : [];
  const buzzSection = buzzList.length > 0
    ? `\n# 参考: バズる記事の要素分析（${buzzList.length}件）\n\n${buzzList
        .map((b, i) => `## 参考${i + 1}\n${b}`)
        .join('\n\n')}\n\n上記の分析から学べる構成・口調・マーケティング要素を活かしてください。`
    : '';

  const researchSection = deepResearch && deepResearch.trim()
    ? `\n# 参考: ディープリサーチ調査結果\n\n${deepResearch}\n\n上記の調査結果を記事の内容のベースとして活用してください。`
    : '';

  const toneSection = tonePreference && tonePreference.trim()
    ? `\n# 文体・口調の指定\n${tonePreference}`
    : '';

  const personalSection = personalNotes && personalNotes.trim()
    ? `\n# 筆者の経験・視点（記事に自然に織り込む）\n${personalNotes}\n\n上記を記事に自然に織り込んでください。プレースホルダではなく、文章として完結させてください。`
    : '';

  // バズりパターン辞書から選択されたパターン（空なら従来通り何も付与しない）
  const patternList = Array.isArray(selectedPatterns)
    ? selectedPatterns.filter(p => p && typeof p === 'object' && (p.title || p.content)).slice(0, 10)
    : [];
  const patternsSection = patternList.length > 0
    ? `\n# 📖 活用するバズりパターン（${patternList.length}件）
以下のパターン・型を意識して記事を執筆してください。それぞれの構造や心理的効果を理解し、自然に記事に組み込んでください。

${patternList.map((p, i) => `## パターン${i + 1}: ${p.title || '(無題)'}
カテゴリ: ${p.category || '-'}
フレームワーク: ${p.framework || '-'}

${(p.content || '').slice(0, 2000)}
`).join('\n---\n\n')}

上記パターンを参考に、表面的な模倣ではなく、構造・心理効果を理解して記事に活かしてください。`
    : '';

  const systemPrompt = `あなたは note プラットフォームで読者を惹きつける記事を執筆する優秀なライターです。SEO・心理学・マーケティングの知識を駆使しつつ、読者の心に響く文章を生成してください。

重要な制約:
- AIが書いたとわかる無機質な文章は避ける
- 読者と対話するような自然な口調
- 必ず最後まで完結させる
- 「ここに体験談を入れてください」のようなプレースホルダは使わず、自然な文章として完結させる
- HTMLタグは使わない、Markdownのリンク記法（[テキスト](URL)）も使わない
- URLは生のURLのみ記載`;

  const userPrompt = `以下のテーマで note 記事を執筆してください。

# テーマ
${theme}

# 記事の長さ
${config.label}（${config.chars}）
${buzzSection}${researchSection}${toneSection}${personalSection}${patternsSection}

# 記事の構成

## タイトル
（読者の興味を引く魅力的なタイトル、30〜40字）

## 本文
- 導入: 共感を呼ぶ問題提起や読者への語りかけ
- 本論: 構造化された見出し・小見出し、具体例を交えた展開
- 結論: 行動喚起、読者へのメッセージで締めくくる

## 出力形式
- Markdown 形式
- 見出しは ## や ### を活用
- 適度に箇条書きを使用
- 必要に応じて引用や強調を活用

# 厳守事項
- ${config.chars} の範囲内
- 必ず最後の結論まで書ききる
- AI らしい不自然な文章を避け、人間が書いたような自然な文体に
- 投稿前に編集される前提だが、未完成感を残さず完結させる`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        // 投資予測・バズり分析と同じく streamWithModel（standard format）
        const usage = await streamWithModel(
          model,
          userPrompt,
          systemPrompt,
          controller,
          encoder,
          config.maxTokens,
          'standard',
        );

        await trackUsage({
          userId,
          featureKey: 'note-article',
          stepLabel: `[length:${length}] ${theme.slice(0, 40)}`,
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
