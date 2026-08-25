// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// リッチコピー共通ユーティリティ（232）
// 「📋コピー」を text/html＋text/plain の同時書き込みに強化する。
// - Word/Pages/メール等 → HTML側が採用され体裁付き（見出し・太字・箇条書き・表・画像）で貼れる
// - プレーンエディタ → 従来どおりMD原文（後方互換・既存ワークフロー無破壊）
// HTML変換は表示用 renderMarkdown の出力を後処理する（表示と同じレンダリング結果に限定＝
// 変換過程で本文を変えない）。class依存はWordで無効のため素のタグ＋最小限のインラインstyleへ置換。
// fail-closed: HTML変換・リッチ書き込みに失敗したらプレーンのみコピーして成功扱いにする。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { renderMarkdown, sanitizeLatex } from './markdown-renderer';
import { copyToClipboard } from './copyToClipboard';

// renderMarkdown の class 依存出力を Word が解釈できる素のタグ＋インラインstyleへ置換する。
// 対応: md-table-wrap/md-table（表の罫線）・md-gap（除去=Wordは段落間隔を持つ）・md-source（出典の小さめ文字）
function toWordHtml(displayHtml: string): string {
  let html = displayHtml;

  // 表: ラッパー除去＋罫線・余白をインラインで付与（Wordは枠線なしで貼る場合があるため明示）
  html = html
    .replace(/<div class="md-table-wrap"><table class="md-table">/g, '<table style="border-collapse:collapse;">')
    .replace(/<\/table><\/div>/g, '</table>')
    .replace(/<th>/g, '<th style="border:1px solid #888;padding:4px 10px;background:#f2f2f2;">')
    .replace(/<td>/g, '<td style="border:1px solid #888;padding:4px 10px;">');

  // 空行ガイド: Wordでは段落間隔が付くため除去（表示上の間隔のためだけの空div）
  html = html.replace(/<div class="md-gap"><\/div>\n?/g, '');

  // 出典行: 小さめ・グレーのインラインstyleへ
  html = html.replace(/<div class="md-source">/g, '<p style="font-size:10pt;color:#666666;">').replace(/<\/div>/g, '</p>');

  // 単独行画像 ![alt](url): renderMarkdown はエスケープ済みテキストとして <p> に残すため <img> へ復元
  // （markdownToDocx の IMAGE_LINE_RE と同じく単独行のみ対象。WordはURL画像を貼り付け時に取り込む）
  html = html.replace(
    /<p>!\[([^\]]*)\]\((https?:[^)<\s]+)\)<\/p>/g,
    '<img src="$2" alt="$1" style="max-width:100%;">',
  );

  return html;
}

// MD → Word向けHTML（表示と同じ renderMarkdown を通す＝表示に無い変換をしない）
export function markdownToWordHtml(markdown: string): string {
  return toWordHtml(renderMarkdown(markdown));
}

// text/html + text/plain を同時にクリップボードへ書く（ClipboardItem 非対応環境は false）。
// 228a note-compat から移管（note-compat 側は再exportで従来import不変）。
export async function copyRichText(html: string, plain: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

// Markdown本文のリッチコピー（232の共通入口）。
// plain側は従来コピーと同一（sanitizeLatex 済みMD原文）＝プレーン貼り付け先の挙動は不変。
// 戻り値はコピーの成否（rich/plainどちらで書けたかは呼び出し側に影響させない＝ボタン表記不変）。
export async function copyRichMarkdown(markdown: string): Promise<boolean> {
  const plain = sanitizeLatex(markdown);
  try {
    const html = markdownToWordHtml(markdown);
    if (await copyRichText(html, plain)) return true;
  } catch {
    // 変換失敗はプレーンにフォールバック（fail-closed: エラーにしない）
  }
  return copyToClipboard(plain);
}

// ── 266【1】: note貼り付け用の見出しレベル繰り上げ ─────────────────────────────
// renderMarkdown は画面表示用に見出しを1段下げる（## → <h3>。h1を記事タイトルに予約する設計で、
// **画面表示としては正しい**）。しかし note は h2=大見出し／h3=小見出しなので、この変換のまま
// 貼ると全見出しが小見出しに落ちる。note向けコピーだけ h3→h2・h4→h3…と1段繰り上げる。
// **共有ヘルパー copyRichMarkdown の既定動作（Word体裁・53箇所実績）は変更しない**（専用ラッパー方式）。
export function promoteHeadingsForNote(html: string): string {
  // 1回の置換で全レベルを同時に変換する（h4→h3→h2 と段階置換すると二重に繰り上がるため）。
  // h2 はそのまま（264以降の本文に h1 由来の h2 は現れないが、現れても note の大見出しとして妥当）。
  return html.replace(/<(\/?)h([3-6])\b/g, (_m, slash: string, level: string) => `<${slash}h${Number(level) - 1}`);
}

/** 発信ハブ①「📋 note用にコピー」専用（適用先を広げるときは266 §1-4の影響確認を行うこと） */
export async function copyRichMarkdownForNote(markdown: string): Promise<boolean> {
  const plain = sanitizeLatex(markdown);
  try {
    const html = promoteHeadingsForNote(markdownToWordHtml(markdown));
    if (await copyRichText(html, plain)) return true;
  } catch {
    // 変換失敗はプレーンにフォールバック（fail-closed: エラーにしない）
  }
  return copyToClipboard(plain);
}
