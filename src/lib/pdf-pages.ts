// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 275 §2-2: PDFのページ画像化は**クライアント側**で行う。
// サーバー側でネイティブ依存のPDF処理（LibreOffice・canvas等）を持たない方針のため、
// pdf.js をブラウザで動かしてページをJPEGに焼き、その画像だけをサーバーへ送る。
//
// 実行時アセット（Worker・cMap・標準フォント）は public/pdfjs/ に置く。
// これは scripts/copy-pdfjs-assets.mjs が prebuild/predev で node_modules から複製する
// ＝pdfjs-dist のバージョンと必ず一致する（不一致のWorkerを読むと静かに壊れるため）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 送信サイズを抑えつつ、スライドの文字が読める幅（AIは画像を視覚的に読む＝§3-2） */
export const PDF_RENDER_MAX_WIDTH = 1280;
export const PDF_JPEG_QUALITY = 0.72;
/** 1ファイルあたりの上限（ブラウザのメモリを守るための安全弁） */
export const PDF_MAX_PAGES = 100;

export interface RenderedPdfPage {
  /** ページ画像（data URL・JPEG） */
  dataUrl: string;
  /** テキストレイヤー（取れなければ空文字）。文字の正確性を上げるため画像と併せて渡す（§3-2） */
  text: string;
}

/** 画像ファイル（PNG/JPEG）をそのまま data URL にする */
export function imageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`${file.name} を読み込めませんでした`));
    reader.readAsDataURL(file);
  });
}

/**
 * PDFを1ページずつ画像化する。onProgress は (完了ページ数, 全ページ数)。
 * 失敗したページはそのページだけ空画像にせず**例外にする**（偽の成功を返さない＝fail-closed）。
 */
export async function renderPdfPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<RenderedPdfPage[]> {
  const pdfjs = await import('pdfjs-dist');
  // バージョン入りのファイル名。取り違えたら404で即座に分かる（黙って別バージョンを読ませない）
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/pdf.worker.${pdfjs.version}.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({
    data,
    // 日本語のフォント非埋め込みPDFで文字が化けないように同一オリジンから読む
    cMapUrl: '/pdfjs/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    isEvalSupported: false,
  }).promise;

  try {
    const total = doc.numPages;
    if (total > PDF_MAX_PAGES) {
      throw new Error(`${file.name} は${total}ページあります（1ファイル${PDF_MAX_PAGES}ページまで）`);
    }
    const pages: RenderedPdfPage[] = [];
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      // 小さいスライドを無理に引き伸ばさない（最大2倍まで）
      const scale = Math.min(2, PDF_RENDER_MAX_WIDTH / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('この端末ではPDFの画像化ができませんでした');
      // 透明背景のままJPEGにすると黒く潰れるため白で塗る
      await page.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY);

      let text = '';
      try {
        const content = await page.getTextContent();
        text = content.items
          .map((it) => (typeof (it as { str?: unknown }).str === 'string' ? (it as { str: string }).str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      } catch {
        // テキストレイヤーは付加情報。取れなくても画像だけで生成する（R-39）
      }

      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      pages.push({ dataUrl, text });
      onProgress?.(i, total);
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
