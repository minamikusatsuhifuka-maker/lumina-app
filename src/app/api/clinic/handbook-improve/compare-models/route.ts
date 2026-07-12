import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { requireAuth } from '@/lib/require-auth';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 比較対象モデル（key はレスポンス／UIで共通利用）
const COMPARISON_MODELS = [
  { key: 'sonnet', id: 'claude-sonnet-4-6' },
  { key: 'opus',   id: 'claude-opus-4-7'  },
  { key: 'opus48', id: 'claude-opus-4-8'  }, // 🆕 Opus 4.8（2026/5/28リリース）
] as const;

async function generateWithModel(
  model: string,
  content: string,
  templateLabel: string,
  templatePrompt: string
) {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: `以下のハンドブック章を「${templateLabel}」のスタイルで改善してください。

【改善方針】
${templatePrompt}

【元の文章】
${content}

改善後の文章のみを出力してください。前置き・説明不要。`,
    }],
  });
  return message.content[0].type === 'text' ? message.content[0].text : '';
}

async function scoreWithModel(
  model: string,
  original: string,
  improved: string,
  templateLabel: string
) {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `以下の【元の文章】と【改善後の文章】を評価してください。

【元の文章】
${original}

【改善後の文章（${templateLabel}）】
${improved}

評価の観点：クリニック理念・ティール組織・リードマネジメント・インサイドアウトとの一致度

以下のJSONのみ返してください（コードブロック不要）：
{
  "score": 整数（50〜95）,
  "comment": "評価コメント（2〜3文）",
  "good_points": ["良い点1", "良い点2"],
  "improve_points": ["改善点1", "改善点2"],
  "balance": {
    "readability": 整数（1〜10）,
    "agency": 整数（1〜10）,
    "specificity": 整数（1〜10）,
    "philosophy": 整数（1〜10）,
    "warmth": 整数（1〜10）
  }
}`,
    }],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
  try {
    return robustJsonParse(raw);
  } catch {
    return { score: 0, comment: '採点失敗', good_points: [], improve_points: [], balance: {} };
  }
}

export async function POST(req: Request) {
  // 認証必須（未ログインは401。AI利用コストの無断消費を防ぐ）
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { content, templateLabel, templatePrompt } = await req.json();

  // 全モデルで同時生成
  const texts = await Promise.all(
    COMPARISON_MODELS.map(m => generateWithModel(m.id, content, templateLabel, templatePrompt))
  );

  // 生成後に各モデル自身で採点
  const scores = await Promise.all(
    COMPARISON_MODELS.map((m, i) => scoreWithModel(m.id, content, texts[i], templateLabel))
  );

  // { sonnet: {...}, opus: {...}, opus48: {...} } 形式で返す
  const result: Record<string, { result: string; scoring: unknown }> = {};
  COMPARISON_MODELS.forEach((m, i) => {
    result[m.key] = { result: texts[i], scoring: scores[i] };
  });

  return NextResponse.json(result);
}
