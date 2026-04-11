import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const {
    bookTitle, bookType, chapterTitle, chapterSummary,
    keyPoints, targetReader, writingStyle, illustrationNote, estimatedPages,
  } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  if (!chapterTitle) {
    return NextResponse.json({ error: '章タイトルは必須です' }, { status: 400 });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: `あなたはKindle書籍のプロ執筆者です。
与えられた章の情報をもとに、読者を惹きつける高品質な章を執筆してください。

執筆ルール:
- Markdown形式で直接本文を出力してください（JSONではありません）
- 章タイトルを # 見出しで開始
- 小見出し（##）を適切に使い、読みやすく構成
- 具体例、エピソード、データを盛り込む
- 読者に語りかけるような親しみやすい文体
- 各セクションの最後にポイントまとめを入れる
- 書籍タイプに応じた文体・構成を使う
- 推定ページ数に見合う文量を書く（1ページ≒400文字）
- イラスト・図解の挿入箇所には <!-- イラスト: 説明 --> のコメントを入れる`,
        messages: [{
          role: 'user',
          content: `以下の章を執筆してください。

書籍タイトル: ${bookTitle || '未定'}
書籍タイプ: ${bookType || 'guide'}
章タイトル: ${chapterTitle}
章の概要: ${chapterSummary || '（概要なし）'}
キーポイント: ${Array.isArray(keyPoints) ? keyPoints.join('、') : keyPoints || '（指定なし）'}
ターゲット読者: ${targetReader || '一般'}
文体: ${writingStyle || '丁寧語・解説調'}
イラストメモ: ${illustrationNote || '（なし）'}
推定ページ数: ${estimatedPages || 10}ページ（約${(estimatedPages || 10) * 400}文字）`,
        }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';

    // Markdown本文をそのまま返す
    return NextResponse.json({ content: text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `章の執筆に失敗しました: ${msg}` }, { status: 500 });
  }
}
