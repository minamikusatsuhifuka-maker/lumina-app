import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const EVALUATION_PROMPT = (
  chapterTitle: string,
  chapterContent: string,
  bookConcept: string,
) => `あなたはKindle書籍の編集者・評価専門家です。
以下の章を多角的に分析・評価してください。

【書籍コンセプト】
${bookConcept}

【章タイトル】
${chapterTitle}

【章の内容】
${chapterContent}

## 評価基準（各20点満点・合計100点）

### 1. 読みやすさ・構成（20点）
- 段落の流れは自然か
- 見出し・箇条書きの使い方
- 文章の長さとリズム

### 2. 内容の深さ・独自性（20点）
- 他にない視点・洞察があるか
- 具体例・エピソードの質
- 読者の知的好奇心を満たすか

### 3. 読者への価値提供（20点）
- 読者が得られるベネフィットが明確か
- 実践的なアクションに繋がるか
- 感情的な共鳴があるか

### 4. 書籍全体との一貫性（20点）
- コンセプトと整合しているか
- トーン・文体が統一されているか
- 前後の章との繋がり

### 5. Kindle向け最適化（20点）
- スマホ・電子書籍での読みやすさ
- 章の適切な長さ（3000〜8000字）
- 引き付けるオープニング・クロージング

## 出力形式（必ずこの形式で）

### 📊 総合スコア: XX/100点

### 各軸のスコア
| 評価軸 | スコア | コメント |
|--------|--------|---------|
| 読みやすさ・構成 | XX/20 | ... |
| 内容の深さ・独自性 | XX/20 | ... |
| 読者への価値提供 | XX/20 | ... |
| 書籍全体との一貫性 | XX/20 | ... |
| Kindle向け最適化 | XX/20 | ... |

### ✅ 優れている点（3つ）
1.
2.
3.

### ⚠️ 改善が必要な点（3つ、優先度順）
1. 【最重要】...
2. 【重要】...
3. 【推奨】...

### 🚀 具体的なブラッシュアップ指示
以下を行うことで品質が大幅に向上します：

**オープニングの改善**
（具体的な書き方の指示）

**本文の強化**
（追加すべき内容・削除すべき内容）

**クロージングの改善**
（読者の行動を促すクロージング案）

**具体例・エピソードの追加案**
（どんな事例を入れると効果的か）`;

const IMPROVE_PROMPT = (
  chapterTitle: string,
  chapterContent: string,
  advice: string,
  bookConcept: string,
) => `あなたはKindle書籍のプロライターです。
以下の章を、改善アドバイスに基づいて完全にリライトしてください。

【書籍コンセプト】
${bookConcept}

【章タイトル】
${chapterTitle}

【現在の章の内容】
${chapterContent}

【改善アドバイス】
${advice}

## リライトの指示

1. **全文リライト**: 単なる修正ではなく、アドバイスを完全に反映した新しいバージョンを書く
2. **オープニング強化**: 読者を引き込む強力な冒頭を書く（問いかけ・エピソード・衝撃的な事実）
3. **具体例の充実**: 抽象的な説明には必ず具体的なエピソード・数字・事例を加える
4. **読者への呼びかけ**: 「あなたも」「きっと」など読者に語りかける表現を自然に入れる
5. **構成の最適化**: 見出し・箇条書きを効果的に使い、スキャンしやすくする
6. **クロージング強化**: 次章への期待感を高め、読者のアクションを促す締めくくりにする
7. **文字数**: 元の内容より20〜30%増量して内容を充実させる

改善後の章を全文出力してください。
タイトルから始めて、章の全文を出力してください。`;

interface EvalRequest {
  action: 'evaluate' | 'improve';
  chapterId: number;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = (session.user as { id?: string })?.id ?? '';

  let body: EvalRequest;
  try {
    body = (await req.json()) as EvalRequest;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { action, chapterId } = body;

  if (!chapterId || (action !== 'evaluate' && action !== 'improve')) {
    return new Response('Invalid action or chapterId', { status: 400 });
  }

  // 章と書籍情報を取得
  const rows = await sql`
    SELECT kc.*,
           kb.title as book_title,
           kb.book_concept as book_concept,
           kb.subtitle as book_subtitle
    FROM kindle_chapters kc
    JOIN kindle_books kb ON kc.book_id = kb.id
    WHERE kc.id = ${chapterId} AND kb.user_id = ${userId}
    LIMIT 1
  `;
  const chapter = rows[0];

  if (!chapter) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: '章が見つかりません' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const bookConcept =
    (chapter.book_concept as string | null) ??
    (chapter.book_subtitle as string | null) ??
    (chapter.book_title as string | null) ??
    'Kindle書籍';

  const contentToUse =
    action === 'improve'
      ? ((chapter.improved_content as string | null) ??
        (chapter.content as string | null) ??
        '')
      : ((chapter.content as string | null) ?? '');

  if (!contentToUse.trim()) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: '章の本文が空です。先に本文を生成してください。' })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const prompt =
    action === 'evaluate'
      ? EVALUATION_PROMPT(
          chapter.title as string,
          contentToUse,
          bookConcept,
        )
      : IMPROVE_PROMPT(
          chapter.title as string,
          contentToUse,
          (chapter.advice as string | null) ?? '',
          bookConcept,
        );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 6000,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        });

        let fullText = '';
        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            fullText += event.delta.text;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`,
              ),
            );
          }
        }

        // DBに保存
        if (action === 'evaluate') {
          // 総合スコアを抽出（全角・半角コロン両対応）
          const scoreMatch = fullText.match(/総合スコア[：:]\s*(\d+)/);
          const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null;

          await sql`
            UPDATE kindle_chapters SET
              advice = ${fullText},
              evaluation_score = ${score},
              status = 'evaluated',
              updated_at = NOW()
            WHERE id = ${chapterId}
          `;
        } else {
          await sql`
            UPDATE kindle_chapters SET
              improved_content = ${fullText},
              status = 'improved',
              version = COALESCE(version, 1) + 1,
              updated_at = NOW()
            WHERE id = ${chapterId}
          `;
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'done', action })}\n\n`,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
