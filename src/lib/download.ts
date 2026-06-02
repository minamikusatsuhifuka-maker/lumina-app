/**
 * テキスト内容をファイルとしてダウンロードさせる低レベルユーティリティ。
 * Blob生成 → リンククリック → URL revoke までを共通化する。
 *
 * ⚠️ ヘッダ整形・ファイル名生成・AIタイトル生成は「呼び出し側の責務」。
 *    ここでは行わない（ページ固有の差異を潰さないため）。
 */
export function triggerDownload(
  filename: string,
  content: string,
  mime: string = 'text/markdown;charset=utf-8',
): void {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // revoke 漏れを統一的に防ぐ
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    console.error('[triggerDownload] ダウンロード失敗:', e);
  }
}
