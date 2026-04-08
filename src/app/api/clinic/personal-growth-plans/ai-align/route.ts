import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { buildSystemContext } from '@/lib/clinic-context';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { staffId } = await req.json();
  if (!staffId) return NextResponse.json({ error: 'staffId は必須です' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  const sql = neon(process.env.DATABASE_URL!);

  // スタッフの個人成長プランを取得
  const planRows = await sql`SELECT * FROM personal_growth_plans WHERE staff_id = ${staffId} ORDER BY created_at DESC LIMIT 1`;

  const plan = planRows[0];
  if (!plan) return NextResponse.json({ error: '個人成長プランが見つかりません' }, { status: 404 });

  const systemContext = await buildSystemContext(
    'あなたはクリニックの人材育成・組織開発の専門家です。個人のビジョンと組織の理念・成長哲学の整合性を分析し、必ずJSON形式のみで返してください。'
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
      system: systemContext,
      messages: [{
        role: 'user',
        content: `上記のクリニック理念・成長哲学と、以下の個人成長プランの整合性を分析してください。

【個人成長プラン】
ライフビジョン: ${plan.life_vision || '（未記入）'}
個人ミッション: ${plan.personal_mission || '（未記入）'}
コアバリュー: ${plan.core_values || '（未記入）'}
自己愛ノート: ${plan.self_love_notes || '（未記入）'}
強み発見: ${plan.strength_discovery || '（未記入）'}
短期目標: ${plan.short_term_goals || '（未記入）'}
長期目標: ${plan.long_term_goals || '（未記入）'}
組織との整合: ${plan.organization_alignment || '（未記入）'}
パワーパートナー: ${plan.power_partners || '（未記入）'}

以下のJSON形式で返してください：
{
  "alignmentScore": 85,
  "alignmentAreas": [
    { "area": "整合している領域", "description": "具体的な説明" }
  ],
  "growthOpportunities": [
    { "opportunity": "成長機会", "description": "具体的な説明", "suggestedAction": "推奨アクション" }
  ],
  "personalBenefit": "この組織で働くことで得られる個人的なメリット",
  "organizationBenefit": "この人材が組織にもたらすメリット",
  "powerPartnerMessage": "パワーパートナーとしてのメッセージ",
  "nextActionForGrowth": "次の成長ステップとして推奨するアクション"
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
