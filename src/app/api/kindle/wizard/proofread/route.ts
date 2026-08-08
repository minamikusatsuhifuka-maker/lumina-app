import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { generateTextWithFallback } from '@/lib/ai-fallback';
import { KINDLE_COMMON_RULES } from '@/lib/kindle-purposes';
import {
  KINDLE_PROOFREAD_PRINCIPLES,
  type KindleProofreadIssue,
  type KindleGlobalNote,
} from '@/lib/kindle-proofread';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 224: Kindleウィザードの自動校正。
// - POST { bookId, chapterId }: 1章分の検出（誤字脱字/表現改善/効果的表現）。
//   proofread/detect と同方式（行番号付与→JSON配列→完全一致original→適用はクライアントのローカル置換）
// - POST { bookId, global: true }: 全体整合（用語ゆれ・章間重複・流れ）の指摘のみ（置換なし）
// - PUT  { bookId, chapterId, issueIndex, decision }: 提案の適用/却下の記録
// 保存はすべて book_meta.proofread 配下への jsonb_set マージ（丸ごと置換をしない＝
// summaries 等の同居キーを壊さない。227以降の book_meta 拡張の土台）。
// fail-closed: 検出のパース失敗時は保存せず500を返す（提案ゼロ扱いにしない・本文は無傷）。

interface RawIssue {
  line?: number | string;
  type?: string;
  original?: string;
  suggestion?: string;
  reason?: string;
  principle?: string;
  scope?: string;
}

const VALID_TYPES = new Set(['誤字脱字', '表現改善', '効果的表現']);

// 235: 共通層でClaude→Gemini自動フォールバック（上限・混雑時のみ切替）
async function callClaude(system: string, userContent: string, maxTokens: number): Promise<string> {
  const ai = await generateTextWithFallback({
    system,
    maxTokens,
    messages: [{ role: 'user', content: userContent }],
  });
  return ai.text;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json().catch(() => ({}));
    const bookId = Number(body.bookId);
    if (!Number.isFinite(bookId)) return NextResponse.json({ error: 'bookIdが必要です' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const [book] = await sql`
      SELECT id FROM kindle_books WHERE id = ${bookId} AND user_id = ${userId}
    `;
    if (!book) return NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 });

    if (body.global === true) {
      return await runGlobalCheck(sql, bookId);
    }

    const chapterId = Number(body.chapterId);
    if (!Number.isFinite(chapterId)) return NextResponse.json({ error: 'chapterIdが必要です' }, { status: 400 });
    return await runChapterDetect(sql, bookId, chapterId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/proofread] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── 章単位の検出 ──
async function runChapterDetect(sql: any, bookId: number, chapterId: number) {
  const [chapter] = await sql`
    SELECT id, chapter_number, title, content FROM kindle_chapters
    WHERE id = ${chapterId} AND book_id = ${bookId}
  `;
  if (!chapter) return NextResponse.json({ error: '章が見つかりません' }, { status: 404 });
  const content: string = chapter.content || '';
  if (!content.trim()) return NextResponse.json({ error: '章の本文が空です' }, { status: 400 });

  // 行番号付与（後段のローカル行指定置換に対応させるため）
  const numbered = content
    .split('\n')
    .map((l: string, i: number) => `${i + 1}: ${l}`)
    .join('\n');

  const system = `あなたは書籍編集・校正のプロです。Kindle書籍の1章分の本文を校正し、修正提案をJSON配列のみで返してください。

検出する種別は3つ:
1. 「誤字脱字」: 誤字・脱字・変換ミス・表記揺れ（送り仮名・漢字/かな・全角/半角の不統一）
2. 「表現改善」: 冗長・不明瞭・重複・回りくどい文章の、意味を変えない改善
3. 「効果的表現」: 下記の観点リストに基づく、より読者に届く表現への提案

${KINDLE_PROOFREAD_PRINCIPLES}

# 提案の厳守事項（校正にも適用する。緩和しない）
${KINDLE_COMMON_RULES}
- 効果的表現の提案が誇張・断定・不安煽りにならないこと。「必ず治る」「今すぐでないと危険」等は提案してはならない。集客目的でも受診を急かさない
- 素材にない事実の追加を提案しない（表現の改善であって内容の創作ではない）
- 医療用語・固有名詞・意図的な表現は過剰に修正しない
- Markdownの見出し記号（##）・箇条書き記号・太字記法は壊さない

JSON配列のみを返してください（前置き・コードフェンス・説明は一切不要）。各要素:
{"line": 行番号(整数), "type": "誤字脱字"|"表現改善"|"効果的表現", "original": "本文に現れる通りの完全一致の抜粋", "suggestion": "修正後の文字列", "reason": "簡潔な理由(1行)", "principle": "効果的表現のときのみ原則名", "scope": "line"|"all"}
- original はその行に出現する通りの完全一致で抜き出すこと（後段のローカル置換に使用するため厳守）
- 表記揺れ等で全箇所を統一すべきものは scope を "all"、それ以外は "line"
- 提案は重要なものに絞る（1章あたり最大20件）。問題が無ければ [] を返す`;

  const user = `以下の行番号付き本文（第${chapter.chapter_number}章「${chapter.title}」）を校正してください。

【行番号付き本文】
${numbered}`;

  const raw = await callClaude(system, user, 8192);

  // fail-closed: パース失敗は保存せず例外→500（提案ゼロ扱いにしない）
  const arr = robustJsonParse<RawIssue[]>(raw);
  if (!Array.isArray(arr)) throw new Error('校正結果が配列ではありません');

  const issues: KindleProofreadIssue[] = arr
    .map((it) => ({
      line: Number(it.line) || 0,
      type: (VALID_TYPES.has(String(it.type)) ? String(it.type) : '表現改善') as KindleProofreadIssue['type'],
      original: String(it.original || ''),
      suggestion: String(it.suggestion || ''),
      reason: String(it.reason || ''),
      principle: it.principle ? String(it.principle) : undefined,
      scope: (it.scope === 'all' ? 'all' : 'line') as KindleProofreadIssue['scope'],
    }))
    .filter((it) => it.original && it.suggestion && it.original !== it.suggestion)
    .slice(0, 20);

  const payload = { issues, ranAt: new Date().toISOString() };

  // book_meta.proofread.chapters.<章ID> へのサーバ側マージ（親パスを先に確保してから書く）
  await sql`
    UPDATE kindle_books SET book_meta =
      jsonb_set(
        jsonb_set(
          jsonb_set(COALESCE(book_meta, '{}'::jsonb), '{proofread}', COALESCE(book_meta->'proofread', '{}'::jsonb), true),
          '{proofread,chapters}', COALESCE(book_meta->'proofread'->'chapters', '{}'::jsonb), true
        ),
        ${['proofread', 'chapters', String(chapterId)]}::text[], ${JSON.stringify(payload)}::jsonb, true
      ),
      updated_at = NOW()
    WHERE id = ${bookId}
  `;

  return NextResponse.json({ success: true, chapterId, issues });
}

// ── 全体整合（1回・指摘のみ） ──
async function runGlobalCheck(sql: any, bookId: number) {
  const chapters = (await sql`
    SELECT chapter_number, title, content FROM kindle_chapters
    WHERE book_id = ${bookId} AND content IS NOT NULL
    ORDER BY chapter_number ASC
  `) as { chapter_number: number; title: string; content: string }[];
  if (chapters.length === 0) return NextResponse.json({ error: '完成した章がありません' }, { status: 400 });

  const joined = chapters
    .map((c) => `【第${c.chapter_number}章 ${c.title}】\n${c.content}`)
    .join('\n\n────────\n\n');

  const system = `あなたは書籍編集者です。全章を通読し、本全体の整合性に関する指摘のみをJSONで返してください。

指摘種別は3つ:
- 「用語ゆれ」: 章をまたぐ表記・用語の不統一（例: ある章では「スキンケア」、別の章では「肌ケア」）
- 「章間重複」: 複数の章で同じ話題・説明が繰り返されている箇所
- 「流れ」: 章のつながり・順序・トーンの不整合

# 厳守事項
- 個別の誤字修正はここでは返さない（章単位の校正で扱う）
- 指摘は具体的に（どの章の何が、どうずれているか）。ただし1〜2文に収める
- 素材にない事実の追加や内容の創作を提案しない。誇張・断定・不安煽りの表現を提案しない

JSONのみを返してください（前置き・コードフェンス不要）:
{"notes": [{"type": "用語ゆれ"|"章間重複"|"流れ", "note": "指摘内容", "chapters": [関係する章番号]}]}
- 指摘は重要なものに絞る（最大10件）。問題が無ければ {"notes": []} を返す`;

  const raw = await callClaude(system, `以下の全章を通読して整合性を確認してください。\n\n${joined}`, 4096);

  const parsed = robustJsonParse<{ notes?: KindleGlobalNote[] }>(raw);
  const notes: KindleGlobalNote[] = (Array.isArray(parsed?.notes) ? parsed.notes : [])
    .map((n) => ({
      type: String(n.type || '流れ'),
      note: String(n.note || ''),
      chapters: Array.isArray(n.chapters) ? n.chapters.map(Number).filter(Number.isFinite) : [],
    }))
    .filter((n) => n.note)
    .slice(0, 10);

  const payload = { notes, ranAt: new Date().toISOString() };
  await sql`
    UPDATE kindle_books SET book_meta =
      jsonb_set(
        jsonb_set(COALESCE(book_meta, '{}'::jsonb), '{proofread}', COALESCE(book_meta->'proofread', '{}'::jsonb), true),
        '{proofread,global}', ${JSON.stringify(payload)}::jsonb, true
      ),
      updated_at = NOW()
    WHERE id = ${bookId}
  `;

  return NextResponse.json({ success: true, notes });
}

// ── 提案の適用/却下の記録 ──
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  try {
    const body = await req.json().catch(() => ({}));
    const bookId = Number(body.bookId);
    const chapterId = Number(body.chapterId);
    const issueIndex = Number(body.issueIndex);
    const decision = body.decision === 'applied' ? 'applied' : body.decision === 'rejected' ? 'rejected' : null;
    if (!Number.isFinite(bookId) || !Number.isFinite(chapterId) || !Number.isFinite(issueIndex) || issueIndex < 0 || !decision) {
      return NextResponse.json({ error: 'bookId / chapterId / issueIndex / decision が必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    // 対象issueの実在確認（owner検証込み）。配列indexの演算子型問題を避けるためJS側で検証する
    const [row] = await sql`
      SELECT book_meta->'proofread'->'chapters'->${String(chapterId)}->'issues' AS issues
      FROM kindle_books WHERE id = ${bookId} AND user_id = ${userId}
    `;
    if (!row) return NextResponse.json({ error: '書籍が見つかりません' }, { status: 404 });
    if (!Array.isArray(row.issues) || issueIndex >= row.issues.length) {
      return NextResponse.json({ error: '対象の提案が見つかりません' }, { status: 404 });
    }

    await sql`
      UPDATE kindle_books SET book_meta =
        jsonb_set(book_meta, ${['proofread', 'chapters', String(chapterId), 'issues', String(issueIndex), 'status']}::text[], ${JSON.stringify(decision)}::jsonb, true),
        updated_at = NOW()
      WHERE id = ${bookId} AND user_id = ${userId}
    `;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/wizard/proofread PUT] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
