import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  let { philosophyText } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);
  const philRows = await sql`SELECT content FROM clinic_philosophy ORDER BY created_at DESC LIMIT 1`;
  const philosophy = philRows[0]?.content || '（理念未登録）';

  // デフォルトの成長哲学テキスト
  if (!philosophyText) {
    philosophyText = 'まず自己愛、自分の人生を大切にし、自分の可能性や価値に気づくことがスタート。セルフコントロール・セルフマネジメント・タイムマネジメント・計画的な目標達成の技術を体得し、自己成長につなげる。その後、身近な家族や縁ある人を豊かで幸せにできる存在になり、より大きく社会を動かせる人間になっていく人格形成をしていく。自己実現と組織の理念・ビジョンが重なるように働きながら、自分が主役として輝けるような組織を設計する。Win-Winの関係でパワーパートナーと同じ目的・目標に向かって協力することで、組織がとてつもなく大きな社会貢献ができるものに変わっていく。';
  }

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
      system: 'あなたはクリニックの経営・人材育成哲学の設計者です。以下の成長哲学を組織全体の制度設計に落とし込んでください。必ずJSON形式のみで返してください。',
      messages: [{
        role: 'user',
        content: `クリニックの理念：${philosophy}

成長哲学：${philosophyText}

上記の成長哲学を踏まえて、以下のJSON形式で組織の成長哲学フレームワークを設計してください：
{
  "coreValues": [
    {
      "id": "value_1",
      "name": "価値観名",
      "essence": "本質的な説明",
      "clinicContext": "クリニックでの具体的な文脈"
    }
  ],
  "growthModel": {
    "name": "成長モデル名",
    "description": "モデルの説明",
    "stages": [
      {
        "stage": 1,
        "name": "ステージ名",
        "description": "ステージの説明",
        "focus": "このステージの焦点",
        "milestone": "達成マイルストーン"
      }
    ]
  },
  "winWinVision": "Win-Winビジョンの説明",
  "powerPartnerDefinition": "パワーパートナーの定義と説明"
}

coreValuesは7項目、growthModelのstagesは5段階で作成してください。`,
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
