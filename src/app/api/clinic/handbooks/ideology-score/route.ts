import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildSystemContext } from '@/lib/clinic-context';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { chapterContent } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const systemPrompt = await buildSystemContext(
    `あなたはクリニックの理念・哲学の専門家です。
ハンドブックの章が、クリニックの理念・先払い哲学・リードマネジメント・インサイドアウト・ティール組織の思想に
どれだけ沿っているかを採点してください。`,
    'philosophy'
  );

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `以下のハンドブックの章を、クリニックの理念との一致度で採点してください。

【章の内容】
${chapterContent}

採点基準：
- 内発的動機・インサイドアウトの視点があるか（命令・強制ではなく自律を促すか）
- 先払い哲学（与えること・貢献することを価値として扱っているか）
- スタッフが主役として描かれているか（管理される存在ではなく）
- リードマネジメント（5大欲求・問いかけ・共感）の要素があるか
- ティール組織（自律・全体性・進化する目的）の精神があるか

必ず以下のJSON形式のみで返してください（他のテキスト不要）：
{
  "score": 75,
  "reason": "（総評を2文で）",
  "points": [
    "（改善ポイント①）",
    "（改善ポイント②）",
    "（改善ポイント③）"
  ]
}`,
      }],
    }),
  });

  const data = await response.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const json = JSON.parse(clean);
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ score: 0, reason: '採点に失敗しました。', points: [] });
  }
}
