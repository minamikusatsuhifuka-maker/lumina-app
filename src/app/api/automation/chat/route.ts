import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';
import { auth } from '@/lib/auth';

export const maxDuration = 120;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const DOMAIN_CONTEXTS = {
  saas: {
    label: '外部SaaS連携',
    icon: '🔗',
    expertise: `Make・Zapier・n8n・Notion API・Google Workspace・SNS API（X・Instagram・YouTube）・
Stripe・Slack・Airtable などの外部SaaS連携の専門家`,
    deepDiveAreas: [
      'どのツールをすでに使っているか',
      '自動化したい業務フローの詳細',
      'データの流れ（入力→処理→出力）',
      '費用対効果の試算',
      'Make vs Zapier vs n8n の選定',
    ],
  },
  creative: {
    label: 'クリエイティブ自動化',
    icon: '🎨',
    expertise: `DALL-E・Midjourney・Stable Diffusion・Runway・ElevenLabs・HeyGen・Synthesia などの
AI生成ツールと、それらを組み合わせたクリエイティブ自動化パイプラインの専門家`,
    deepDiveAreas: [
      'どんなクリエイティブを量産したいか',
      'ブランドの一貫性をどう保つか',
      '画像→動画→SNS投稿の自動パイプライン',
      'コスト試算（API料金）',
      '品質チェックの仕組み',
    ],
  },
  agent: {
    label: 'AIエージェント化',
    icon: '🤖',
    expertise: `Claude・GPT-4・Gemini を使ったAIエージェント設計、
LangChain・AutoGen・CrewAI・Claude Computer Use などのエージェントフレームワーク、
MCP（Model Context Protocol）・Tool Use・Function Calling の専門家。
完全自律型AIエージェントの設計・実装・運用のエキスパート。`,
    deepDiveAreas: [
      'エージェントに任せたいタスクの詳細',
      '人間の監視・承認が必要な判断ポイント',
      'ツール使用（Web検索・DB操作・API呼び出し）の範囲',
      'エラー・例外処理の設計',
      'コスト・安全性・信頼性のトレードオフ',
      'Claude Computer Use による操作自動化',
      'マルチエージェント協調の可能性',
    ],
  },
  all: {
    label: '全体戦略',
    icon: '🚀',
    expertise: `SaaS連携・クリエイティブ自動化・AIエージェント化の全領域をカバーする
自動化戦略コンサルタント。現状分析から優先順位付け・ロードマップ設計まで総合的に支援。`,
    deepDiveAreas: [
      '現在の業務フローと最大のボトルネック',
      '自動化による期待効果（時間・コスト・品質）',
      '技術的なリソース・制約',
      '優先順位の考え方',
      '段階的な実装ロードマップ',
    ],
  },
};

const BASE_SYSTEM_PROMPT = (domain: string, clinicInfo: string) => {
  const ctx = DOMAIN_CONTEXTS[domain as keyof typeof DOMAIN_CONTEXTS] ?? DOMAIN_CONTEXTS.all;

  return `あなたは${ctx.expertise}です。
ユーザーの事業・業務を深く理解し、最適な自動化戦略を共に設計します。

## あなたのミッション
AIと外部SaaSを組み合わせて、ユーザーの仕事を果てしなく効率化・自動化する。
人間が5%の判断だけ行えば、残り95%をAIと自動化仕組みが実行できる状態を目指す。

## 対話のスタイル
- 具体的な質問で現状を深く理解する
- 「なぜ」「どのくらい」「誰が」を必ず確認する
- 抽象的な要望を具体的な技術仕様に落とし込む
- 実現可能性・コスト・リスクを正直に評価する
- 最先端の情報（2025-2026年時点）を提供する

## AIエージェント特別深掘りポイント
エージェント化の相談では以下を必ず議論する：
1. **目標設定**：エージェントが達成すべき最終ゴール
2. **ツール定義**：使えるツール（Web・DB・API・ファイル操作）
3. **判断フロー**：自律判断できる範囲 vs 人間承認が必要な範囲
4. **メモリ設計**：短期・長期記憶の保持方法
5. **エラー処理**：失敗時のフォールバック戦略
6. **コスト制御**：1タスクあたりの最大API使用量
7. **Claude Computer Use**：PC操作の自動化可能性

## 対話後の出力
十分な情報が集まったら「設計書を出力できます」と伝える。
設計書には以下を含める：
- 全体アーキテクチャ図（テキスト形式）
- 推奨ツール・技術スタック
- 実装ステップ（Week単位）
- コスト試算
- リスクと対策

${clinicInfo ? `\n## ユーザーの背景\n${clinicInfo}` : ''}

## 現在の自動化状況（xLUMINA内）
- AIオーケストレーター（23ステップ並列実行）✅
- Cron定期実行 ✅
- バッチリサーチ ✅
- ブログ・LP・医療文書自動生成 ✅
- 価格戦略AI分析 ✅
→ これらの**外部展開・拡張**が次のステップ`;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = (session?.user as any)?.id;
  const { messages, domain, userInput } = await req.json();

  const clinicPrompt = await getClinicSystemPrompt('automation', userId);
  const systemPrompt = BASE_SYSTEM_PROMPT(domain ?? 'all', clinicPrompt ?? '');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const allMessages = [
          ...(messages.length === 0 ? [{
            role: 'user' as const,
            content: `${domain === 'agent' ? 'AIエージェント化' : domain === 'saas' ? '外部SaaS連携' : domain === 'creative' ? 'クリエイティブ自動化' : '自動化戦略全般'}について深く相談したいです。まず私の状況を教えてください。`,
          }] : messages),
          ...(userInput ? [{ role: 'user' as const, content: userInput }] : []),
        ];

        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          stream: true,
          system: systemPrompt,
          messages: allMessages,
        });

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`
            ));
          }
        }
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
