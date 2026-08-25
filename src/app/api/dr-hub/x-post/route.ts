import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '@/lib/require-auth';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { generateTextWithFallback } from '@/lib/ai-fallback';
import { MEDICAL_AD_NG_RULES } from '@/lib/medical-ad-check';
import { PERSONA_STYLES, getPersonaStyle } from '@/lib/persona-styles';
import { getPlaybook, PLAYBOOK_VERSION } from '@/lib/knowledge/noteXPlaybook';
import {
  X_HARD_LIMIT,
  X_LENGTH_CONFIG,
  getXPostType,
  validateXPost,
  type XLength,
  type XPostWarning,
} from '@/lib/x-post-rules';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 261③→265c: note記事と連動したX投稿の生成（KB v2.0準拠）。
// - POST { articleId | article:{title,content}, drId?, threadCount:2〜5, xLength:'short'|'mini'|'long',
//          postType:'knowhow'|'story'|'debate'|'insight'|'infographic', personaKey? }
//   → 単発ポスト（既定=1,000〜2,000字のミニ講義型）＋スレッド＋URLリプライ用の一文を1回のAI呼び出しで生成
// - v2の設計目標: 「いいね」ではなく共有シグナル（URLコピー/DM共有=約40倍相当）を狙う
// - URLは本文に入れない（1つ目のリプライへ＝X-03/XP-04/C-02。生成でも検証でも守る）
// - 機械検証（x-post-rules.ts）: 文字数超過のみ1回自動再生成、それ以外は警告を返して画面表示
// - 生成のみで**DBに保存しない**（保存は /api/dr-hub/x-post/save）。自動投稿はしない（コピペ運用）

const MAX_SOURCE_CHARS = 20000;

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
    const xLength: XLength =
      body.xLength === 'short' || body.xLength === 'long' ? body.xLength : 'mini'; // 既定=ミニ講義（v2）
    const lengthConf = X_LENGTH_CONFIG[xLength];
    const postType = getXPostType(body.postType);
    const persona =
      typeof body.personaKey === 'string' && body.personaKey in PERSONA_STYLES
        ? getPersonaStyle(body.personaKey)
        : null;

    // 265c: KB v2.0 の③用の章を注入（X-02〜X-09・XP-04・PART-A）
    const playbook = getPlaybook(['X-02', 'X-03', 'X-04', 'X-05', 'X-06', 'X-07', 'X-08', 'X-09', 'XP-04', 'PART-A']);

    const system = `あなたはX（旧Twitter）で専門職の読者に価値を届けるSNS編集者です。
渡されたnote記事への導線となる投稿を作ってください。

# 発信ナレッジ（note×X運用ナレッジベース v${PLAYBOOK_VERSION} より抜粋）
${playbook}

# 設計の評価軸（v2・最重要）
「いいね」を狙わない。**共有シグナル（URLコピー・DM共有＝いいねの約40倍相当）**を最優先に、
「保存したくなる知識」「誰かに教えたくなる情報」「意見を言いたくなる問いかけ」のいずれかになっているかで設計する。
教えたくなる粒度＝特定の職種・立場に刺さる具体性（個人宛に転送したくなるレベルまで絞る）。

${postType.promptBlock}
${persona ? `\n# 想定読者\n${persona.label}（${persona.hint}）に届く切り口・語りかけにする\n` : ''}
# ナレッジとガードの優先順位（最重要・厳守）
上のナレッジと以下のガードが衝突する場合は、**必ずガードを優先**する。
- 医療広告規制のNG表現を使わない:
${MEDICAL_AD_NG_RULES}
- 「常識の否定」フックは主語を「過去の自分の理解」に限定（一般論・他者・他院を否定しない）
- Before/Afterの主語は自分に限定（患者・症例を主語にしない）
- 「〜しないと危険」「知らないと損する」型の煽り禁止
- 効果の数値化禁止（数字は手順・時間・件数・項目数のみ）
- 記事にない事実・数値・出典を書かない

# 構成と体裁（厳守）
- 構成は Hook → Before → Solution → After → CTA（X-04のv2版）
- 1行目フックは冒頭30〜40字で読者のスクロールを止める
- 1文は40〜60字。**2〜3行ごとに空白行**を入れる。「・」「①②③」「▼」で箇条書き化
- 論理と感情を必ず両方入れる
- **URLそのものは本文に一切書かない**（URLは1つ目のリプライに置く運用）
- ハッシュタグは0〜2個まで（Xのスパム判定回避）

# 作るもの（すべて）
1. single: 単発ポスト1本。長さは**${lengthConf.label.replace('（既定）', '')}（${lengthConf.chars}）**
2. thread: ${threadCount}ポストのスレッド。1本目=フック＋本文の核、中間=要点の展開、最終=まとめ＋CTA。
   各ポストは読みやすい長さに（番号は付けない・画面側で付ける）
3. urlReplyLeadin: 1つ目のリプライに記事URLと一緒に置く導線の一文（30字以内。例:「本文で触れた記事の全文はこちらです」）

必ず以下のJSON形式のみを返してください（前置き・コードフェンス不要）:
{"single": "…", "thread": ["…", "…"], "urlReplyLeadin": "…"}`;

    const userMessage = `以下のnote記事「${title}」への導線となるX投稿を作ってください。\n\n--- 記事 ---\n${content.slice(0, MAX_SOURCE_CHARS)}\n--- ここまで ---`;

    const generate = async (extraInstruction = '') => {
      const ai = await generateTextWithFallback({
        system: extraInstruction ? `${system}\n\n${extraInstruction}` : system,
        maxTokens: lengthConf.maxTokens,
        messages: [{ role: 'user', content: userMessage }],
      });
      const parsed = robustJsonParse<{ single?: unknown; thread?: unknown; urlReplyLeadin?: unknown }>(ai.text);
      return {
        single: String(parsed?.single ?? '').trim(),
        thread: (Array.isArray(parsed?.thread) ? parsed.thread : [])
          .map((t) => String(t).trim())
          .filter(Boolean)
          .slice(0, 5),
        urlReplyLeadin: String(parsed?.urlReplyLeadin ?? '').trim().slice(0, 60),
        _ai: { provider: ai.provider, modelLabel: ai.modelLabel },
      };
    };

    let result = await generate();
    // 機械検証①: 25,000字（投稿不能）超過のみ**1回だけ自動再生成**（それ以外は警告表示に留める）
    const overLimit = (r: typeof result) =>
      r.single.length > X_HARD_LIMIT || r.thread.some((t) => t.length > X_HARD_LIMIT);
    if (overLimit(result)) {
      result = await generate(`# 再生成の追加指示\n前回の出力が長すぎました。各ポストを必ず${X_HARD_LIMIT}字未満に収めてください。`);
    }

    // fail-closed: どちらも取れないなら失敗として返す
    if (!result.single && result.thread.length === 0) {
      return NextResponse.json({ error: 'X投稿を生成できませんでした（再試行してください）' }, { status: 500 });
    }

    // 機械検証②: 警告リスト（表示のみ・自動修正しない＝R-26）
    const warnings: Record<string, XPostWarning[]> = {};
    if (result.single) warnings.single = validateXPost(result.single, { media: 'x', isFirstPost: true });
    result.thread.forEach((t, i) => {
      warnings[`thread-${i}`] = validateXPost(t, { media: 'x', isFirstPost: i === 0 });
    });
    if (overLimit(result)) {
      (warnings.single ??= []).push({
        code: 'over-limit',
        message: `再生成後も${X_HARD_LIMIT}字を超えています。手動で再生成するか短い長さプリセットを選んでください`,
      });
    }

    return NextResponse.json({
      success: true,
      single: result.single,
      thread: result.thread,
      urlReplyLeadin: result.urlReplyLeadin || '本文で触れた記事の全文はこちらです',
      warnings,
      xLength,
      postType: body.postType && typeof body.postType === 'string' ? body.postType : 'knowhow',
      charLimit: X_HARD_LIMIT,
      _ai: result._ai,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[dr-hub/x-post] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
