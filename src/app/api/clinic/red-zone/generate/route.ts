import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const systemPrompt = await buildSystemContext(
    'あなたはクリニック経営・人事制度の専門家です。必ずJSON形式のみで返してください。マークダウンのコードフェンスなどは付けないでください。',
    'evaluation'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `医療クリニックでよく問題になるレッドゾーン行動を以下のカテゴリ別にJSON形式で提案してください。
院長と対話しながら確認・追加できるよう、よくある事例を具体的に列挙してください。

カテゴリ：
- harassment（ハラスメント）
- attitude（態度・姿勢の問題）
- legal（法的問題）
- moral（モラル・倫理）
- work（職務上の問題）

{
  "redZones": [
    {
      "category": "harassment",
      "title": "パワーハラスメント",
      "description": "職場内での地位・権限を使った嫌がらせ・暴言・過度な叱責",
      "severity": "critical",
      "consequence": "即時退職勧告・場合によっては法的措置"
    }
  ]
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
