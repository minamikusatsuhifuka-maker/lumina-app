export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

const ZONE_DEFS: Record<string, { label: string; prompt: string }> = {
  red: {
    label: '🔴レッドゾーン（即退職レベルの重大違反）',
    prompt: `発覚次第即時解雇。いかなる理由・状況でも例外なし。
ハラスメント・情報漏洩・虚偽報告・窃盗横領・無断欠勤3日以上など。`,
  },
  yellow: {
    label: '🟡イエローゾーン（退職勧告レベル）',
    prompt: `改善指導を行い、期間内に改善なければ退職勧告。
遅刻繰返し・報連相欠如・ネガティブ影響・患者対応低下・ルール無視など。`,
  },
  green: {
    label: '🟢グリーンゾーン（一人前の基準）',
    prompt: `全スタッフが達成すべき基本ライン。
組織づくりへの協力・真面目に違反なく働く・肯定的な仕事観・セルフコントロール・タイムマネジメント・全員が代表者という意識。`,
  },
  teal: {
    label: '🩵ティールゾーン（リーダー以上の基準）',
    prompt: `グリーンを体現した上でさらに高い次元。
リードマネジメント実践・視座の高さ・人材育成・学習意欲・責任感・ロールモデル・大きな志・社会貢献・縁ある人を豊かにする。`,
  },
};

async function generateZone(apiKey: string, zone: string, systemPrompt: string): Promise<any[]> {
  const def = ZONE_DEFS[zone];
  if (!def) return [];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `${def.label}の行動基準を6件生成してください。
${def.prompt}

JSON形式のみで返してください：
{"items":[{"category":"カテゴリ英語","title":"短いタイトル","description":"具体的な説明","official_statement":"公式ステートメント","legal_basis":"就業規則参照（あれば）","improvement_period":${zone === 'yellow' ? '"改善期間"' : 'null'}}]}`,
      }],
    }),
  });

  const data = await res.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const match = clean.match(/(\{[\s\S]*\})/);
  const parsed = JSON.parse(match ? match[1] : clean);
  return parsed.items || [];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });

  try {
    // 就業規則（軽量取得）
    let rulesSnippet = '';
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const rules = await sql`SELECT content FROM employment_rules LIMIT 1`;
      if (rules[0]?.content) rulesSnippet = (rules[0].content as string).slice(0, 800);
    } catch {}

    const systemPrompt = `あなたは皮膚科・美容皮膚科クリニックの行動基準設計AIです。必ずJSON形式のみで返してください。
院長の哲学：ティール組織（全員がリーダー・自律型）、先払いの原則、実評価（実行・実績・実力・誠実）、リードマネジメント（内発的動機）。
${rulesSnippet ? `就業規則（抜粋）：${rulesSnippet}` : ''}`;

    // 4ゾーンを逐次生成（各1500トークン、タイムアウト回避）
    const zones = [];
    for (const zone of ['red', 'yellow', 'green', 'teal']) {
      try {
        const items = await generateZone(apiKey, zone, systemPrompt);
        zones.push({ zone_type: zone, items });
      } catch (e) {
        console.error(`Zone ${zone} generation failed:`, e);
        zones.push({ zone_type: zone, items: [] });
      }
    }

    return NextResponse.json({ zones });
  } catch (e) {
    console.error('red-zone generate error:', e);
    return NextResponse.json({ error: '生成に失敗しました', details: String(e) }, { status: 500 });
  }
}
