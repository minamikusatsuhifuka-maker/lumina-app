"use client";

// DermaPDF Pro の proofread-comparison.tsx を移植。ハイライトロジック・UIは流用。
// 変更点（xLUMINA 適応）:
//  - 保存は localStorage(saveAnalysis) をやめ、サーバ /api/text-analysis/saves に POST
//  - folder はカテゴリに流用しない（auto-categorize 上書き問題の既知ルール）。
//    校正区分は analysis_type='proofread' で持ち、校正前(原文)は input_text に保持（lazy-load対応済）
//  - トーストは xLUMINA の useToast() に差し替え

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { AppliedFix } from "@/components/proofread/ProofreadModal";
import { useToast } from "@/components/ui/Toast";

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

// テキスト全体を行ごとにハイライト描画する。
// mode==="before": 各修正の original を赤文字、"after": suggestion を緑文字で強調。
// scope==="all" は全行の全出現箇所、"line" は該当行のみ。
function renderPane(
  text: string,
  fixes: AppliedFix[],
  mode: "before" | "after"
): ReactNode {
  const pick = (f: AppliedFix) => (mode === "before" ? f.original : f.suggestion);
  const allTargets = fixes.filter((f) => f.scope === "all").map(pick);
  const cls =
    mode === "before"
      ? "rounded bg-red-100 px-0.5 font-semibold text-red-600"
      : "rounded bg-green-100 px-0.5 font-semibold text-green-700";

  const lines = text.split("\n");
  return lines.map((line, i) => {
    const lineNo = i + 1;
    const targets = [
      ...allTargets,
      ...fixes
        .filter((f) => f.scope === "line" && f.line === lineNo)
        .map(pick),
    ];
    return (
      <span key={i}>
        {highlightLine(line, targets, cls, `${mode}-${i}`)}
        {i < lines.length - 1 ? "\n" : ""}
      </span>
    );
  });
}

// 校正の「校正前｜校正後」を大きく表示し、校正後を text_analysis_saves に新規保存する。
export function ProofreadComparison({
  before,
  after,
  title,
  fixes = [],
  onClose,
}: {
  before: string;
  after: string;
  title: string;
  // 適用済み修正の一覧。該当箇所を校正前=赤／校正後=緑でハイライトする。
  fixes?: AppliedFix[];
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  // 素テキストをそのままコピー（色・HTMLは含めず、貼り付け先では全て黒になる）
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("コピーしました", "success");
    } catch {
      // 失敗時は何もしない（クリップボード権限不可など）
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // folder はカテゴリに使わない。校正区分は analysisType で、原文は inputText(=input_text) に保持。
      const res = await fetch("/api/text-analysis/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `【校正済み】${title}`,
          content: after,
          inputText: before,
          analysisType: "proofread",
          analysisLabel: "校正済み",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "保存に失敗しました");
      }
      showToast("校正内容を保存しました（保存一覧に追加）", "success");
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-[#B5D4F4] bg-white/60 p-5 shadow-lg backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-700">🔎 校正 前後比較</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100"
          title="比較を閉じる"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold text-red-600">
            校正前（原文・赤字＝修正箇所）
          </div>
          <pre className="min-h-[50vh] max-h-[72vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50/30 p-4 text-sm leading-relaxed text-gray-700">
            {renderPane(before, fixes, "before")}
          </pre>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-green-600">
            校正後（緑字＝修正箇所）
          </div>
          <pre className="min-h-[50vh] max-h-[72vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-green-200 bg-green-50/30 p-4 text-sm leading-relaxed text-gray-700">
            {renderPane(after, fixes, "after")}
          </pre>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[#1D9E75] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0F6E56] disabled:opacity-50"
        >
          {saving ? "保存中..." : "校正内容を保存"}
        </button>
        <button
          onClick={() => handleCopy(after)}
          className="rounded-lg border border-[#1D9E75] px-5 py-2.5 text-sm font-semibold text-[#1D9E75] hover:bg-[#1D9E75]/10"
          title="校正後テキストをコピー（色なしのプレーンテキスト）"
        >
          📋 コピー
        </button>
        <button
          onClick={() => handleCopy(before)}
          className="rounded-lg border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
          title="校正前（原文）をコピー（色なしのプレーンテキスト）"
        >
          📋 校正前をコピー
        </button>
      </div>
    </section>
  );
}
