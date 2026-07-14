"use client";

// 校正の前後比較ペイン（モーダル内・メイン画面の両方で使う共通描画）。
// 適用済み候補の before/after 文字列と行番号を使った置換ベースのハイライト
// （汎用diffは使わない。候補データが正確な位置情報を持つため確実・軽量）。
// テキストは React ノードとして描画するので自動エスケープされる（dangerouslySetInnerHTML 不使用）。

import type { ReactNode } from "react";

export type IssueScope = "line" | "all";

// 前後比較ペインのハイライト描画に渡す「適用済み修正」1件分
export interface AppliedFix {
  original: string;
  suggestion: string;
  line: number;
  scope: IssueScope;
}

// 1行内で targets に一致する全箇所を <mark> でハイライトする。
// 見つからなければ素のテキストをそのまま返す（誤ハイライト・クラッシュ防止）。
function highlightLine(
  line: string,
  targets: string[],
  cls: string,
  keyBase: string
): ReactNode {
  // 空文字を除き、長い一致を優先（部分一致の取りこぼし防止）
  const uniq = Array.from(new Set(targets.filter((t) => t.length > 0))).sort(
    (a, b) => b.length - a.length
  );
  if (uniq.length === 0) return line;

  const ranges: { start: number; end: number }[] = [];
  for (const t of uniq) {
    let from = 0;
    while (true) {
      const i = line.indexOf(t, from);
      if (i === -1) break;
      ranges.push({ start: i, end: i + t.length });
      from = i + t.length;
    }
  }
  if (ranges.length === 0) return line;

  // 重なり区間をマージ
  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  merged.forEach((m, idx) => {
    if (m.start > cursor) nodes.push(line.slice(cursor, m.start));
    nodes.push(
      <mark key={`${keyBase}-${idx}`} className={cls}>
        {line.slice(m.start, m.end)}
      </mark>
    );
    cursor = m.end;
  });
  if (cursor < line.length) nodes.push(line.slice(cursor));
  return nodes;
}

// 個別候補カードと同じ配色トーン（校正前=赤系 / 校正後=緑系）
const BEFORE_CLS =
  "rounded bg-red-100 px-0.5 font-semibold text-red-700 line-through decoration-red-400/60";
const AFTER_CLS = "rounded bg-green-100 px-0.5 font-semibold text-green-700";

// テキスト全体を行ごとにハイライト描画する。
// mode==="before": 各修正の original を赤系、"after": suggestion を緑系で強調。
// scope==="all" は全行の全出現箇所、"line" は該当行のみ（同一文字列が複数行にあっても行番号で絞る）。
export function renderProofreadPane(
  text: string,
  fixes: AppliedFix[],
  mode: "before" | "after"
): ReactNode {
  const pick = (f: AppliedFix) => (mode === "before" ? f.original : f.suggestion);
  const allTargets = fixes.filter((f) => f.scope === "all").map(pick);
  const cls = mode === "before" ? BEFORE_CLS : AFTER_CLS;

  const lines = text.split("\n");
  return lines.map((line, i) => {
    const lineNo = i + 1;
    const targets = [
      ...allTargets,
      ...fixes.filter((f) => f.scope === "line" && f.line === lineNo).map(pick),
    ];
    return (
      <span key={i}>
        {highlightLine(line, targets, cls, `${mode}-${i}`)}
        {i < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

// 比較ペイン本体（<pre> の見た目は呼び出し側の className で調整する）
export function ProofreadDiffPane({
  text,
  fixes,
  mode,
  className,
}: {
  text: string;
  fixes: AppliedFix[];
  mode: "before" | "after";
  className?: string;
}) {
  return (
    <pre className={className}>{renderProofreadPane(text, fixes, mode)}</pre>
  );
}
