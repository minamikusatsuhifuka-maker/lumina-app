// Vercel Blob の認証解決。値はすべて環境変数から読む（ハードコード禁止）。
//
// Blob には2方式あり、当プロジェクトは後者（Storeをプロジェクトに接続すると自動注入される）:
//  - BLOB_READ_WRITE_TOKEN … 旧来のRead/Writeトークン
//  - OIDC … Vercel実行環境の VERCEL_OIDC_TOKEN ＋ BLOB_STORE_ID（@vercel/blob v2が自動解決）
//
// どちらでも動くよう、RWトークンがあるときだけ明示的に渡し、無ければSDKのOIDC解決に任せる。

export function blobAuthOptions(): { token?: string } {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? { token } : {};
}

// 保存・削除の前段チェック（どちらの資格情報も無ければ設定漏れ）
export function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}
