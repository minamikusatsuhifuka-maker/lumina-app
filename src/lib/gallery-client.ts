// 画像ギャラリー（165）保存のクライアントヘルパー。
// 画像本体は POST /api/gallery でサーバへ渡し、サーバが Vercel Blob に格納する。
// image-gen 画面・EyecatchModal（166）など複数箇所から同じ経路で保存する（保存経路を増やさない）。

export interface GallerySaveInput {
  imageBase64: string;
  prompt: string;
  // settings.model に生成モデル名を入れて記録する（image_gallery のスキーマ変更は不要・171）
  settings?: { size?: string; quality?: string; model?: string };
  title?: string;
}

// 保存後にサーバが返す画像メタ（/api/gallery POST の RETURNING と同形）
export interface GallerySavedImage {
  id: string;
  blob_url: string;
  pathname: string;
  title?: string;
}

// 成功時は保存済みメタ（blob_url を後続処理に使える・228）、失敗時は例外（呼び出し側でトースト表示）。
// 従来の呼び出し（戻り値を見ない）は挙動不変。
export async function saveImageToGallery(input: GallerySaveInput): Promise<GallerySavedImage> {
  const res = await fetch('/api/gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'ギャラリー保存に失敗しました');
  }
  return data.image as GallerySavedImage;
}
