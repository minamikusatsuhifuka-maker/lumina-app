import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@/lib/db';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';

export const maxDuration = 180;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  const { sessionId, messages, domain } = await req.json();

  const conversationText = messages
    .map((m: any) => `${m.role === 'user' ? '👤' : '🤖'}: ${m.content}`)
    .join('\n\n');

  const prompt = `あなたは自動化戦略の設計専門家です。
以下の対話内容を元に、実装可能な自動化戦略設計書を作成してください。

## 対話内容
${conversationText}

## 設計書の形式

# 🚀 自動化戦略設計書

## 📋 現状分析と課題
（対話から把握した現状と最大のボトルネック）

## 🏗 推奨アーキテクチャ

### 全体構成図（テキスト形式）
\`\`\`
[入力] → [処理1] → [処理2] → [出力]
     ↓              ↑
  [自動化A]    [自動化B]
\`\`\`

### 推奨ツール・技術スタック
| カテゴリ | ツール | 用途 | 月額費用目安 |
|---------|--------|------|------------|

## 🤖 AIエージェント設計（該当する場合）

### エージェントの目標・役割
### 使用ツール一覧
### 自律判断できる範囲
### 人間承認が必要な判断
### メモリ・状態管理
### エラー処理フロー

## 📅 実装ロードマップ

### Week 1-2: 基盤構築
具体的なタスク（3〜5個）

### Week 3-4: コア自動化
具体的なタスク

### Month 2: 高度化
具体的なタスク

### Month 3以降: 完全自律化
具体的なタスク

## 💰 コスト試算（月額）
| 項目 | 費用 |
|------|------|
| Claude API | ¥X,XXX |
| 外部SaaS | ¥X,XXX |
| その他 | ¥X,XXX |
| **合計** | **¥XX,XXX** |

## ⚠️ リスクと対策
| リスク | 影響度 | 対策 |
|--------|--------|------|

## 🎯 期待される効果
- 削減できる作業時間: 週XX時間
- 自動化率: XX%
- 月次コスト削減: ¥X,XXX

## 🚦 今すぐできるファーストステップ（3つ）
1.
2.
3. `;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 6000,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`
            ));
          }
          if (event.type === 'message_start') inputTokens = event.message?.usage?.input_tokens ?? 0;
          if (event.type === 'message_delta') outputTokens = event.usage?.output_tokens ?? 0;
        }

        if (sessionId) {
          await sql`
            UPDATE automation_sessions SET
              strategy_output = ${fullText},
              updated_at = NOW()
            WHERE id = ${sessionId} AND user_id = ${userId}
          `.catch(() => {});
        }

        await trackUsage({ userId, featureKey: 'automation', stepLabel: '戦略設計書生成', inputTokens, outputTokens }).catch(() => {});

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: String(err) })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
