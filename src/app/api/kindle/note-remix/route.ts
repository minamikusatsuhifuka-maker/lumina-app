import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_MEDIUM, DEFAULT_AI_MODEL } from '@/lib/ai-models';
import { checkMedicalAd, MEDICAL_AD_NG_RULES } from '@/lib/medical-ad-check';
import { NOTE_COMMON_RULES } from '@/lib/note-styles';
import { getMyStylePrompt } from '@/lib/my-style-server';
import { getPlaybook, PLAYBOOK_VERSION } from '@/lib/knowledge/noteXPlaybook';
import {
  PERSONA_STYLES,
  PERSONA_GUARD,
  PERSONA_HEADING_GUARD,
  personaStructureRules,
  parsePersonaArticleOutput,
  getPersonaStyle,
} from '@/lib/persona-styles';
import {
  getRemixAngle,
  REMIX_ANGLES,
  FACT_FIDELITY_RULES,
  REWRITE_NOT_COPY_RULES,
  NO_BOOK_CONTEXT_RULES,
  detectBookContext,
  textOverlapRatio,
  KDP_OVERLAP_WARN,
} from '@/lib/kindle-note-remix';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 269: Kindle本 → note記事の多軸展開（章 × ペルソナ × 切り口）。
// - 素材の単位は既存の章（bookId+chapterId）またはインライン章（手動アップロード）＝分割境界をAIに考えさせない
// - 生成エンジンは①の資産を再利用: 9ペルソナ・264構造規約（タイトル3本マーカー分離・note2階層）・PERSONA_HEADING_GUARD
// - 書籍本文は複製せず書き下ろす（§2 KDPセレクト配慮）。事実同一性（§4）はガードとは別に必ず注入
// - 生成後の機械検証（プロンプト遵守に依存しない二段構え・R-26=警告のみ）:
//   書籍文脈の残存（§7）／書籍本文との一致度概算（§2-2・KDPフラグ時に警告強調）
// - 1リクエスト=1記事（②と同じ部分成功方針）。**DBに保存しない**（保存は画面の明示操作のみ）

const MAX_SOURCE_CHARS = 30000;

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const personaKey = typeof body.personaKey === 'string' ? body.personaKey : '';
    if (!(personaKey in PERSONA_STYLES)) {
      return NextResponse.json({ error: 'personaKey が不正です' }, { status: 400 });
    }
    const angleKey = typeof body.angleKey === 'string' ? body.angleKey : '';
    if (!(angleKey in REMIX_ANGLES)) {
      return NextResponse.json({ error: 'angleKey が不正です' }, { status: 400 });
    }
    const persona = getPersonaStyle(personaKey);
    const angle = getRemixAngle(angleKey);
    const kdpSelect = body.kdpSelect === true;
    const aiModel = body.model === 'claude' ? 'claude' : DEFAULT_AI_MODEL;

    // 素材の章: 既存Kindle章（owner検証つき）またはインライン（手動アップロード）
    let bookTitle = String(body.bookTitle ?? '').trim();
    let chapterTitle = '';
    let chapterText = '';
    const bookId = Number(body.bookId);
    const chapterId = Number(body.chapterId);
    if (Number.isFinite(bookId) && Number.isFinite(chapterId)) {
      const sql = neon(process.env.DATABASE_URL!);
      const [row] = (await sql`
        SELECT c.title AS chapter_title, c.content, b.title AS book_title
        FROM kindle_chapters c
        JOIN kindle_books b ON b.id = c.book_id
        WHERE c.id = ${chapterId} AND c.book_id = ${bookId} AND b.user_id = ${userId}
      `) as { chapter_title: string; content: string | null; book_title: string }[];
      if (!row) return NextResponse.json({ error: '章が見つかりません' }, { status: 404 });
      chapterTitle = row.chapter_title || '';
      chapterText = row.content || '';
      bookTitle = bookTitle || row.book_title || '';
    } else {
      const inline = (body.chapter ?? {}) as Record<string, unknown>;
      chapterTitle = String(inline.title ?? '').trim();
      chapterText = String(inline.content ?? '').trim();
    }
    if (!chapterText.trim()) {
      return NextResponse.json({ error: '素材の章（bookId+chapterId または chapter.content）が必要です' }, { status: 400 });
    }

    // 269§9: KB注入（N-06 構成／N-08 無料はWhy・What／N-10 文章体／X-02 シグナル／PART-A）→ ガード後勝ち
    const playbook = getPlaybook(['N-06', 'N-08', 'N-10', 'X-02', 'PART-A']);
    const myStyleBlock = await getMyStylePrompt(userId);

    const system = `あなたは note プラットフォームで読者を惹きつける記事を執筆する優秀なライターです。
医療に関わる内容では医療広告規制（医療法・医療広告ガイドライン／薬機法）に配慮し、以下のNG表現は使いません:
${MEDICAL_AD_NG_RULES}

${NOTE_COMMON_RULES}`;

    const prompt = `以下のKindle書籍の1章をテーマの素材として、指定された読者ペルソナ・切り口で note 記事を**書き下ろして**ください。

# 発信ナレッジ（note×X運用ナレッジベース v${PLAYBOOK_VERSION} より抜粋）
${playbook}

# ナレッジとガードの優先順位（最重要・厳守）
上のナレッジと以下のガード・規約が衝突する場合は、**必ずガード・規約を優先**する。
- 「常識の否定」は主語を「過去の自分の理解」に限定（一般論・他者・他院を否定しない）
- Before/Afterの主語は自分に限定（患者・症例を主語にしない）
- 数字は手順・時間・件数のみ（効果の数値化・成果の断定は禁止）
- 「知らないと危険」「知らないと損」型の煽り禁止

${FACT_FIDELITY_RULES}

${REWRITE_NOT_COPY_RULES}

${NO_BOOK_CONTEXT_RULES}

${persona.promptBlock}

${PERSONA_GUARD}

${PERSONA_HEADING_GUARD}

${angle.promptBlock}
${myStyleBlock ? `\n${myStyleBlock}\n` : ''}
${personaStructureRules('3〜5本')}

# 記事の型（269・この配分で組む）
1. リード文（150〜250字・見出しなし）: **この記事だけで完結する**問題提起
2. Why（全体の約30%）: なぜその問題が起きるか
3. What（全体の約40%）: 解決の全体像
4. 小さな一歩（全体の約15%）: 今日できること1つ
5. 書籍への導線（全体の約15%）: 「具体的な手順・実践の詳細は書籍にまとめてある」ことを自然に伝える
${bookTitle ? `   - 書籍名は『${bookTitle}』。煽らず、読みたい人だけが進める丁寧な導線にする` : '   - 書籍名は伏せて「書籍」とだけ書く（画面側で追記する）'}

# 記事の長さ
本文2,000〜3,000字（必ず最後まで書ききる）

# 素材（テーマと事実関係の根拠はこの章のみ。本文は複製しない）
## 章「${chapterTitle || '無題'}」
${chapterText.slice(0, MAX_SOURCE_CHARS)}`;

    const raw = await generateWithModel(aiModel, prompt, system, 10000, GEMINI_TEXT_THINKING_MEDIUM);
    if (!raw || !raw.trim()) {
      return NextResponse.json({ error: '記事の生成結果が空でした。もう一度お試しください' }, { status: 502 });
    }

    const { titles, body: articleBody } = parsePersonaArticleOutput(raw);

    // 機械検証（警告のみ・自動修正しない）
    const contextHits = detectBookContext(articleBody);
    const overlapRatio = textOverlapRatio(articleBody, chapterText);
    const adCheck = await checkMedicalAd(articleBody);

    return NextResponse.json({
      success: true,
      content: articleBody,
      titles,
      ad_check: adCheck,
      contextHits,
      overlapRatio: Math.round(overlapRatio * 1000) / 1000,
      overlapWarn: overlapRatio >= KDP_OVERLAP_WARN,
      kdpSelect,
      personaKey: persona.key,
      personaLabel: persona.label,
      angleKey: angle.key,
      angleLabel: angle.label,
      chapterTitle,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[kindle/note-remix] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
