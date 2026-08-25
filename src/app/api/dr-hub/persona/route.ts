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
import { getMyStylePrompt } from '@/lib/my-style-server';
import {
  PERSONA_STYLES,
  PERSONA_GUARD,
  PERSONA_COMPARE_MIN,
  PERSONA_COMPARE_MAX,
  getPersonaStyle,
  type PersonaStyleKey,
} from '@/lib/persona-styles';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 261①: DR記事 → ペルソナ別note記事（236テイスト変換の2段階方式を踏襲）。
// - POST { drId, mode:'samples', personaKeys[] } → 選んだ2〜4ペルソナの冒頭サンプルを**1回のAI呼び出し**で生成
// - POST { drId, mode:'full', personaKey, length, model } → その1ペルソナで記事全文を生成
// **どちらもDBに保存しない**（保存は画面の SaveToLibraryButton＝明示操作のみ。R-38と同方針）。
// 品質規約は note系（NOTE_COMMON_RULES + NOTE_WRITING_DESIGN + MEDICAL_AD_NG_RULES）＋ PERSONA_GUARD。
// マイ文体は full のみ注入（優先順位: 画面指定＝ペルソナ ＞ マイ文体 ＞ プリセット。my-style.ts の宣言どおり）。

const SAMPLE_SOURCE_CHARS = 6000; // サンプル生成に渡すDR記事の冒頭（全文を渡すとコスト・時間が無駄）
const FULL_SOURCE_CHARS = 60000; // 全文生成に渡す上限（DR記事は長大になり得るため防御的に切る）

type Length = 'short' | 'medium' | 'long';
const LENGTH_CONFIG: Record<Length, { label: string; chars: string }> = {
  short: { label: '短め', chars: '1500〜2500字' },
  medium: { label: '標準', chars: '3000〜4500字' },
  long: { label: '長め', chars: '5000〜7000字' },
};

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const drId = typeof body.drId === 'string' ? body.drId.trim() : '';
    const mode = body.mode === 'full' ? 'full' : 'samples';
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

    return mode === 'samples'
      ? await generateSamples(body.personaKeys, dr.title, content)
      : await generateFullArticle(body, userId, dr.title, content);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[dr-hub/persona] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── 段階1: 選んだペルソナの冒頭サンプルを1回で生成（読み比べて選ぶための材料） ──
async function generateSamples(personaKeysRaw: unknown, title: string, content: string) {
  const keys = (Array.isArray(personaKeysRaw) ? personaKeysRaw : [])
    .map((k) => String(k))
    .filter((k): k is PersonaStyleKey => k in PERSONA_STYLES);
  const unique = [...new Set(keys)];
  if (unique.length < PERSONA_COMPARE_MIN || unique.length > PERSONA_COMPARE_MAX) {
    return NextResponse.json(
      { error: `読み比べるペルソナは${PERSONA_COMPARE_MIN}〜${PERSONA_COMPARE_MAX}件で選んでください` },
      { status: 400 },
    );
  }

  const excerpt = content.slice(0, SAMPLE_SOURCE_CHARS);
  const personaBlocks = unique.map((k) => `## ${k}\n${PERSONA_STYLES[k].promptBlock}`).join('\n\n');

  const system = `あなたは note プラットフォームで読者を惹きつける記事を執筆する優秀なライターです。
渡されたディープリサーチ記事をもとに、指定された複数の読者ペルソナそれぞれに向けた「note記事の冒頭部分」を書き、
著者が読み比べて選べるサンプルを作ってください。

# ペルソナの定義
${personaBlocks}

${PERSONA_GUARD}

# 医療広告規制のNG表現（使わない）
${MEDICAL_AD_NG_RULES}

# サンプルの作り方
- 各ペルソナとも、記事の冒頭（導入〜本題の入り口）を**500〜800字**で書く
- ペルソナごとの違いが読み比べて分かるように、語りかけ方・切り口の特徴をはっきり出す
- 内容の根拠は渡された資料の記述のみ。ペルソナを出すために事実を足さない
- 見出しは使わず、記事の書き出しとして自然な文章にする

必ず以下のJSON形式のみを返してください（前置き・コードフェンス不要）:
{"samples": {${unique.map((k) => `"${k}": "…"`).join(', ')}}}`;

  const ai = await generateTextWithFallback({
    system,
    maxTokens: 12000,
    messages: [
      {
        role: 'user',
        content: `以下はディープリサーチ記事「${title}」の冒頭です。各ペルソナ向けのnote記事冒頭サンプルを作ってください。\n\n--- DR記事（冒頭抜粋） ---\n${excerpt}\n--- ここまで ---`,
      },
    ],
  });

  const parsed = robustJsonParse<{ samples?: Record<string, unknown> }>(ai.text);
  const samples: Record<string, string> = {};
  for (const k of unique) {
    const s = String(parsed?.samples?.[k] ?? '').trim();
    if (s) samples[k] = s;
  }
  // fail-closed: 1件も取れないなら失敗として返す（空のカードを並べない）
  if (Object.keys(samples).length === 0) {
    return NextResponse.json({ error: 'サンプルを生成できませんでした（再試行してください）' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    samples,
    _ai: { provider: ai.provider, modelLabel: ai.modelLabel },
  });
}

// ── 段階2: 選ばれた1ペルソナで記事全文を生成（保存しない） ──
async function generateFullArticle(
  body: { personaKey?: unknown; length?: unknown; model?: unknown },
  userId: string,
  title: string,
  content: string,
) {
  if (typeof body.personaKey !== 'string' || !(body.personaKey in PERSONA_STYLES)) {
    return NextResponse.json({ error: 'personaKey が不正です' }, { status: 400 });
  }
  const persona = getPersonaStyle(body.personaKey);
  const length: Length = body.length === 'short' || body.length === 'long' ? body.length : 'medium';
  const config = LENGTH_CONFIG[length];
  const aiModel = body.model === 'claude' ? 'claude' : DEFAULT_AI_MODEL;

  // 228c: マイ文体（未設定・無効・失敗は空文字＝従来どおり）
  const myStyleBlock = await getMyStylePrompt(userId);

  const system = `あなたは note プラットフォームで読者を惹きつける記事を執筆する優秀なライターです。SEO・心理学・マーケティングの知識を駆使しつつ、読者の心に響く文章を生成してください。
医療に関わる内容では医療広告規制（医療法・医療広告ガイドライン／薬機法）に配慮し、以下のNG表現は使いません:
${MEDICAL_AD_NG_RULES}

${NOTE_COMMON_RULES}`;

  const prompt = `以下のディープリサーチ記事をもとに、指定された読者ペルソナに向けた note 記事を執筆してください。内容は「参照資料」の記述だけを根拠にします。

${persona.promptBlock}

${PERSONA_GUARD}
${myStyleBlock ? `\n${myStyleBlock}\n` : ''}
${NOTE_WRITING_DESIGN}

# 記事の長さ
${config.label}（${config.chars}）

# 参照資料（記事の根拠はこの資料の記述のみ）
## ${title}
${content.slice(0, FULL_SOURCE_CHARS)}

# 記事の構成
- 導入: このペルソナの関心・悩みに寄り添う問題提起や語りかけ
- 本論: 構造化された見出し・小見出し（## / ###）で、要点を資料に基づいて展開
- 結論: 読者へのメッセージ・次の一歩で締めくくる

# 出力形式
- Markdown 形式（先頭に # タイトルを置く。記事タイトルは読者の興味を引く30〜40字で新規に作る。前置き・コードフェンス不要）
- 適度に箇条書きを使用

# 厳守事項
- ${config.chars} の範囲内で、必ず最後の結論まで書ききる
- 根拠は参照資料の記述のみ。資料に無い出典・数値・固有の研究名を新たに書かない
- AI らしい不自然な文章を避け、人間が書いたような自然な文体に`;

  // 記事本文＝品質優先で medium を明示（claude時は geminiGenerationConfig は無視される）
  const article = await generateWithModel(aiModel, prompt, system, 12000, GEMINI_TEXT_THINKING_MEDIUM);
  if (!article || !article.trim()) {
    return NextResponse.json({ error: '記事の生成結果が空でした。もう一度お試しください' }, { status: 502 });
  }

  const adCheck = await checkMedicalAd(article);

  return NextResponse.json({
    success: true,
    content: article,
    ad_check: adCheck,
    personaKey: persona.key,
    personaLabel: persona.label,
  });
}
