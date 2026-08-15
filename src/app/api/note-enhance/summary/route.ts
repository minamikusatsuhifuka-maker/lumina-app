import { DEFAULT_AI_MODEL } from '@/lib/ai-models';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { NOTE_ENHANCE_RULES } from '@/lib/note-placement';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 228: note記事のまとめ生成（227A/Bの横展開・記事単位）。
// - 保存はしない（enhance状態はクライアント側の器＝feature_result_drafts / library.metadata）
// - fail-closed: パース失敗・0点なら points を返さず502（本文・既存まとめは無傷）

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json().catch(() => ({}))) as { content?: unknown; title?: unknown };
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return NextResponse.json({ error: '本文が必要です' }, { status: 400 });
    const title = typeof body.title === 'string' ? body.title.trim() : '';

    const system = `あなたは記事編集者です。note記事の本文から、読者が持ち帰るべき要点まとめを作ります。

${NOTE_ENHANCE_RULES}`;

    const prompt = `以下のnote記事の「要点まとめ」を作ってください。

# 作り方
- 3〜5点。各要点は40〜60字・体言止めか短い文で簡潔に
- 本文に書かれている内容のみ（本文にない事実・数値を加えない）
- 読者の行動や理解につながる順に並べる

# 記事タイトル
${title || '（無題）'}

# 本文
${content.slice(0, 40000)}

# 出力フォーマット（必ずこのJSONのみ。前置き・コードフェンス禁止）
{ "points": ["要点1", "要点2", "要点3"] }`;

    // Sonnet 5はthinking既定ON＝枠は思考込み。小さすぎる枠は全滅リスクがあるため余裕を持つ（209系の教訓）
    const raw = await generateWithModel(DEFAULT_AI_MODEL, prompt, system, 4000);
    const parsed = robustJsonParse<{ points?: unknown }>(raw);
    const points = (Array.isArray(parsed.points) ? parsed.points : [])
      .map((p) => String(p).trim())
      .filter(Boolean)
      .slice(0, 8);
    if (points.length === 0) {
      return NextResponse.json({ error: 'まとめの生成に失敗しました（もう一度お試しください）' }, { status: 502 });
    }
    return NextResponse.json({ points, updatedAt: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[note-enhance/summary] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
