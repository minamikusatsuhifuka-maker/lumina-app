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

// ── 294 §3: text/html の行構造を text/plain と同じにする（R-104） ──────────────────────
// 院長の実地確認: メモ（macOS Notes）に貼ると改行が失われて詰まる。Word・note・テキストエディットは正常。
// 実際の text/html を確認した結果（原因）:
//   - renderMarkdown は行ごとに <p> を作り、MDの空行は <div class="md-gap"> にする
//   - 旧 toWordHtml は md-gap を「Wordは段落間隔を持つから」と**除去**していた＝HTMLには空行の情報が残らず、
//     段落の切れ目は <p> の**暗黙の余白**にだけ頼っていた
//   - Notes は NSTextView（Cocoa の HTML 取り込み）。同じ取り込みを textutil で実測すると <p> の余白は
//     段落属性（\sa）になり、Notes はそれを自分の本文スタイルに正規化して捨てる → 段落間の空きが全て消える
//   - Word・note は <p> の余白を描くので偶然成立していた
// 対処: 空行を**明示の空段落**として残し（<p style="margin:0;"><br></p>）、<p> の暗黙の余白は margin:0 で切る。
//   → HTMLの行構造が text/plain（テキストエディットで正常）と一致し、貼り付け先が段落余白を持つ／持たないに
//     依らず同じ骨格になる。二重の余白（余白＋空段落）を作らない。
//   Cocoa の実測: 空の <p></p> は取り込み時に消える／<p><br></p> と <br> は空段落として残る／margin は honor される。
// 共有ヘルパー本体を直す（案A）。note 用ラッパーは note 自身が段落余白を持つため空段落だけ外す（266の見出し繰り上げは不変）。
export const RICH_COPY_P_OPEN = '<p style="margin:0;">';
export const RICH_COPY_GAP_HTML = '<p style="margin:0;"><br></p>';

/** note のように貼り付け先が段落余白を持つ場合に、294の空段落だけを外す（他は不変） */
export function stripRichCopyGaps(html: string): string {
  return html.split(`${RICH_COPY_GAP_HTML}\n`).join('').split(RICH_COPY_GAP_HTML).join('');
}

// renderMarkdown の class 依存出力を Word が解釈できる素のタグ＋インラインstyleへ置換する。
// 対応: md-table-wrap/md-table（表の罫線）・md-gap（空段落へ・294）・md-source（出典の小さめ文字）・<p>（余白0・294）
function toWordHtml(displayHtml: string): string {
  let html = displayHtml;

  // 表: ラッパー除去＋罫線・余白をインラインで付与（Wordは枠線なしで貼る場合があるため明示）
  html = html
    .replace(/<div class="md-table-wrap"><table class="md-table">/g, '<table style="border-collapse:collapse;">')
    .replace(/<\/table><\/div>/g, '</table>')
    .replace(/<th>/g, '<th style="border:1px solid #888;padding:4px 10px;background:#f2f2f2;">')
    .replace(/<td>/g, '<td style="border:1px solid #888;padding:4px 10px;">');

  // 空行: 明示の空段落へ（294。旧: 除去）。text/plain の空行と1対1
  html = html.replace(/<div class="md-gap"><\/div>/g, RICH_COPY_GAP_HTML);

  // 出典行: 小さめ・グレーのインラインstyleへ（余白0も揃える）
  html = html.replace(/<div class="md-source">/g, '<p style="margin:0;font-size:10pt;color:#666666;">').replace(/<\/div>/g, '</p>');

  // 単独行画像 ![alt](url): renderMarkdown はエスケープ済みテキストとして <p> に残すため <img> へ復元
  // （markdownToDocx の IMAGE_LINE_RE と同じく単独行のみ対象。WordはURL画像を貼り付け時に取り込む）
  html = html.replace(
    /<p>!\[([^\]]*)\]\((https?:[^)<\s]+)\)<\/p>/g,
    '<img src="$2" alt="$1" style="max-width:100%;">',
  );

  // 段落: 暗黙の余白を切る（294。空段落が唯一の空きの源になる＝二重余白を作らない）。最後に行う（上の <p> 判定を壊さない）
  html = html.replace(/<p>/g, RICH_COPY_P_OPEN);

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

// クリップボードに載せる2形式（294: 純関数に切り出して text/plain が変わっていないことを単体テストで固定する）。
// plain は sanitizeLatex 済みMD原文のみ＝294でも一切変更しない（テキストエディットで正常なため）。
export function richCopyParts(markdown: string): { html: string; plain: string } {
  return { html: markdownToWordHtml(markdown), plain: sanitizeLatex(markdown) };
}

// Markdown本文のリッチコピー（232の共通入口）。
// plain側は従来コピーと同一（sanitizeLatex 済みMD原文）＝プレーン貼り付け先の挙動は不変。
// 戻り値はコピーの成否（rich/plainどちらで書けたかは呼び出し側に影響させない＝ボタン表記不変）。
export async function copyRichMarkdown(markdown: string): Promise<boolean> {
  const plain = sanitizeLatex(markdown);
  try {
    const { html } = richCopyParts(markdown);
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
    // 294: note は段落自身が余白を持つため空段落を外す（空段落を足すと note では二重の空きになる）。
    // 見出し繰り上げ（266）は従来どおり。margin:0 は note が捨てる（inline style 非対応）ので実質不変
    const html = promoteHeadingsForNote(stripRichCopyGaps(markdownToWordHtml(markdown)));
    if (await copyRichText(html, plain)) return true;
  } catch {
    // 変換失敗はプレーンにフォールバック（fail-closed: エラーにしない）
  }
  return copyToClipboard(plain);
}
