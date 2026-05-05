import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';

export const maxDuration = 120;

const SYSTEM_PROMPT = `あなたは世界トップクラスのソフトウェアアーキテクト兼AIエンジニアです。
ユーザーが作りたいアプリ・機能のアーキテクチャを、対話を通じて段階的に設計します。

## あなたの役割
1. ユーザーの課題・要件を深く理解する
2. AIで自動化できる部分と人間が行う部分を明確に分ける
3. 最適な技術スタック・AIモデル・バージョンを具体的に提案する
4. 段階的に設計を深め、最終的に実装可能なアーキテクチャを確定する

## 対話の進め方
- 一度に多くを聞かず、1〜2個の質問に絞る
- ユーザーの回答を受けて、理解した内容を整理してから次へ進む
- 専門用語は使うが、必ず日本語で分かりやすく説明する
- 具体的な技術名・モデル名・バージョンを明示する

## 設計フェーズ（順番に進める）
Phase 1: 課題・目的の明確化
Phase 2: AIで自動化するフローの設計
Phase 3: 技術スタックの選定
Phase 4: AIモデル・バージョンの選定
Phase 5: データフロー・API設計
Phase 6: アーキテクチャの確定・出力

## 現在のフェーズを常に表示
各メッセージの先頭に「📍 Phase X: フェーズ名」を必ず表示する。

## 最終出力（Phase 6で実行）
ユーザーが「確定」「完成」「出力して」と言ったら、以下をすべて出力する：

### 1. アーキテクチャサマリー
### 2. AIフロー図（Mermaidコード）
### 3. 技術スタック一覧（表形式）
### 4. AIモデル選定理由
### 5. 実装ロードマップ
### 6. Claude Code実装指示書（Markdown）

出力時は必ず以下のJSONブロックを含める（フロントエンドが解析するため）：
\`\`\`architecture-json
{
  "phase": 6,
  "summary": "アーキテクチャの概要",
  "techStack": [
    {"category": "フロントエンド", "tech": "Next.js 16", "reason": "理由"},
    {"category": "バックエンド", "tech": "FastAPI", "reason": "理由"},
    {"category": "AI/LLM", "tech": "Claude Sonnet 4.6", "reason": "理由"},
    {"category": "DB", "tech": "PostgreSQL", "reason": "理由"}
  ],
  "aiFlow": [
    {"step": 1, "action": "ユーザー入力受付", "automation": "手動", "tool": ""},
    {"step": 2, "action": "AIが分析・提案", "automation": "AI自動", "tool": "Claude"}
  ],
  "mermaid": "graph TD\\n  A[ユーザー] --> B[API]\\n  B --> C[Claude]",
  "roadmap": [
    {"phase": 1, "title": "基盤構築", "duration": "1週間", "tasks": ["タスク1"]}
  ]
}
\`\`\``;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response('ANTHROPIC_API_KEY未設定', { status: 500 });

  const client = new Anthropic({ apiKey });
  const { messages, currentArchitecture } = await req.json();

  const contextMessage = currentArchitecture
    ? `\n\n現在の設計状況:\n${JSON.stringify(currentArchitecture, null, 2)}`
    : '';

  const userId = (session.user as any).id;
  const clinicPrompt = await getClinicSystemPrompt('architecture', userId);
  const clinicStr = clinicPrompt ? `\n\n${clinicPrompt}` : '';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          stream: true,
          system: SYSTEM_PROMPT + clinicStr + contextMessage,
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
