// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラチャート — クライアント共用の純関数・定数（DB 非依存・R-108）
//
// 位置づけ（301 §1-2）: 📔エピソード記録＝一次情報の貯蔵庫 ／ マンダラ＝思考の骨格 ／ 📕Kindle＝骨格に素材を流し込む先。
// 302〜307 でデータモデルを作り直さないための取り決め（§4-3）を、このファイル1箇所に置く:
//   ① リンクの scope は固定列挙にせず文字列。許容値は MANDALA_LINK_SCOPES だけで管理する
//   ② 第2階層（81マス）の中央は保存しない。親マスのタイトルを表示側で導出する（R-92・R-74）
//   ③ chart / cell の meta（JSONB）は 305（反応メモ）・307（投稿記録）の受け皿。本便では書かない
//   ④ マスの id は不変（uuid）。他画面からは scope='mandala' + item_key=cell.id で参照する（297 と同じ形）
//   ⑤ チャート→アウトライン（目次順）は mandalaOutline() が唯一の正本。順序は MANDALA_OUTLINE_POSITIONS
//      に固定し、**グリッドの描画順もこの関数から取る**（表示と目次を別々に組まない・R-74）
//   ⑥ 一覧（本文を含まない軽い形）とチャート単位（全マス本文）の2経路は型で分ける
//
// このファイルは DB 層（lib/db.ts・lib/sanitize.ts）を import しない（クライアント部品が値 import するため・R-108）。
// サーバ専用（DB）は mandala-server.ts。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ───────────────────────────────────────────────────────────────────────────
// 定数
// ───────────────────────────────────────────────────────────────────────────

/** 3×3 の中央（テーマ）。第1階層ではチャート名、第2階層では親マスのタイトル（導出・保存しない） */
export const MANDALA_CENTER = 4;

/** 第1階層のマス数（3×3）。一覧の「5/9」の分母 */
export const MANDALA_DEPTH1_COUNT = 9;

/**
 * §4-3⑤ アウトライン（目次）の順序＝行優先・中央抜き。**ここ1箇所で固定**する。
 * グリッドの描画順は mandalaGridSlots() がこの配列から組み立てる（別の順序を書かない）。
 */
export const MANDALA_OUTLINE_POSITIONS: readonly number[] = [0, 1, 2, 3, 5, 6, 7, 8];

/** 位置の日本語ラベル（編集パネルの見出し・aria-label 用） */
export const MANDALA_POSITION_LABELS: readonly string[] = ['左上', '上', '右上', '左', '中央（テーマ）', '右', '左下', '下', '右下'];

/**
 * §4-3① マス⇄外部アイテムのリンク scope。固定の列挙（enum・CHECK制約）にせず、許容値はこの定数だけで管理する。
 * 302（記事・エピソードのリンクUI）・304（Kindle目次）・306（未調査マスからの発注）はここに足すだけで済む。
 */
export const MANDALA_LINK_SCOPES: readonly string[] = ['library', 'text_analysis', 'context', 'episode'];
export function isMandalaLinkScope(v: unknown): v is string {
  return typeof v === 'string' && MANDALA_LINK_SCOPES.includes(v);
}

/** §4-3④ 他画面（用途カテゴリ・マイフォルダ・306の自動紐づけ）からマスを指すときの scope 名 */
export const MANDALA_ITEM_SCOPE = 'mandala';

/** 入力の上限。本文は「長文を保存できる」が要件（§1-1）なので十分に大きく取る（DB の保護のみ） */
export const MANDALA_TITLE_MAX = 200;
export const MANDALA_BODY_MAX = 200_000;

/** 一覧カードの本文プレビューの長さ（2〜3行ぶん・§3-3） */
export const MANDALA_PREVIEW_MAX = 140;

/** 未保存で離れるときの確認文（パネルを閉じる／別マスへ移る／ページを離れる・§3-3。confirm は1回・R-56） */
export const MANDALA_UNSAVED_CONFIRM = 'このマスに未保存の変更があります。破棄してよろしいですか？';

// ───────────────────────────────────────────────────────────────────────────
// 型（§4-3⑥ 一覧＝軽い形／チャート単位＝全マス本文）
// ───────────────────────────────────────────────────────────────────────────

export interface MandalaCell {
  /** 不変の uuid（§4-3④） */
  id: string;
  chart_id: string;
  /** 第1階層は null、第2階層は親マスの id */
  parent_cell_id: string | null;
  depth: 1 | 2;
  /** 0〜8（3×3 の行優先） */
  position: number;
  title: string;
  body: string;
  /** §4-3③ 305/307 の受け皿。本便では常に {} */
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** 一覧API（本文を含まない・§4-3⑥）。title は中央マスのタイトル（§3-5・二重管理しない） */
export interface MandalaChartSummary {
  id: string;
  title: string;
  /** 第1階層で埋まっているマス数（分母は MANDALA_DEPTH1_COUNT） */
  filled_count: number;
  /** 全階層で埋まっているマス数（303以降） */
  filled_total: number;
  /** リンク済み件数（302〜） */
  link_count: number;
  /** 302 §5: 一次情報（📔エピソードのリンク）が1件以上ある埋まったマス数。分母は filled_count */
  primary_count: number;
  /** 305: 第2階層（子マス）の行数。削除の確認文に出す */
  child_count: number;
  /** 308: 反応記録のある埋まったマス数（第1階層）。0 なら一覧に出さない */
  reaction_count: number;
  /** 308: 型（meta.preset）。無ければ null */
  preset: string | null;
  created_at: string;
  updated_at: string;
}

/** チャート単位API（全マス本文を含む・§4-3⑥） */
export interface MandalaChartDetail {
  id: string;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  cells: MandalaCell[];
}

// ───────────────────────────────────────────────────────────────────────────
// 判定（すべて決定的・R-74）
// ───────────────────────────────────────────────────────────────────────────

/** 空のマスは正常状態（§4-4）。タイトルか本文のどちらかに空白以外があれば「埋まっている」 */
export function isCellFilled(cell: Pick<MandalaCell, 'title' | 'body'> | null | undefined): boolean {
  if (!cell) return false;
  return cell.title.trim() !== '' || cell.body.trim() !== '';
}

export function filledCount(cells: readonly MandalaCell[], depth?: 1 | 2): number {
  return cells.filter((c) => (depth === undefined || c.depth === depth) && isCellFilled(c)).length;
}

/** 第1階層の中央マス */
export function centerCell(cells: readonly MandalaCell[]): MandalaCell | null {
  return cells.find((c) => c.depth === 1 && c.position === MANDALA_CENTER) ?? null;
}

/** §3-5 中央マスのタイトル＝チャート名。空なら「（無題）」（DB にチャート名を持たない・R-74） */
export const MANDALA_UNTITLED = '（無題）';
export function chartDisplayTitle(centerTitle: string | null | undefined): string {
  const t = (centerTitle ?? '').trim();
  return t || MANDALA_UNTITLED;
}

/** マスの見出し（パネル・全画面のタイトル行）。空なら位置ラベルで補う */
export function cellDisplayTitle(cell: Pick<MandalaCell, 'title' | 'position'> | null | undefined): string {
  if (!cell) return MANDALA_UNTITLED;
  const t = cell.title.trim();
  return t || `${MANDALA_UNTITLED} ${MANDALA_POSITION_LABELS[cell.position] ?? ''}`.trim();
}

/**
 * 一覧カードの本文プレビュー（§3-3 冒頭2〜3行）。Markdown 記号（見出し・強調・箇条書き）は文字として
 * 出さない（R-18）。整形表示ではなく「冒頭の文字列」なので renderMarkdown は使わない（読む画面は MarkdownBody）。
 */
export function cellPreviewText(body: string, max: number = MANDALA_PREVIEW_MAX): string {
  const text = (body ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/^\s*\d+[.)]\s+/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim(),
    )
    .filter((line) => line !== '' && !/^-{3,}$/.test(line))
    .join(' ');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

// ───────────────────────────────────────────────────────────────────────────
// §4-3⑤ アウトライン（目次順）と §4-3② 中央の導出 — グリッドもこの関数から描く
// ───────────────────────────────────────────────────────────────────────────

/** アウトラインの1行。depth=2 の中央（position 4）は保存されないので現れない */
export interface MandalaOutlineEntry {
  /** 実在する行（保存済み）。未作成の第2階層はまだ無いので、その位置は行ごと出ない */
  cell: MandalaCell;
  depth: 1 | 2;
  position: number;
  /** 第2階層なら親（第1階層）の position。第1階層は null */
  parentPosition: number | null;
  /** 目次に出す名前（空なら位置ラベルで補う） */
  title: string;
}

/**
 * チャートの全マス → 目次順の配列（304 の Kindle 目次・307 の投稿シリーズがこの順を使う）。
 * 順序: 第1階層を MANDALA_OUTLINE_POSITIONS 順に並べ、各マスの直後にその第2階層（同じ順・中央抜き）を挟む。
 * 中央（テーマ）は目次の「本のタイトル」に当たるので配列には含めない（chartDisplayTitle で取る）。
 * 同じ入力→同じ出力（配列の順序に依存しない・R-74）。
 */
export function mandalaOutline(cells: readonly MandalaCell[]): MandalaOutlineEntry[] {
  const depth1 = new Map<number, MandalaCell>();
  const childrenOf = new Map<string, Map<number, MandalaCell>>();
  for (const c of cells) {
    if (c.depth === 1) {
      depth1.set(c.position, c);
    } else if (c.parent_cell_id) {
      if (c.position === MANDALA_CENTER) continue; // ② 中央は保存しない（来ても捨てる）
      const m = childrenOf.get(c.parent_cell_id) ?? new Map<number, MandalaCell>();
      m.set(c.position, c);
      childrenOf.set(c.parent_cell_id, m);
    }
  }
  const out: MandalaOutlineEntry[] = [];
  for (const p of MANDALA_OUTLINE_POSITIONS) {
    const parent = depth1.get(p);
    if (!parent) continue;
    out.push({ cell: parent, depth: 1, position: p, parentPosition: null, title: cellDisplayTitle(parent) });
    const kids = childrenOf.get(parent.id);
    if (!kids) continue;
    for (const q of MANDALA_OUTLINE_POSITIONS) {
      const kid = kids.get(q);
      if (!kid) continue;
      out.push({ cell: kid, depth: 2, position: q, parentPosition: p, title: cellDisplayTitle(kid) });
    }
  }
  return out;
}

/** グリッドの1枠。cell が null なら未作成（第2階層で親を展開する前）。derived は「保存されない中央」（②） */
export interface MandalaGridSlot {
  position: number;
  cell: MandalaCell | null;
  /** 中央を親から導出した枠（第2階層のみ true）。保存されない（押すと親マスそのものの編集になる・305） */
  derived: boolean;
  /** 導出枠に表示するタイトル（親マスのタイトル）。第1階層の中央は cell.title なので null */
  derivedTitle: string | null;
  /** 305: 導出枠の実体＝親マス（同じ cell.id）。第1階層は null */
  derivedCell: MandalaCell | null;
}

/**
 * 3×3 の描画順（9枠・position 0〜8）。**周囲8枠の順序は mandalaOutline() から取り**、中央を index 4 に差し込む
 * ＝表示と目次を別々に組まない（R-74）。
 * - parentCellId が null: 第1階層。中央は保存済みの行（チャート名）
 * - parentCellId あり: 第2階層。中央は親マスのタイトルを導出（保存しない・②）
 */
export function mandalaGridSlots(cells: readonly MandalaCell[], parentCellId: string | null = null): MandalaGridSlot[] {
  const outline = mandalaOutline(cells);
  const ring = outline.filter((e) =>
    parentCellId === null ? e.depth === 1 : e.depth === 2 && e.cell.parent_cell_id === parentCellId,
  );
  const byPosition = new Map(ring.map((e) => [e.position, e.cell]));
  const slots: MandalaGridSlot[] = MANDALA_OUTLINE_POSITIONS.map((p) => ({
    position: p,
    cell: byPosition.get(p) ?? null,
    derived: false,
    derivedTitle: null,
    derivedCell: null,
  }));
  const parent = parentCellId === null ? null : (cells.find((c) => c.id === parentCellId) ?? null);
  const center: MandalaGridSlot =
    parentCellId === null
      ? { position: MANDALA_CENTER, cell: centerCell(cells), derived: false, derivedTitle: null, derivedCell: null }
      : {
          position: MANDALA_CENTER,
          cell: null,
          derived: true,
          derivedTitle: cellDisplayTitle(parent),
          derivedCell: parent,
        };
  slots.splice(MANDALA_CENTER, 0, center);
  return slots;
}

// ───────────────────────────────────────────────────────────────────────────
// 文言（決定的・R-74）
// ───────────────────────────────────────────────────────────────────────────

/**
 * §3-2 削除の確認文。埋まっているマス数とリンク済み件数を出す。confirm はこの1本だけ（R-56）。
 * 削除は不可逆で Undo を持たないので「元に戻せない」を必ず明記する（250と同じ3点）。
 */
export function mandalaDeleteConfirmMessage(title: string, filled: number, links: number, children: number = 0): string {
  return (
    `マンダラ「${chartDisplayTitle(title)}」を削除します。\n\n` +
    `埋まっているマス: ${filled}/${MANDALA_DEPTH1_COUNT}\n` +
    (children > 0 ? `子マス（81マス）: ${children}件\n` : '') +
    `リンク済み: ${links}件\n\n` +
    `削除すると全マスとリンクが消え、元に戻せません（取り消しはできません）。\n` +
    `よろしいですか？`
  );
}

/**
 * §4-4 保存成功の表示は**保存された行**から作る（R-95）。送った値や API の応答の形に依存しない。
 * 空で保存＝マスを空に戻す操作（正常・§4-4）なので、その旨を出す。
 */
export function cellSavedMessage(row: Pick<MandalaCell, 'title' | 'body' | 'position'>): string {
  if (!isCellFilled(row)) return `マス「${MANDALA_POSITION_LABELS[row.position] ?? row.position}」を空にしました`;
  return `「${cellDisplayTitle(row)}」を保存しました（${row.body.length.toLocaleString()}文字）`;
}

/** 入力の整形（画面・API 共用）。タイトルは1行・前後空白なし、本文は改行を保ったまま上限だけ切る */
export function normalizeCellInput(input: { title?: unknown; body?: unknown }): { title: string; body: string } {
  const title = (typeof input.title === 'string' ? input.title : '').replace(/[\r\n]+/g, ' ').trim().slice(0, MANDALA_TITLE_MAX);
  const body = (typeof input.body === 'string' ? input.body : '').replace(/\r\n?/g, '\n').slice(0, MANDALA_BODY_MAX);
  return { title, body };
}

/** uuid 風か（API の id 検証。DB へ渡す前の形式チェックのみ） */
export function isUuidLike(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// ═══════════════════════════════════════════════════════════════════════════
// 302: A 比較／B リンク／C 一次情報／D 未保存本文の退避 — すべて DB 非依存の純関数・定数
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// B. リンク（302 §4）。scope の許容値は MANDALA_LINK_SCOPES（301）が正本＝ここに別の列挙を作らない
// ───────────────────────────────────────────────────────────────────────────

/** 他画面で「1件を開いた状態」にする URL パラメータ名（📚🗂🧠📔の4画面が読む） */
export const MANDALA_OPEN_PARAM = 'open';

export interface MandalaScopeMeta {
  icon: string;
  label: string;
  /** §4-4 リンク先を直接開く遷移先（既存画面＋?open=。新しい詳細ページは作らない） */
  openHref: (itemKey: string) => string;
}

/** scope ごとの表示と遷移先。キーは MANDALA_LINK_SCOPES の値と一致させる（U71 で固定） */
export const MANDALA_SCOPE_META: Record<string, MandalaScopeMeta> = {
  library: { icon: '📚', label: 'リサーチ保存', openHref: (k) => `/dashboard/library?${MANDALA_OPEN_PARAM}=${encodeURIComponent(k)}` },
  text_analysis: { icon: '🗂', label: 'テキスト分析', openHref: (k) => `/dashboard/saved?${MANDALA_OPEN_PARAM}=${encodeURIComponent(k)}` },
  context: { icon: '🧠', label: 'AI参照素材', openHref: (k) => `/dashboard/context-library?${MANDALA_OPEN_PARAM}=${encodeURIComponent(k)}` },
  episode: { icon: '📔', label: 'エピソード記録', openHref: (k) => `/dashboard/episodes?${MANDALA_OPEN_PARAM}=${encodeURIComponent(k)}` },
};

export function scopeMetaOf(scope: string): MandalaScopeMeta {
  return MANDALA_SCOPE_META[scope] ?? { icon: '🔗', label: scope, openHref: () => '' };
}

/** チャート単位APIが返す軽いリンク行（グリッドの件数・一次情報の導出に使う） */
export interface MandalaLinkLite {
  id: number;
  cell_id: string;
  scope: string;
  item_key: string;
  created_at: string;
}

/**
 * パネルのリンク欄に出す解決済みの行。**確実な鍵（scope/item_key）と解決結果（title/exists）を分ける**（R-92）。
 * タイトルは保存せず読み出し時に scope ごとに解決する＝リンク先が消えていれば exists=false・title=null
 */
export interface MandalaLinkResolved extends MandalaLinkLite {
  note: string;
  title: string | null;
  exists: boolean;
  char_count: number | null;
  item_created_at: string | null;
}

/** リンク先が消えているときの表示（§4-3。外せることはそのまま） */
export const MANDALA_LINK_MISSING_LABEL = 'リンク先なし（削除済み）';

export function linkDisplayTitle(link: Pick<MandalaLinkResolved, 'title' | 'exists'>): string {
  if (!link.exists) return MANDALA_LINK_MISSING_LABEL;
  const t = (link.title ?? '').trim();
  return t || MANDALA_UNTITLED;
}

/** 1リクエストで付けられる件数の上限（298 の一括付け外しと同じ考え方・R-101） */
export const MANDALA_LINK_BULK_LIMIT = 100;

export interface MandalaLinkCounts {
  total: number;
  episode: number;
}

/** マスごとのリンク件数（🔗n）とエピソード件数（📔n・C の一次情報）。入力順に依存しない */
export function linkCountsByCell(links: readonly MandalaLinkLite[]): Map<string, MandalaLinkCounts> {
  const map = new Map<string, MandalaLinkCounts>();
  for (const l of links) {
    const cur = map.get(l.cell_id) ?? { total: 0, episode: 0 };
    cur.total += 1;
    if (l.scope === 'episode') cur.episode += 1;
    map.set(l.cell_id, cur);
  }
  return map;
}

/**
 * 一括で付けた結果の文言（決定的・R-74）。一部失敗でも成功分は反映済み（R-39）なので成功数と失敗数を両方出す。
 * unchanged＝既にリンク済みだった件数（一意制約に到達しない・ON CONFLICT DO NOTHING）
 */
export function linkBulkResultMessage(r: { added: number; unchanged: number; failed: number }): string {
  const parts: string[] = [`${r.added}件をリンクしました`];
  if (r.unchanged > 0) parts.push(`${r.unchanged}件は既にリンク済み`);
  const head = r.failed > 0 ? '⚠️' : '✅';
  const tail = r.failed > 0 ? `／❌ ${r.failed}件は失敗しました（成功した分は反映されています）` : '';
  return `${head} ${parts.join('・')}${tail}`;
}

/** ピッカーに出す1件（4種のAPIの形をここで1つに揃える） */
export interface MandalaPickerItem {
  scope: string;
  key: string;
  title: string;
  /** 種別ラベルなど補助の1行（無ければ空） */
  sub: string;
  charCount: number;
  createdAt: string;
}

/** ピッカーの検索件数の上限（軽い一覧APIの limit） */
export const MANDALA_PICKER_LIMIT = 50;

/**
 * §4-2 検索元は既存の軽い一覧API（本文を含まない経路）。scope ごとの URL をここ1箇所で決める:
 *   📚 /api/library?light=1（302で足したオプトイン・title 検索のみ）／🗂 /api/text-analysis/saves（194 一覧v2・qScope=title）
 *   🧠 /api/context-saves（175 一覧・qScope=title）／📔 /api/episodes（281。記録は短いので全欄でよい）
 */
export function pickerSearchUrl(scope: string, q: string): string {
  const qs = q.trim();
  const enc = encodeURIComponent(qs);
  switch (scope) {
    case 'library':
      return `/api/library?light=1&limit=${MANDALA_PICKER_LIMIT}${qs ? `&q=${enc}` : ''}`;
    case 'text_analysis':
      return `/api/text-analysis/saves?limit=${MANDALA_PICKER_LIMIT}&qScope=title${qs ? `&q=${enc}` : ''}`;
    case 'context':
      return `/api/context-saves?limit=${MANDALA_PICKER_LIMIT}&qScope=title${qs ? `&q=${enc}` : ''}`;
    case 'episode':
      return `/api/episodes?limit=${MANDALA_PICKER_LIMIT}${qs ? `&q=${enc}` : ''}`;
    default:
      return '';
  }
}

type AnyRow = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** 4種のAPI応答を MandalaPickerItem[] に揃える（決定的・応答の形に依存する箇所はここだけ） */
export function pickerItemsOf(scope: string, json: unknown): MandalaPickerItem[] {
  const rows: AnyRow[] = Array.isArray(json)
    ? (json as AnyRow[])
    : json && typeof json === 'object' && Array.isArray((json as AnyRow).items)
      ? ((json as AnyRow).items as AnyRow[])
      : [];
  const out: MandalaPickerItem[] = [];
  for (const r of rows) {
    const key = str(r.id);
    if (!key) continue;
    if (scope === 'library') {
      out.push({ scope, key, title: str(r.title), sub: str(r.type), charCount: num(r.char_count), createdAt: str(r.created_at) });
    } else if (scope === 'text_analysis') {
      out.push({
        scope,
        key,
        title: str(r.auto_title) || str(r.file_name),
        sub: str(r.analysis_label),
        charCount: num(r.char_count),
        createdAt: str(r.created_at),
      });
    } else if (scope === 'context') {
      out.push({ scope, key, title: str(r.topic), sub: str(r.category), charCount: num(r.char_count), createdAt: str(r.created_at) });
    } else if (scope === 'episode') {
      const fields = ['period', 'situation', 'feelings', 'details', 'thoughts', 'reflection'];
      const fallback = (str(r.situation) || str(r.details)).trim().replace(/\s+/g, ' ');
      const title = str(r.title).trim() || (fallback ? fallback.slice(0, 30) + (fallback.length > 30 ? '…' : '') : MANDALA_UNTITLED);
      out.push({
        scope,
        key,
        title,
        sub: str(r.period),
        charCount: fields.reduce((s, f) => s + str(r[f]).length, 0) + str(r.title).length,
        createdAt: str(r.created_at),
      });
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// C. 一次情報あり／なし（302 §5）— scope='episode' のリンク件数から決定的に導出（R-74）。別の状態を保存しない
// ───────────────────────────────────────────────────────────────────────────

export interface PrimaryInfoSummary {
  /** 一次情報（📔リンク）が1件以上あるマス数（分子） */
  withPrimary: number;
  /** 埋まっているマス数（分母。第1階層） */
  filled: number;
}

/** 見出しの「一次情報あり n/m」。空のマスは分母にも分子にも入れない（§5） */
export function primaryInfoSummary(cells: readonly MandalaCell[], links: readonly MandalaLinkLite[]): PrimaryInfoSummary {
  const counts = linkCountsByCell(links);
  let filled = 0;
  let withPrimary = 0;
  for (const c of cells) {
    if (c.depth !== 1 || !isCellFilled(c)) continue;
    filled += 1;
    if ((counts.get(c.id)?.episode ?? 0) > 0) withPrimary += 1;
  }
  return { withPrimary, filled };
}

// ───────────────────────────────────────────────────────────────────────────
// A. 複数マスの比較（302 §3）
// ───────────────────────────────────────────────────────────────────────────

/** 選べる件数の上限＝第1階層の全マス（9）。列数（1〜4・幅で折り返し）とは別に決める（R-94） */
export const MANDALA_COMPARE_MAX = MANDALA_DEPTH1_COUNT;
export const MANDALA_COMPARE_MIN = 2;

/** 比較ボタンの状態。下限未満・上限超えは無効化して理由を出す（R-101。上限は全マス数なので通常は超えない） */
export function mandalaCompareState(selectedCount: number): { enabled: boolean; label: string; reason: string | null } {
  if (selectedCount < MANDALA_COMPARE_MIN) {
    return { enabled: false, label: `⇔ 選択した${selectedCount}件を比較`, reason: `比較は${MANDALA_COMPARE_MIN}件以上のマスを選んでください` };
  }
  if (selectedCount > MANDALA_COMPARE_MAX) {
    return { enabled: false, label: `⇔ 比較（最大${MANDALA_COMPARE_MAX}件）`, reason: `比較できるのは${MANDALA_COMPARE_MAX}件までです（${selectedCount}件選択中）` };
  }
  return { enabled: true, label: `⇔ 選択した${selectedCount}件を比較`, reason: null };
}

/** 選択のトグル（選んだ順を保つ）。上限を超える追加は受け付けない（271 と同じ・黙って押し出さない） */
export function toggleCellSelection(ids: readonly string[], id: string, max: number = MANDALA_COMPARE_MAX): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  if (ids.length >= max) return [...ids];
  return [...ids, id];
}

/** 比較の列＝選んだ順の、埋まっている実在マスだけ（空のマスは比較に出ない・§3-1） */
export function compareCellsOf(cells: readonly MandalaCell[], selectedIds: readonly string[]): MandalaCell[] {
  const byId = new Map(cells.map((c) => [c.id, c]));
  const out: MandalaCell[] = [];
  for (const id of selectedIds) {
    const c = byId.get(id);
    if (!c || !isCellFilled(c)) continue;
    out.push(c);
    if (out.length >= MANDALA_COMPARE_MAX) break;
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// D. 未保存本文の退避と復元（302 §6）— ブラウザのローカル保存。鍵はマスの id。サーバーには書かない
// ───────────────────────────────────────────────────────────────────────────

export const MANDALA_STASH_PREFIX = 'mandala_draft:';
/** 入力のたびに退避するデバウンス（ms） */
export const MANDALA_STASH_DEBOUNCE_MS = 500;

export interface MandalaStash {
  title: string;
  body: string;
  /** 退避時刻（ISO） */
  at: string;
}

export function mandalaStashKey(cellId: string): string {
  return `${MANDALA_STASH_PREFIX}${cellId}`;
}

/** 退避と保存済みが同じ内容か（同じなら提案を出さず退避を消す・§6-2） */
export function isStashSameAsSaved(stash: Pick<MandalaStash, 'title' | 'body'>, saved: { title: string; body: string }): boolean {
  return stash.title === saved.title && stash.body === saved.body;
}

/** §6-2 復元を提案する条件: 退避があり、かつ保存済みの本文と異なる（黙って上書きしない） */
export function shouldOfferRestore(stash: MandalaStash | null, saved: { title: string; body: string }): boolean {
  if (!stash) return false;
  return !isStashSameAsSaved(stash, saved);
}

export function loadStash(cellId: string): MandalaStash | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(mandalaStashKey(cellId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<MandalaStash>;
    if (typeof v?.title !== 'string' || typeof v?.body !== 'string') return null;
    return { title: v.title, body: v.body, at: typeof v.at === 'string' ? v.at : '' };
  } catch {
    return null;
  }
}

export function saveStash(cellId: string, stash: MandalaStash): void {
  try {
    window.localStorage.setItem(mandalaStashKey(cellId), JSON.stringify(stash));
  } catch {}
}

export function clearStash(cellId: string): void {
  try {
    window.localStorage.removeItem(mandalaStashKey(cellId));
  } catch {}
}

// ───────────────────────────────────────────────────────────────────────────
// 304: バッジのホバーポップアップ（リンク一覧）の判断（純関数）
// ───────────────────────────────────────────────────────────────────────────

/** ポップアップに出す上限（§2-1）。超えた分は「他 n件 → パネルで見る」の1行に畳む（R-101/R-109） */
export const MANDALA_POPOVER_MAX = 8;

export type MandalaPopoverFrom = 'links' | 'episode' | 'reaction' | 'articles' | 'research';

/**
 * ポップアップの行を決める。📔 から開いたときは episode を先頭に並べる（安定ソート＝同種内は元の順）。
 * 返り値: 表示する行と、畳んだ残り件数
 */
export function popoverRowsOf(
  links: readonly MandalaLinkResolved[],
  from: MandalaPopoverFrom,
  max: number = MANDALA_POPOVER_MAX,
): { rows: MandalaLinkResolved[]; rest: number } {
  const ordered =
    from === 'episode'
      ? [...links.filter((l) => l.scope === 'episode'), ...links.filter((l) => l.scope !== 'episode')]
      : [...links];
  return { rows: ordered.slice(0, max), rest: Math.max(0, ordered.length - max) };
}

/** ポップアップの識別子（マス×どのバッジからでも同じ箱＝同じ key にする） */
export function popoverKeyOf(cellId: string): string {
  return `mandala-links:${cellId}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 305: 81マス表示（第2階層）— 切替の保存・入れ子の目次・集計（DB 非依存の純関数・定数）
// ═══════════════════════════════════════════════════════════════════════════

/** 表示モードの保存先（303 の並び順と同じ localStorage） */
export const MANDALA_VIEW_STORAGE_KEY = 'mandala_view_mode';
export type MandalaView = '9' | '81';
export const MANDALA_VIEW_DEFAULT: MandalaView = '9';
export function parseMandalaView(raw: string | null | undefined): MandalaView {
  return raw === '81' ? '81' : MANDALA_VIEW_DEFAULT;
}

/** 第2階層の子マス数（8ブロック×8） */
export const MANDALA_CHILD_TOTAL = (MANDALA_DEPTH1_COUNT - 1) * (MANDALA_DEPTH1_COUNT - 1);

/**
 * 305是正②（309 期）: 81マスをブロック単位に落とす**グリッド領域の幅**（px）。viewport 幅ではなく描画領域で判定する
 * （サイドパネル 480px が開くと画面は広いのに領域だけ狭くなる）。従来の viewport 900px は、サイドバー 220px と
 * 余白を引くと領域 ≈640px に相当するので、その値を閾値にする。1ブロック（3マス＋間隔）が ≈200px を割ると読めない
 */
export const MANDALA_NARROW_MIN_WIDTH = 640;
/** 1ブロックの子マス数（中央を除く8） */
export const MANDALA_CHILD_PER_BLOCK = MANDALA_DEPTH1_COUNT - 1;

/** §2-7 入れ子の目次: 親（第1階層）ごとに、その子（第2階層・MANDALA_OUTLINE_POSITIONS 順）を持つ */
export interface MandalaOutlineNode {
  cell: MandalaCell;
  position: number;
  title: string;
  /** 展開していない親は空配列 */
  children: MandalaOutlineEntry[];
}

/**
 * mandalaOutline()（平坦・301）を**そのまま**親ごとにまとめた入れ子形。順序は平坦形と同一＝表示と目次を別々に組まない。
 * 306（マンダラ→Kindle目次）はこれを読む。第1階層だけの入力では children がすべて空配列になる（平坦形の結果は不変・R-88）。
 */
export function mandalaOutlineNested(cells: readonly MandalaCell[]): MandalaOutlineNode[] {
  const out: MandalaOutlineNode[] = [];
  let cur: MandalaOutlineNode | null = null;
  for (const e of mandalaOutline(cells)) {
    if (e.depth === 1) {
      cur = { cell: e.cell, position: e.position, title: e.title, children: [] };
      out.push(cur);
    } else if (cur && e.cell.parent_cell_id === cur.cell.id) {
      cur.children.push(e);
    }
  }
  return out;
}

/** 親マス（第1階層）の位置ラベルを含む「親 › 子」（§2-5）。第1階層はそのまま */
export function cellPathLabel(cell: Pick<MandalaCell, 'depth' | 'position' | 'parent_cell_id'>, cells: readonly MandalaCell[]): string {
  const own = MANDALA_POSITION_LABELS[cell.position] ?? String(cell.position);
  if (cell.depth !== 2 || !cell.parent_cell_id) return own;
  const parent = cells.find((c) => c.id === cell.parent_cell_id);
  const parentLabel = parent ? (MANDALA_POSITION_LABELS[parent.position] ?? String(parent.position)) : '?';
  return `${parentLabel} › ${own}`;
}

/** そのブロック（親）が展開済みか＝子の行が1つでもあるか */
export function isBlockExpanded(cells: readonly MandalaCell[], parentCellId: string): boolean {
  return cells.some((c) => c.depth === 2 && c.parent_cell_id === parentCellId);
}

export interface ExpansionSummary {
  /** 展開済みブロック数（子の行が1つでもある親の数）／8 */
  expandedBlocks: number;
  /** 埋まっている子マス数／64 */
  childFilled: number;
  /** 一次情報（📔）が1件以上ある埋まった子マス数 */
  childWithPrimary: number;
}

/** §2-6 81表示のときだけ出す集計（9マス分の n/9・📔 n/m とは別。決定的・R-74） */
export function expansionSummary(cells: readonly MandalaCell[], links: readonly MandalaLinkLite[]): ExpansionSummary {
  const counts = linkCountsByCell(links);
  const parents = new Set<string>();
  let childFilled = 0;
  let childWithPrimary = 0;
  for (const c of cells) {
    if (c.depth !== 2 || !c.parent_cell_id) continue;
    parents.add(c.parent_cell_id);
    if (!isCellFilled(c)) continue;
    childFilled += 1;
    if ((counts.get(c.id)?.episode ?? 0) > 0) childWithPrimary += 1;
  }
  return { expandedBlocks: parents.size, childFilled, childWithPrimary };
}

// ═══════════════════════════════════════════════════════════════════════════
// 308: 有料note記事の型（区分 meta.tier）／マス単位の反応記録（meta.reaction）／無料比率 — DB 非依存の純関数・定数
//   meta は**キー単位でマージ**する（tier・reaction・chart.preset）。丸ごと置き換える経路を作らない（§5）
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// 区分（無料／有料）。定義（どの位置がどちらか）は lib/mandala-presets.ts、判定と表示語はここ
// ───────────────────────────────────────────────────────────────────────────

export type MandalaTier = 'free' | 'paid';
export const MANDALA_TIERS: readonly MandalaTier[] = ['free', 'paid'];
/** 表示語は短く（R-57）。「有料ラインの下」であることが一目で分かる色は表示側 */
export const MANDALA_TIER_LABELS: Record<MandalaTier, string> = { free: '無料', paid: '有料' };
export function isMandalaTier(v: unknown): v is MandalaTier {
  return v === 'free' || v === 'paid';
}
/** マスの区分（meta.tier）。無ければ null＝区分の表示は何も増えない（既存チャート・§7） */
export function cellTier(cell: Pick<MandalaCell, 'meta'> | null | undefined): MandalaTier | null {
  const t = cell?.meta?.tier;
  return isMandalaTier(t) ? t : null;
}
/** チャートの型（meta.preset）。無ければ null */
export function chartPreset(meta: Record<string, unknown> | null | undefined): string | null {
  const p = meta?.preset;
  return typeof p === 'string' && p ? p : null;
}

// ───────────────────────────────────────────────────────────────────────────
// 反応記録（§3-1）。単一のスナップショット。購入率は保存せず表示側で導出（R-74）
// ───────────────────────────────────────────────────────────────────────────

export const MANDALA_REACTION_KEYS = ['views', 'likes', 'shares', 'purchases'] as const;
export type MandalaReactionKey = (typeof MANDALA_REACTION_KEYS)[number];
export const MANDALA_REACTION_LABELS: Record<MandalaReactionKey, string> = {
  views: 'アクセス',
  likes: 'スキ',
  shares: '共有',
  purchases: '購入',
};
export const MANDALA_REACTION_MEMO_MAX = 100;
/** 上限（整数の保護のみ。桁あふれで壊れないため） */
export const MANDALA_REACTION_VALUE_MAX = 1_000_000_000;

export interface MandalaReaction {
  views?: number;
  likes?: number;
  shares?: number;
  purchases?: number;
  memo?: string;
  /** 記録日時（ISO・UTC）。表示は JST（R-86） */
  recordedAt: string;
}

/** meta.reaction の読み出し。形が崩れていれば null（fail-closed）。数値は非負整数だけ拾う */
export function parseReaction(meta: Record<string, unknown> | null | undefined): MandalaReaction | null {
  const r = meta?.reaction;
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const out: MandalaReaction = { recordedAt: typeof o.recordedAt === 'string' ? o.recordedAt : '' };
  let any = false;
  for (const k of MANDALA_REACTION_KEYS) {
    const v = o[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
      out[k] = v;
      any = true;
    }
  }
  if (typeof o.memo === 'string' && o.memo.trim()) {
    out.memo = o.memo.slice(0, MANDALA_REACTION_MEMO_MAX);
    any = true;
  }
  return any ? out : null;
}

export function hasReaction(cell: Pick<MandalaCell, 'meta'> | null | undefined): boolean {
  return parseReaction(cell?.meta) !== null;
}

export type ReactionInputResult =
  | { ok: true; reaction: Omit<MandalaReaction, 'recordedAt'> | null }
  | { ok: false; error: string };

/**
 * 記録の入力検証（画面・API 共用・fail-closed）。空欄（undefined / null / ''）は「未記録」、数値は非負整数のみ。
 * 全部空なら reaction=null＝キーごと消す（§3-1）。不正は理由つきで拒否（API は 400・何も書かない）
 */
export function normalizeReactionInput(input: Record<string, unknown> | null | undefined): ReactionInputResult {
  const src = input && typeof input === 'object' ? input : {};
  const out: Omit<MandalaReaction, 'recordedAt'> = {};
  let any = false;
  for (const k of MANDALA_REACTION_KEYS) {
    const raw = src[k];
    if (raw === undefined || raw === null || raw === '') continue;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > MANDALA_REACTION_VALUE_MAX) {
      return { ok: false, error: `${MANDALA_REACTION_LABELS[k]}は0以上の整数で入力してください` };
    }
    out[k] = n;
    any = true;
  }
  const memoRaw = src.memo;
  if (memoRaw !== undefined && memoRaw !== null) {
    if (typeof memoRaw !== 'string') return { ok: false, error: '一言は文字列で入力してください' };
    const memo = memoRaw.replace(/\r\n?/g, '\n').trim();
    if (memo.length > MANDALA_REACTION_MEMO_MAX) {
      return { ok: false, error: `一言は${MANDALA_REACTION_MEMO_MAX}字以内で入力してください（${memo.length}字）` };
    }
    if (memo) {
      out.memo = memo;
      any = true;
    }
  }
  return { ok: true, reaction: any ? out : null };
}

/** 2つの記録が（記録日時を除いて）同じか。同一内容の再送は書かない（R-87 のサーバ側） */
export function isSameReaction(a: Omit<MandalaReaction, 'recordedAt'> | null, b: Omit<MandalaReaction, 'recordedAt'> | null): boolean {
  if (!a || !b) return a === b;
  return MANDALA_REACTION_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null)) && (a.memo ?? '') === (b.memo ?? '');
}

/** 購入率＝purchases ÷ views。views が 0 か未記録なら null（出さない・§3-1）。保存しない（R-74） */
export function purchaseRate(r: Pick<MandalaReaction, 'views' | 'purchases'> | null | undefined): number | null {
  if (!r || typeof r.views !== 'number' || r.views <= 0 || typeof r.purchases !== 'number') return null;
  return r.purchases / r.views;
}

/** 表示用（小数1桁）。0.125 → 12.5% */
export function formatRate(rate: number): string {
  return `${(Math.round(rate * 1000) / 10).toLocaleString()}%`;
}

export interface ReactionSummary {
  /** 記録のある埋まったマス数（第1階層） */
  withReaction: number;
  /** 埋まっているマス数（第1階層）。302 の一次情報と同じ分母 */
  filled: number;
}

/** 見出しの「📈 反応記録 n/m」（§3-3）。302 primaryInfoSummary と同じ形。0件なら表示側で出さない（§7） */
export function reactionSummary(cells: readonly MandalaCell[]): ReactionSummary {
  let filled = 0;
  let withReaction = 0;
  for (const c of cells) {
    if (c.depth !== 1 || !isCellFilled(c)) continue;
    filled += 1;
    if (hasReaction(c)) withReaction += 1;
  }
  return { withReaction, filled };
}

// ───────────────────────────────────────────────────────────────────────────
// 無料比率（§4）。free の本文文字数 ÷（free＋paid）。中央は含めない。子マスの本文は親の区分に含める（節は章の区分）
// ───────────────────────────────────────────────────────────────────────────

/** 目安（N-08: 無料60〜70%は検証すべき仮説）。数値と並べるだけ＝煽らない */
export const MANDALA_FREE_RATIO_GUIDE = { min: 0.6, max: 0.7 } as const;

export interface FreeRatio {
  freeChars: number;
  paidChars: number;
  /** 両方0なら null（出さない） */
  ratio: number | null;
}

export function freeRatio(cells: readonly MandalaCell[]): FreeRatio {
  const tierById = new Map<string, MandalaTier>();
  for (const c of cells) {
    if (c.depth !== 1 || c.position === MANDALA_CENTER) continue;
    const t = cellTier(c);
    if (t) tierById.set(c.id, t);
  }
  let freeChars = 0;
  let paidChars = 0;
  for (const c of cells) {
    const t = c.depth === 1 ? tierById.get(c.id) : c.parent_cell_id ? tierById.get(c.parent_cell_id) : undefined;
    if (!t) continue;
    if (t === 'free') freeChars += c.body.length;
    else paidChars += c.body.length;
  }
  const total = freeChars + paidChars;
  return { freeChars, paidChars, ratio: total > 0 ? freeChars / total : null };
}

/** 比率を出す条件: 型のチャート、または区分を持つマスが1つ以上（§4）。既存チャート（meta={}）では出ない（§7） */
export function shouldShowFreeRatio(chartMeta: Record<string, unknown> | null | undefined, cells: readonly MandalaCell[]): boolean {
  return chartPreset(chartMeta) !== null || cells.some((c) => cellTier(c) !== null);
}

/** 見出しの文言（§4）。目安は並記のみ */
export function freeRatioLabel(ratio: number): string {
  return `無料 ${formatRate(ratio)}（目安 ${Math.round(MANDALA_FREE_RATIO_GUIDE.min * 100)}〜${Math.round(MANDALA_FREE_RATIO_GUIDE.max * 100)}%）`;
}
