import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '@/lib/require-auth';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { generateTextWithFallback } from '@/lib/ai-fallback';
import { MEDICAL_AD_NG_RULES } from '@/lib/medical-ad-check';
import { PERSONA_STYLES, getPersonaStyle } from '@/lib/persona-styles';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 261③: note記事と連動したX投稿文の生成（記事への導線ポスト）。
// - POST { articleId | article:{title,content}, drId?, threadCount:2〜5, personaKey? }
//   → 単発ポスト＋スレッド形式（2〜5ポスト）を**1回のAI呼び出し**で両方生成
// - 生成のみで**DBに保存しない**（保存は /api/dr-hub/x-post/save の明示操作のみ＝R-38と同方針）
// - Xへの自動投稿はしない（コピペ運用。外部APIを使わない＝指示書261の停止条件を踏まない）
// - ガード: 医療広告NG・誇張禁止は既存規約を注入。文字数はAI指示＋画面で実数表示の二段構え

const MAX_SOURCE_CHARS = 20000; // 投稿文生成に記事全文は不要（要点が拾えれば十分）
const POST_CHAR_LIMIT = 135; // 全角換算の安全圏（Xは280単位＝全角140字。URL・ハッシュタグ分の余白を残す）

const X_POST_RULES = `# X投稿の厳守事項
- 1ポストは全角${POST_CHAR_LIMIT}字以内（URLを末尾に貼る前提で余白を残す）
- 記事URLそのものは本文に書かない（投稿時に末尾へ貼る運用。「続きは記事で👇」のような導線文で締める）
- 医療広告規制のNG表現を使わない:
${MEDICAL_AD_NG_RULES}
- 煽り・不安訴求・限定性の演出は禁止（「今すぐ」「手遅れ」「今だけ」等）
- 記事にない事実・数値・出典を書かない
- ハッシュタグは1ポストに0〜2個まで（内容に自然に合うもののみ）
- 絵文字は控えめに（1ポスト0〜2個）`;

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : '';
    const inline = (body.article ?? {}) as Record<string, unknown>;
    let title = String(inline.title ?? '').trim();
    let content = String(inline.content ?? '').trim();

    // 保存済み記事を指定された場合はサーバ側で本文を取得（owner検証必須）
    if (articleId) {
      const sql = neon(process.env.DATABASE_URL!);
      const [row] = (await sql`
        SELECT id, title, content FROM library
        WHERE id = ${articleId} AND user_id = ${userId} AND type = 'note-article'
      `) as { id: string; title: string; content: string | null }[];
      if (!row) return NextResponse.json({ error: 'note記事が見つかりません' }, { status: 404 });
      title = row.title || title;
      content = row.content || '';
    }
    if (!content.trim()) {
      return NextResponse.json({ error: '元になる記事（articleId または article.content）が必要です' }, { status: 400 });
    }

    const tc = Number(body.threadCount);
    const threadCount = Number.isInteger(tc) && tc >= 2 && tc <= 5 ? tc : 3;
    const persona =
      typeof body.personaKey === 'string' && body.personaKey in PERSONA_STYLES
        ? getPersonaStyle(body.personaKey)
        : null;

    const system = `あなたはX（旧Twitter）で読者の役に立つ発信をするSNS編集者です。
渡されたnote記事への導線となる投稿文を作ってください。

${X_POST_RULES}
${persona ? `\n# 想定読者\n${persona.label}（${persona.hint}）に届く切り口・語りかけにする\n` : ''}
# 作るもの（両方）
1. single: 単発ポスト1本。記事の一番の読みどころを1つに絞り、読みたくなる導線文で締める
2. thread: ${threadCount}ポストのスレッド。1本目=フック（記事の問い・気づき）、中間=記事の要点を小出しに、最終=まとめ＋記事への導線
   - スレッドの各ポストも全角${POST_CHAR_LIMIT}字以内。番号（1/${threadCount} など）は付けない（画面側で付ける）

必ず以下のJSON形式のみを返してください（前置き・コードフェンス不要）:
{"single": "…", "thread": ["…", "…"]}`;

    const ai = await generateTextWithFallback({
      system,
      maxTokens: 6000,
      messages: [
        {
          role: 'user',
          content: `以下のnote記事「${title}」への導線となるX投稿（単発＋${threadCount}ポストのスレッド）を作ってください。\n\n--- 記事 ---\n${content.slice(0, MAX_SOURCE_CHARS)}\n--- ここまで ---`,
        },
      ],
    });

    const parsed = robustJsonParse<{ single?: unknown; thread?: unknown }>(ai.text);
    const single = String(parsed?.single ?? '').trim();
    const thread = (Array.isArray(parsed?.thread) ? parsed.thread : [])
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, 5);

    // fail-closed: どちらも取れないなら失敗として返す
    if (!single && thread.length === 0) {
      return NextResponse.json({ error: 'X投稿を生成できませんでした（再試行してください）' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      single,
      thread,
      charLimit: POST_CHAR_LIMIT,
      _ai: { provider: ai.provider, modelLabel: ai.modelLabel },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[dr-hub/x-post] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
