// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindleウィザードの素材取得（222・229Aでnote記事対応・231でテキスト分析対応）
// - library（type='deepresearch'/'note-article'・uuid）: 裸のIDのまま（既存book_metaの後方互換）
// - text_analysis_saves（SERIAL整数）: 231で「ana-N」名前空間を全経路に通す
// IDで受け取り、サーバ側でowner検証つきで本文を取得する（note-bundle-server.ts と同方針:
// 一覧・検証APIは本文非返却、本文はサーバ側でのみ取得する）。
// 上限（10件・合計15万字=全ソース合算）と目次生成用の切り詰め（1件8,000字）もここに集約。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { neon } from '@neondatabase/serverless';
import {
  MAX_KINDLE_SOURCES,
  MAX_KINDLE_TOTAL_CHARS,
  OUTLINE_EXCERPT_CHARS,
  KINDLE_LIBRARY_TYPES,
  KINDLE_MATERIAL_SOURCE_META,
  makeAnalysisSourceKey,
  parseKindleSourceKey,
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

// owner検証つきで取得し、選択順（ids順）に並べ直す。
// - 裸ID（uuid）→ library（type検証あり）／'ana-N' → text_analysis_saves（231）
// - 存在しない/他ユーザー/他typeのIDは黙って落ちる（呼び出し側で件数差を検知できる）
export async function fetchKindleMaterials(
  userId: string,
  ids: string[],
): Promise<KindleMaterialRow[]> {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const sql = neon(process.env.DATABASE_URL!);

  // 名前空間で2テーブルに振り分け（ana-N のみ analysis。それ以外は従来どおり library）
  const libIds: string[] = [];
  const anaIds: number[] = [];
  for (const raw of ids) {
    const parsed = parseKindleSourceKey(String(raw));
    if (parsed.kind === 'analysis') anaIds.push(parsed.id);
    else libIds.push(parsed.id);
  }

  const [libRowsRaw, anaRowsRaw] = await Promise.all([
    libIds.length > 0
      ? sql`
          SELECT id, title, content, type, created_at
          FROM library
          WHERE user_id = ${userId} AND type = ANY(${KINDLE_LIBRARY_TYPES as unknown as string[]}) AND id = ANY(${libIds})
        `
      : Promise.resolve([]),
    anaIds.length > 0
      ? sql`
          SELECT id, COALESCE(NULLIF(auto_title, ''), NULLIF(file_name, ''), '無題') AS title, content, created_at
          FROM text_analysis_saves
          WHERE user_id = ${userId} AND id = ANY(${anaIds})
        `
      : Promise.resolve([]),
  ]);
  const libRows = libRowsRaw as { id: string; title: string; content: string; type: string; created_at: string | null }[];
  const anaRows = anaRowsRaw as { id: number; title: string; content: string; created_at: string | null }[];

  const byId = new Map<string, KindleMaterialRow>();
  for (const r of libRows) {
    byId.set(String(r.id), {
      id: String(r.id),
      title: r.title || '(無題)',
      text: r.content || '',
      charCount: (r.content || '').length,
      createdAt: r.created_at,
      source: (r.type === 'note-article' ? 'note-article' : 'deepresearch') as KindleMaterialSource,
    });
  }
  for (const r of anaRows) {
    const key = makeAnalysisSourceKey(Number(r.id));
    byId.set(key, {
      // ラベル・AIのsource_ids・chapterSourceRefs すべて名前空間つき文字列で完全一致させる
      id: key,
      title: r.title || '(無題)',
      text: r.content || '',
      charCount: (r.content || '').length,
      createdAt: r.created_at,
      source: 'analysis',
    });
  }
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

// 231: テキスト分析結果が素材に含まれるときのみ注入する変換指示（KINDLE_NOTE_SOURCE_RULESと同じ流儀）。
// 分析レポートの構造・メタ表現をそのまま書籍に持ち込ませない。
export const KINDLE_ANALYSIS_SOURCE_RULES = `# テキスト分析素材の扱い（厳守）
- 分析レポートの構造（評価軸・スコア・章立て）をそのまま章構成にせず、本全体の設計に組み替える
- 「本分析では」「このテキストは」等の分析メタ表現を書籍の文章に持ち込まない
- 分析の根拠となった内容・知見を素材として使い、読者向けの文章に書き下ろす`;

export function hasAnalysisMaterials(materials: KindleMaterialRow[]): boolean {
  return materials.some((m) => m.source === 'analysis');
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
