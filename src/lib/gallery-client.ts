// 画像ギャラリー（165）保存のクライアントヘルパー。
// 画像本体は POST /api/gallery でサーバへ渡し、サーバが Vercel Blob に格納する。
// image-gen 画面・EyecatchModal（166）など複数箇所から同じ経路で保存する（保存経路を増やさない）。

export interface GallerySaveInput {
  imageBase64: string;
  prompt: string;
  settings?: { size?: string; quality?: string };
  title?: string;
}

// 成功時 true、失敗時は例外（呼び出し側でトースト表示）
export async function saveImageToGallery(input: GallerySaveInput): Promise<void> {
  const res = await fetch('/api/gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'ギャラリー保存に失敗しました');
  }
}
