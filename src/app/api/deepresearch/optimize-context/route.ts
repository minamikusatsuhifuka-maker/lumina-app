import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY が未設定です' }, { status: 500 });
    }

    const today = new Date().toISOString().slice(0, 10);

    const prompt = `あなたはAIに読み込ませる背景情報（コンテキスト）を整理する専門家です。
リサーチレポートを、AIが他のタスク（文章作成・SNS投稿・LP作成・資料作成）で活用しやすい
コンパクトで構造化された背景情報に再構造化してください。

絶対ルール：
- Markdown形式で出力（HTMLタグ・コードブロックは使わない）
- 各セクションを必ず埋める
- 簡潔・正確・具体的に
- URLは生のURLのみ
- 前置きや後書きは書かず、いきなりMarkdownを出力する

# 元のリサーチトピック
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
- 資料作成：どのようなスライド・資料に使えるか`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 8000,
      },
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    // レスポンスの詳細を確認
    const response = result.response;
    const candidates = response?.candidates || [];
    const finishReason = candidates[0]?.finishReason;
    const safetyRatings = candidates[0]?.safetyRatings;
    const promptFeedback = (response as any)?.promptFeedback;

    // すべての text パートを連結（thinkingパートと混在する場合に対応）
    let contextText = '';
    try {
      contextText = response.text() || '';
    } catch (textErr) {
      console.error('[optimize-context] response.text() failed:', textErr);
    }

    // text() で取れなかった場合の手動連結
    if (!contextText.trim()) {
      const parts = candidates[0]?.content?.parts || [];
      contextText = parts
        .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
        .filter(Boolean)
        .join('\n');
    }

    if (!contextText.trim()) {
      console.error('[optimize-context] 空応答:', {
        finishReason,
        safetyRatings,
        promptFeedback,
        candidateCount: candidates.length,
        topicLength: topic.length,
        researchTextLength: researchText.length,
      });

      // フォールバック: 元のリサーチテキストから最低限のコンテキストを生成
      const fallback = buildFallbackContext(topic, researchText, today);
      return NextResponse.json({
        contextText: fallback,
        warning: `AIによる最適化が空応答だったため、簡易フォールバックを生成しました（finishReason: ${finishReason || 'unknown'}）。再生成をお試しください。`,
      });
    }

    return NextResponse.json({ contextText });
  } catch (e: any) {
    console.error('[optimize-context] エラー:', e);
    return NextResponse.json(
      { error: e?.message || '最適化に失敗しました' },
      { status: 500 }
    );
  }
}

// AI応答が空のときに使うフォールバック生成
function buildFallbackContext(topic: string, researchText: string, today: string): string {
  // 簡易抽出: 行頭の箇条書き・URLなど
  const lines = researchText.split('\n').map(l => l.trim()).filter(Boolean);
  const bullets = lines.filter(l => l.startsWith('-') || l.startsWith('•') || /^\d+\./.test(l)).slice(0, 10);
  const urls = lines.filter(l => /https?:\/\//.test(l)).slice(0, 5);
  const summary = lines.find(l => l.length > 30 && !l.startsWith('#')) || lines[0] || '';

  return `# ${topic} - AI背景情報コンテキスト
生成日: ${today}

## 📌 エグゼクティブサマリー（3行以内）
${summary.slice(0, 200)}

## 🎯 核心ファクト（箇条書き10項目以内）
${bullets.length > 0 ? bullets.join('\n') : '- リサーチ結果から自動抽出できませんでした'}

## 💡 重要なインサイト
（再生成してください）

## 📊 データ・数値・事例
${urls.length > 0 ? urls.join('\n') : '（再生成してください）'}

## ⚠️ 注意点・制約・反論
（再生成してください）

## 🔑 キーワード・専門用語
${topic}

## 📝 このコンテキストの活用方法
- 文章作成：${topic}に関する記事
- SNS投稿：${topic}の概要紹介
- LP作成：${topic}関連のサービス訴求
- お役立ちコラム：${topic}の入門解説
- 資料作成：${topic}のレポート・スライド

---
※ 自動最適化が失敗したため、簡易フォールバックを表示しています。「🔄 再生成」を試してください。`;
}
