import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { neon } from '@neondatabase/serverless';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_MEDIUM } from '@/lib/ai-models';
import { checkMedicalAd, MEDICAL_AD_NG_RULES } from '@/lib/medical-ad-check';
import { getNoteStyle, NOTE_COMMON_RULES } from '@/lib/note-styles';
import { NOTE_WRITING_DESIGN } from '@/lib/note-writing';
import { getMyStylePrompt } from '@/lib/my-style-server';
import { verifyContent } from '@/lib/content-verify';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 228d: おまかせ投稿の記事生成（1素材→即記事＝案4／箇条書きメモ→記事＝案5）。
// - source: {kind:'library'|'analysis', id} … 本文はサーバ側でowner検証つき取得（クライアントから受けない）
// - memo: string[] … 院長の要点（1行1項目）。source と併用可（メモを軸に素材で補強＝インサイドアウト）
// - 品質規約はnote生成2経路と完全同格: note-styles＋NOTE_WRITING_DESIGN＋NOTE_COMMON_RULES＋
//   医療広告ガード＋checkMedicalAd＋マイ文体（228c）
// - 生成のみ（保存・後続のまとめ/図表/配置はクライアントが既存note-enhance APIを直列で呼ぶ）

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
    const body = (await req.json().catch(() => ({}))) as {
      source?: { kind?: unknown; id?: unknown };
      memo?: unknown;
      style?: unknown;
      length?: unknown;
      model?: unknown;
    };
    const memo = (Array.isArray(body.memo) ? body.memo : [])
      .map((m) => String(m).trim())
      .filter(Boolean)
      .slice(0, 12);
    const sourceKind =
      body.source?.kind === 'library' || body.source?.kind === 'analysis' ? body.source.kind : null;

    if (!sourceKind && memo.length === 0) {
      return NextResponse.json({ error: '素材またはメモ（1行以上）が必要です' }, { status: 400 });
    }

    // 素材本文の取得（owner検証・上限4万字）
    let materialTitle = '';
    let materialText = '';
    if (sourceKind) {
      const sql = neon(process.env.DATABASE_URL!);
      if (sourceKind === 'library') {
        const id = String(body.source?.id ?? '');
        const [row] = await sql`
          SELECT title, content FROM library WHERE id = ${id} AND user_id = ${userId}
        `;
        if (!row) return NextResponse.json({ error: '素材が見つかりません' }, { status: 404 });
        materialTitle = row.title || '(無題)';
        materialText = (row.content || '').slice(0, 40_000);
      } else {
        const id = Number(body.source?.id);
        if (!Number.isInteger(id)) return NextResponse.json({ error: '素材IDが不正です' }, { status: 400 });
        const [row] = await sql`
          SELECT COALESCE(NULLIF(auto_title,''), NULLIF(file_name,''), '無題') AS title, content
          FROM text_analysis_saves WHERE id = ${id} AND user_id = ${userId}
        `;
        if (!row) return NextResponse.json({ error: '素材が見つかりません' }, { status: 404 });
        materialTitle = row.title;
        materialText = (row.content || '').slice(0, 40_000);
      }
      if (!materialText.trim()) {
        return NextResponse.json({ error: '素材の本文が空です' }, { status: 400 });
      }
    }

    const style = getNoteStyle(body.style);
    const length: Length = body.length === 'short' || body.length === 'long' ? body.length : 'medium';
    const aiModel = body.model === 'gemini' ? 'gemini' : 'claude';
    const config = LENGTH_CONFIG[length];
    const myStyleBlock = await getMyStylePrompt(userId);

    const system = `あなたは note プラットフォームで読者を惹きつける記事を執筆する優秀なライターです。SEO・心理学・マーケティングの知識を駆使しつつ、読者の心に響く文章を生成してください。
医療に関わる内容では医療広告規制（医療法・医療広告ガイドライン／薬機法）に配慮し、以下のNG表現は使いません:
${MEDICAL_AD_NG_RULES}

${NOTE_COMMON_RULES}`;

    const memoSection = memo.length > 0
      ? `\n# 筆者の要点メモ（この記事の芯。全項目を自然に織り込み、この順を基本に展開する）\n${memo.map((m) => `- ${m}`).join('\n')}\n`
      : '';
    const materialSection = materialText
      ? `\n# 参照素材「${materialTitle}」（${memo.length > 0 ? '要点メモを補強する根拠として使う' : '記事の根拠はこの素材の記述のみ'}）\n${materialText}\n`
      : '';

    const prompt = `note記事を1本執筆してください。
${memoSection}${materialSection}
# 記事の長さ
${config.label}（${config.chars}）

${style.promptBlock}
${myStyleBlock ? `\n${myStyleBlock}\n` : ''}
${NOTE_WRITING_DESIGN}

# 出力形式
- Markdown 形式（先頭に # 記事タイトルを置く。前置き・コードフェンス不要）
- 見出しは ## / ### を活用し、適度に箇条書きを使用

# 厳守事項
- ${config.chars} の範囲内で、必ず最後の結論まで書ききる
- 根拠は${materialText ? '素材とメモの記述のみ' : 'メモの記述のみ'}。無い出典・数値・固有の研究名を新たに書かない
- AI らしい不自然な文章を避け、人間が書いたような自然な文体に`;

    const content = await generateWithModel(aiModel, prompt, system, 12000, GEMINI_TEXT_THINKING_MEDIUM);
    if (!content || !content.trim()) {
      return NextResponse.json({ error: '記事の生成結果が空でした。もう一度お試しください' }, { status: 502 });
    }
    const titleMatch = /^#\s+(.+)$/m.exec(content);
    const title = (titleMatch?.[1] ?? materialTitle ?? 'note記事').trim().slice(0, 80);
    const adCheck = await checkMedicalAd(content);
    // 233②: 内容検証（素材照合＋禁止表現・AI不使用の辞書/文字列照合）。
    // ad_check（Geminiの文脈判断）と併記する＝観点は同じでも判定方式が違うため補い合う。
    // 素材なし（メモのみ）のときは素材照合をスキップし、禁止表現だけ返る。
    const verify = verifyContent(content, [materialText, memo.join('\n')]);

    return NextResponse.json({ content, title, ad_check: adCheck, verify, style: style.key });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[note-quick/article] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
