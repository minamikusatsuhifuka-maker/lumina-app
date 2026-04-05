import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { content } = await req.json();
  if (!content) return NextResponse.json({ error: 'content は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const systemPrompt = await buildSystemContext('あなたはクリニック経営の専門家です。理念文書を分析し、必ずJSON形式のみで返してください。JSONのみを返し、それ以外のテキストは含めないでください。', 'philosophy');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `以下のクリニック理念を分析し、下記JSON形式で返してください：
{
  "coreValues": ["価値観1", "価値観2", ...],
  "mission": "ミッションの要約（1文）",
  "vision": "ビジョンの要約（1文）",
  "behaviorPrinciples": ["行動指針1", "行動指針2", ...],
  "keywords": ["キーワード1", "キーワード2", ...]
}

理念文書：
${content}`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    // JSONブロックを抽出（```json ... ``` またはそのまま）
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
