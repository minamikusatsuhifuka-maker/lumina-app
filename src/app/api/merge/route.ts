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
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `以下の複数の調査・分析結果を統合して、包括的なレポートを作成してください。

${itemsText}

以下の構成で統合レポートを作成：

## 📊 統合サマリー
（全資料を横断した主要な発見・結論）

## 🔗 共通点・一致した見解
（複数の資料で共通して言及されていた点）

## ⚡ 重要な相違点・矛盾
（資料間で異なる見解や矛盾している点）

## 💎 新たな洞察
（資料を統合することで見えてきた新しい視点）

## 🎯 推奨アクション
（この情報を基に取るべき行動・次のステップ）

## ⚠️ 注意点・限界
（情報の限界や注意すべき点）`,
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
