import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: `以下の会議メモ・議事録を整理してください。

【会議メモ】
${text}

以下の形式で整理してください：

## 📋 会議サマリー
（会議の目的・参加者・日時があれば記載、2〜3文）

## ✅ 決定事項
（決まったことを箇条書きで）

## 🎯 アクションアイテム
| タスク | 担当者 | 期限 |
|--------|--------|------|
（担当者・期限が不明な場合は「未定」）

## 💬 主要な議論ポイント
（重要な議論・意見の対立・検討事項）

## ⏭️ 次のステップ
（次回会議・フォローアップすべきこと）

## ❓ 未解決事項
（持ち越し・要確認事項）` }],
    }),
  });

  const data = await response.json();
  const result = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return NextResponse.json({ result });
}
