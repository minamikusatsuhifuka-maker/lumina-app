import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_MEDIUM } from '@/lib/ai-models';
import { checkMedicalAd, MEDICAL_AD_NG_RULES } from '@/lib/medical-ad-check';
import { getNoteStyle, NOTE_COMMON_RULES } from '@/lib/note-styles';
import {
  MAX_BUNDLE_SOURCES,
  BUNDLE_SOURCE_META,
  normalizeBundleRefs,
} from '@/lib/note-bundle';
import { fetchBundleMaterials } from '@/lib/note-bundle-server';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 179/180 パス2: プランで確定した1記事分（タイトル＋要点＋割り当て資料＋文体）から note記事を生成する。
// - 1リクエスト=1記事（クライアントが逐次呼び出し・部分成功方針）。全資料でなく割り当て資料のみ渡す
// - 180: 資料は {source,id}[] で受け取り、🧠context_saves / 🗂text_analysis_saves を横断
//   （後方互換: sourceIds number[] は context 扱い）
// - 本文はサーバ側でIDから直接取得（owner検証は両テーブルとも必須）。一覧APIの本文非返却を壊さない
// - 記事本文の生成＝品質優先で thinking medium・枠は思考込みで余裕を（178の設計）
// - 品質規約: 既存 note記事生成の規約（note-styles.ts NOTE_COMMON_RULES）＋医療広告ガード＋数値の新規生成禁止
// - 生成後に checkMedicalAd で自己チェックし ad_check を併記（seo/article と同方式）

type Length = 'short' | 'medium' | 'long';
const LENGTH_CONFIG: Record<Length, { label: string; chars: string }> = {
  short: { label: '短め', chars: '1500〜2500字' },
  medium: { label: '標準', chars: '3000〜4500字' },
  long: { label: '長め', chars: '5000〜7000字' },
};

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;
  const userId = guard.userId;

  try {
    const body = (await req.json()) as {
      title?: unknown;
      points?: unknown;
      sources?: unknown;
      sourceIds?: unknown;
      style?: unknown;
      length?: unknown;
      model?: unknown;
    };

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: '記事タイトルが必要です' }, { status: 400 });
    }
    const points = (Array.isArray(body.points) ? body.points : [])
      .map((p) => String(p).trim())
      .filter(Boolean)
      .slice(0, 12);
    // {source,id}[]（sources）または旧形式 number[]（sourceIds → context扱い）を正規化
    const refs = normalizeBundleRefs({ sources: body.sources, ids: body.sourceIds });
    if (refs.length === 0) {
      return NextResponse.json({ error: '資料が割り当てられていません' }, { status: 400 });
    }
    if (refs.length > MAX_BUNDLE_SOURCES) {
      return NextResponse.json(
        { error: `1記事に割り当てられる資料は最大${MAX_BUNDLE_SOURCES}件です` },
        { status: 400 },
      );
    }
    const style = getNoteStyle(body.style);
    const length: Length =
      body.length === 'short' || body.length === 'long' ? body.length : 'medium';
    const aiModel = body.model === 'gemini' ? 'gemini' : 'claude';

    // 割り当てられた資料の本文だけをサーバ側で取得（owner検証は両テーブルとも必須）
    const rows = await fetchBundleMaterials(userId, refs);
    if (rows.length === 0) {
      return NextResponse.json({ error: '割り当てられた資料が見つかりません' }, { status: 404 });
    }

    const materialsSection = rows
      .map((r) => `## 資料（${BUNDLE_SOURCE_META[r.source].label}）: ${r.topic}\n${r.text}`)
      .join('\n\n---\n\n');

    const config = LENGTH_CONFIG[length];

    const system = `あなたは note プラットフォームで読者を惹きつける記事を執筆する優秀なライターです。SEO・心理学・マーケティングの知識を駆使しつつ、読者の心に響く文章を生成してください。
医療に関わる内容では医療広告規制（医療法・医療広告ガイドライン／薬機法）に配慮し、以下のNG表現は使いません:
${MEDICAL_AD_NG_RULES}

${NOTE_COMMON_RULES}`;

    const pointsSection = points.length
      ? `\n# この記事に盛り込む要点\n${points.map((p) => `- ${p}`).join('\n')}\n`
      : '';

    const prompt = `以下のタイトル・要点で note 記事を執筆してください。内容は「参照資料」の記述だけを根拠にします。

# 記事タイトル
${title}
${pointsSection}
# 記事の長さ
${config.label}（${config.chars}）

${style.promptBlock}

# 参照資料（${rows.length}件。記事の根拠はこの資料の記述のみ）
${materialsSection}

# 記事の構成
- 導入: 読者の関心・悩みに寄り添う問題提起や語りかけ
- 本論: 構造化された見出し・小見出し（## / ###）で、要点を資料に基づいて展開
- 結論: 読者へのメッセージ・次の一歩で締めくくる

# 出力形式
- Markdown 形式（先頭に # タイトルを置く。前置き・コードフェンス不要）
- 適度に箇条書きを使用

# 厳守事項
- ${config.chars} の範囲内で、必ず最後の結論まで書ききる
- 根拠は参照資料の記述のみ。資料に無い出典・数値・固有の研究名を新たに書かない。資料の記述を根拠として示す場合は資料の表現に忠実に
- AI らしい不自然な文章を避け、人間が書いたような自然な文体に`;

    // 記事本文＝品質優先で medium を明示（claude時は geminiGenerationConfig は無視される）。
    // 枠12000: gemini は思考トークンが枠を消費するため本文分に余裕を持たせる（178）。
    const content = await generateWithModel(
      aiModel,
      prompt,
      system,
      12000,
      GEMINI_TEXT_THINKING_MEDIUM,
    );
    if (!content || !content.trim()) {
      return NextResponse.json({ error: '記事の生成結果が空でした。もう一度お試しください' }, { status: 502 });
    }

    const adCheck = await checkMedicalAd(content);

    return NextResponse.json({
      content,
      ad_check: adCheck,
      style: style.key,
      usedSourceKeys: rows.map((r) => r.key),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[note-bundle/article] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
