import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { content, mode } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `あなたはSEOとコンテンツマーケティングの専門家です。
与えられた文章に最適なタイトル候補を5つ提案してください。
必ずJSON形式のみで返してください。マークダウン不要。

{
  "titles": [
    { "title": "タイトル案", "reason": "理由（20字以内）", "score": 85 }
  ]
}

タイトルの条件：
- 32文字以内（SEO最適）
- 数字・具体性・感情訴求を含める
- クリックしたくなる表現
- ${mode === 'blog' ? 'ブログ記事' : mode === 'sns_twitter' ? 'Twitter投稿' : 'コンテンツ'}に最適化`,
      messages: [{
        role: 'user',
        content: `以下の文章に最適なタイトルを5つ提案してください：\n\n${content?.slice(0, 500) ?? ''}`,
      }],
    }),
  });

  const data = await response.json();
  let text = data.content?.[0]?.text ?? '{"titles":[]}';
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json({ titles: [] });
  }
}
