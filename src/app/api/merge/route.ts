import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { items } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const itemsText = items.map((item: any, i: number) =>
    `【資料${i + 1}：${item.title}】\n${(item.content || '').slice(0, 2000)}`
  ).join('\n\n---\n\n');

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
      system: `あなたは優秀なリサーチアナリストです。
複数の調査・分析結果を横断的に分析し、以下の構造でレポートを生成してください。
必ず各セクションを明確に分けて出力してください。

# 🎯 エグゼクティブサマリー
（全体を3行で要約）

# 🔗 共通テーマ・キーワード
（複数のアイテムに共通して現れるテーマや概念を箇条書きで）

# 💡 主要インサイト
（データから導き出せる重要な洞察を優先度順に3〜5個）

# ⚡ 矛盾点・対立する見解
（アイテム間で意見や事実が異なる点を明示。なければ「特になし」）

# 📊 総合評価
（全体的な傾向と結論）

# ✅ アクション推奨事項
（このデータをもとに取るべき具体的なアクションを3つ）`,
      messages: [{
        role: 'user',
        content: `以下の${items.length}件の調査・分析結果を統合分析してください。\n\n${itemsText}`,
      }],
    }),
  });

  const data = await response.json();
  const result = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');

  return NextResponse.json({ result });
}
