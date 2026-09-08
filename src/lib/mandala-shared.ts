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
  /** リンク済み件数（302以降で増える。本便では 0） */
  link_count: number;
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
  /** 中央を親から導出した枠（第2階層のみ true）。編集できない・保存されない */
  derived: boolean;
  /** 導出枠に表示するタイトル（親マスのタイトル）。第1階層の中央は cell.title なので null */
  derivedTitle: string | null;
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
  }));
  const center: MandalaGridSlot =
    parentCellId === null
      ? { position: MANDALA_CENTER, cell: centerCell(cells), derived: false, derivedTitle: null }
      : {
          position: MANDALA_CENTER,
          cell: null,
          derived: true,
          derivedTitle: cellDisplayTitle(cells.find((c) => c.id === parentCellId) ?? null),
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
export function mandalaDeleteConfirmMessage(title: string, filled: number, links: number): string {
  return (
    `マンダラ「${chartDisplayTitle(title)}」を削除します。\n\n` +
    `埋まっているマス: ${filled}/${MANDALA_DEPTH1_COUNT}\n` +
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
