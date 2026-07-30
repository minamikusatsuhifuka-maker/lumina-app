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
const MAX_TOKENS = 10000;

type Insights = {
  summary: string;
  detail: string;
  keywords: string[];
  advice: string;
};

// 206: パースは標準パーサ（ai-json-parser.ts）に統一（ローカル extractJson 再実装は削除）。
// 救済しても失敗した場合は「全欄空のインサイト」を200で返さず、例外→502で失敗を可視化する
// （205調査: 旧実装はサイレントに空欄を返しユーザーが失敗に気づけなかった）
function parseInsights(raw: string): Insights {
  const json = robustJsonParse<Record<string, unknown>>(raw);
  const summary = typeof json.summary === 'string' ? json.summary : '';
  const detail = typeof json.detail === 'string' ? json.detail : '';
  const advice = typeof json.advice === 'string' ? json.advice : '';
  const keywords = Array.isArray(json.keywords)
    ? json.keywords
        .filter((k: unknown) => typeof k === 'string' && (k as string).trim())
        .map((k: string) => k.trim())
    : [];
  if (!summary && !detail && !advice) {
    throw new Error('インサイトが空です');
  }
  return { summary, detail, keywords, advice };
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
    // 206: パース失敗を含む全失敗を502で返す（UI側が可視化＋再試行導線を出す）
    console.error('deepresearch/insights failed:', e?.message ?? e);
    return new Response(JSON.stringify({ error: e?.message ?? 'インサイト生成に失敗しました' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
