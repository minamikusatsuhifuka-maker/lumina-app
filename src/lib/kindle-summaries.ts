// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Kindleウィザードの章まとめ 一元管理（227【A】【B】）
// 【B】独立まとめ欄: book_meta.summaries（章IDキー・サーバ側jsonb_setマージ=224方式）
// 【A】章末まとめの後付け: 同じ要点データから本文末尾に「## この章のまとめ」を追記
// クライアント/サーバ共用のため server-only 依存を置かない。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface KindleChapterSummary {
  points: string[];
  updatedAt: string;
  source: 'auto' | 'edited';
}

// key = 章ID（文字列）
export type KindleBookSummaries = Record<string, KindleChapterSummary>;

// 章末まとめ見出しの検出（見出しレベル・強調・かっこ・「この章/本章」の揺れを吸収）。
// KINDLE_LAYOUT_RULES は文言「この章のまとめ」しか固定していないため、実出力の揺れ
// （### / **…** / 章のポイント 等）を安全側（=存在するとみなして二重付与を防ぐ）に拾う。
const SUMMARY_HEADING_RE =
  /^[ \t]{0,3}(?:#{2,6}[ \t]*|\*{2}|【)?\s*(?:この|本)?章の(?:まとめ|ポイント|要点)\s*(?:\*{2}|】)?\s*$/m;

// 本文に章末まとめが既にあるか。
// 見出しが本文の後半（60%以降）にある、または見出し以降に箇条書き行が続く場合に「あり」。
// 冒頭の「この章でわかること」は文言が異なるためマッチしない。
export function hasChapterEndSummary(content: string): boolean {
  const m = SUMMARY_HEADING_RE.exec(content);
  if (!m) return false;
  if (m.index >= content.length * 0.6) return true;
  return /^\s*[-*・]\s+/m.test(content.slice(m.index + m[0].length));
}

// 【A】本文末尾に追記する章末まとめブロック（223改善-2以降の自動生成と同じ体裁）
export function buildChapterSummaryBlock(points: string[]): string {
  return `## この章のまとめ\n\n${points.map((p) => `- ${p}`).join('\n')}`;
}

// ⑥巻末「全章まとめ」ページ（MD/txt/Word共通のMarkdown1ブロック）。
// 章はfullMarkdownBodyと同じ##階層を増やさないよう、章名は太字行で表す。
export function buildBookSummarySection(
  chapters: { chapterNumber: number; title: string; id: number }[],
  summaries: KindleBookSummaries,
): string {
  const parts: string[] = [];
  for (const c of [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)) {
    const entry = summaries[String(c.id)];
    if (!entry || entry.points.length === 0) continue;
    parts.push(`**第${c.chapterNumber}章 ${c.title}**\n${entry.points.map((p) => `- ${p}`).join('\n')}`);
  }
  if (parts.length === 0) return '';
  return `## 全章まとめ\n\n${parts.join('\n\n')}`;
}

// 編集UI・PUT検証の共通ガード（空行除去・前後空白トリム・上限8点）
export function normalizeSummaryPoints(points: unknown): string[] {
  if (!Array.isArray(points)) return [];
  return points
    .map((p) => String(p ?? '').trim())
    .filter((p) => p.length > 0)
    .slice(0, 8);
}
