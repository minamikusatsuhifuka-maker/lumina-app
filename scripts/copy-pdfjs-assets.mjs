// 275: pdf.js の実行時アセットを public/pdfjs/ へ複製する（prebuild / predev で自動実行）。
//
// なぜコピーするか:
//   PDFのページ画像化はクライアント側で行う（275 §2-2）。pdf.js は
//   ①Workerスクリプト ②CJKのcMap ③標準フォント を **同一オリジンのURL** から読む。
//   node_modules を直接配信できないため public/ へ複製する。
//
// なぜ git に入れないか（.gitignore 済み）:
//   185ファイル・2.4MBあり、しかも pdfjs-dist のバージョンと**必ず一致**していなければ
//   Worker がバージョン不一致で落ちる。手でコピーして置くと、次のバージョン更新で
//   置き去りになって静かに壊れる。ビルドのたびに node_modules から取り直せば必ず一致する。
//
// 失敗したら**ビルドを止める**（PDF機能が黙って壊れた状態で出るのを防ぐ＝fail-closed）。

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const pkgPath = require.resolve('pdfjs-dist/package.json');
const pkg = require(pkgPath);
const src = path.dirname(pkgPath);
const dest = path.join(root, 'public', 'pdfjs');

// バージョンが変わったら中身ごと入れ替える（古いWorkerが残らないように毎回作り直す）
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

// Worker はバージョン入りの名前で置く。pdf-pages.ts は pdfjs.version から同じ名前を組み立てるため、
// 取り違え（別バージョンのWorkerを読む）は404になって**すぐ気づく**。
await cp(
  path.join(src, 'build', 'pdf.worker.min.mjs'),
  path.join(dest, `pdf.worker.${pkg.version}.min.mjs`),
);
// CJK（日本語）のcMapと標準フォント: フォント非埋め込みPDFで文字が化けないために要る
await cp(path.join(src, 'cmaps'), path.join(dest, 'cmaps'), { recursive: true });
await cp(path.join(src, 'standard_fonts'), path.join(dest, 'standard_fonts'), { recursive: true });

await writeFile(
  path.join(dest, 'VERSION'),
  `pdfjs-dist ${pkg.version}\nscripts/copy-pdfjs-assets.mjs が生成（手で編集しない）\n`,
);

console.log(`[copy-pdfjs-assets] pdfjs-dist ${pkg.version} → public/pdfjs/`);
