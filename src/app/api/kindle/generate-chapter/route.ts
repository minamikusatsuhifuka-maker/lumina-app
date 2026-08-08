import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { streamTextWithFallback, generateTextWithFallback } from '@/lib/ai-fallback';
import { neon } from '@neondatabase/serverless';
import {
  fetchKindleMaterials,
  hasNoteMaterials,
  hasAnalysisMaterials,
  KINDLE_ANALYSIS_SOURCE_RULES,
  KINDLE_MATERIAL_SOURCE_META,
  KINDLE_NOTE_SOURCE_RULES,
} from '@/lib/kindle-materials';
import { getKindlePurpose, KINDLE_COMMON_RULES, KINDLE_LAYOUT_RULES } from '@/lib/kindle-purposes';
import { getKindleStyle } from '@/lib/kindle-styles';
import { stripLeadingChapterHeading } from '@/lib/kindle-text';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  // 235: 生成は ai-fallback（Claude→Gemini）に集約したため、Anthropicキーの有無で門前払いしない
  // （Geminiだけでも動く状態を保つ。両方失敗したときに初めてエラーになる＝fail-closed）
  const { chapter, bookMeta, language, targetWordCount, bookId, chapterId } = await req.json();

  // 222: bookId+chapterId 指定時はウィザード駆動モード（DBから章・素材・目的・文体・
  // 前章文脈を取得して生成し、完了時にサーバ側で章を保存＝status駆動レジュームの土台）。
  // 未指定なら従来モードそのまま（完全後方互換）。
  if (bookId && chapterId) {
    const userId = (session as any).user?.id;
    if (!userId) return new Response('Unauthorized', { status: 401 });
    return wizardGenerateChapter(userId, Number(bookId), Number(chapterId));
  }

  const langInstruction = language === 'en'
    ? 'Write in English. Use natural, engaging English prose.'
    : '日本語で執筆してください。自然で読みやすい文体にしてください。';

  const prompt = `${langInstruction}

以下の書籍情報と章情報に基づいて、本文を執筆してください。

【書籍情報】
タイトル: ${bookMeta?.title ?? ''}
ターゲット: ${bookMeta?.targetAudience ?? ''}
ジャンル: ${bookMeta?.genre ?? ''}

【章情報】
第${chapter?.number ?? chapter?.chapterNumber ?? ''}章: ${chapter?.title ?? ''}
概要: ${chapter?.summary ?? ''}
目標文字数: ${targetWordCount ?? chapter?.targetWordCount ?? 3000}字
キーメッセージ: ${(chapter?.keyMessages ?? []).join('、')}
感情的フック: ${chapter?.emotionalHook ?? ''}

【執筆ルール】
1. 目標文字数に近づけて執筆する（±10%以内）
2. 冒頭でストーリーや問いかけで引き込む
3. 具体的な事例・データ・エビデンスを含める
4. ナッジ理論・損失回避・社会的証明を自然に組み込む
5. 各節の末尾に次節への「橋渡し」を入れる
6. 読了後に「行動したい」と思える締めにする
7. 見出し（##）を使って読みやすく構造化する

本文のみを出力してください（説明文・前置き不要）。`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Step1: ディープリサーチ
        // 235: 共通層でClaude→Gemini自動フォールバック
        const research = await generateTextWithFallback({
          maxTokens: 4000,
          messages: [{
            role: 'user',
            content: `「${chapter?.title ?? ''}」について、以下を調査してください：
1. 関連する最新の研究・データ・統計
2. 権威ある文献・書籍の参照
3. 具体的な事例・成功例・失敗例
4. エビデンスベースの知見

JSON形式で出力：
{"research": "調査結果の要約", "references": [{"title": "文献名", "author": "著者", "year": 2024, "point": "引用ポイント"}], "keyData": ["データ1", "データ2"]}`,
          }],
        });

        const researchText = research.text;

        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'research_done', research: researchText })}\n\n`
        ));

        // Step2: 本文生成（ストリーミング）
        const write = await streamTextWithFallback(
          {
            maxTokens: 12000,
            messages: [{ role: 'user', content: prompt + `\n\n【参考リサーチ】\n${researchText}` }],
          },
          {
            onDelta: (text) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`)),
            onReset: () => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'reset' })}\n\n`)),
          },
        );
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done', ai: { provider: write.provider, modelLabel: write.modelLabel } })}\n\n`),
        );
        controller.close();
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: String(err?.message || err) })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}

// ── 222: ウィザード駆動モード ──
// 生成中は章statusを変えない（300秒killで中断しても 'pending' のまま＝安全に再キュー可能）。
// 成功時のみ content 保存＋status='completed'、生成エラー時は status='failed'。
async function wizardGenerateChapter(userId: string, bookId: number, chapterId: number) {
  const sql = neon(process.env.DATABASE_URL!);

  // 書籍（owner検証）・対象章・全章を取得
  const [book] = await sql`
    SELECT id, title, subtitle, target_reader, book_meta FROM kindle_books
    WHERE id = ${bookId} AND user_id = ${userId}
  `;
  if (!book) return new Response(JSON.stringify({ error: '書籍が見つかりません' }), { status: 404 });

  const chapters = (await sql`
    SELECT id, chapter_number, title, summary, target_word_count, content, status
    FROM kindle_chapters WHERE book_id = ${bookId}
    ORDER BY chapter_number ASC
  `) as { id: number; chapter_number: number; title: string; summary: string; target_word_count: number; content: string | null; status: string }[];

  const target = chapters.find((c) => c.id === chapterId);
  if (!target) return new Response(JSON.stringify({ error: '章が見つかりません' }), { status: 404 });

  const meta = (book as any).book_meta ?? {};
  const purpose = getKindlePurpose(meta.purposeKey);
  const style = getKindleStyle(meta.styleKey);
  const isLastChapter = target.chapter_number === Math.max(...chapters.map((c) => c.chapter_number));

  // 章に割り当てた素材（実在IDのみが book_meta に入っている前提だが、取得時もowner検証される）
  const assignedIds: string[] = Array.isArray(meta.chapterSourceRefs?.[String(target.chapter_number)])
    ? meta.chapterSourceRefs[String(target.chapter_number)]
    : [];
  const materials = await fetchKindleMaterials(userId, assignedIds);
  const materialsBlock =
    materials.length > 0
      ? materials
          .map((m, i) => `【素材${i + 1}｜${KINDLE_MATERIAL_SOURCE_META[m.source].label}】${m.title}\n${m.text}`)
          .join('\n\n---\n\n')
      : '（この章への割当素材なし。書籍情報と章概要に基づいて執筆する）';

  // 前章文脈: 完了章のタイトル＋概要一覧、直前の完了章の末尾800字（追加AI呼び出しなし）
  const done = chapters.filter(
    (c) => c.chapter_number < target.chapter_number && (c.content ?? '').trim().length > 0,
  );
  const priorSummaries = done.map((c) => `第${c.chapter_number}章「${c.title}」: ${c.summary || '（概要なし）'}`).join('\n');
  const prevChapter = done.length > 0 ? done[done.length - 1] : null;
  const prevTail = prevChapter ? (prevChapter.content ?? '').slice(-800) : '';
  const priorContextBlock = done.length > 0
    ? `【ここまでの章（重複を避け、流れを引き継ぐこと）】
${priorSummaries}

【直前の章（第${prevChapter!.chapter_number}章）の末尾】
…${prevTail}`
    : '（この章が最初の執筆章）';

  const system = `あなたはKindle書籍の執筆者です。渡された素材と書籍情報に基づいて、指定された章の本文を執筆してください。

${purpose.promptBlock}
${isLastChapter ? `\n${purpose.ctaBlock}\n` : ''}
${style.promptBlock}

${KINDLE_LAYOUT_RULES}

${KINDLE_COMMON_RULES}${hasNoteMaterials(materials) ? `\n\n${KINDLE_NOTE_SOURCE_RULES}` : ''}${hasAnalysisMaterials(materials) ? `\n\n${KINDLE_ANALYSIS_SOURCE_RULES}` : ''}`;

  const prompt = `以下の章の本文を執筆してください。本文のみを出力してください（説明文・前置き不要）。
章タイトルの見出し（「# 第N章 …」等）は本文に含めず、書き出しの段落（または「この章でわかること」）から始めてください。

【書籍情報】
タイトル: ${(book as any).title ?? ''}
サブタイトル: ${(book as any).subtitle ?? ''}
ターゲット読者: ${(book as any).target_reader ?? ''}

【章情報】
第${target.chapter_number}章: ${target.title}
概要: ${target.summary || ''}
目標文字数: ${target.target_word_count || 3500}字（±10%以内）

${priorContextBlock}

【素材（この章に割り当てられた資料・全文）】
${materialsBlock}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 235: 共通層でClaude→Gemini自動フォールバック（上限・混雑時のみ）。
        // Claudeが流し始めてから落ちた場合は onReset で受け手の蓄積を捨てて重複を防ぐ
        const ai = await streamTextWithFallback(
          { system, maxTokens: 12000, messages: [{ role: 'user', content: prompt }] },
          {
            onDelta: (text) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`)),
            onReset: () => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'reset' })}\n\n`)),
          },
        );
        let fullText = ai.text;

        // 防御的二重ガード: プロンプト指示をすり抜けた冒頭の章見出しH1を除去してから保存
        fullText = stripLeadingChapterHeading(fullText, target.chapter_number, target.title);

        // fail-closed: 空本文は保存しない（偽の完了を作らない）
        if (!fullText.trim()) {
          await sql`UPDATE kindle_chapters SET status = 'failed', updated_at = NOW() WHERE id = ${chapterId}`;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: '本文が空でした（再試行してください）' })}\n\n`));
          controller.close();
          return;
        }

        // サーバ側で保存（章完了ごとの永続化＝レジューム土台）＋総文字数の再計算
        await sql`
          UPDATE kindle_chapters SET content = ${fullText}, status = 'completed', updated_at = NOW()
          WHERE id = ${chapterId}
        `;
        await sql`
          UPDATE kindle_books SET
            current_word_count = (SELECT COALESCE(SUM(LENGTH(content)), 0) FROM kindle_chapters WHERE book_id = ${bookId}),
            updated_at = NOW()
          WHERE id = ${bookId}
        `;

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'done', saved: true, charCount: fullText.length, ai: { provider: ai.provider, modelLabel: ai.modelLabel } })}\n\n`,
          ),
        );
        controller.close();
      } catch (err: any) {
        try {
          await sql`UPDATE kindle_chapters SET status = 'failed', updated_at = NOW() WHERE id = ${chapterId}`;
        } catch {
          /* 状態更新の失敗は握りつぶさずSSEで通知済みのため無視 */
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: String(err?.message || err) })}\n\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
