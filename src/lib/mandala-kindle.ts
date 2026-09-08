// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 307: 🔲 マンダラ → 📕 Kindle目次 の変換（純関数・DB 非依存・R-108・決定的・R-74）
//
// 対応（§1-2）: 中央＝本の主題（タイトル案）／第1階層の周囲8マス＝章（最大8）／第2階層（305）＝節（各章最大8）
//   マスの本文＝著者メモ（骨子・Markdown のまま。要約・整形しない）／リンク 📚🗂📔＝素材／🧠＝参照のみ
// 順序は mandalaOutlineNested()（305）のまま。ここで並べ替えない。
//
// 書き込み先はウィザードの既存の目次構造（§2-1 調査: kindle_chapters の行＝章のみ・節の階層は無い）。
// 別の目次構造は作らない（§3-3）ので、**節は章の著者メモ（summary）の中に小見出し＋本文として畳み込む**
// （mandalaKindleSummaryText）。構造としての章・節は本関数の出力に残し、出どころ記録（book_meta.mandala）にも
// 節ごとの cellId を残す＝後続（再取込）が復元できる。
//
// プレビューと保存は**同じ関数の同じ出力**を使う（プレビュー＝この結果を描く／保存＝この結果の chapters を
// ウィザードの Outline としてそのまま create へ渡す）。表示と保存を別々に組まない。
//
// 素材（§4-2）: 単位は成果物の行（scope + item_key をそのまま引き継ぐ）。Kindle の素材にできる鍵は
//   library → uuid そのまま／text_analysis → ana-N／episode → ep-N（281）／context → 不可（参照のみ）
// サーバは実在・type 適合（library は deepresearch / note-article のみ）を materialKeyOf で判定して渡す。
// 素材にできないリンク・上限（10件・合計字数）を超えた分は「参照のみ」として著者メモ末尾の参照一覧へ＝
// 黙って落とさず件数で出す（R-101 の考え方）。リンク先が消えているもの（exists=false）は紐づけず件数で出す。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { MAX_KINDLE_SOURCES, MAX_KINDLE_TOTAL_CHARS, makeAnalysisSourceKey, makeEpisodeSourceKey } from '@/lib/kindle-limits';
import {
  MANDALA_UNTITLED,
  chartDisplayTitle,
  isCellFilled,
  scopeMetaOf,
  type MandalaCell,
  type MandalaLinkResolved,
  type MandalaOutlineNode,
} from '@/lib/mandala-shared';

/** 章の上限＝周囲8マス、節の上限＝子8マス（構造上それ以上は無いが、明示して固定する） */
export const MANDALA_KINDLE_CHAPTER_MAX = 8;
export const MANDALA_KINDLE_SECTION_MAX = 8;

export interface MandalaKindleOptions {
  /** タイトルも本文も空のマスを含める（既定 false＝含めない・§3-2） */
  includeEmpty?: boolean;
  /** 素材にできる件数の上限（既定 MAX_KINDLE_SOURCES） */
  materialLimit?: number;
  /** 素材の合計字数の上限（既定 MAX_KINDLE_TOTAL_CHARS） */
  materialCharLimit?: number;
  /**
   * リンク → Kindle の素材キー（library uuid／ana-N／ep-N）。null＝素材にできない（参照のみ）。
   * 省略時は scope だけで決める（context は null）。サーバは実在・type 適合を加味した判定を渡す
   */
  materialKeyOf?: (link: MandalaLinkResolved) => string | null;
}

export type MandalaKindleRefKind = 'material' | 'reference' | 'missing';

/** 章・節に付くリンク1件の扱い（順序はリンクの並びのまま） */
export interface MandalaKindleRef {
  scope: string;
  item_key: string;
  title: string;
  kind: MandalaKindleRefKind;
  /** kind='material' のときの素材キー */
  materialKey: string | null;
  char_count: number | null;
}

export interface MandalaKindleSection {
  cellId: string;
  position: number;
  title: string;
  /** マスの本文そのまま */
  memo: string;
  refs: MandalaKindleRef[];
}

export interface MandalaKindleChapter {
  chapter_num: number;
  cellId: string;
  position: number;
  title: string;
  /** マスの本文そのまま（整形・要約しない） */
  memo: string;
  sections: MandalaKindleSection[];
  refs: MandalaKindleRef[];
  /** ウィザードの章 summary に書く本文（memo ＋ 節の畳み込み ＋ 参照一覧）。mandalaKindleSummaryText の出力 */
  summary: string;
  /** この章（節を含む）の素材キー（順序保持・重複なし） */
  source_ids: string[];
}

export interface MandalaKindleCounts {
  chapters: number;
  sections: number;
  /** 空のため除外したマス数（章＋節） */
  excludedEmpty: number;
  /** リンク先なし（削除済み）で紐づけなかった件数 */
  missingLinks: number;
  /** 素材として紐づく件数（本全体・重複なし） */
  materials: number;
  /** うち 📔 エピソード */
  materialEpisodes: number;
  /** 参照のみ（🧠・type 不適合・上限超過）の件数 */
  referenceOnly: number;
  /** うち上限（件数・字数）超過で参照のみに回した件数 */
  materialOverflow: number;
}

export interface MandalaKindleCellIds {
  /** 章番号 → 親マスの cellId */
  chapter: Record<string, string>;
  /** 章番号 → 節（子マス）の cellId の並び */
  section: Record<string, string[]>;
}

export type MandalaKindleResult =
  | {
      ok: true;
      bookTitle: string;
      /** 中央が空で「（無題）」で進むとき true（その旨を出す・§3-2） */
      untitledTheme: boolean;
      chapters: MandalaKindleChapter[];
      /** 本全体の素材キー（章順・重複なし・上限内） */
      sourceIds: string[];
      counts: MandalaKindleCounts;
      cellIds: MandalaKindleCellIds;
    }
  | {
      ok: false;
      reason: string;
      bookTitle: string;
      untitledTheme: boolean;
      counts: MandalaKindleCounts;
    };

export const MANDALA_KINDLE_REJECT_NO_CHAPTERS = '章になるマスがありません（周囲8マスにタイトルか本文を入れてください）';

/** 既定の素材キー判定（scope だけで決める。サーバは実在・type を加味した判定を渡す） */
export function defaultMaterialKeyOf(link: Pick<MandalaLinkResolved, 'scope' | 'item_key'>): string | null {
  if (link.scope === 'library') return link.item_key;
  if (link.scope === 'text_analysis') {
    const n = Number(link.item_key);
    return Number.isInteger(n) && n > 0 ? makeAnalysisSourceKey(n) : null;
  }
  if (link.scope === 'episode') {
    const n = Number(link.item_key);
    return Number.isInteger(n) && n > 0 ? makeEpisodeSourceKey(n) : null;
  }
  return null;
}

const SECTION_HEADING = '### ';
const REFS_HEADING = '素材・参照:';

function refLine(r: MandalaKindleRef): string {
  const meta = scopeMetaOf(r.scope);
  const label = r.scope === 'episode' ? '体験' : '素材';
  const tail = r.kind === 'material' ? '' : '（参照のみ）';
  return `- ${label}: ${r.title || MANDALA_UNTITLED}（${meta.icon} ${meta.label}）${tail}`;
}

/**
 * 章の著者メモ（ウィザードの summary）を組む。memo は先頭にそのまま（1文字も変えない）。
 * 節は「### 節タイトル」＋本文、参照一覧は末尾。節も参照も無ければ memo と完全一致
 */
export function mandalaKindleSummaryText(memo: string, sections: readonly MandalaKindleSection[], refs: readonly MandalaKindleRef[]): string {
  const parts: string[] = [];
  if (memo.trim()) parts.push(memo);
  for (const s of sections) {
    const block = [`${SECTION_HEADING}${s.title}`];
    if (s.memo.trim()) block.push('', s.memo);
    const sRefs = s.refs.filter((r) => r.kind !== 'missing');
    if (sRefs.length > 0) block.push('', ...sRefs.map(refLine));
    parts.push(block.join('\n'));
  }
  const cRefs = refs.filter((r) => r.kind !== 'missing');
  if (cRefs.length > 0) parts.push([REFS_HEADING, ...cRefs.map(refLine)].join('\n'));
  return parts.join('\n\n');
}

/**
 * 変換本体。入力は 305 の mandalaOutlineNested() の結果と 302 の解決済みリンク（そのままの形）。
 * 同じ入力なら同じ出力（決定的）。副作用なし
 */
export function mandalaToKindleOutline(
  center: Pick<MandalaCell, 'title' | 'body'> | null,
  nested: readonly MandalaOutlineNode[],
  links: readonly MandalaLinkResolved[],
  options: MandalaKindleOptions = {},
): MandalaKindleResult {
  const includeEmpty = options.includeEmpty === true;
  const materialLimit = options.materialLimit ?? MAX_KINDLE_SOURCES;
  const materialCharLimit = options.materialCharLimit ?? MAX_KINDLE_TOTAL_CHARS;
  const materialKeyOf = options.materialKeyOf ?? defaultMaterialKeyOf;

  const bookTitle = chartDisplayTitle(center?.title);
  const untitledTheme = !(center?.title ?? '').trim();

  // リンクは id 順（＝付けた順）に並べてから配る。入力の並びに依存しない（R-74）
  const linksByCell = new Map<string, MandalaLinkResolved[]>();
  for (const l of [...links].sort((a, b) => a.id - b.id)) (linksByCell.get(l.cell_id) ?? linksByCell.set(l.cell_id, []).get(l.cell_id)!).push(l);

  const counts: MandalaKindleCounts = {
    chapters: 0,
    sections: 0,
    excludedEmpty: 0,
    missingLinks: 0,
    materials: 0,
    materialEpisodes: 0,
    referenceOnly: 0,
    materialOverflow: 0,
  };

  // 素材の割当は章順・リンク順に「上限内なら素材、超えたら参照のみ」。本全体で重複しない
  const materialSet = new Set<string>();
  let materialChars = 0;
  const refsOf = (cellId: string): MandalaKindleRef[] => {
    const rows = linksByCell.get(cellId) ?? [];
    return rows.map((l) => {
      const title = (l.title ?? '').trim();
      if (!l.exists) {
        counts.missingLinks += 1;
        return { scope: l.scope, item_key: l.item_key, title, kind: 'missing' as const, materialKey: null, char_count: null };
      }
      const key = materialKeyOf(l);
      if (key === null) {
        counts.referenceOnly += 1;
        return { scope: l.scope, item_key: l.item_key, title, kind: 'reference' as const, materialKey: null, char_count: l.char_count };
      }
      if (materialSet.has(key)) {
        // 別の章で既に素材になっている＝この章でも素材として参照（件数は増やさない）
        return { scope: l.scope, item_key: l.item_key, title, kind: 'material' as const, materialKey: key, char_count: l.char_count };
      }
      const chars = l.char_count ?? 0;
      if (materialSet.size >= materialLimit || materialChars + chars > materialCharLimit) {
        counts.referenceOnly += 1;
        counts.materialOverflow += 1;
        return { scope: l.scope, item_key: l.item_key, title, kind: 'reference' as const, materialKey: null, char_count: l.char_count };
      }
      materialSet.add(key);
      materialChars += chars;
      counts.materials += 1;
      if (l.scope === 'episode') counts.materialEpisodes += 1;
      return { scope: l.scope, item_key: l.item_key, title, kind: 'material' as const, materialKey: key, char_count: l.char_count };
    });
  };

  const chapters: MandalaKindleChapter[] = [];
  const cellIds: MandalaKindleCellIds = { chapter: {}, section: {} };
  for (const node of nested) {
    if (chapters.length >= MANDALA_KINDLE_CHAPTER_MAX) break;
    if (!includeEmpty && !isCellFilled(node.cell)) {
      counts.excludedEmpty += 1;
      // 空の親の子は章ごと落ちる＝子も除外数に数える（黙って落とさない）
      counts.excludedEmpty += node.children.filter((c) => includeEmpty || !isCellFilled(c.cell)).length;
      continue;
    }
    const sections: MandalaKindleSection[] = [];
    for (const child of node.children) {
      if (sections.length >= MANDALA_KINDLE_SECTION_MAX) break;
      if (!includeEmpty && !isCellFilled(child.cell)) {
        counts.excludedEmpty += 1;
        continue;
      }
      sections.push({
        cellId: child.cell.id,
        position: child.position,
        title: child.title,
        memo: child.cell.body,
        refs: [],
      });
    }
    const chapterRefs = refsOf(node.cell.id);
    for (const s of sections) s.refs = refsOf(s.cellId);
    const chapterNum = chapters.length + 1;
    const sourceIds: string[] = [];
    for (const r of [...chapterRefs, ...sections.flatMap((s) => s.refs)]) {
      if (r.kind === 'material' && r.materialKey && !sourceIds.includes(r.materialKey)) sourceIds.push(r.materialKey);
    }
    chapters.push({
      chapter_num: chapterNum,
      cellId: node.cell.id,
      position: node.position,
      title: node.title,
      memo: node.cell.body,
      sections,
      refs: chapterRefs,
      summary: mandalaKindleSummaryText(node.cell.body, sections, chapterRefs),
      source_ids: sourceIds,
    });
    cellIds.chapter[String(chapterNum)] = node.cell.id;
    cellIds.section[String(chapterNum)] = sections.map((s) => s.cellId);
    counts.sections += sections.length;
  }
  counts.chapters = chapters.length;

  if (chapters.length === 0) {
    return { ok: false, reason: MANDALA_KINDLE_REJECT_NO_CHAPTERS, bookTitle, untitledTheme, counts };
  }
  return { ok: true, bookTitle, untitledTheme, chapters, sourceIds: [...materialSet], counts, cellIds };
}

// ───────────────────────────────────────────────────────────────────────────
// 出どころの記録（§4-3 方式1: kindle_books.book_meta.mandala）
// ───────────────────────────────────────────────────────────────────────────

export interface MandalaBookSource {
  source: 'mandala';
  chartId: string;
  /** 起こした時点のチャート名（中央マス）。表示用。チャートが改名されても記録は変えない */
  chartTitle: string;
  cellIds: MandalaKindleCellIds;
  /** ISO 8601（UTC）。表示は JST（R-86） */
  importedAt: string;
  /** 二重発火の遮断用（R-87）。プレビューごとに1つ */
  nonce: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE_RE = /^[\w-]{8,64}$/;

/** book_meta.mandala の読み出し（形が崩れていれば null＝fail-closed） */
export function parseMandalaBookSource(bookMeta: unknown): MandalaBookSource | null {
  if (!bookMeta || typeof bookMeta !== 'object') return null;
  const m = (bookMeta as { mandala?: unknown }).mandala;
  if (!m || typeof m !== 'object') return null;
  const r = m as Record<string, unknown>;
  if (r.source !== 'mandala' || typeof r.chartId !== 'string' || !UUID_RE.test(r.chartId)) return null;
  if (typeof r.importedAt !== 'string' || Number.isNaN(Date.parse(r.importedAt))) return null;
  const cellIdsRaw = r.cellIds && typeof r.cellIds === 'object' ? (r.cellIds as Record<string, unknown>) : {};
  const chapter: Record<string, string> = {};
  const section: Record<string, string[]> = {};
  const ch = cellIdsRaw.chapter && typeof cellIdsRaw.chapter === 'object' ? (cellIdsRaw.chapter as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(ch)) if (typeof v === 'string' && UUID_RE.test(v)) chapter[k] = v;
  const se = cellIdsRaw.section && typeof cellIdsRaw.section === 'object' ? (cellIdsRaw.section as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(se)) if (Array.isArray(v)) section[k] = v.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x));
  return {
    source: 'mandala',
    chartId: r.chartId,
    chartTitle: typeof r.chartTitle === 'string' ? r.chartTitle : '',
    cellIds: { chapter, section },
    importedAt: r.importedAt,
    nonce: typeof r.nonce === 'string' && NONCE_RE.test(r.nonce) ? r.nonce : '',
  };
}

/** クライアントから create へ渡す記録の検証（サーバ側・fail-closed）。不正なら null */
export function validateMandalaBookSource(input: unknown): MandalaBookSource | null {
  const parsed = parseMandalaBookSource({ mandala: input });
  if (!parsed || !parsed.nonce) return null;
  return parsed;
}

/**
 * ④で章を並べ替え・削除した後の章配列から、章番号→cellId の記録を組み直す
 * （chapters は確定時の順・chapter_num 連番）。cellId を持たない章（手で足した章）は記録に載らない
 */
export function rebuildMandalaCellIds(
  chapters: readonly { chapter_num: number; mandala_cell_id?: string | null; mandala_section_cell_ids?: readonly string[] | null }[],
): MandalaKindleCellIds {
  const out: MandalaKindleCellIds = { chapter: {}, section: {} };
  for (const c of chapters) {
    if (typeof c.mandala_cell_id === 'string' && c.mandala_cell_id) {
      out.chapter[String(c.chapter_num)] = c.mandala_cell_id;
      out.section[String(c.chapter_num)] = Array.isArray(c.mandala_section_cell_ids) ? [...c.mandala_section_cell_ids] : [];
    }
  }
  return out;
}

/** 案件の見出し付近に出す文言（§3-4）。日時は呼び出し側が JST に整形して渡す（R-86） */
export function mandalaOriginLabel(source: Pick<MandalaBookSource, 'chartTitle'>, importedAtJst: string): string {
  return `マンダラ『${chartDisplayTitle(source.chartTitle)}』から起こした（${importedAtJst}）`;
}

/** チャート画面の「📕 起こした本: n件」の文言（§3-4）。0件は出さない（呼び出し側で判定） */
export function mandalaBooksLabel(n: number): string {
  return `📕 起こした本: ${n}件`;
}

/** プレビュー用の件数行（§3-2: 除外・リンク先なし・素材・参照のみ）。0件の行は出さない */
export function mandalaKindleCountLines(counts: MandalaKindleCounts): { key: keyof MandalaKindleCounts; text: string }[] {
  const out: { key: keyof MandalaKindleCounts; text: string }[] = [];
  out.push({ key: 'chapters', text: `章 ${counts.chapters}件・節 ${counts.sections}件` });
  if (counts.excludedEmpty > 0) out.push({ key: 'excludedEmpty', text: `空のため除外: ${counts.excludedEmpty}件` });
  if (counts.missingLinks > 0) out.push({ key: 'missingLinks', text: `リンク先なし（紐づけない）: ${counts.missingLinks}件` });
  out.push({ key: 'materials', text: `素材: ${counts.materials}件（うち📔 ${counts.materialEpisodes}件）` });
  if (counts.referenceOnly > 0) {
    out.push({
      key: 'referenceOnly',
      text: `参照のみ（メモ末尾に一覧）: ${counts.referenceOnly}件${counts.materialOverflow > 0 ? `（うち上限超過 ${counts.materialOverflow}件）` : ''}`,
    });
  }
  return out;
}
