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
