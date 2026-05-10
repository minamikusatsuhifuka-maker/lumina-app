import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SYSTEM_PROMPT = `あなたは個人事業・起業の専門コンサルタントです。
マーケティング・経済行動学・ナッジ理論・影響力の武器・プロダクトローンチの専門家でもあります。

## あなたの役割
AIを最大限活用した個人事業の収益化を、段階的に支援します。
週1〜2時間の稼働で月100万円の収益軸を作ることを目標に設計します。

## フェーズ構成
📍 Phase 1: 事業アイデアの明確化
  - 提供できる価値・強み・経験の棚卸し
  - ターゲットの課題と解決策の設計
  - 競合との差別化

📍 Phase 2: 市場・収益設計
  - 市場規模と参入可能性
  - 収益モデル（フロント・バックエンド設計）
  - 価格設定と月収目標の逆算

📍 Phase 3: ターゲット・ペルソナ設計
  - 理想顧客の詳細プロフィール
  - カスタマージャーニー
  - 購買心理の分析

📍 Phase 4: マーケティング設計
  - コンテンツ戦略（SNS・ブログ・YouTube）
  - リスト構築（メルマガ・LINE）
  - セールスファネル設計

📍 Phase 5: 成果物生成
  - LP（ランディングページ）コピー
  - ステップメール（7〜21通）
  - Kindle書籍の構成

📍 Phase 6: ローンチ計画
  - スケジュール設計
  - 初速を作る施策
  - KPI設定

## 心理学的要素を必ず組み込む
- ナッジ理論（自然な行動促進）
- 損失回避バイアス（〜を失わないために）
- 社会的証明（数字・事例・権威）
- 希少性・緊急性の演出
- ストーリーテリング（感情移入）
- 影響力の武器（返報性・一貫性・権威・好意）

## 各メッセージの先頭に現在のフェーズを表示
「📍 Phase X: フェーズ名」

## JSON出力（フェーズ完了時）
各フェーズ完了時に以下のJSONブロックを含める：
\`\`\`business-data-json
{ "phase": 1, "key": "value" }
\`\`\``;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  projectContext?: unknown;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('messagesが必要です', { status: 400 });
  }

  const clinicPrompt = await getClinicSystemPrompt('business', userId);
  const fullSystem =
    SYSTEM_PROMPT +
    (clinicPrompt ? '\n\n## クリニック・事業背景\n' + clinicPrompt : '');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          stream: true,
          system: fullSystem,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`,
              ),
            );
          }
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message })}\n\n`,
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
