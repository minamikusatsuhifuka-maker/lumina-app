import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';
import type { AIModel } from '@/lib/ai-client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CLAUDE_TEXT_MODEL, GEMINI_TEXT_MODEL } from '@/lib/ai-models';
import { robustJsonParse } from '@/lib/ai-json-parser';

export const maxDuration = 300;

const CLAUDE_MODEL_ID = CLAUDE_TEXT_MODEL;
const GEMINI_MODEL_ID = GEMINI_TEXT_MODEL;
const MAX_TOKENS = 8000;

type Insights = {
  summary: string;
  advice: string;
  keywords: string[];
};

// 206: パースは標準パーサ（ai-json-parser.ts）に統一（ローカル extractJson 再実装は削除）。
// 救済しても失敗した場合は「全欄空のインサイト」を200で返さず、例外→502で失敗を可視化する
// （205調査: 旧実装はサイレントに空欄を返しユーザーが失敗に気づけなかった）
function parseInsights(raw: string): Insights {
  const json = robustJsonParse<Record<string, unknown>>(raw);
  const summary = typeof json.summary === 'string' ? json.summary : '';
  const advice = typeof json.advice === 'string' ? json.advice : '';
  const keywords = Array.isArray(json.keywords)
    ? json.keywords.filter((k: unknown) => typeof k === 'string' && (k as string).trim()).map((k: string) => k.trim())
    : [];
  if (!summary && !advice) {
    throw new Error('インサイトが空です');
  }
  return { summary, advice, keywords };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  if (!session) return new Response('Unauthorized', { status: 401 });
  const userId = session ? (session.user as any).id : '';
  const { report, topic, model = 'claude' } = (await req.json()) as {
    report: string;
    topic: string;
    model?: AIModel;
  };

  if (!report || !topic) {
    return new Response(JSON.stringify({ error: 'report and topic are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const systemPrompt = `あなたは優秀な投資アナリストです。与えられた投資予測レポートを分析し、必ず指示された JSON 形式のみで応答してください。`;

  const userPrompt = `以下の投資予測レポートを分析し、JSON 形式で返してください。

# 検証対象
${topic}

# 入力レポート
${report}

# 出力（必ず以下の JSON 形式のみ、前置き・後置き・コードフェンス禁止）
{
  "summary": "本レポートの本質的な要点を1000字以内で要約（です・ます調）",
  "advice": "投資家視点での実用的なアドバイスを2000字以内（リスク警告・検証ポイント・参考指標を含む）",
  "keywords": ["関連キーワード1", "関連キーワード2", "..."]
}

# 厳守事項
- summary は必ず1000字以内
- advice は必ず2000字以内
- keywords は8〜12個、再リサーチに値する具体的な企業名・技術名・概念
- JSON 以外の文字は一切出力しない（\`\`\`json \`\`\` も不要）`;

  try {
    let rawText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let usageModel = CLAUDE_MODEL_ID;

    if (model === 'gemini') {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const geminiModel = genAI.getGenerativeModel({
        model: GEMINI_MODEL_ID,
        systemInstruction: systemPrompt,
      });
      const result = await geminiModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      });
      rawText = result.response.text();
      inputTokens = result.response.usageMetadata?.promptTokenCount ?? 0;
      outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? 0;
      usageModel = CLAUDE_MODEL_ID; // 価格表は Claude 基準で記録（既存パターン踏襲）
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey || apiKey === 'your_api_key_here') {
        return new Response(JSON.stringify({ error: 'APIキーが設定されていません' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL_ID,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!response.ok) {
        // 206: APIエラーも空インサイトの200偽装をやめて明示的に失敗させる
        return new Response(JSON.stringify({ error: `APIエラー: ${response.status}` }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const data = await response.json();
      rawText = (data.content || [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      inputTokens = data.usage?.input_tokens ?? 0;
      outputTokens = data.usage?.output_tokens ?? 0;
    }

    const insights = parseInsights(rawText);

    if (userId) {
      await trackUsage({
        userId,
        featureKey: 'investment-insights',
        stepLabel: (topic ?? '').slice(0, 50),
        inputTokens,
        outputTokens,
        model: usageModel,
      });
    }

    return new Response(JSON.stringify(insights), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    // 206: パース失敗を含む全失敗を502で返す（UI側が可視化＋再試行導線を出す。
    // メインレポートは別経路なので影響しない）
    console.error('investment-research/insights failed:', e?.message ?? e);
    return new Response(JSON.stringify({ error: e?.message ?? 'インサイト生成に失敗しました' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
