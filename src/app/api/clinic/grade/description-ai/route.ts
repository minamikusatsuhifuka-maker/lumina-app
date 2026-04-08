import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { currentText, instruction } = await req.json();
  if (!currentText) return NextResponse.json({ error: 'currentText は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const systemContext = await buildSystemContext(
    'あなたはクリニックの等級制度・組織開発の専門家です。改善した文章のみを返してください。マークダウンや余分な説明は不要です。',
    'grade'
  );

  const prompt = `以下は「当院の等級制度について」の説明文です。

【現在の文章】
${currentText}

【指示】
${instruction || '院長の哲学（同心円成長・ティール組織・先払い・非ピラミッド）に沿って、より伝わりやすく改善してください。'}

改善した文章のみを返してください。マークダウンや余分な説明は不要です。`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: systemContext,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const suggested = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return NextResponse.json({ suggested });
}
