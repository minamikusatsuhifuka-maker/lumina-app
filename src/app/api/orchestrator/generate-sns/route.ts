import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { extractAnthropicText } from '@/lib/anthropic-text';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface GenerateSnsRequest {
  topic: string;
  lpContent?: string;
  persona?: string;
  days?: number;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  let body: GenerateSnsRequest;
  try {
    body = (await req.json()) as GenerateSnsRequest;
  } catch {
    return NextResponse.json({ error: '不正なリクエスト' }, { status: 400 });
  }

  const { topic, lpContent, persona, days = 30 } = body;
  if (!topic?.trim()) {
    return NextResponse.json({ error: 'topicは必須です' }, { status: 400 });
  }

  try {
    const response = await client.messages.create({
      model: CLAUDE_TEXT_MODEL,
      max_tokens: 12000,
      messages: [
        {
          role: 'user',
          content: `以下の情報を元に、${days}日分のSNS投稿（X/Twitter・Instagram・note）を作成してください。

【テーマ】${topic}
【ターゲット】${persona?.slice(0, 500) ?? ''}
【LP内容の要点】${lpContent?.slice(0, 500) ?? ''}

【${days}日間の構成】
Week1: 問題提起・共感
Week2: 解決策の提示・価値提供
Week3: 事例・社会的証明
Week4: オファー・CTA

各投稿：
- X/Twitter（140字以内）
- Instagram（300字・ハッシュタグ10個）
- note見出し案

全${days}日分を出力してください。`,
        },
      ],
    });

    const content = extractAnthropicText(response.content);
    return NextResponse.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
