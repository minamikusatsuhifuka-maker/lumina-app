import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { safeJsonParse } from '@/lib/ai-json-parser';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 全面リライト・パス1（172）: 全文＋フリープロンプトから「新しい構成案（見出し＋要点）」だけを
// JSONで返させる。出力が短い＝truncationしないので、全体を俯瞰した再構成が成立する。
// 本文はパス2（/api/refine/section）でセクション単位に生成する。

interface RawSection {
  heading?: unknown;
  points?: unknown;
}

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
    const instruction = typeof body.instruction === 'string' ? body.instruction : '';
    if (!sourceText.trim()) {
      return NextResponse.json({ error: '対象テキストがありません' }, { status: 400 });
    }
    if (!instruction.trim()) {
      return NextResponse.json({ error: 'リライトの指示を入力してください' }, { status: 400 });
    }

    const prompt = `あなたは日本語の編集者です。次の「指示」に従い、対象テキストを作り直すための新しい構成案（見出しの一覧と、各見出しに入れる要点）だけを設計してください。本文はまだ書きません。

【指示】
${instruction}

【厳守事項】
- 出力はJSONのみ（前置き・コードフェンス・説明は不要）。
- 形式: {"sections":[{"heading":"見出し","points":["要点1","要点2"]}]}
- 原文の情報を過不足なくカバーする構成にする（勝手に新事実を足さない）。
- 数値・割合・金額を新たに作らない（原文にある数値は該当セクションのpointsに残す）。
- 効果効能を断定する新しい表現を足さない。
- 見出しは簡潔に。points は本文を書くための箇条書きメモ。

【対象テキスト】
${sourceText}`;

    // 169実績: responseMimeType:'application/json' ＋ 枠4096 ＋ safeJsonParse で安定
    const raw = await generateWithModel('gemini', prompt, undefined, 4096, {
      responseMimeType: 'application/json',
    });

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const slice = start !== -1 && end !== -1 && end > start ? raw.slice(start, end + 1) : '{}';
    const parsed = safeJsonParse<{ sections?: RawSection[] }>(slice, {});

    const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
      .map((s) => ({
        heading: String(s.heading ?? '').trim(),
        points: Array.isArray(s.points) ? s.points.map((p) => String(p)).filter(Boolean) : [],
      }))
      .filter((s) => s.heading || s.points.length > 0);

    if (sections.length === 0) {
      return NextResponse.json(
        { error: '構成案を作成できませんでした。指示を変えてお試しください。' },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: true, sections });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[refine/outline]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
