// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindleウィザードの素材取得（222）
// ディープリサーチ結果（library type='deepresearch'）をIDで受け取り、
// サーバ側でowner検証つきで本文を取得する（note-bundle-server.ts と同方針:
// 一覧・検証APIは本文非返却、本文はサーバ側でのみ取得する）。
// 上限（10件・合計15万字）と目次生成用の切り詰め（1件8,000字）もここに集約。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { neon } from '@neondatabase/serverless';

// 選択上限（note-bundle の MAX_BUNDLE_SOURCES=10 と同根拠）
export const MAX_KINDLE_SOURCES = 10;
// 合計文字数上限（DR実測: 平均4,674字・p90約1万字 → 全件p90級でも安全圏に収める）
export const MAX_KINDLE_TOTAL_CHARS = 150_000;
// 目次生成時の1素材あたり切り詰め（p90の大半をカバーしつつプロンプトを制限）
export const OUTLINE_EXCERPT_CHARS = 8_000;

export interface KindleMaterialRow {
  id: string;
  title: string;
  text: string;
  charCount: number;
  createdAt: string | null;
}

// owner検証＋type固定（'deepresearch'）で取得し、選択順（ids順）に並べ直す。
// 存在しない/他ユーザー/他typeのIDは黙って落ちる（呼び出し側で件数差を検知できる）。
export async function fetchKindleMaterials(
  userId: string,
  ids: string[],
): Promise<KindleMaterialRow[]> {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT id, title, content, created_at
    FROM library
    WHERE user_id = ${userId} AND type = 'deepresearch' AND id = ANY(${ids})
  `) as { id: string; title: string; content: string; created_at: string | null }[];
  const byId = new Map(
    rows.map((r) => [
      String(r.id),
      {
        id: String(r.id),
        title: r.title || '(無題)',
        text: r.content || '',
        charCount: (r.content || '').length,
        createdAt: r.created_at,
      },
    ]),
  );
  return ids
    .map((id) => byId.get(String(id)))
    .filter((m): m is KindleMaterialRow => m !== undefined);
}

// 上限バリデーション。違反時は理由を返す（fail-closed: 呼び出し側は400で弾く）
export function validateKindleMaterialLimits(materials: KindleMaterialRow[]): {
  ok: boolean;
  error?: string;
  totalChars: number;
} {
  const totalChars = materials.reduce((sum, m) => sum + m.charCount, 0);
  if (materials.length === 0) {
    return { ok: false, error: '素材が0件です（IDが不正か、選択した素材が見つかりません）', totalChars };
  }
  if (materials.length > MAX_KINDLE_SOURCES) {
    return { ok: false, error: `素材は最大${MAX_KINDLE_SOURCES}件までです（${materials.length}件）`, totalChars };
  }
  if (totalChars > MAX_KINDLE_TOTAL_CHARS) {
    return {
      ok: false,
      error: `素材の合計文字数が上限${MAX_KINDLE_TOTAL_CHARS.toLocaleString()}字を超えています（${totalChars.toLocaleString()}字）`,
      totalChars,
    };
  }
  return { ok: true, totalChars };
}

// 目次生成用の切り詰め（本文生成では使わない＝割当素材は全文注入）
export function excerptForOutline(text: string): string {
  if (text.length <= OUTLINE_EXCERPT_CHARS) return text;
  return `${text.slice(0, OUTLINE_EXCERPT_CHARS)}\n…（以下略・全${text.length.toLocaleString()}字）`;
}
