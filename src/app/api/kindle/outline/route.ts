import { anthropicFetch } from '@/lib/anthropic-compat';
import { CLAUDE_TEXT_MODEL } from '@/lib/ai-models';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { extractAnthropicText } from '@/lib/anthropic-text';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { assertAnthropicOk } from '@/lib/anthropic-error';
import { generateTextWithFallback } from '@/lib/ai-fallback';
import {
  fetchKindleMaterials,
  validateKindleMaterialLimits,
  excerptForOutline,
  kindleMaterialLabel,
  hasNoteMaterials,
  KINDLE_NOTE_SOURCE_RULES,
  hasAnalysisMaterials,
  KINDLE_ANALYSIS_SOURCE_RULES,
} from '@/lib/kindle-materials';
import { getKindlePurpose, KINDLE_COMMON_RULES } from '@/lib/kindle-purposes';
import { getKindleStyle } from '@/lib/kindle-styles';

export const runtime = 'nodejs';
export const maxDuration = 180;

// 222: 分量プリセット（追加はここに定義する）。225cで standard 解禁
const WIZARD_PRESETS: Record<string, { label: string; chapterRange: string; charsPerChapter: string }> = {
  leadmagnet: {
    label: 'リードマグネット（登録プレゼント・2〜3万字）',
    chapterRange: '6〜8章',
    charsPerChapter: '3500〜4000',
  },
  standard: {
    label: '標準Kindle本（5〜8万字）',
    chapterRange: '12〜16章',
    charsPerChapter: '4200〜5000',
  },
};

const BOOK_TYPE_GUIDES: Record<string, string> = {
  guide: `解説書・ガイドブック構成:
- 各章は「導入→解説→具体例→まとめ」の流れ
- 読者がすぐ実践できるアクションポイントを含める
- 図解・チェックリストの挿入箇所を提案
- 専門用語には必ず噛み砕いた説明を付ける`,
  novel: `小説・フィクション構成:
- 起承転結を意識した章立て
- キャラクター設定と心理描写を重視
- 各章末にクリフハンガー（引き）を入れる
- 伏線の配置と回収を計画的に`,
  picture: `絵本構成:
- 1見開き＝1シーン（テキスト＋イラスト指示）
- 文字数は1ページ50〜100文字以内
- 繰り返し表現やリズム感のある文体
- 各ページに具体的なイラスト指示を付ける`,
  puzzle: `パズル・クイズ本構成:
- テーマ別にカテゴリ分け
- 難易度のグラデーション（初級→中級→上級）
- 各問題に解説ページを対応させる
- 巻末に解答一覧を配置`,
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', { status: 401 });

  const { title, bookType, theme, targetReader, chapterCount, pageCount, sourceIds, purposeKey, styleKey, preset } =
    await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  // 222: sourceIds 指定時はウィザード経路（素材束ね＋目的×文体＋分量プリセット）。
  // 未指定なら従来経路そのまま（完全後方互換＝スタジオからの呼び出しに影響なし）。
  if (Array.isArray(sourceIds) && sourceIds.length > 0) {
    return wizardOutline({
      userId: (session.user as any).id,
      apiKey,
      sourceIds,
      purposeKey,
      styleKey,
      preset,
      theme,
    });
  }

  if (!title) {
    return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 });
  }

  const typeGuide = BOOK_TYPE_GUIDES[bookType] || BOOK_TYPE_GUIDES.guide;

  try {
    const response = await anthropicFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_TEXT_MODEL,
        max_tokens: 8000,
        system: `あなたはKindle出版の専門プロデューサーです。
与えられた情報をもとに、Amazon KDPで出版するための本の構成案を作成してください。

書籍タイプ別のガイド:
${typeGuide}

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "book_title": "正式な書籍タイトル",
  "subtitle": "サブタイトル",
  "tagline": "キャッチコピー（1行）",
  "target_reader": "ターゲット読者の具体的な描写",
  "unique_value": "この本ならではの価値・差別化ポイント",
  "chapters": [
    {
      "chapter_num": 1,
      "title": "章タイトル",
      "summary": "章の概要（100〜200文字）",
      "key_points": ["ポイント1", "ポイント2", "ポイント3"],
      "estimated_pages": 10,
      "illustration_note": "この章で使うイラスト・図解の提案"
    }
  ],
  "foreword_outline": "まえがきの概要",
  "afterword_outline": "あとがきの概要",
  "cover_text": {
    "front": "表紙に載せるテキスト",
    "back": "裏表紙の紹介文（150文字程度）",
    "author_bio": "著者プロフィール文"
  },
  "kdp_keywords": ["キーワード1", "キーワード2", "...（7つ）"],
  "kdp_categories": ["カテゴリ1", "カテゴリ2"],
  "estimated_total_pages": 100,
  "pricing_suggestion": "推奨価格とその理由"
}`,
        messages: [{
          role: 'user',
          content: `以下の情報で本の構成案を作成してください。

タイトル案: ${title}
書籍タイプ: ${bookType || 'guide'}
テーマ・内容: ${theme || '（指定なし — タイトルから推測してください）'}
ターゲット読者: ${targetReader || '一般'}
希望章数: ${chapterCount || '5〜8章'}
希望ページ数: ${pageCount || '80〜120ページ'}`,
        }],
      }),
    });

    const data = await response.json();
    // 234【1】: APIエラーを握りつぶすと text='' となり「JSONパース失敗」に化ける（R-33）
    assertAnthropicOk(response, data);
    const text = extractAnthropicText(data.content);
    try {
      return NextResponse.json(robustJsonParse(text));
    } catch {
      return NextResponse.json({ error: 'JSONパース失敗', raw: text.slice(0, 100) }, { status: 500 });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `構成案の生成に失敗しました: ${msg}` }, { status: 500 });
  }
}

// ── 222: ウィザード経路（DR素材束ね → 目次生成） ──
// 章タイトルはAI命名（既存機能維持）。章ごとに使用素材ID（source_ids）を割り当てさせ、
// 実在IDのみ通す検証を行う（ハルシネーションIDを捨てる）。
async function wizardOutline(params: {
  userId: string;
  apiKey: string;
  sourceIds: string[];
  purposeKey: unknown;
  styleKey: unknown;
  preset: unknown;
  theme?: string;
}) {
  const { userId, apiKey, sourceIds, theme } = params;

  const presetKey = typeof params.preset === 'string' ? params.preset : 'leadmagnet';
  const presetDef = WIZARD_PRESETS[presetKey];
  if (!presetDef) {
    return NextResponse.json(
      { error: `preset が不正です（対応: ${Object.keys(WIZARD_PRESETS).join('/')}）` },
      { status: 400 },
    );
  }
  const purpose = getKindlePurpose(params.purposeKey);
  const style = getKindleStyle(params.styleKey);

  try {
    const materials = await fetchKindleMaterials(userId, sourceIds);
    if (materials.length !== sourceIds.length) {
      return NextResponse.json(
        { error: `選択素材のうち${sourceIds.length - materials.length}件が見つかりません` },
        { status: 400 },
      );
    }
    const check = validateKindleMaterialLimits(materials);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const materialsBlock = materials
      .map((m, i) => `${kindleMaterialLabel(m, i)}\n${excerptForOutline(m.text)}`)
      .join('\n\n---\n\n');

    const system = `あなたはKindle出版の専門プロデューサーです。
渡された素材（ディープリサーチ結果・note記事・テキスト分析結果）を束ねて、1冊の本の構成案（目次）を作成してください。
本のタイトル・各章のタイトルは、素材の内容からあなたが命名してください。

${purpose.promptBlock}

${style.promptBlock}

${KINDLE_COMMON_RULES}
${hasNoteMaterials(materials) ? `\n${KINDLE_NOTE_SOURCE_RULES}\n` : ''}${hasAnalysisMaterials(materials) ? `\n${KINDLE_ANALYSIS_SOURCE_RULES}\n` : ''}

# 分量指定（厳守）
- プリセット: ${presetDef.label}
- 章数: ${presetDef.chapterRange}
- 各章の目標文字数: ${presetDef.charsPerChapter}字（target_chars に数値で設定）

# 素材の割り当て（厳守）
- 各章の source_ids に、その章の執筆で使う素材のIDを入れる（渡された素材のIDのみ。新しいIDを作らない）
- IDは素材見出しの「ID: 」の文字列を一字一句そのまま使う（例: "ana-12" のような接頭辞つきIDも省略・改変しない）
- すべての素材がいずれかの章で使われるように配分する（1素材を複数章で使ってもよい）

必ず以下のJSON形式のみを返してください。前置きや説明は不要です。

{
  "book_title": "正式な書籍タイトル",
  "subtitle": "サブタイトル",
  "tagline": "キャッチコピー（1行）",
  "target_reader": "ターゲット読者の具体的な描写",
  "unique_value": "この本ならではの価値・差別化ポイント",
  "chapters": [
    {
      "chapter_num": 1,
      "title": "章タイトル",
      "summary": "章の概要（100〜200文字）",
      "key_points": ["ポイント1", "ポイント2", "ポイント3"],
      "target_chars": 3500,
      "source_ids": ["使う素材のID"]
    }
  ],
  "foreword_outline": "まえがきの概要",
  "afterword_outline": "あとがきの概要"
}`;

    // 235: 共通層でClaude→Gemini自動フォールバック（上限・混雑時のみ）
    const ai = await generateTextWithFallback({
      system,
      maxTokens: 8000,
      messages: [
        {
          role: 'user',
          content: `以下の素材を束ねて本の構成案を作成してください。
${theme ? `\n【著者からの補足】\n${theme}\n` : ''}
【素材（全${materials.length}件）】

${materialsBlock}`,
        },
      ],
    });
    const text = ai.text;

    let outline: any;
    try {
      outline = robustJsonParse(text);
    } catch {
      return NextResponse.json({ error: 'JSONパース失敗', raw: text.slice(0, 100) }, { status: 500 });
    }

    // fail-closed: 必須構造の検証と source_ids の実在チェック
    if (!outline || typeof outline.book_title !== 'string' || !Array.isArray(outline.chapters) || outline.chapters.length === 0) {
      return NextResponse.json({ error: '構成案の形式が不正です（book_title / chapters）' }, { status: 500 });
    }
    const validIdSet = new Set(sourceIds);
    outline.chapters = outline.chapters.map((c: any, idx: number) => ({
      ...c,
      chapter_num: typeof c.chapter_num === 'number' ? c.chapter_num : idx + 1,
      target_chars: typeof c.target_chars === 'number' && c.target_chars > 0 ? c.target_chars : 3500,
      source_ids: Array.isArray(c.source_ids)
        ? c.source_ids.filter((id: unknown) => typeof id === 'string' && validIdSet.has(id))
        : [],
    }));

    // 235要件2: どのモデルで生成したかを必ず返す（画面で「✨ Geminiで生成」を出すため）
    return NextResponse.json({ ...outline, _ai: { provider: ai.provider, modelLabel: ai.modelLabel } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `構成案の生成に失敗しました: ${msg}` }, { status: 500 });
  }
}
