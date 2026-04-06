export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

const ZONE_DEFINITIONS: Record<string, string> = {
  red:    'レッドゾーン（即退職レベルの重大違反）：患者・スタッフへのハラスメント、個人情報漏洩、虚偽報告、記録改ざん、無断欠勤3日以上、窃盗・横領など',
  yellow: 'イエローゾーン（勧告・改善指導が必要な行動）：遅刻・早退の繰り返し（月3回以上）、報連相の欠如、チームへのネガティブ影響、患者対応のクオリティ低下、指示無視など',
  green:  'グリーンゾーン（期待される標準的な行動）：時間を守る、丁寧な患者対応、チームワーク、積極的な報連相、学ぶ姿勢の継続、業務ルールの遵守など',
  teal:   'ティールゾーン（自律型・模範的な行動）：後輩の自発的育成、業務改善の提案と実行、患者満足度向上の自発的取り組み、先払い精神での貢献、チームを引き上げる行動など',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  try {
    const { zone } = await req.json();

    if (!ZONE_DEFINITIONS[zone]) {
      return NextResponse.json({ error: '無効なゾーンです' }, { status: 400 });
    }

    // 就業規則を軽量取得
    let rulesSnippet = '';
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const rules = await sql`SELECT content FROM employment_rules ORDER BY created_at DESC LIMIT 1`;
      if (rules.length > 0) rulesSnippet = (rules[0].content as string)?.slice(0, 500) || '';
    } catch {}

    const systemPrompt = `あなたは皮膚科・美容皮膚科クリニックの行動基準設計AIです。
院長の哲学：ティール組織（全員がリーダー）・先払い（貢献を先に）・実評価（実行・実績・実力・誠実）・リードマネジメント（内発的動機）
${rulesSnippet ? `就業規則（抜粋）：${rulesSnippet}` : ''}`;

    const prompt = `${ZONE_DEFINITIONS[zone]}の行動基準を5件生成してください。

以下のJSON形式のみで返してください（前置き・説明不要）：
{
  "rules": [
    {
      "title": "タイトル（20文字以内）",
      "description": "具体的な説明（1〜2文）",
      "example": "具体的な行動例",
      "consequence": "対応・結果"
    }
  ]
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return NextResponse.json({ rules: parsed.rules || [] });

  } catch (e) {
    console.error('generate error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
