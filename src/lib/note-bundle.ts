// 179/180 保存資料→note記事群 の共有定数・型（API・UIの両方から参照。route.tsは任意exportが不可）

// 選択できる保存資料の上限（暴発防止・両ソース合計）。
// 1件3,000字級×10でパス1プロンプトが安全圏に収まる想定。
export const MAX_BUNDLE_SOURCES = 10;

// 180: 素材ソース種別。context=🧠AI参照素材(context_saves) / analysis=🗂テキスト分析(text_analysis_saves)
export type BundleSource = 'context' | 'analysis';

export interface BundleRef {
  source: BundleSource;
  id: number;
}

// UI表示・プロンプトの出典ラベルで共通使用
export const BUNDLE_SOURCE_META: Record<BundleSource, { icon: string; label: string }> = {
  context: { icon: '🧠', label: 'AI参照素材' },
  analysis: { icon: '🗂', label: 'テキスト分析' },
};

// プロンプト・プラン編集UIで使う資料キー（2テーブルでIDが衝突するため文字列キーで区別）
export function makeBundleKey(source: BundleSource, id: number): string {
  return source === 'analysis' ? `ana-${id}` : `ctx-${id}`;
}

// 資料キー → BundleRef（不正な形式は null）
export function parseBundleKey(key: unknown): BundleRef | null {
  if (typeof key !== 'string') return null;
  const m = key.match(/^(ctx|ana)-(\d+)$/);
  if (!m) return null;
  const id = parseInt(m[2], 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { source: m[1] === 'ana' ? 'analysis' : 'context', id };
}

// APIボディの sources / 旧形式 ids を BundleRef[] に正規化（後方互換: idのみ→context扱い）
export function normalizeBundleRefs(body: { sources?: unknown; ids?: unknown }): BundleRef[] {
  const refs: BundleRef[] = [];
  if (Array.isArray(body.sources)) {
    for (const s of body.sources) {
      const id = parseInt(String((s as { id?: unknown })?.id), 10);
      const source = (s as { source?: unknown })?.source;
      if (!Number.isFinite(id) || id <= 0) continue;
      refs.push({ source: source === 'analysis' ? 'analysis' : 'context', id });
    }
  } else if (Array.isArray(body.ids)) {
    for (const v of body.ids) {
      const id = parseInt(String(v), 10);
      if (!Number.isFinite(id) || id <= 0) continue;
      refs.push({ source: 'context', id });
    }
  }
  // 重複除去（同一 source+id）
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = makeBundleKey(r.source, r.id);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
