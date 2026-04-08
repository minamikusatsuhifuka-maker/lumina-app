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

  const systemPrompt = await buildSystemContext(
    'あなたはクリニック経営・労務管理の専門家です。必ずJSON形式のみで返してください。マークダウンのコードフェンスなどは付けないでください。',
    'handbook'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `以下の就業規則を読んで、JSON形式で整理してください：

${content.slice(0, 8000)}

{
  "topRules": ["重要なルール1", "重要なルール2", ...],
  "redZoneRelated": ["レッドゾーンに該当する条項1", ...],
  "staffNotice": ["スタッフへの周知事項1", ...]
}

topRulesは最も重要なルールを10個、
redZoneRelatedは退職・解雇・懲戒に関連する条項、
staffNoticeは全スタッフに周知すべき事項を抽出してください。`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : text);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'AI応答のパースに失敗しました', raw: text }, { status: 500 });
  }
}
