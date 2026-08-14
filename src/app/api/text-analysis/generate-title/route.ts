import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest, NextResponse } from 'next/server';
import { createAnthropicClient } from '@/lib/anthropic-compat';
import { auth } from '@/lib/auth';
import { extractAnthropicText } from '@/lib/anthropic-text';

export const runtime = 'nodejs';
export const maxDuration = 60;

const client = createAnthropicClient();

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { text, analysisLabel } = (await req.json()) as {
    text: string;
    analysisLabel: string;
  };

  try {
    const response = await client.messages.create({
      model: CLAUDE_TEXT_MODEL,
      max_tokens: 1024,
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
    const raw = extractAnthropicText(response.content);
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
