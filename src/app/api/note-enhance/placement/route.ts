import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/require-auth';
import { generateWithModel } from '@/lib/ai-client';
import { GEMINI_TEXT_THINKING_LOW } from '@/lib/ai-models';
import { robustJsonParse } from '@/lib/ai-json-parser';
import { buildPlacementPrompt } from '@/lib/note-placement';
import {
  NOTE_PLACEMENT_SLOTS,
  recommendedImageCount,
  splitMarkdownBlocks,
  type NotePlacementSlot,
} from '@/lib/note-enhance';

export const runtime = 'nodejs';
export const maxDuration = 120;

// 228: 画像配置の自動提案（観点10原則の配置応用）。
// - 提案のみ返す＝生成も保存もしない（プレビューで位置調整・削除できる。完全自動固定にしない）
// - 228a改訂: AI画像は冒頭イメージ1枚が既定 → 自動提案は hook(最多1)＋cta(最多1) のみ受理
//   （evidence/rest はAI提案から除外＝図表が主力。手動追加はクライアント側で引き続き可能）
// - 検証: afterBlock はブロック範囲内・同一ブロック重複除去。fail-closed: パース失敗・0件は502

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
    const maxImages = recommendedImageCount(content.length);

    const { system, prompt } = buildPlacementPrompt({ title, blocks, maxImages });
    // 提案は短い構造化出力＝thinking low + JSON mime（178の確立方式・plan routeと同じ）
    const raw = await generateWithModel('gemini', prompt, system, 8192, {
      responseMimeType: 'application/json',
      ...GEMINI_TEXT_THINKING_LOW,
    });
    const parsed = robustJsonParse<{ placements?: unknown }>(raw);

    const seenBlocks = new Set<number>();
    let ctaCount = 0;
    let hookCount = 0;
    const placements = (Array.isArray(parsed.placements) ? parsed.placements : [])
      .map((p: any) => {
        const slot = typeof p?.slot === 'string' && p.slot in NOTE_PLACEMENT_SLOTS ? (p.slot as NotePlacementSlot) : null;
        const afterBlock = Number(p?.afterBlock);
        if (!slot || !Number.isInteger(afterBlock) || afterBlock < 0 || afterBlock >= blocks.length) return null;
        if (seenBlocks.has(afterBlock)) return null;
        if (slot === 'cta') {
          if (ctaCount >= 1) return null;
          ctaCount++;
        } else if (slot === 'hook') {
          if (hookCount >= 1) return null;
          hookCount++;
        } else {
          // evidence/rest はAI提案から除外（図表が主力・手動追加のみ）
          return null;
        }
        seenBlocks.add(afterBlock);
        return {
          slot,
          afterBlock,
          purpose: String(p?.purpose ?? '').trim().slice(0, 200),
          principle: String(p?.principle ?? '').trim().slice(0, 40),
          prompt: slot === 'cta' ? '' : String(p?.prompt ?? '').trim().slice(0, 1000),
        };
      })
      .filter(Boolean);

    if (placements.length === 0) {
      return NextResponse.json({ error: '配置の提案に失敗しました（もう一度お試しください）' }, { status: 502 });
    }
    return NextResponse.json({
      placements,
      recommended: maxImages,
      blockCount: blocks.length,
      ranAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error('[note-enhance/placement] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
