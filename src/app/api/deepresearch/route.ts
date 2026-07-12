import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getClinicSystemPrompt } from '@/lib/clinicProfile';
import { trackUsage } from '@/lib/trackUsage';
import { streamWithModel, type AIModel } from '@/lib/ai-client';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = session ? (session.user as any).id : '';
  const { topic, depth, periodStart, periodEnd, model = 'claude' } = (await req.json()) as {
    topic: string;
    depth?: string;
    periodStart?: string;
    periodEnd?: string;
    model?: AIModel;
  };

  // 対象期間セクション（指定がある場合のみ。未指定時は既存と完全互換）
  // 期間はプロンプト注入だけでは実効性ゼロ（古い知識の現在形作文になる）ため、
  // 「期間内の情報をWeb検索で収集し、見つからなければ確認できなかったと書く」検索指示にする
  const periodSection = (periodStart || periodEnd)
    ? `\n\n# 対象期間\n${periodStart || '指定なし'} 〜 ${periodEnd || '現在まで'}\nこの期間に公開・発表された情報をWeb検索で優先的に収集し、検索で確認できた内容を中心に分析してください。それ以外の期間の情報は、必要な背景説明としてのみ参照してください。期間内の情報がWeb検索で見つからない項目は、推測で埋めずに「この期間の情報はWeb検索では確認できなかった」と明記してください。`
    : '';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // クリニック背景情報を取得（任意）
  const clinicPrompt = userId ? await getClinicSystemPrompt('deepresearch', userId) : '';
  const clinicStr = clinicPrompt ? `\n\n${clinicPrompt}` : '';

  // モード別の本文指示（文字数より完結性を最優先）
  const depthPrompts: Record<string, string> = {
    quick: '1500字程度で簡潔にまとめてください。要点を絞りつつ、必ず最後の「まとめ・結論」まで完結させてください。',
    standard: '3000字程度で詳しくまとめてください。概要・主要ポイント・最新動向・事例を含め、必ず最後の「まとめ・結論」まで完結させてください。',
    deep: '5000字程度の詳細なリサーチレポートを作成してください。各章を深く掘り下げつつ、必ず最後の「まとめ・結論」で締めくくってください。文字数より完結性を最優先してください。',
  };

  // モード別のmax_tokens（完結性確保のため余裕を持たせる）
  const depthMaxTokens: Record<string, number> = {
    quick: 3000,
    standard: 6000,
    deep: 12000,
  };
  const selectedDepth = depth || 'standard';
  const maxTokens = depthMaxTokens[selectedDepth] || 6000;

  // モード別のアウトライン構成
  const depthOutlines: Record<string, string> = {
    quick: `## はじめに
## 要点（3〜5項目）
## まとめ・結論`,
    standard: `## はじめに
## 背景と概要
## 主要ポイント・最新動向
## 事例・実践
## まとめ・結論`,
    deep: `## はじめに
## 背景と概要
## 詳細解説（複数章で深く掘り下げ）
## 実践・活用方法
## まとめ・結論`,
  };
  const outline = depthOutlines[selectedDepth] || depthOutlines.standard;

  const encoder = new TextEncoder();

  const systemPrompt = `あなたは優秀なリサーチアナリストです。
与えられたトピックについてWebを検索し、信頼性の高い情報を収集・統合して、
日本語で読みやすいレポートを作成してください。

絶対に守るルール：
1. URLは生のURLのみ記載（例: https://example.com）
2. HTMLタグは一切使用禁止（<a href=...>など）
3. Markdownのリンク記法も禁止（[テキスト](URL)形式も使わない）
4. 出典は「出典: サイト名 https://URL」の形式のみ
5. URLの後に属性やスタイルは絶対に書かない
6. 事実と推測を明確に区別してください
7. 必ずWeb検索を実行し、検索結果で確認できた情報に基づいて書くこと（学習時の知識だけを「最新情報」として書くことは禁止）
8. Web検索で確認できなかった事項は、推測や作文で埋めずに「Web検索では確認できなかった」と明記すること${clinicStr}`;

  const userPrompt = `トピック：${topic}${periodSection}
調査深度の指示：${depthPrompts[selectedDepth]}

【必須要件】
- 必ず「まとめ・結論」セクションで締めくくること
- 途中で終わらず最後まで完結させること
- 文字数が多少前後しても完結を最優先すること
- 以下の構成に従うこと

# ${topic}
${outline}
## 参考・補足

【出力ルール】
- 各情報の引用元URLを必ず記載
- URLは生のURL（https://...）のみ。HTMLタグやMarkdownリンク記法は禁止
- 出典の形式: 「出典: サイト名 https://URL」
- 事実と推測を明確に区別

【最重要】必ず最後の「まとめ・結論」まで書き切ってください。
途中で終わることは絶対に避けてください。
時間や長さが厳しい場合は中盤を簡潔にしてでも、結論セクションを必ず含めてください。`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));

        // Gemini: streamWithModel（Google検索グラウンディング有効・出典は本文末尾に自動追記）
        if (model === 'gemini') {
          const usage = await streamWithModel(
            'gemini',
            userPrompt,
            systemPrompt,
            controller,
            encoder,
            maxTokens,
            'standard',
            true, // webSearch: 実検索に基づかない「最新風の古い内容」を防ぐ
          );
          await trackUsage({
            userId,
            featureKey: 'deepresearch',
            stepLabel: (topic ?? '').slice(0, 50),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          });
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'done', usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens } })}\n\n`,
            ),
          );
          return;
        }

        // Claude: web_search ツール対応のため既存実装を維持
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

        // 使用量を記録
        const usageInput = data.usage?.input_tokens ?? 0;
        const usageOutput = data.usage?.output_tokens ?? 0;
        await trackUsage({
          userId,
          featureKey: 'deepresearch',
          stepLabel: (topic ?? '').slice(0, 50),
          inputTokens: usageInput,
          outputTokens: usageOutput,
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
