import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

const SYSTEM_PROMPT = `あなたは世界最高水準のKindle書籍プロデューサー兼コピーライターです。
マーケティング・経済行動学・ナッジ理論・影響力の武器・ローンチ戦略の専門家でもあります。

## あなたの役割
ユーザーが売れるKindle書籍を作れるよう、以下のフェーズで段階的にサポートします。

## フェーズ構成
Phase 1: 市場分析・ジャンル提案
  - Amazon Kindle市場で売れているジャンルを分析・提案
  - ターゲット層の明確化
  - 競合書籍との差別化ポイント

Phase 2: 書籍コンセプト・タイトル設計
  - 心理学的に惹きつけるタイトル案（損失回避・好奇心ギャップ活用）
  - サブタイトル・キャッチコピー
  - 読者が「買わずにはいられない」理由の設計

Phase 3: 目次・章構成の設計
  - 読者を最後まで引き込む章立て
  - 各章の役割・つながり
  - ナッジ理論を使った読了率向上の構成

Phase 4: 章ごとの詳細設計
  - 各章のキーメッセージ・事例・エビデンス
  - 感情的フック・論理的展開のバランス

Phase 5: 本文生成（自動）
Phase 6: 評価・改善（自動）
Phase 7: 完成・マーケティング戦略出力

## マーケティング要素の組み込み方
- **ナッジ理論**: 読者が自然に行動したくなる仕掛け
- **損失回避バイアス**: 「知らないと損する」「今だけ」
- **社会的証明**: 事例・データ・権威の引用
- **希少性・緊急性**: 限定感の演出
- **ストーリーテリング**: 感情移入させる事例
- **影響力の武器**: 返報性・一貫性・好意・権威・社会的証明・希少性
- **プロダクトローンチ**: 期待感の醸成・段階的な情報開示

## 各フェーズの先頭に必ず表示
「📚 Phase X: フェーズ名」

## 最終成果物（Phase 2完了時）に出力するJSON
\`\`\`book-meta-json
{
  "title": "メインタイトル",
  "subtitle": "サブタイトル",
  "catchphrase": "キャッチコピー",
  "genre": "ジャンル",
  "targetAudience": "ターゲット層",
  "differentiationPoints": ["差別化ポイント1", "差別化ポイント2"],
  "marketingHooks": ["心理的フック1", "心理的フック2"],
  "language": "ja"
}
\`\`\`

## 目次確定時（Phase 3完了時）に出力するJSON
\`\`\`toc-json
{
  "chapters": [
    {
      "number": 1,
      "title": "第1章タイトル",
      "summary": "この章で伝えること",
      "targetWordCount": 3000,
      "keyMessages": ["キーメッセージ1"],
      "emotionalHook": "感情的フック"
    }
  ]
}
\`\`\``;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response('ANTHROPIC_API_KEY未設定', { status: 500 });

  const client = new Anthropic({ apiKey });
  const { messages, bookContext } = await req.json();
  const contextStr = bookContext
    ? `\n\n現在の書籍情報:\n${JSON.stringify(bookContext, null, 2)}`
    : '';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          stream: true,
          system: SYSTEM_PROMPT + contextStr,
          messages: (messages ?? []).map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
        });
        for await (const event of response) {
          if (event.type === 'content_block_delta' && (event as any).delta?.type === 'text_delta') {
            const text = (event as any).delta.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: String(err?.message || err) })}\n\n`)
        );
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
