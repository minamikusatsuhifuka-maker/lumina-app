// 179 保存資料→note記事群 の共有定数（API・UIの両方から参照。route.tsは任意exportが不可）

// 選択できる保存資料の上限（暴発防止）。1件3,000字級×10でパス1プロンプトが安全圏に収まる想定。
export const MAX_BUNDLE_SOURCES = 10;
