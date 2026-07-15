import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 全面リライト・パス2（172）: パス1のアウトラインの「1見出し分」の本文だけを生成する。
// 各セクションの出力は短い＝枠内に収まる。クライアントから各セクションを並列に叩き結合する。
// （全セクションを1リクエストで逐次生成すると遅く maxDuration も圧迫するためリクエストを分割）

export async function POST(req: NextRequest) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const heading = typeof body.heading === 'string' ? body.heading : '';
    const points: string[] = Array.isArray(body.points) ? body.points.map((p: unknown) => String(p)) : [];
    const instruction = typeof body.instruction === 'string' ? body.instruction : '';
    const fullText = typeof body.fullText === 'string' ? body.fullText : '';
    if (!heading && points.length === 0) {
      return NextResponse.json({ error: '見出し情報がありません' }, { status: 400 });
    }

    const prompt = `あなたは日本語の編集者です。文章全体を「指示」に従って作り直しています。いま、次の1つの見出しの本文だけを書いてください。

【全体の指示】
${instruction}

【このセクションの見出し】
${heading}

【このセクションに入れる要点】
${points.map((p) => `- ${p}`).join('\n')}

【厳守事項】
- 出力はこのセクションの本文のみ（見出し行は書かない・前置きや説明も不要）。
- 要点をもとに、指示のトーン・体裁で自然な本文にする。
- 数値・割合・金額を新たに作らない。原文にある数値は正確に保持する。
- 効果効能を断定する新しい表現を足さない。

【参照（元の全文。事実確認用。ここから該当情報を拾う）】
${fullText}`;

    // 本文1セクションは短い。thinkingで枠を食っても本文が残るよう少し余裕を持たせる。
    const raw = await generateWithModel('gemini', prompt, undefined, 4096);
    const textOut = raw.trim();
    if (!textOut) {
      return NextResponse.json({ error: '本文を生成できませんでした' }, { status: 502 });
    }
    return NextResponse.json({ success: true, text: textOut });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[refine/section]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
