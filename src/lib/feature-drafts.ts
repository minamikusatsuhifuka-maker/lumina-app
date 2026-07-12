// 機能別「最新の実行結果」自動下書きのクライアントヘルパー
// 正はDB（feature_result_drafts・owner単位）＝iPhone/PCなど端末をまたいで復元できる。
// 手動保存（保存一覧/コンテキストライブラリ）とは役割が別（自動=最新1件の復元用）。

export interface FeatureDraft<T = unknown> {
  payload: T;
  updated_at: string;
}

// マウント時の復元用取得（失敗しても画面表示を妨げない）
export async function loadFeatureDraft<T>(
  feature: string,
): Promise<FeatureDraft<T> | null> {
  try {
    const res = await fetch(
      `/api/feature-drafts?feature=${encodeURIComponent(feature)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.draft ?? null;
  } catch {
    return null;
  }
}

// 生成完了時の自動保存（fire-and-forget・失敗しても結果表示を妨げない）
export function saveFeatureDraft(feature: string, payload: unknown): void {
  fetch('/api/feature-drafts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feature, payload }),
  }).catch(() => {});
}

// 「クリア」ボタンからの下書き削除（fire-and-forget）
export function clearFeatureDraft(feature: string): void {
  fetch(`/api/feature-drafts?feature=${encodeURIComponent(feature)}`, {
    method: 'DELETE',
  }).catch(() => {});
}

// バナー表示用の日時整形（例: 7/12 14:05）
export function formatDraftTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
