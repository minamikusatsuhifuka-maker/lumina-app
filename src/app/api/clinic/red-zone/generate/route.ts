export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

const ZONE_PROMPTS: Record<string, string> = {
  red:    'レッドゾーン（即退職レベルの重大違反）：患者・スタッフへのハラスメント、情報漏洩、虚偽報告、無断欠勤、窃盗など',
  yellow: 'イエローゾーン（勧告・改善指導が必要）：遅刻の繰り返し、報連相の欠如、チームへのネガティブ影響、ルール無視など',
  green:  'グリーンゾーン（期待される標準行動）：時間を守る、丁寧な患者対応、チームワーク、学ぶ姿勢、報連相の徹底など',
  teal:   'ティールゾーン（自律型・模範的行動）：後輩育成、業務改善の提案、患者満足度向上の自発的取り組み、先払い行動など',
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  try {
    const { zone } = await req.json();

    // 就業規則を軽量取得
    let rulesSnippet = '';
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const rules = await sql`SELECT content FROM employment_rules ORDER BY created_at DESC LIMIT 1`;
      if (rules.length > 0) rulesSnippet = (rules[0].content as string)?.slice(0, 600) || '';
    } catch {}

    const systemPrompt = `あなたは皮膚科・美容皮膚科クリニックの行動基準設計AIです。必ずJSON形式のみで返してください。
院長の哲学：ティール組織・先払い・実評価（実行・実績・実力・誠実）・リードマネジメント
${rulesSnippet ? `就業規則（抜粋）：${rulesSnippet}` : ''}`;

    // 全ゾーンを順番に生成
    const targetZones = zone === 'all' ? ['red', 'yellow', 'green', 'teal'] : [zone];
    const results: any[] = [];

    for (const z of targetZones) {
      try {
        const prompt = `${ZONE_PROMPTS[z]}の行動基準を5件生成してください。

JSON形式のみで返してください：
{
  "rules": [
    {
      "zone": "${z}",
      "title": "タイトル（20文字以内）",
      "description": "説明（1〜2文）",
      "example": "具体例",
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
            max_tokens: 1200,
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        const data = await response.json();
        const text = data.content?.[0]?.text || '{}';
        const clean = text.replace(/```json|```/g, '').trim();
        const match = clean.match(/(\{[\s\S]*\})/);
        const parsed = JSON.parse(match ? match[1] : clean);
        if (parsed.rules) results.push(...parsed.rules);
      } catch (e) {
        console.error(`zone ${z} generate error:`, e);
      }
    }

    return NextResponse.json({ rules: results });

  } catch (e) {
    console.error('generate error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
