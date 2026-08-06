// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// noteエディタ互換の出力変換（228・note貼り付けキット）
// noteエディタはMarkdown部分対応（##/###見出し・リスト・引用は貼り付け時に自動変換）だが、
// H1・太字記号・表・リンク記法は非対応（記号が露出する）。ここで互換テキストに変換する。
// 変換はコピー用の複製に対してのみ行う（元の本文は無傷＝fail-closed）。
// クライアント専用ユーティリティ（クリップボードAPIを含む）。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import {
  NOTE_PLACEMENT_SLOTS,
  noteImageFileName,
  splitMarkdownBlocks,
  type NotePlacementImage,
} from './note-enhance';

export interface NoteCompatOptions {
  // 太字記号 **…** の扱い（既定=除去。noteでは記号が露出するため）
  boldMode: 'strip' | 'keep';
  // Markdown表の扱い（既定=箇条書き変換。noteに表の標準機能がないため）
  tableMode: 'bullets' | 'keep';
}

export const DEFAULT_NOTE_COMPAT: NoteCompatOptions = { boldMode: 'strip', tableMode: 'bullets' };

// H1はnote非対応（タイトル欄に入れる前提）→ 本文中の # は ## に格下げ
function demoteH1(md: string): string {
  return md.replace(/^# (?!#)/gm, '## ');
}

// [テキスト](URL) → テキスト URL（noteはリンク記法非対応・生URLは自動リンク化される）
function flattenLinks(md: string): string {
  return md.replace(/(?<!!)\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1 $2');
}

function stripBold(md: string): string {
  return md.replace(/\*\*([^*]+)\*\*/g, '$1');
}

// Markdown表 → 「・1列目｜見出し2: 値、見出し3: 値」の箇条書き（note互換テキスト表現）
function tableToBullets(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;
  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const splitRow = (l: string) =>
    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const headers = splitRow(lines[i]);
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        const cells = splitRow(lines[i]);
        const first = cells[0] ?? '';
        const rest = headers
          .slice(1)
          .map((h, j) => (cells[j + 1] ? `${h}: ${cells[j + 1]}` : ''))
          .filter(Boolean)
          .join('、');
        out.push(rest ? `・${first}｜${rest}` : `・${first}`);
        i++;
      }
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join('\n');
}

export function toNoteCompatible(markdown: string, opts: NoteCompatOptions = DEFAULT_NOTE_COMPAT): string {
  let md = demoteH1(markdown);
  md = flattenLinks(md);
  if (opts.tableMode === 'bullets') md = tableToBullets(md);
  if (opts.boldMode === 'strip') md = stripBold(md);
  return md;
}

// 貼り付け後に画像をドラッグする位置の目印（この行自体はnoteで削除してもらう）
export function buildMarkerLine(order: number, placement: NotePlacementImage): string {
  const meta = NOTE_PLACEMENT_SLOTS[placement.slot];
  return `――― 画像${String(order).padStart(2, '0')}（${meta.label}）: ${noteImageFileName(order, placement.slot)} をここに挿入 ―――`;
}

// 挿入順（afterBlock昇順）に並べた配置。cta（まとめ画像）は url ではなく summaryImage を使うため
// 「画像があるもの」= 挿絵は url あり・cta は hasSummaryImage のときに数える
export function orderedPlacements(placements: NotePlacementImage[]): NotePlacementImage[] {
  return [...placements].sort((a, b) => a.afterBlock - b.afterBlock);
}

// 本文（Markdown）へマーカー行を挿入した互換テキストを作る。
// ブロック分割は note-enhance.ts の splitMarkdownBlocks と同一定義（配置提案とズレない）。
export function buildNotePasteText(
  markdown: string,
  placements: NotePlacementImage[],
  opts: NoteCompatOptions = DEFAULT_NOTE_COMPAT,
): string {
  const blocks = splitMarkdownBlocks(toNoteCompatible(markdown, opts));
  const sorted = orderedPlacements(placements);
  const byBlock = new Map<number, { order: number; p: NotePlacementImage }[]>();
  sorted.forEach((p, idx) => {
    const at = Math.min(Math.max(p.afterBlock, 0), Math.max(blocks.length - 1, 0));
    const list = byBlock.get(at) ?? [];
    list.push({ order: idx + 1, p });
    byBlock.set(at, list);
  });
  const out: string[] = [];
  blocks.forEach((b, i) => {
    out.push(b);
    for (const { order, p } of byBlock.get(i) ?? []) {
      out.push(buildMarkerLine(order, p));
    }
  });
  return out.join('\n\n');
}

// 🧪リッチコピー（実験）用の最小HTML変換。noteエディタが text/html 貼り付けで
// 何を受け付けるかの実地検証に使う（見出し・段落・リスト・引用・太字・img）。
export function buildNoteHtml(markdown: string, imageUrlByBlock: Map<number, string[]>): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const blocks = splitMarkdownBlocks(demoteH1(markdown));
  const html: string[] = [];
  blocks.forEach((b, i) => {
    const lines = b.split('\n');
    if (/^##\s/.test(b)) {
      html.push(`<h2>${inline(b.replace(/^##\s+/, ''))}</h2>`);
    } else if (/^###\s/.test(b)) {
      html.push(`<h3>${inline(b.replace(/^###\s+/, ''))}</h3>`);
    } else if (lines.every((l) => /^[-•]\s/.test(l) || !l.trim())) {
      html.push(`<ul>${lines.filter((l) => l.trim()).map((l) => `<li>${inline(l.replace(/^[-•]\s+/, ''))}</li>`).join('')}</ul>`);
    } else if (lines.every((l) => /^\d+\.\s/.test(l) || !l.trim())) {
      html.push(`<ol>${lines.filter((l) => l.trim()).map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`);
    } else if (/^>\s?/.test(b)) {
      html.push(`<blockquote>${inline(b.replace(/^>\s?/gm, ''))}</blockquote>`);
    } else {
      html.push(`<p>${inline(b).replace(/\n/g, '<br>')}</p>`);
    }
    for (const url of imageUrlByBlock.get(i) ?? []) {
      html.push(`<img src="${esc(url)}" alt="">`);
    }
  });
  return html.join('\n');
}

// text/html + text/plain を同時にクリップボードへ書く（ClipboardItem 非対応環境は false）
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

// 画像URLをバイナリのままファイル保存させる（triggerDownload はテキスト専用のため別関数）
export async function downloadImageFile(url: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  } catch {
    return false;
  }
}
