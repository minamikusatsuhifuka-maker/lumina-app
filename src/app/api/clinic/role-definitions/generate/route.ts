import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { roleName, levelOrder } = await req.json();
  if (!roleName) return NextResponse.json({ error: 'roleName は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const systemContext = await buildSystemContext(
    'あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。JSONのみを返し、それ以外のテキストは含めないでください。'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      system: systemContext,
      messages: [{
        role: 'user',
        content: `役割名：${roleName}
レベル順序：${levelOrder || '未指定'}

以下のJSON形式で役割定義を作成してください：
{
  "name": "${roleName}",
  "levelOrder": ${levelOrder || 1},
  "description": "役割の概要説明（3〜5文）",
  "responsibilities": ["主な責務①", "主な責務②", "主な責務③"],
  "authority": "権限の範囲の説明",
  "leadershipRequirements": "求められるリーダーシップの説明"
}`,
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
