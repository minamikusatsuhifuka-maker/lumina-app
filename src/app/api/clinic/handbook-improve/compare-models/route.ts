import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = {
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-7',
};

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
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return { score: 0, comment: '採点失敗', good_points: [], improve_points: [], balance: {} };
  }
}

export async function POST(req: Request) {
  const { content, templateLabel, templatePrompt } = await req.json();

  // Sonnet・Opusで同時生成
  const [sonnetText, opusText] = await Promise.all([
    generateWithModel(MODELS.sonnet, content, templateLabel, templatePrompt),
    generateWithModel(MODELS.opus,   content, templateLabel, templatePrompt),
  ]);

  // 生成後に両モデルで採点（それぞれ自身のモデルで採点）
  const [sonnetScore, opusScore] = await Promise.all([
    scoreWithModel(MODELS.sonnet, content, sonnetText, templateLabel),
    scoreWithModel(MODELS.opus,   content, opusText,   templateLabel),
  ]);

  return NextResponse.json({
    sonnet: { result: sonnetText, scoring: sonnetScore },
    opus:   { result: opusText,   scoring: opusScore   },
  });
}
