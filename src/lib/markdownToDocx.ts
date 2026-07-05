'use client';

// Markdown を Word(.docx) の「実体」（見出しスタイル・太字・箇条書き・表）へマッピングして
// 出力する共通ユーティリティ。テキスト分析（SavedAnalysisList）とコンテキストライブラリ
// （ContextLibraryPanel）の両画面から流用する（markdownToText.ts の .docx 版）。
// 依存: docx（純JS・クライアント側で Blob 生成）。日本語フォントは游明朝を明示指定する。
// DermaPDF Pro の markdown-docx.ts と同じ作法（実績あり）。
// ⚠️ docx はバンドルが大きいため、呼び出し側は本モジュールごと dynamic import すること:
//    const { downloadMarkdownAsDocx } = await import('@/lib/markdownToDocx');

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  LevelFormat,
  AlignmentType,
  type IParagraphOptions,
  type ILevelsOptions,
} from 'docx';

// 日本語（東アジア文字）にも確実に適用されるようフォント属性を明示する。
const JP_FONT = { ascii: '游明朝', eastAsia: '游明朝', hAnsi: '游明朝' } as const;
const MONO_FONT = { ascii: 'Consolas', eastAsia: '游明朝', hAnsi: 'Consolas' } as const;

type RunOpts = { bold?: boolean; italics?: boolean; code?: boolean };

// 1つの TextRun を日本語フォント付きで生成。code のときは等幅＋薄いシェーディング。
function makeRun(text: string, opts: RunOpts = {}): TextRun {
  return new TextRun({
    text,
    bold: opts.bold,
    italics: opts.italics,
    font: opts.code ? MONO_FONT : JP_FONT,
    ...(opts.code ? { shading: { fill: 'F1F5F9' } } : {}),
  });
}

// インライン記法（**太字** / *斜体* / _斜体_ / `コード` / [文言](URL)）を TextRun 群へ分解。
// 非重複トークンを優先度順（リンク→太字→コード→斜体）に切り出す。ネストは素の文字として扱う。
const INLINE_RE =
  /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

function parseInline(
  text: string,
  base: RunOpts = {},
): (TextRun | ExternalHyperlink)[] {
  const out: (TextRun | ExternalHyperlink)[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push(makeRun(text.slice(last, m.index), base));
    }
    const token = m[0];
    if (m[1]) {
      // [文言](URL) → ハイパーリンク
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        out.push(
          new ExternalHyperlink({
            link: linkMatch[2],
            children: [
              new TextRun({
                text: linkMatch[1],
                font: JP_FONT,
                style: 'Hyperlink',
              }),
            ],
          }),
        );
      } else {
        out.push(makeRun(token, base));
      }
    } else if (m[2]) {
      out.push(makeRun(token.slice(2, -2), { ...base, bold: true }));
    } else if (m[3]) {
      out.push(makeRun(token.slice(1, -1), { ...base, code: true }));
    } else if (m[4]) {
      out.push(makeRun(token.slice(1, -1), { ...base, italics: true }));
    } else if (m[5]) {
      out.push(makeRun(token.slice(1, -1), { ...base, italics: true }));
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(makeRun(text.slice(last), base));
  if (out.length === 0) out.push(makeRun('', base));
  return out;
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

// テーブル1行を "|" 区切りのセル配列へ。先頭/末尾の空セルは除去。
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

// GFMテーブルの区切り行（|---|:--:| 等）かどうか。
function isTableSeparator(line: string): boolean {
  return (
    /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line) &&
    line.includes('-')
  );
}

const CELL_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: 'CBD5E1',
} as const;

function buildTable(rows: string[][]): Table {
  const colCount = Math.max(...rows.map((r) => r.length));
  const trs = rows.map((cells, rowIdx) => {
    const filled = [...cells];
    while (filled.length < colCount) filled.push('');
    return new TableRow({
      tableHeader: rowIdx === 0,
      children: filled.map(
        (cell) =>
          new TableCell({
            shading: rowIdx === 0 ? { fill: 'E6F1FB' } : undefined,
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: [
              new Paragraph({
                children: parseInline(cell, { bold: rowIdx === 0 }),
              }),
            ],
          }),
      ),
    });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: CELL_BORDER,
      bottom: CELL_BORDER,
      left: CELL_BORDER,
      right: CELL_BORDER,
      insideHorizontal: CELL_BORDER,
      insideVertical: CELL_BORDER,
    },
    rows: trs,
  });
}

type ConvertResult = {
  children: (Paragraph | Table)[];
  numberingConfigs: { reference: string; levels: ILevelsOptions[] }[];
};

function orderedLevels(): ILevelsOptions[] {
  return [0, 1, 2].map((level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: AlignmentType.START,
    style: {
      paragraph: {
        indent: { left: 720 * (level + 1), hanging: 360 },
      },
    },
  }));
}

// Markdown文字列を docx の子要素（段落・表）へ変換。順序付きリストは
// ブロックごとに個別の numbering インスタンスを割り当てて番号を1から振り直す。
export function markdownToDocx(markdown: string): ConvertResult {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const children: (Paragraph | Table)[] = [];
  const numberingConfigs: ConvertResult['numberingConfigs'] = [];
  let orderedRefCounter = 0;
  // 直近の順序付きリスト参照（連続する数字項目は同一リストとして継続）
  let currentOrderedRef: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    // 空行 → リスト継続を切る（段落スペーシングで見た目は保つ）
    if (trimmed === '') {
      currentOrderedRef = null;
      continue;
    }

    // 水平線
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      children.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B5D4F4', space: 1 },
          },
          spacing: { before: 120, after: 120 },
        }),
      );
      currentOrderedRef = null;
      continue;
    }

    // 見出し（# 〜 ######）
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length - 1;
      children.push(
        new Paragraph({
          heading: HEADING_LEVELS[level],
          spacing: { before: level === 0 ? 240 : 180, after: 80 },
          children: parseInline(headingMatch[2]),
        }),
      );
      currentOrderedRef = null;
      continue;
    }

    // 表（ヘッダ行 + 次行が区切り行）
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableRows: string[][] = [splitTableRow(trimmed)];
      let j = i + 2;
      for (; j < lines.length; j++) {
        const t = lines[j].trim();
        if (t === '' || !t.includes('|')) break;
        tableRows.push(splitTableRow(t));
      }
      children.push(buildTable(tableRows));
      children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      i = j - 1;
      currentOrderedRef = null;
      continue;
    }

    // 箇条書き（- / * / +）。先頭インデント2スペース=1階層。
    const bulletMatch = /^(\s*)([-*+])\s+(.*)$/.exec(raw);
    if (bulletMatch) {
      const indent = bulletMatch[1].replace(/\t/g, '  ').length;
      const level = Math.min(3, Math.floor(indent / 2));
      children.push(
        new Paragraph({
          bullet: { level },
          spacing: { after: 40 },
          children: parseInline(bulletMatch[3]),
        }),
      );
      currentOrderedRef = null;
      continue;
    }

    // 番号付きリスト（1. 2. …）
    const orderedMatch = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(raw);
    if (orderedMatch) {
      const indent = orderedMatch[1].replace(/\t/g, '  ').length;
      const level = Math.min(2, Math.floor(indent / 2));
      if (!currentOrderedRef) {
        currentOrderedRef = `md-num-${orderedRefCounter++}`;
        numberingConfigs.push({
          reference: currentOrderedRef,
          levels: orderedLevels(),
        });
      }
      const opts: IParagraphOptions = {
        numbering: { reference: currentOrderedRef, level },
        spacing: { after: 40 },
        children: parseInline(orderedMatch[3]),
      };
      children.push(new Paragraph(opts));
      continue;
    }

    // 引用（> ）
    const quoteMatch = /^>\s?(.*)$/.exec(trimmed);
    if (quoteMatch) {
      children.push(
        new Paragraph({
          indent: { left: 480 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: 'B5D4F4', space: 8 },
          },
          spacing: { after: 40 },
          children: parseInline(quoteMatch[1], { italics: true }),
        }),
      );
      currentOrderedRef = null;
      continue;
    }

    // 通常段落
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: parseInline(trimmed),
      }),
    );
    currentOrderedRef = null;
  }

  return { children, numberingConfigs };
}

// タイトル・メタ情報＋Markdown本文を1つの .docx として組み立ててダウンロードする。
// 呼び出し側の責務: AIタイトル生成（generateTitleWithTimeout）・sanitizeLatex 適用・
// ファイル名生成（sanitizeFilename + yyyymmdd + .docx）は txt/MD と同じ流儀で呼び出し側が行う。
// ※ triggerDownload(download.ts) は文字列専用で Blob 非対応のため、ここで直接DLする
//   （SavedAnalysisList の ZIP 一括DLと同じ方式）。
export async function downloadMarkdownAsDocx(opts: {
  title: string;
  metaLines: string[];
  markdown: string;
  fileName: string;
}): Promise<void> {
  const { title, metaLines, markdown, fileName } = opts;
  const { children, numberingConfigs } = markdownToDocx(markdown);

  const header: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 60 },
      children: [new TextRun({ text: title, bold: true, font: JP_FONT })],
    }),
    ...metaLines.map(
      (line) =>
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({ text: line, size: 18, color: '64748B', font: JP_FONT }),
          ],
        }),
    ),
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: 'B5D4F4', space: 1 },
      },
      spacing: { after: 160 },
    }),
  ];

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: '游明朝' } },
      },
    },
    numbering: { config: numberingConfigs },
    sections: [{ children: [...header, ...children] }],
  });

  const blob = new Blob([await Packer.toBlob(doc)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // revoke 漏れを統一的に防ぐ（download.ts と同じ流儀）
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
