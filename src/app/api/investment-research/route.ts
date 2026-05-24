import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';
import { streamWithModel, type AIModel } from '@/lib/ai-client';

export const maxDuration = 300;

type InvestmentMode = 'world' | 'sector' | 'future' | 'custom';

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session ? (session.user as any).id : '';
  const {
    topic,
    mode = 'custom',
    periodStart,
    periodEnd,
    model = 'claude',
  } = (await req.json()) as {
    topic: string;
    mode?: InvestmentMode;
    periodStart?: string;
    periodEnd?: string;
    model?: AIModel;
  };

  if (!topic || typeof topic !== 'string') {
    return new Response(JSON.stringify({ error: 'topic is required' }), {
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

  // 対象期間セクション（指定があるときのみプロンプトに付与）
  const periodSection = (periodStart || periodEnd)
    ? `\n\n# 対象期間\n${periodStart || '指定なし'} 〜 ${periodEnd || '現在まで'}\n\n上記の期間における情報・出来事・データを中心に分析してください。それ以外の期間の情報は、必要な背景説明としてのみ参照し、メインの分析対象から除外してください。`
    : '';

  // モード別プロンプト
  const modePrompts: Record<InvestmentMode, string> = {
    world: `以下のテーマについて、最新の世界情勢・地政学・経済動向の観点から包括的に分析してください。${periodSection}

# テーマ
${topic}

# 出力構成
## 🌍 現在の世界情勢の全体像
## 🔥 主要なリスク要因（地政学・経済・規制等）
## 💹 市場への影響と動向
## 🏆 影響を受ける/恩恵を受ける主要国・地域
## ⚠️ 注意すべきリスクシナリオ
## 💡 投資家視点での検証ポイント
## 📚 参考情報源

# 注意
- 客観的事実と推測を明確に区別
- 出典・根拠を可能な限り明示
- 必ず最後の「📚 参考情報源」まで完結させる`,

    sector: `以下の分野について、投資視点でのトレンド分析を行ってください。${periodSection}

# 分野/テーマ
${topic}

# 出力構成
## 📊 業界・分野の全体像と市場規模
## 🚀 成長を牽引する要因
## 🏆 主要プレイヤー（国内外）
## 🌟 注目のサブセクター・新興企業
## ⚠️ 業界が抱える課題・リスク
## 📈 今後3〜5年の見通し
## 💡 投資判断の検証ポイント
## 📚 参考情報源

# 注意
- 客観的事実と推測を明確に区別
- 必ず最後の「📚 参考情報源」まで完結させる`,

    future: `以下のテーマについて、3〜5年先を見据えた未来予測を行ってください。${periodSection}

# テーマ
${topic}

# 出力構成
## 🔮 予測の前提（現状の傾向）
## 🚀 今後発展が予測される分野・テーマ Top 10
## 🌟 各分野の発展シナリオと根拠
## 🏆 恩恵を受けると予想される業界・企業
## ⚠️ ブレ要因・不確実性
## 💡 早期検証ポイント（兆候を見るための指標）
## 📚 参考情報源

# 注意
- 予測には根拠を明示
- 確度の高さを区別（「ほぼ確実」「可能性が高い」「不確定」など）
- 必ず最後の「📚 参考情報源」まで完結させる`,

    custom: `以下の投資候補について多角的に検証してください。${periodSection}

# 検証対象
${topic}

# 出力構成
## 💡 対象の概要
## 📊 現状分析（業績・財務・市場地位）
## 🌍 マクロ環境との関連性
## 🚀 成長ドライバーとなる要因
## ⚠️ リスク要因
## 🏆 競合との比較
## 📈 中長期的な可能性
## 💡 投資判断の検証ポイント・指標
## 📚 参考情報源

# 注意
- 客観的事実と推測を明確に区別
- 投資判断は最終的に自己責任である旨を意識した提示
- 必ず最後の「📚 参考情報源」まで完結させる`,
  };

  const systemPrompt = `あなたは優秀な投資アナリスト・経済リサーチャーです。
最新の世界情勢・市場動向・業界トレンドを統合し、客観的かつ実用的な投資分析レポートを日本語で作成してください。

絶対に守るルール：
1. URLは生のURLのみ記載（例: https://example.com）
2. HTMLタグは一切使用禁止（<a href=...>など）
3. Markdownのリンク記法も禁止（[テキスト](URL)形式も使わない）
4. 出典は「出典: サイト名 https://URL」の形式のみ
5. URLの後に属性やスタイルは絶対に書かない
6. 事実と推測を明確に区別してください`;
  const userPrompt = modePrompts[mode];
  const maxTokens = 12000;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        // Gemini: streamWithModel（Web検索ツールなし）
        if (model === 'gemini') {
          const usage = await streamWithModel(
            'gemini',
            userPrompt,
            systemPrompt,
            controller,
            encoder,
            maxTokens,
            'standard',
          );
          await trackUsage({
            userId,
            featureKey: 'investment-research',
            stepLabel: (topic ?? '').slice(0, 50),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            model: 'claude-sonnet-4-6',
          });
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'done', usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } })}\n\n`,
            ),
          );
          return;
        }

        // Claude: web_search ツール対応
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokens,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });

        if (!response.ok) {
          controller.enqueue(encoder.encode(`data: {"type":"error","message":"APIエラー: ${response.status}"}\n\n`));
          controller.close();
          return;
        }

        const data = await response.json();
        const text = (data.content || [])
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n');

        const lines = text.split('\n');
        for (const line of lines) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', content: line + '\n' })}\n\n`));
          await new Promise(r => setTimeout(r, 5));
        }

        const usageInput = data.usage?.input_tokens ?? 0;
        const usageOutput = data.usage?.output_tokens ?? 0;
        await trackUsage({
          userId,
          featureKey: 'investment-research',
          stepLabel: (topic ?? '').slice(0, 50),
          inputTokens: usageInput,
          outputTokens: usageOutput,
          model: 'claude-sonnet-4-6',
        });
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'done', usage: { input_tokens: usageInput, output_tokens: usageOutput } })}\n\n`,
          ),
        );
      } catch (error: any) {
        controller.enqueue(encoder.encode(`data: {"type":"error","message":"${error.message}"}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
