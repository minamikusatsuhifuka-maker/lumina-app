// 180: note記事まとめ生成のサーバ側 本文取得（plan / article の両ルートで共用）。
// - source別にテーブルから本文を直接取得（owner検証は両テーブルとも必須・選択分のみ）
// - 一覧APIの本文非返却方針を維持するため、本文はここ（サーバ側）でのみ取得する
// - context=🧠AI参照素材(context_saves: topic/context_text) / analysis=🗂テキスト分析(text_analysis_saves: auto_title/content)

import { neon } from '@neondatabase/serverless';
import { makeBundleKey, type BundleRef, type BundleSource } from '@/lib/note-bundle';

export interface BundleMaterialRow {
  key: string;
  source: BundleSource;
  id: number;
  topic: string;
  text: string;
}

export async function fetchBundleMaterials(
  userId: string,
  refs: BundleRef[],
): Promise<BundleMaterialRow[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const ctxIds = refs.filter((r) => r.source === 'context').map((r) => r.id);
  const anaIds = refs.filter((r) => r.source === 'analysis').map((r) => r.id);

  const [ctxRows, anaRows] = await Promise.all([
    ctxIds.length > 0
      ? sql`
          SELECT id, topic, context_text
          FROM context_saves
          WHERE id = ANY(${ctxIds}) AND user_id = ${userId}
        `
      : Promise.resolve([] as Record<string, unknown>[]),
    anaIds.length > 0
      ? sql`
          SELECT id, COALESCE(NULLIF(auto_title, ''), NULLIF(file_name, ''), '無題') AS topic, content
          FROM text_analysis_saves
          WHERE id = ANY(${anaIds}) AND user_id = ${userId}
        `
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const materials: BundleMaterialRow[] = [
    ...(ctxRows as { id: number; topic: string; context_text: string }[]).map((r) => ({
      key: makeBundleKey('context', r.id),
      source: 'context' as const,
      id: r.id,
      topic: r.topic || '無題',
      text: r.context_text || '',
    })),
    ...(anaRows as { id: number; topic: string; content: string }[]).map((r) => ({
      key: makeBundleKey('analysis', r.id),
      source: 'analysis' as const,
      id: r.id,
      topic: r.topic || '無題',
      text: r.content || '',
    })),
  ];
  // 選択順（refs順）に並べ直す
  const byKey = new Map(materials.map((m) => [m.key, m]));
  return refs
    .map((r) => byKey.get(makeBundleKey(r.source, r.id)))
    .filter((m): m is BundleMaterialRow => m !== undefined);
}
