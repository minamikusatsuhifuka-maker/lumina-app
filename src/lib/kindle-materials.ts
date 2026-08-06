// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindleウィザードの素材取得（222・229Aでnote記事対応）
// ディープリサーチ結果（library type='deepresearch'）とnote記事（type='note-article'）を
// IDで受け取り、サーバ側でowner検証つきで本文を取得する（note-bundle-server.ts と同方針:
// 一覧・検証APIは本文非返却、本文はサーバ側でのみ取得する）。
// 同一テーブル・同一uuid空間のため sourceIds の形式は不変（種別はtype列から導出）。
// 上限（10件・合計15万字=DR+note合算）と目次生成用の切り詰め（1件8,000字）もここに集約。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { neon } from '@neondatabase/serverless';
import {
  MAX_KINDLE_SOURCES,
  MAX_KINDLE_TOTAL_CHARS,
  OUTLINE_EXCERPT_CHARS,
  KINDLE_MATERIAL_SOURCES,
  KINDLE_MATERIAL_SOURCE_META,
  type KindleMaterialSource,
} from '@/lib/kindle-limits';

// 定数の実体は kindle-limits.ts（クライアント共用）。サーバ側の既存importを壊さないため再export
export { MAX_KINDLE_SOURCES, MAX_KINDLE_TOTAL_CHARS, OUTLINE_EXCERPT_CHARS, KINDLE_MATERIAL_SOURCE_META };
export type { KindleMaterialSource };

export interface KindleMaterialRow {
  id: string;
  title: string;
  text: string;
  charCount: number;
  createdAt: string | null;
  source: KindleMaterialSource;
}

// owner検証＋type検証（deepresearch / note-article のみ）で取得し、選択順（ids順）に並べ直す。
// 存在しない/他ユーザー/他typeのIDは黙って落ちる（呼び出し側で件数差を検知できる）。
export async function fetchKindleMaterials(
  userId: string,
  ids: string[],
): Promise<KindleMaterialRow[]> {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT id, title, content, type, created_at
    FROM library
    WHERE user_id = ${userId} AND type = ANY(${KINDLE_MATERIAL_SOURCES}) AND id = ANY(${ids})
  `) as { id: string; title: string; content: string; type: string; created_at: string | null }[];
  const byId = new Map(
    rows.map((r) => [
      String(r.id),
      {
        id: String(r.id),
        title: r.title || '(無題)',
        text: r.content || '',
        charCount: (r.content || '').length,
        createdAt: r.created_at,
        source: (r.type === 'note-article' ? 'note-article' : 'deepresearch') as KindleMaterialSource,
      },
    ]),
  );
  return ids
    .map((id) => byId.get(String(id)))
    .filter((m): m is KindleMaterialRow => m !== undefined);
}

// 素材ブロックの見出しラベル（目次生成・本文生成の両方で使用）
export function kindleMaterialLabel(m: KindleMaterialRow, index: number): string {
  return `【素材${index + 1}｜ID: ${m.id}｜${KINDLE_MATERIAL_SOURCE_META[m.source].label}】${m.title}`;
}

// note記事が素材に含まれるときのみプロンプトへ注入する変換指示（229A）。
// 「改編」の担保: 記事の口語・構成をそのまま書籍に持ち込ませない。
export const KINDLE_NOTE_SOURCE_RULES = `# note記事素材の扱い（厳守）
- note記事の口語・語りかけ調は、文体指示に従って書籍の文章に変換する（記事の文章をそのまま写さない）
- 記事の構成（タイトル・導入・結び・CTA）をそのまま章構成にせず、本全体の設計に組み替える
- 複数の記事で重複する話題は1箇所に統合し、内容の矛盾があれば素材の範囲で自然に調停する`;

export function hasNoteMaterials(materials: KindleMaterialRow[]): boolean {
  return materials.some((m) => m.source === 'note-article');
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
