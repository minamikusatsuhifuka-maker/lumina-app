// 共通 Markdown→HTML レンダラ
// deepresearch の formatReport / processInline をベースに共通化したもの。
// 対応記法: 見出し(#/##/###)、箇条書き(-/*/・)、番号リスト(1. 2. ...)、太字(**)、
//           出典行整形、URL自動リンク、区切り線(---)。
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

  for (const line of lines) {
    const t = line.trim();

    // 空行
    if (t === '') {
      closeList();
      html.push('<div class="md-gap"></div>');
      continue;
    }

    // 見出し（### → h4 / ## → h3 / # → h2）
    if (t.startsWith('### ')) { closeList(); html.push(`<h4>${processInline(t.slice(4))}</h4>`); continue; }
    if (t.startsWith('## '))  { closeList(); html.push(`<h3>${processInline(t.slice(3))}</h3>`); continue; }
    if (t.startsWith('# '))   { closeList(); html.push(`<h2>${processInline(t.slice(2))}</h2>`); continue; }

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
