// 共通 Markdown→HTML レンダラ
// deepresearch の formatReport / processInline をベースに共通化したもの。
// 対応記法: 見出し(# 〜 ######)、箇条書き(-/*/・)、番号リスト(1. 2. ...)、太字(**)、
//           出典行整形、URL自動リンク、区切り線(---)、テーブル(|a|b|、区切り行必須)。
//
// 使い方: <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
// スタイルは globals.css の .markdown-body 配下で当てる。
//
// 安全性: AI応答を入力する前提。ユーザー入力を直接流し込まないこと。
//         インライン処理の前に必ず escapeHtml で HTML をエスケープする。

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// インライン処理（太字・出典リンク・裸URL）。流用元 deepresearch の挙動を踏襲。
function processInline(raw: string): string {
  // 先に HTML エスケープ（その後の置換で生成するタグは安全なもののみ）
  let text = escapeHtml(raw);

  // 太字 **xxx**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 「出典: サイト名 https://URL」形式
  text = text.replace(
    /出典[:：]\s*([^\s]+)\s+(https?:\/\/[^\s）\]。、！？\n]+)/g,
    '出典: <a href="$2" target="_blank" rel="noopener noreferrer">$1 ↗</a>'
  );

  // 裸のURL（属性値内などに既に入っていないもの）
  text = text.replace(
    /(?<![="'(])(https?:\/\/[^\s）\]。、！？\n"'<>]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1 ↗</a>'
  );

  return text;
}

// テーブルブロックの解析。区切り行（|---|---|）が必須で、無ければ null を返す
// （本文中の縦棒を誤ってテーブル化しないための誤検出防止）。
// startIdx を先頭行とみなし、ヘッダ + 区切り行 + データ行を <table> に変換する。
function parseTableBlock(
  lines: string[],
  startIdx: number,
): { html: string; nextIdx: number } | null {
  const headerLine = lines[startIdx];
  const sepLine = lines[startIdx + 1];
  // 1行目がテーブル行か
  if (!/^\s*\|.*\|\s*$/.test(headerLine)) return null;
  // 2行目が区切り行（|---|---|、:--/:-:/--: の寄せ指定も許容）か。無ければテーブルとみなさない
  if (!sepLine || !/^\s*\|[\s:|-]+\|\s*$/.test(sepLine)) return null;

  // | で分割し、前後の空セル（行頭・行末の | による空文字）を除去
  const splitRow = (row: string) =>
    row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

  const headers = splitRow(headerLine);
  const rows: string[][] = [];
  let i = startIdx + 2;
  while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
    rows.push(splitRow(lines[i]));
    i++;
  }

  const thead = `<thead><tr>${headers
    .map((h) => `<th>${processInline(h)}</th>`)
    .join('')}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${processInline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;

  // 広いテーブルでも崩れないよう、ラッパー div で横スクロール対応
  const html = `<div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div>`;
  return { html, nextIdx: i };
}

export function renderMarkdown(raw: string): string {
  if (!raw) return '';

  const lines = raw.split('\n');
  const html: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const t = line.trim();

    // テーブル（区切り行が続く場合のみ）。誤検出防止のため最優先で判定
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const table = parseTableBlock(lines, idx);
      if (table) {
        closeList();
        html.push(table.html);
        idx = table.nextIdx - 1; // for ループの idx++ で nextIdx に進む
        continue;
      }
    }

    // 空行
    if (t === '') {
      closeList();
      html.push('<div class="md-gap"></div>');
      continue;
    }

    // 見出し（長いシャープから先に判定: ###### → h6 / ##### → h6 / #### → h5
    //         / ### → h4 / ## → h3 / # → h2）
    if (t.startsWith('###### ')) { closeList(); html.push(`<h6>${processInline(t.slice(7))}</h6>`); continue; }
    if (t.startsWith('##### '))  { closeList(); html.push(`<h6>${processInline(t.slice(6))}</h6>`); continue; }
    if (t.startsWith('#### '))   { closeList(); html.push(`<h5>${processInline(t.slice(5))}</h5>`); continue; }
    if (t.startsWith('### '))    { closeList(); html.push(`<h4>${processInline(t.slice(4))}</h4>`); continue; }
    if (t.startsWith('## '))     { closeList(); html.push(`<h3>${processInline(t.slice(3))}</h3>`); continue; }
    if (t.startsWith('# '))      { closeList(); html.push(`<h2>${processInline(t.slice(2))}</h2>`); continue; }

    // 区切り線
    if (/^---+$/.test(t)) { closeList(); html.push('<hr/>'); continue; }

    // 出典行（流用元踏襲: 「出典」「【出典】」「参考」で始まる行）
    if (t.startsWith('出典') || t.startsWith('【出典】') || t.startsWith('参考')) {
      closeList();
      html.push(`<div class="md-source">${processInline(t)}</div>`);
      continue;
    }

    // 番号付きリスト（1. 2. ...）
    const numMatch = t.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${processInline(numMatch[2])}</li>`);
      continue;
    }

    // 箇条書き（-, *, ・, •）
    if (/^[-*・•]\s+/.test(t)) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${processInline(t.replace(/^[-*・•]\s+/, ''))}</li>`);
      continue;
    }

    // 通常段落
    closeList();
    html.push(`<p>${processInline(t)}</p>`);
  }

  closeList();
  return html.join('\n');
}
