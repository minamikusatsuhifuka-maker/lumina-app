// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 308 §2: 🔲 マンダラの型プリセット（DB 非依存・R-108）。本便は「有料note記事」1種のみ。
//
// 定義は**この1箇所**。作成時にだけ適用し（既存チャートへの後付けは範囲外）、周囲8のタイトルは入力の初期値
// （院長が書き換えてよい）。区分（meta.tier）は院長がパネルで無料⇄有料に変えられる。
// KB 根拠: N-06 構成フロー（導入→着地点→信頼→理論→目次/CTA→手順→成果物→結び）／N-07 無料エリア7要素／
//          N-08 有料ライン（無料60〜70%は仮説）／N-09 有料エリアの中身（手順・テンプレ・生データ）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 311是正: mandala-shared が「未記入」判定のためにここを読むので、こちらは型だけ読む（実行時の循環参照を作らない）
import type { MandalaTier } from '@/lib/mandala-shared';

export const MANDALA_PRESET_PAID_NOTE = 'paid_note';
export type MandalaPresetKey = typeof MANDALA_PRESET_PAID_NOTE;
export const MANDALA_PRESET_KEYS: readonly MandalaPresetKey[] = [MANDALA_PRESET_PAID_NOTE];

export function isMandalaPresetKey(v: unknown): v is MandalaPresetKey {
  return typeof v === 'string' && (MANDALA_PRESET_KEYS as readonly string[]).includes(v);
}

export interface MandalaPresetCell {
  position: number;
  /** 入力の初期値（院長が書き換えてよい） */
  title: string;
  tier: MandalaTier;
}

export interface MandalaPreset {
  key: MandalaPresetKey;
  label: string;
  description: string;
  /** 中央は空のまま（院長が書く）。パネルのプレースホルダに出す */
  centerPlaceholder: string;
  /** 周囲8マス（position 0〜3, 5〜8）。順序は position 昇順 */
  cells: readonly MandalaPresetCell[];
}

export const MANDALA_PRESETS: Record<MandalaPresetKey, MandalaPreset> = {
  paid_note: {
    key: 'paid_note',
    label: '有料note記事の型',
    description: '無料5マス（導入・着地点・信頼・理論・目次/CTA）と有料3マス（手順・成果物・結び）。無料比率の目安は60〜70%',
    centerPlaceholder: '読者の着地点（After）を1行で',
    cells: [
      { position: 0, title: '導入・共感（読者の悩みの代弁）', tier: 'free' },      // N-06 ① / N-07
      { position: 1, title: '着地点・ベネフィット', tier: 'free' },                // N-06 ② / N-07
      { position: 2, title: '信頼性・実体験（一次情報）', tier: 'free' },          // N-06 ③ / N-07
      { position: 3, title: '理論の要約（Why／What）', tier: 'free' },              // N-06 ④ / N-07
      { position: 5, title: '目次・対象読者・有料ライン直前のCTA', tier: 'free' }, // N-06 ⑤ / N-07 / N-08
      { position: 6, title: '具体的手順（How）', tier: 'paid' },                    // N-06 ⑥ / N-09
      { position: 7, title: 'テンプレート・成果物・生データ', tier: 'paid' },       // N-06 ⑦ / N-09
      { position: 8, title: '結び・次の一歩', tier: 'paid' },                       // N-06 ⑧ / N-09
    ],
  },
};

export function getMandalaPreset(key: MandalaPresetKey): MandalaPreset {
  return MANDALA_PRESETS[key];
}

/** 作成時の9マス分（position 0〜8・中央（型に無い位置）は空タイトル・meta なし）。作成 API はこの配列をそのまま行にする（R-74） */
export function presetCellRows(key: MandalaPresetKey): { position: number; title: string; meta: Record<string, unknown> }[] {
  const preset = getMandalaPreset(key);
  const byPos = new Map(preset.cells.map((c) => [c.position, c]));
  return Array.from({ length: 9 }, (_, position) => {
    const c = byPos.get(position);
    return c ? { position, title: c.title, meta: { tier: c.tier } } : { position, title: '', meta: {} };
  });
}

/** 311是正: 位置ごとの「型の初期タイトル」（全プリセット分）。未記入の判定（mandala-shared.isPresetPlaceholder）が読む */
export function presetInitialTitlesAt(position: number): string[] {
  const out: string[] = [];
  for (const key of MANDALA_PRESET_KEYS) {
    for (const c of MANDALA_PRESETS[key].cells) if (c.position === position) out.push(c.title.trim());
  }
  return out;
}
