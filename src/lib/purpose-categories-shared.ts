// 297: 🎯用途カテゴリのうち**クライアントでも使う純関数・定数**だけを置く（DB 非依存）。
//
// lib/purpose-categories.ts は `@/lib/db`（neon）を import するサーバー専用モジュール。クライアント部品が
// そこから値を import すると、ブラウザ側バンドルに neon と process.env.DATABASE_URL の参照が混入し、
// モジュール初期化で例外＝画面全体がクラッシュする（297 の初回デプロイで3画面が落ちた実害・R-108）。
// クライアント部品は必ずこのファイルから import する（lib/purpose-categories.ts からは `import type` のみ）。

/** カテゴリ名の上限（バッジ表示が破綻しない長さ・マイフォルダと同じ） */
export const MAX_PURPOSE_NAME_LENGTH = 30;

/**
 * 削除確認に出す文言。件数は「そのカテゴリに入っている記事（3画面合計）」。削除自体はしない（R-76）。
 * 確認は1回だけ（R-56）。「記事は削除されません」を必ず明記する（284・296と同じ形）。
 */
export function purposeDeleteConfirmMessage(name: string, countTotal: number): string {
  return (
    `用途カテゴリ「${name}」を削除します。\n\n` +
    `このカテゴリには ${countTotal}件 の記事が入っていますが、記事は削除されません（用途の割り当てが外れるだけです）。\n` +
    `よろしいですか？`
  );
}

// ── 298: 選択した記事への一括付け外し（クライアント・サーバー共通の判断） ──────────────────

/** 1リクエストで扱う記事数の上限（250の一括削除 BULK_DELETE_LIMIT と同値。超過は無効化して理由を出す・R-101） */
export const PURPOSE_BULK_LIMIT = 500;

export type PurposeBulkMode = 'add' | 'remove';

/** 一括操作ボタンの状態。0件は出さない（バーは1件以上で出る）。上限超えは無効化＋理由（先頭N件に黙って切らない・R-101） */
export function purposeBulkState(selectedCount: number): { enabled: boolean; reason: string | null } {
  if (selectedCount <= 0) return { enabled: false, reason: '記事を選んでください' };
  if (selectedCount > PURPOSE_BULK_LIMIT) {
    return { enabled: false, reason: `一度に用途を付け外しできるのは${PURPOSE_BULK_LIMIT}件までです（${selectedCount}件選択中・選択を減らしてください）` };
  }
  return { enabled: true, reason: null };
}

/**
 * 実行結果の文言（決定的・R-74）。changed=状態が変わった記事数／unchanged=既にその状態だった記事数／failed=失敗した記事数。
 * 一部失敗でも成功分は反映済み（R-39）なので、成功数と失敗数を両方出す（偽の成功を出さない）。
 */
export function purposeBulkResultMessage(mode: PurposeBulkMode, r: { changed: number; unchanged: number; failed: number }): string {
  const verb = mode === 'add' ? 'に付けました' : 'から外しました';
  const already = mode === 'add' ? '既に付いていました' : '元から付いていませんでした';
  const parts: string[] = [`${r.changed}件${verb}`];
  if (r.unchanged > 0) parts.push(`${r.unchanged}件は${already}`);
  const head = r.failed > 0 ? '⚠️' : '✅';
  const tail = r.failed > 0 ? `／❌ ${r.failed}件は失敗しました（成功した分は反映されています）` : '';
  return `${head} ${parts.join('・')}${tail}`;
}
