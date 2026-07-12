import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { trackUsage } from '@/lib/trackUsage';
import type { AIModel } from '@/lib/ai-client';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 300;

const CLAUDE_MODEL_ID = 'claude-sonnet-4-6';
const GEMINI_MODEL_ID = 'gemini-3.5-flash';
const MAX_TOKENS = 10000;

type Insights = {
  summary: string;
  detail: string;
  keywords: string[];
  advice: string;
};

const EMPTY_INSIGHTS: Insights = { summary: '', detail: '', keywords: [], advice: '' };

// AI 応答から JSON 部分のみを抽出（前置き/コードフェンス/後置きを除去）
function extractJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
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
    const detail = typeof json.detail === 'string' ? json.detail : '';
    const advice = typeof json.advice === 'string' ? json.advice : '';
    const keywords = Array.isArray(json.keywords)
      ? json.keywords
          .filter((k: unknown) => typeof k === 'string' && k.trim())
          .map((k: string) => k.trim())
      : [];
    return { summary, detail, keywords, advice };
  } catch {
    return EMPTY_INSIGHTS;
  }
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

  const systemPrompt = `あなたは優秀なリサーチアナリストです。与えられたリサーチレポートを分析し、必ず指示された JSON 形式のみで応答してください。`;

  const userPrompt = `以下のリサーチレポートを分析し、JSON 形式で返してください。

# テーマ
${topic}

# 入力レポート
${report}

# 出力（必ず以下の JSON 形式のみ、前置き・後置き・コードフェンス禁止）
{
  "summary": "本レポートの要点を1000字以内で構造化要約（マークダウン形式、小見出しと箇条書きを多用、見やすさ優先）",
  "detail": "詳細にまとめた構造化サマリー（2000〜3000字、## 見出しを活用、です・ます調）",
  "keywords": ["重要キーワード1", "重要キーワード2", "..."],
  "advice": "このリサーチ結果を実践に活かすためのアドバイス・次のアクション提案を2000字以内（## 見出しで構造化）"
}

# 厳守事項
- summary: 1000字以内、必ずマークダウン形式で以下のように構造化:
  - 「## 📋 主要ポイント」「## 🎯 重要な要素」「## 💡 実践・活用」のような小見出しで区切る（小見出しは内容に応じて適宜変更）
  - 各セクションは箇条書きを中心に
  - 重要なキーワード・数字・固有名詞は **太字** で強調
  - 段落文は最小限、一目で全体像が把握できる視覚的な見やすさを優先
  - 「です・ます調」維持
- detail: 2000〜3000字、## 見出しで構造化
- keywords: 10〜15個、再リサーチに値する具体的な語句
- advice: 2000字以内、実践への落とし込み・次のステップ・参考になりそうなアクションを含む
- JSON 以外の文字一切なし（\`\`\`json\`\`\` も不要）`;

  try {
    let rawText = '';
    let inputTokens = 0;
    let outputTokens = 0;

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
        featureKey: 'deepresearch-insights',
        stepLabel: (topic ?? '').slice(0, 50),
        inputTokens,
        outputTokens,
        model: CLAUDE_MODEL_ID,
      });
    }

    return new Response(JSON.stringify(insights), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ...EMPTY_INSIGHTS, error: e?.message ?? 'unknown error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
