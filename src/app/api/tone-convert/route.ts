import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { extractAnthropicText } from '@/lib/anthropic-text';

export const runtime = 'nodejs';
export const maxDuration = 300;

const TONE_PROMPTS: Record<string, string> = {
  formal:   'より丁寧でフォーマルなビジネス文体に変換してください。敬語を使い、専門的な表現にしてください。',
  casual:   'よりカジュアルで読みやすい文体に変換してください。親しみやすい表現にしてください。',
  shorter:  '内容を保ちながら30〜40%短くしてください。冗長な表現を削り、要点のみを残してください。',
  detailed: '各ポイントをより詳しく掘り下げて、具体例や説明を追加して内容を豊かにしてください。',
  positive: 'より前向きでポジティブなトーンに変換してください。',
  simple:   '中学生でも理解できる平易な言葉に変換してください。難しい用語は簡単な言葉に置き換えてください。',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { text, tone } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_TEXT_MODEL,
      max_tokens: 8000,
      system: `あなたは文章変換の専門家です。
指示に従って文章を変換してください。
変換後の文章のみを返してください。前置きや説明は不要です。`,
      messages: [{
        role: 'user',
        content: `${TONE_PROMPTS[tone] ?? '文章を改善してください。'}\n\n${text}`,
      }],
    }),
  });

  const data = await response.json();
  const converted = extractAnthropicText(data.content) || text;
  return NextResponse.json({ converted });
}
