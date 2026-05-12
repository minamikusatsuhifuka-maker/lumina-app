import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface PostSnsBody {
  content: string;
  title: string;
  platform: 'x' | 'instagram' | 'both';
  autoPost?: boolean;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const { content, title, platform } = (await req.json()) as PostSnsBody;

  const prompt = `以下のコンテンツから${
    platform === 'x'
      ? 'X（Twitter）'
      : platform === 'instagram'
        ? 'Instagram'
        : 'X・Instagram両方'
  }用の投稿文を作成してください。

タイトル: ${title}
内容: ${content.slice(0, 1000)}

${
  platform === 'x' || platform === 'both'
    ? `
## X（Twitter）投稿（140字以内）
- ハッシュタグ3個以内
- 行動を促す内容
- URLは含めない（後で追加）
`
    : ''
}
${
  platform === 'instagram' || platform === 'both'
    ? `
## Instagram投稿（300字以内）
- 絵文字を効果的に使用
- ハッシュタグ10個
- 読者の共感を呼ぶ内容
`
    : ''
}

JSON形式で出力:
\`\`\`json
{
  "x_post": "X投稿文（140字以内）",
  "instagram_post": "Instagram投稿文",
  "instagram_hashtags": ["#タグ1", "#タグ2"],
  "suggested_image_prompt": "画像生成AIへの指示（英語）"
}
\`\`\``;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text =
    response.content[0]?.type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/);
  let posts: Record<string, unknown> = {};
  try {
    posts = jsonMatch ? JSON.parse(jsonMatch[1]) : {};
  } catch {
    posts = { raw: text };
  }

  return NextResponse.json({ posts });
}
