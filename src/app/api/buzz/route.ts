import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { content, mode, checks } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const isAutoFix = checks && checks.length > 0;

  const prompt = isAutoFix
    ? `以下のSNS投稿文を、指定された改善項目に基づいて自動修正してください。

【元の投稿文】
${content}

【改善する項目】
${checks.join('\n')}

修正後の投稿文のみ返してください。`
    : `以下のSNS投稿のバズりやすさを分析してください。

【投稿文】
${content}

【プラットフォーム】
${mode || 'X（Twitter）'}

以下のJSONのみ返してください（コードブロック不要）：
{
  "score": 0-100の数値,
  "level": "バズる可能性大" or "普通" or "改善が必要",
  "strengths": ["良い点1", "良い点2"],
  "improvements": [
    {"id": "hook", "label": "冒頭フック強化", "description": "最初の一文を強くする"},
    {"id": "cta", "label": "行動喚起追加", "description": "いいね・リポストを促す文言"},
    {"id": "emotion", "label": "感情訴求強化", "description": "共感・驚きを引き出す表現"},
    {"id": "hashtag", "label": "ハッシュタグ最適化", "description": "拡散しやすいタグを追加"},
    {"id": "length", "label": "文字数最適化", "description": "最適な長さに調整"}
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: isAutoFix ? 1000 : 500,
      system: isAutoFix ? 'あなたはSNSマーケティングの専門家です。' : 'あなたはSNSマーケティングの専門家です。JSONのみ返してください。',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  if (isAutoFix) {
    return NextResponse.json({ fixed: text });
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json({ score: 50, level: '普通', strengths: [], improvements: [] });
  }
}
