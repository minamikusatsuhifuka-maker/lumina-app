import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_LOW } from '@/lib/ai-models';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { buildFiguresPrompt } from '@/lib/note-placement';
import { splitMarkdownBlocks } from '@/lib/note-enhance';
import { FIGURE_TEMPLATES, type FigureTemplateKey } from '@/lib/summary-image-templates';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 228a: 図表候補の抽出（手順・比較・Q&A・前後の変化）。記事図表の主力レーン。
// - 提案のみ返す＝描画も保存もしない（データは編集可能な下書き→編集後データだけを描画=227C準拠）
// - 検証: template 4種のみ・afterBlock 範囲内・groups整形（beforeafterは2グループに正規化）
// - fail-closed: パース失敗は502。0件は「図表化に向く構造なし」として空配列を正常返却

const MAX_FIGURES = 3;

export async function POST(req: Request) {
  const guard = await requireAuth();
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json().catch(() => ({}))) as { content?: unknown; title?: unknown };
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return NextResponse.json({ error: '本文が必要です' }, { status: 400 });
    const title = typeof body.title === 'string' ? body.title.trim() : '';

    const blocks = splitMarkdownBlocks(content).slice(0, 200);
    if (blocks.length === 0) {
      return NextResponse.json({ error: '本文が空です' }, { status: 400 });
    }

    const { system, prompt } = buildFiguresPrompt({ title, blocks, maxFigures: MAX_FIGURES });
    const raw = await generateWithModel('gemini', prompt, system, 8192, {
      responseMimeType: 'application/json',
      ...GEMINI_TEXT_THINKING_LOW,
    });
    const parsed = robustJsonParse<{ figures?: unknown }>(raw);

    const figures = (Array.isArray(parsed.figures) ? parsed.figures : [])
      .map((f: any) => {
        const template =
          typeof f?.template === 'string' && f.template in FIGURE_TEMPLATES
            ? (f.template as FigureTemplateKey)
            : null;
        const afterBlock = Number(f?.afterBlock);
        const figTitle = String(f?.title ?? '').trim().slice(0, 60);
        if (!template || !figTitle || !Number.isInteger(afterBlock) || afterBlock < 0 || afterBlock >= blocks.length) {
          return null;
        }
        let groups = (Array.isArray(f?.groups) ? f.groups : [])
          .map((g: any) => ({
            heading: typeof g?.heading === 'string' && g.heading.trim() ? g.heading.trim().slice(0, 80) : undefined,
            points: (Array.isArray(g?.points) ? g.points : [])
              .map((p: unknown) => String(p).trim())
              .filter(Boolean)
              .slice(0, 8),
          }))
          .filter((g: { points: string[] }) => g.points.length > 0)
          .slice(0, 6);
        if (template === 'beforeafter') groups = groups.slice(0, 2);
        if (template === 'steps' && groups.length > 1) {
          // stepsは1グループに正規化（複数来たら結合）
          groups = [{ heading: undefined, points: groups.flatMap((g: { points: string[] }) => g.points).slice(0, 8) }];
        }
        if (groups.length === 0) return null;
        if (template === 'beforeafter' && groups.length < 2) return null;
        return {
          template,
          title: figTitle,
          afterBlock,
          purpose: String(f?.purpose ?? '').trim().slice(0, 200),
          principle: String(f?.principle ?? '').trim().slice(0, 40),
          groups,
        };
      })
      .filter(Boolean)
      .slice(0, MAX_FIGURES);

    // 0件は「図表化に向く構造なし」の正常応答（無理に作らない）
    return NextResponse.json({
      figures,
      blockCount: blocks.length,
      ranAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[note-enhance/figures] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
