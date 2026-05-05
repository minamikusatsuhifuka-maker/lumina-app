import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { callAI } from '@/lib/call-ai';

export const maxDuration = 120;

// リサーチ結果をAI背景情報コンテキストとして再構造化するAPI
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { topic, researchText } = await req.json();
    if (!topic || !researchText) {
      return NextResponse.json({ error: 'topic と researchText は必須です' }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);

    const system = `あなたはAIに読み込ませる背景情報（コンテキスト）を整理する専門家です。
リサーチレポートを、AIが他のタスク（文章作成・SNS投稿・LP作成・資料作成）で活用しやすい
コンパクトで構造化された背景情報に再構造化してください。

絶対ルール：
- Markdown形式で出力（HTMLタグ・コードブロックは使わない）
- 各セクションを必ず埋める
- 簡潔・正確・具体的に
- URLは生のURLのみ`;

    const userPrompt = `# 元のリサーチトピック
${topic}

# 元のリサーチテキスト
${researchText}

---

# 出力フォーマット（このフォーマットで再構造化してください）

# ${topic} - AI背景情報コンテキスト
生成日: ${today}

## 📌 エグゼクティブサマリー（3行以内）
（核心を3行でまとめる）

## 🎯 核心ファクト（箇条書き10項目以内）
- ファクト1
- ファクト2
...

## 💡 重要なインサイト
（専門家視点の洞察・示唆）

## 📊 データ・数値・事例
（具体的な数字・事例・統計）

## ⚠️ 注意点・制約・反論
（反論・リスク・限界）

## 🔑 キーワード・専門用語
（重要キーワード一覧）

## 📝 このコンテキストの活用方法
- 文章作成：どのような記事・コンテンツに使えるか
- SNS投稿：どのような投稿に使えるか
- LP作成：どのランディングページに活用できるか
- お役立ちコラム：どのようなコラムネタになるか
- 資料作成：どのようなスライド・資料に使えるか

上記フォーマットに沿って日本語で出力してください。フォーマット外の前置き・後書きは書かないでください。`;

    const contextText = await callAI({
      model: 'gemini',
      system,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 4000,
    });

    if (!contextText || contextText.trim() === '') {
      return NextResponse.json({ error: 'AI応答が空でした' }, { status: 500 });
    }

    return NextResponse.json({ contextText });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '最適化に失敗しました' }, { status: 500 });
  }
}
