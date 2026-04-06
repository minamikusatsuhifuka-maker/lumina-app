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

    // 就業規則を軽量取得（特殊文字を除去）
    let rulesSnippet = '';
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const rules = await sql`SELECT content FROM employment_rules ORDER BY created_at DESC LIMIT 1`;
      if (rules.length > 0) {
        rulesSnippet = (rules[0].content as string)
          ?.slice(0, 300)
          ?.replace(/[\r\n]+/g, ' ')
          ?.replace(/\\/g, '')
          || '';
      }
    } catch {}

    const systemPrompt = `あなたは皮膚科・美容皮膚科クリニックの行動基準設計AIです。院長の哲学：ティール組織・先払い・実評価・リードマネジメント。${rulesSnippet ? `就業規則参考：${rulesSnippet}` : ''}`;

    const prompt = `${ZONE_DEFINITIONS[zone]}の行動基準を5件生成してください。

必ずJSON形式のみで返してください：
{
  "rules": [
    {
      "title": "タイトル",
      "description": "説明",
      "example": "具体例",
      "consequence": "対応"
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
    const text = data.content?.[0]?.text || '';

    // 堅牢なJSON抽出
    let rules: any[] = [];
    try {
      const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonBlockMatch
        ? jsonBlockMatch[1]
        : (text.match(/\{[\s\S]*\}/) || ['{}'])[0];

      const parsed = JSON.parse(jsonStr);
      rules = parsed.rules || [];
    } catch {
      // フォールバック：正規表現でtitle・descriptionを抽出
      const titleMatches = [...text.matchAll(/"title"\s*:\s*"([^"]+)"/g)];
      const descMatches = [...text.matchAll(/"description"\s*:\s*"([^"]+)"/g)];
      const exampleMatches = [...text.matchAll(/"example"\s*:\s*"([^"]+)"/g)];
      const consequenceMatches = [...text.matchAll(/"consequence"\s*:\s*"([^"]+)"/g)];
      rules = titleMatches.map((m, i) => ({
        title: m[1],
        description: descMatches[i]?.[1] || m[1],
        example: exampleMatches[i]?.[1] || '',
        consequence: consequenceMatches[i]?.[1] || '',
      }));
    }

    return NextResponse.json({ rules });

  } catch (e) {
    console.error('generate error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
