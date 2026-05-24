import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';
import type { AIModel } from '@/lib/ai-client';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 300;

const CLAUDE_MODEL_ID = 'claude-sonnet-4-6';
const GEMINI_MODEL_ID = 'gemini-3.5-flash';
const MAX_TOKENS = 8000;

type Insights = {
  summary: string;
  advice: string;
  keywords: string[];
};

const EMPTY_INSIGHTS: Insights = { summary: '', advice: '', keywords: [] };

// AI 応答から JSON 部分のみを抽出（前置き/コードフェンスを除去）
function extractJson(raw: string): string {
  let s = raw.trim();
  // ```json ... ``` または ``` ... ``` のコードフェンスを剥がす
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // 最初の { から最後の } までを抽出
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return s.slice(first, last + 1);
  }
  return s;
}

function parseInsights(raw: string): Insights {
  try {
    const json = JSON.parse(extractJson(raw));
    const summary = typeof json.summary === 'string' ? json.summary : '';
    const advice = typeof json.advice === 'string' ? json.advice : '';
    const keywords = Array.isArray(json.keywords)
      ? json.keywords.filter((k: unknown) => typeof k === 'string' && k.trim()).map((k: string) => k.trim())
      : [];
    return { summary, advice, keywords };
  } catch {
    return EMPTY_INSIGHTS;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
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
        return new Response(JSON.stringify({ ...EMPTY_INSIGHTS, error: `APIエラー: ${response.status}` }), {
          status: 200,
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
    // パース失敗・通信エラー時は空オブジェクトを返してメインレポートを守る
    return new Response(JSON.stringify({ ...EMPTY_INSIGHTS, error: e?.message ?? 'unknown error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
