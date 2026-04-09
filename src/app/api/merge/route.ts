import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

async function callAnthropic(apiKey: string, body: object, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status === 529) && i < retries) {
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      continue;
    }
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
}

export async function POST(req: NextRequest) {
  const { items } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!items || items.length < 2) {
    return NextResponse.json({ error: '2件以上のアイテムが必要です' }, { status: 400 });
  }

  const itemsText = items.map((item: any, i: number) =>
    `【資料${i + 1}：${item.title || '無題'}】\n${(item.content || '（内容なし）').slice(0, 2000)}`
  ).join('\n\n---\n\n');

  try {
    const data = await callAnthropic(apiKey, {
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
    });

    const result = (data.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');

    if (!result) {
      return NextResponse.json({ error: '統合レポートの生成に失敗しました（空の応答）' }, { status: 502 });
    }

    return NextResponse.json({ result });
  } catch (e: any) {
    console.error('[merge]', e.message);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
