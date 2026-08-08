import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '@/lib/require-auth';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { generateTextWithFallback } from '@/lib/ai-fallback';
import { getKindlePurpose, KINDLE_COMMON_RULES, KINDLE_LAYOUT_RULES } from '@/lib/kindle-purposes';
import { getKindleStyle } from '@/lib/kindle-styles';
import { stripLeadingChapterHeading } from '@/lib/kindle-text';
import { KINDLE_TASTES, KINDLE_TASTE_KEYS, KINDLE_TASTE_GUARD, getKindleTaste } from '@/lib/kindle-taste';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 236B: テイスト変換（2段階方式）。
// - POST { bookId, chapterId, mode:'samples' } → 全テイストの冒頭サンプルを**1回のAI呼び出し**で生成
// - POST { bookId, chapterId, mode:'convert', tasteKey } → その1テイストで章の全文を変換
// **どちらもDBに保存しない**（適用は院長がdiffを見てから /api/kindle/chapters PATCH で行う）。
// 236D「適用前に必ずdiffを見せる」を、サーバ側でも"保存しない"ことで担保する。

const SAMPLE_CHARS = 1200; // サンプル生成に渡す原文の冒頭（全文を渡すとコスト・時間が無駄）

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const bookId = Number(body.bookId);
    const chapterId = Number(body.chapterId);
    const mode = body.mode === 'convert' ? 'convert' : 'samples';
    if (!Number.isFinite(bookId) || !Number.isFinite(chapterId)) {
      return NextResponse.json({ error: 'bookId / chapterId が必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const [book] = (await sql`
      SELECT id, title, target_reader, book_meta FROM kindle_books
      WHERE id = ${bookId} AND user_id = ${userId}
    `) as { id: number; title: string; target_reader: string | null; book_meta: any }[];
    if (!book) return NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 });

    const [chapter] = (await sql`
      SELECT id, chapter_number, title, content, target_word_count FROM kindle_chapters
      WHERE id = ${chapterId} AND book_id = ${bookId}
    `) as { id: number; chapter_number: number; title: string; content: string | null; target_word_count: number }[];
    if (!chapter) return NextResponse.json({ error: '章が見つかりません' }, { status: 404 });
    const content = chapter.content || '';
    if (!content.trim()) return NextResponse.json({ error: '章の本文が空です' }, { status: 400 });

    const purpose = getKindlePurpose(book.book_meta?.purposeKey);
    const style = getKindleStyle(book.book_meta?.styleKey);

    return mode === 'samples'
      ? await generateSamples(chapter, content, purpose.label)
      : await convertFullText(body.tasteKey, chapter, content, purpose.promptBlock, style.promptBlock);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/taste] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── 段階1: 全テイストのサンプルを1回で生成（読み比べて選ぶための材料） ──
async function generateSamples(
  chapter: { chapter_number: number; title: string },
  content: string,
  purposeLabel: string,
) {
  const excerpt = content.slice(0, SAMPLE_CHARS);
  const tasteBlocks = KINDLE_TASTE_KEYS.map((k) => `## ${k}\n${KINDLE_TASTES[k].promptBlock}`).join('\n\n');

  const system = `あなたは書籍編集のプロです。渡された章の冒頭を、指定された複数のテイストにそれぞれ書き換え、
著者が読み比べて選べるサンプルを作ってください。

# この本の目的
${purposeLabel}

# テイストの定義
${tasteBlocks}

${KINDLE_TASTE_GUARD}

# サンプルの作り方
- 各テイストとも、渡された冒頭部分を**300字程度**に書き換える（長すぎない）
- テイストごとの違いが読み比べて分かるように、その特徴をはっきり出す
- ただし内容・事実は原文のまま。テイストを出すために情報を足さない

必ず以下のJSON形式のみを返してください（前置き・コードフェンス不要）:
{"samples": {${KINDLE_TASTE_KEYS.map((k) => `"${k}": "…"`).join(', ')}}}`;

  const ai = await generateTextWithFallback({
    system,
    maxTokens: 8000,
    messages: [
      {
        role: 'user',
        content: `以下は第${chapter.chapter_number}章「${chapter.title}」の冒頭です。各テイストのサンプルを作ってください。\n\n--- 原文の冒頭 ---\n${excerpt}\n--- ここまで ---`,
      },
    ],
  });

  const parsed = robustJsonParse<{ samples?: Record<string, unknown> }>(ai.text);
  const samples: Record<string, string> = {};
  for (const k of KINDLE_TASTE_KEYS) {
    const s = String(parsed?.samples?.[k] ?? '').trim();
    if (s) samples[k] = s;
  }
  // fail-closed: 1件も取れないなら失敗として返す（空のカードを並べない）
  if (Object.keys(samples).length === 0) {
    return NextResponse.json({ error: 'サンプルを生成できませんでした（再試行してください）' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    chapterId: chapter.chapter_number,
    original: excerpt,
    samples,
    _ai: { provider: ai.provider, modelLabel: ai.modelLabel },
  });
}

// ── 段階2: 選ばれた1テイストで全文変換（保存しない） ──
async function convertFullText(
  tasteKeyRaw: unknown,
  chapter: { chapter_number: number; title: string; target_word_count: number },
  content: string,
  purposeBlock: string,
  styleBlock: string,
) {
  if (typeof tasteKeyRaw !== 'string' || !KINDLE_TASTES[tasteKeyRaw]) {
    return NextResponse.json(
      { error: `tasteKey が不正です（対応: ${KINDLE_TASTE_KEYS.join('/')}）` },
      { status: 400 },
    );
  }
  const taste = getKindleTaste(tasteKeyRaw);

  const system = `あなたは書籍編集のプロです。渡された章の本文を、指定されたテイストに書き換えてください。

${purposeBlock}

${styleBlock}

${taste.promptBlock}

${KINDLE_LAYOUT_RULES}

${KINDLE_COMMON_RULES}

${KINDLE_TASTE_GUARD}

# 出力
- 書き換えた本文のみを出力する（前置き・説明・コードフェンス不要）
- 分量は原文と同程度（±15%以内）を目安にする`;

  const ai = await generateTextWithFallback({
    system,
    maxTokens: 12000,
    messages: [
      {
        role: 'user',
        content: `以下の第${chapter.chapter_number}章「${chapter.title}」の本文を「${taste.label}」のテイストに書き換えてください。\n\n--- 原文 ---\n${content}\n--- ここまで ---`,
      },
    ],
  });

  // 防御的二重ガード: 章見出しH1が混じったら落とす（既存の章生成と同じ扱い）
  const revised = stripLeadingChapterHeading(ai.text, chapter.chapter_number, chapter.title);
  // fail-closed: 空・極端に短い結果は返さない（原文は当然無傷＝そもそも保存していない）
  if (!revised.trim() || revised.length < content.length * 0.3) {
    return NextResponse.json(
      { error: '変換結果が不完全でした（原文はそのままです。再試行してください）' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    tasteKey: taste.key,
    tasteLabel: taste.label,
    original: content,
    revised,
    originalChars: content.length,
    revisedChars: revised.length,
    _ai: { provider: ai.provider, modelLabel: ai.modelLabel },
  });
}
