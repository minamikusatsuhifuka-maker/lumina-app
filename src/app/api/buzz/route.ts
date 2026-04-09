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
    : `以下のSNS投稿のバズりやすさを5軸で詳細に分析してください。

【投稿文】
${content}

【プラットフォーム】
${mode || 'X（Twitter）'}

以下のJSONのみ返してください（コードブロック不要）：
{
  "score": 0-100の総合スコア（5軸の加重平均: フック力25% + 感情訴求25% + 行動喚起20% + 拡散性15% + コンテンツ品質15%）,
  "level": "バズる可能性大"（80以上） or "普通"（50-79） or "改善が必要"（50未満）,
  "axes": {
    "hook": {"score": 0-100, "comment": "冒頭の注目度（スクロール停止力・意外性・疑問提起）の評価コメント15字以内"},
    "emotion": {"score": 0-100, "comment": "感情訴求（共感・驚き・感動・怒り・笑い）の評価コメント15字以内"},
    "cta": {"score": 0-100, "comment": "行動喚起（いいね・RT・コメント・保存を促す力）の評価コメント15字以内"},
    "virality": {"score": 0-100, "comment": "拡散構造（引用しやすさ・ハッシュタグ・話題性）の評価コメント15字以内"},
    "quality": {"score": 0-100, "comment": "品質（読みやすさ・情報価値・独自性・完成度）の評価コメント15字以内"}
  },
  "strengths": ["具体的な良い点1", "具体的な良い点2"],
  "improvements": [
    {"id": "hook", "label": "冒頭フック強化", "description": "具体的な改善提案"},
    {"id": "cta", "label": "行動喚起追加", "description": "具体的な改善提案"},
    {"id": "emotion", "label": "感情訴求強化", "description": "具体的な改善提案"},
    {"id": "hashtag", "label": "ハッシュタグ最適化", "description": "具体的な改善提案"},
    {"id": "length", "label": "文字数最適化", "description": "具体的な改善提案"}
  ]
}

評価のルール：
- scoreは甘くしない。本当にバズる投稿のみ80以上にする
- improvements のdescriptionは投稿内容に即した具体的な提案にする（テンプレ文は禁止）
- strengthsも投稿内容を引用して具体的に書く`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: isAutoFix ? 1000 : 1200,
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
