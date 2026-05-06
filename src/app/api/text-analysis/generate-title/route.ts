import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { text, analysisLabel } = (await req.json()) as {
    text: string;
    analysisLabel: string;
  };

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content:
            `以下の分析結果（${analysisLabel}）を表す、短くわかりやすいタイトルを1つだけ生成してください。\n\n` +
            `【条件】\n- 20〜40文字程度\n- 日本語\n- 内容の核心を一言で表す\n` +
            `- タイトルだけを出力し、説明・前置き・記号は不要\n\n` +
            `【分析結果（先頭300文字）】\n${text.slice(0, 300)}`,
        },
      ],
    });
    // content[0]がtextブロックかチェック
    const block = response.content[0];
    const raw = block && block.type === 'text' ? block.text : '';
    const title = raw
      .replace(/^["「『【]|["」』】]$/g, '')
      .replace(/\n/g, '')
      .trim()
      .slice(0, 50);
    return NextResponse.json({ title: title || analysisLabel });
  } catch {
    return NextResponse.json({ title: analysisLabel });
  }
}
