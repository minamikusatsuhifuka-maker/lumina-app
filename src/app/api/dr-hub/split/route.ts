import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireAuth } from '@/lib/require-auth';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { generateTextWithFallback } from '@/lib/ai-fallback';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_MEDIUM, DEFAULT_AI_MODEL } from '@/lib/ai-models';
import { checkMedicalAd, MEDICAL_AD_NG_RULES } from '@/lib/medical-ad-check';
import { NOTE_COMMON_RULES } from '@/lib/note-styles';
import { NOTE_WRITING_DESIGN } from '@/lib/note-writing';
import { KINDLE_PROOFREAD_PRINCIPLES } from '@/lib/kindle-proofread';
import { getMyStylePrompt } from '@/lib/my-style-server';
import { PERSONA_STYLES, PERSONA_GUARD, getPersonaStyle } from '@/lib/persona-styles';
import { getPlaybook, PLAYBOOK_VERSION } from '@/lib/knowledge/noteXPlaybook';
import { loadEpisodePromptBlock } from '@/lib/episodes-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 261②: DR記事の分割記事化（マーケ要素込み）。
// - POST { drId, mode:'plan', count: 1〜5|'auto', personaKey? } → 分割プランを**1回のAI呼び出し**で提案
//   （記事間の導線設計＝第1記事で問題提起→続きへの興味／最終記事でCTA、を10原則に基づいて組む）
// - POST { drId, mode:'article', article:{...}, series:{...}, personaKey?, length?, model? } → プランの1記事分を生成
//   （note-bundle と同じ「1リクエスト=1記事・部分成功」方針）
// **どちらもDBに保存しない**（保存は画面の SaveToLibraryButton＝明示操作のみ）。
// ガード: note系規約（NOTE_COMMON_RULES + NOTE_WRITING_DESIGN + MEDICAL_AD_NG_RULES）を全段で緩めない。
// NOTE_WRITING_DESIGN に誇張・不安煽り・受診誘導の禁止が入っており、CTAもこの範囲で作らせる。

const MAX_SPLIT = 5;
const PLAN_SOURCE_CHARS = 30000; // プラン提案に渡す上限（構成把握には全文は不要）
const FULL_SOURCE_CHARS = 60000; // 記事生成に渡す上限

type Length = 'short' | 'medium' | 'long';
const LENGTH_CONFIG: Record<Length, { label: string; chars: string }> = {
  short: { label: '短め', chars: '1500〜2500字' },
  medium: { label: '標準', chars: '3000〜4500字' },
  long: { label: '長め', chars: '5000〜7000字' },
};

// シリーズ設計の共通指示（プラン・記事生成の両方に差し込む）
const SERIES_DESIGN_RULES = `# シリーズ設計（マーケティング・行動心理学・ローンチの基本）
- 第1記事: 読者の問題・関心を具体的に言語化して提起し、シリーズで何が分かるかを予告する（続きを読みたくなる引きで締める）
- 中間記事: 前の記事の要点に短く触れてから本題に入り、末尾で次の記事への興味づけをする
- 最終記事: シリーズ全体を短く振り返り、読者の「次の行動」を1つ示して締める（CTA）
- CTAは誠実な範囲のみ: 今日からできる行動・関連テーマをさらに知る・フォローする 等。受診誘導・商品購入の圧力・限定性の演出は禁止
- 各記事は単体でも読み切れるようにする（前の記事を読んでいなくても内容が分かる）

# 効果的表現の観点（以下の原則を構成に活かす。誇張・不安煽りは禁止）
${KINDLE_PROOFREAD_PRINCIPLES}`;

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const drId = typeof body.drId === 'string' ? body.drId.trim() : '';
    const mode = body.mode === 'article' ? 'article' : 'plan';
    if (!drId) {
      return NextResponse.json({ error: 'drId（DR記事のID）が必要です' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const [dr] = (await sql`
      SELECT id, title, content FROM library
      WHERE id = ${drId} AND user_id = ${userId} AND type = 'deepresearch'
    `) as { id: string; title: string; content: string | null }[];
    if (!dr) return NextResponse.json({ error: 'DR記事が見つかりません' }, { status: 404 });
    const content = dr.content || '';
    if (!content.trim()) return NextResponse.json({ error: 'DR記事の本文が空です' }, { status: 400 });

    return mode === 'plan'
      ? await generatePlan(body, dr.title, content)
      : await generateArticle(body, userId, dr.title, content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[dr-hub/split] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface PlanArticle {
  title: string;
  role: string;
  /** 265c: この記事の対象読者を1行で（N-03「ターゲットの極小化」） */
  audience: string;
  points: string[];
  bridge: string;
  principles: string[];
}

// 265c: ②に注入するKB章（N-03 テーマ選定と1記事1テーマ／N-06 構成／C-02 X→note導線／PART-A 専門領域補正）
const SPLIT_PLAYBOOK_IDS = ['N-03', 'N-06', 'C-02', 'PART-A'];

// ナレッジ→ガードの後勝ち原則（§4。KBの拡散セオリーより医療広告ガードを必ず優先）
const KB_GUARD_PRECEDENCE = `# ナレッジとガードの優先順位（最重要・厳守）
上のナレッジと医療広告ガード・誇張禁止の規約が衝突する場合は、**必ずガードを優先**する。
- 「常識の否定」は主語を「過去の自分の理解」に限定（一般論・他者・他院を否定しない）
- Before/Afterの主語は自分に限定（患者・症例を主語にしない）
- 「〜しないと危険」「知らないと損する」型の煽り禁止
- 数字は手順・時間・件数・項目数にのみ使う（効果の数値化は禁止）`;

// ── 段階1: 分割プランの提案（1回のAI呼び出し） ──
async function generatePlan(
  body: { count?: unknown; personaKey?: unknown },
  title: string,
  content: string,
) {
  const countRaw = body.count;
  const fixedCount =
    typeof countRaw === 'number' && Number.isInteger(countRaw) && countRaw >= 1 && countRaw <= MAX_SPLIT
      ? countRaw
      : null; // null = AIおまかせ（1〜5で提案）
  const persona =
    typeof body.personaKey === 'string' && body.personaKey in PERSONA_STYLES
      ? getPersonaStyle(body.personaKey)
      : null;

  const system = `あなたは note の連載記事を設計する編集者です。渡されたディープリサーチ記事を、note記事のシリーズへ分割するプランを提案してください。

# 発信ナレッジ（note×X運用ナレッジベース v${PLAYBOOK_VERSION} より抜粋）
${getPlaybook(SPLIT_PLAYBOOK_IDS)}

${KB_GUARD_PRECEDENCE}

${SERIES_DESIGN_RULES}
${persona ? `\n${persona.promptBlock}\n` : ''}
# プランの作り方
- **1記事1テーマの原則**（N-03）: 1本の記事に複数テーマを詰め込まない。テーマが混ざるなら分割数を増やす
- ${fixedCount ? `記事数はちょうど${fixedCount}本にする` : `記事数は素材の量と話題のまとまりから1〜${MAX_SPLIT}本で最適な数を選ぶ`}
- recommendedCount には、素材から見て最適と考える記事数（1〜${MAX_SPLIT}）とその理由を入れる
- 各記事の title は読者の興味を引く30〜40字。「ターゲットの明確化」「具体的ベネフィット」「手軽さ・再現性」「一次情報の明示」を織り込む（数字は手順・件数のみ）
- audience は**その記事の対象読者を1行で**（N-03「ターゲットの極小化」: 「〜で悩む〜な人」まで絞る）
- role はシリーズ内での役割（第1記事=問題提起 等）を1行で
- points は素材にある内容から選ぶ（素材に無い話題を立てない）。1記事あたり3〜6個
- bridge はその記事の末尾に置く「次への導線」の設計を1行で（最終記事は締めのCTA設計）
- principles は活かす原則の名前を1〜3個（上記の観点リストから）

必ず以下のJSON形式のみを返してください（前置き・コードフェンス不要）:
{"recommendedCount": 数値, "reason": "…", "articles": [{"title": "…", "role": "…", "audience": "…", "points": ["…"], "bridge": "…", "principles": ["…"]}]}`;

  const ai = await generateTextWithFallback({
    system,
    maxTokens: 8000,
    messages: [
      {
        role: 'user',
        content: `以下のディープリサーチ記事「${title}」を分割するプランを提案してください。\n\n--- DR記事 ---\n${content.slice(0, PLAN_SOURCE_CHARS)}\n--- ここまで ---`,
      },
    ],
  });

  const parsed = robustJsonParse<{
    recommendedCount?: unknown;
    reason?: unknown;
    articles?: unknown;
  }>(ai.text);

  const articles: PlanArticle[] = (Array.isArray(parsed?.articles) ? parsed.articles : [])
    .slice(0, MAX_SPLIT)
    .map((a: Record<string, unknown>) => ({
      title: String(a?.title ?? '').trim(),
      role: String(a?.role ?? '').trim(),
      audience: String(a?.audience ?? '').trim(),
      points: (Array.isArray(a?.points) ? a.points : []).map((p) => String(p).trim()).filter(Boolean).slice(0, 8),
      bridge: String(a?.bridge ?? '').trim(),
      principles: (Array.isArray(a?.principles) ? a.principles : []).map((p) => String(p).trim()).filter(Boolean).slice(0, 3),
    }))
    .filter((a) => a.title);

  // fail-closed: プランが1本も取れないなら失敗として返す
  if (articles.length === 0) {
    return NextResponse.json({ error: '分割プランを生成できませんでした（再試行してください）' }, { status: 500 });
  }
  // 記事数を固定指定した場合はその数に切り揃える（多すぎる分は落とす。少なければそのまま返して画面で分かるように）
  const finalArticles = fixedCount ? articles.slice(0, fixedCount) : articles;

  const rc = Number(parsed?.recommendedCount);
  return NextResponse.json({
    success: true,
    recommendedCount: Number.isInteger(rc) && rc >= 1 && rc <= MAX_SPLIT ? rc : finalArticles.length,
    reason: String(parsed?.reason ?? '').trim(),
    articles: finalArticles,
    _ai: { provider: ai.provider, modelLabel: ai.modelLabel },
  });
}

// ── 段階2: プランの1記事分を生成（1リクエスト=1記事・保存しない） ──
async function generateArticle(
  body: {
    article?: unknown;
    series?: unknown;
    personaKey?: unknown;
    length?: unknown;
    model?: unknown;
    episodeIds?: unknown; // 281
  },
  userId: string,
  title: string,
  content: string,
) {
  const a = (body.article ?? {}) as Record<string, unknown>;
  const articleTitle = String(a.title ?? '').trim();
  if (!articleTitle) {
    return NextResponse.json({ error: 'article.title（記事タイトル）が必要です' }, { status: 400 });
  }
  const role = String(a.role ?? '').trim();
  const audience = String(a.audience ?? '').trim();
  const points = (Array.isArray(a.points) ? a.points : []).map((p) => String(p).trim()).filter(Boolean).slice(0, 8);
  const bridge = String(a.bridge ?? '').trim();

  const s = (body.series ?? {}) as Record<string, unknown>;
  const index = Number(s.index);
  const total = Number(s.total);
  const seriesValid =
    Number.isInteger(index) && Number.isInteger(total) && index >= 1 && total >= 1 && index <= total && total <= MAX_SPLIT;
  const prevTitle = String(s.prevTitle ?? '').trim();
  const nextTitle = String(s.nextTitle ?? '').trim();

  const persona =
    typeof body.personaKey === 'string' && body.personaKey in PERSONA_STYLES
      ? getPersonaStyle(body.personaKey)
      : null;
  const length: Length = body.length === 'short' || body.length === 'long' ? body.length : 'medium';
  const config = LENGTH_CONFIG[length];
  const aiModel = body.model === 'claude' ? 'claude' : DEFAULT_AI_MODEL;

  const myStyleBlock = await getMyStylePrompt(userId);
  // 281: 著者の実体験エピソード（episodeIds を送ったときだけ・R-88／R-75の規約つき）
  const episode = await loadEpisodePromptBlock(userId, body.episodeIds);

  const system = `あなたは note プラットフォームで読者を惹きつける連載記事を執筆する優秀なライターです。SEO・心理学・マーケティングの知識を駆使しつつ、読者の心に響く文章を生成してください。
医療に関わる内容では医療広告規制（医療法・医療広告ガイドライン／薬機法）に配慮し、以下のNG表現は使いません:
${MEDICAL_AD_NG_RULES}

${NOTE_COMMON_RULES}`;

  const seriesSection = seriesValid
    ? `# シリーズ内の位置
- この記事はシリーズ全${total}本の第${index}記事
${prevTitle ? `- 前の記事:「${prevTitle}」（冒頭で要点に短く触れてから本題に入る）` : ''}
${nextTitle ? `- 次の記事:「${nextTitle}」（末尾で次の記事への興味づけをする）` : '- これが最終記事（シリーズ全体を短く振り返り、次の行動を1つ示して締める）'}
`
    : '';

  const prompt = `以下のプランに基づいて、シリーズの1記事分の note 記事を執筆してください。内容は「参照資料」の記述だけを根拠にします。

# 発信ナレッジ（note×X運用ナレッジベース v${PLAYBOOK_VERSION} より抜粋）
${getPlaybook(SPLIT_PLAYBOOK_IDS)}

${KB_GUARD_PRECEDENCE}

# 記事タイトル
${articleTitle}
${role ? `\n# この記事の役割\n${role}\n` : ''}${audience ? `\n# この記事の対象読者（1記事1テーマ・この読者だけに向けて書く）\n${audience}\n` : ''}${points.length ? `\n# この記事に盛り込む要点\n${points.map((p) => `- ${p}`).join('\n')}\n` : ''}${bridge ? `\n# 末尾の導線設計\n${bridge}\n` : ''}
${seriesSection}
${SERIES_DESIGN_RULES}
${persona ? `\n${persona.promptBlock}\n\n${PERSONA_GUARD}\n` : ''}${myStyleBlock ? `\n${myStyleBlock}\n` : ''}
${NOTE_WRITING_DESIGN}

# 記事の長さ
${config.label}（${config.chars}）

# 参照資料（記事の根拠はこの資料の記述のみ）
## ${title}
${content.slice(0, FULL_SOURCE_CHARS)}
${episode.block ? `\n${episode.block}\n` : ''}
# 出力形式
- Markdown 形式（先頭に # ${articleTitle} を置く。前置き・コードフェンス不要）
- 構造化された見出し・小見出し（## / ###）と適度な箇条書き

# 厳守事項
- ${config.chars} の範囲内で、必ず最後の結論まで書ききる
- 根拠は参照資料の記述のみ。資料に無い出典・数値・固有の研究名を新たに書かない${episode.block ? '\n- 実体験エピソードは「記録どおり」に使う。記録にない出来事・数字・感情を足さない（R-75）' : ''}
- AI らしい不自然な文章を避け、人間が書いたような自然な文体に`;

  const article = await generateWithModel(aiModel, prompt, system, 12000, GEMINI_TEXT_THINKING_MEDIUM);
  if (!article || !article.trim()) {
    return NextResponse.json({ error: '記事の生成結果が空でした。もう一度お試しください' }, { status: 502 });
  }

  const adCheck = await checkMedicalAd(article);

  return NextResponse.json({
    success: true,
    content: article,
    ad_check: adCheck,
    index: seriesValid ? index : null,
  });
}
