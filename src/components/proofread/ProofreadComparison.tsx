"use client";

// DermaPDF Pro の proofread-comparison.tsx を移植。ハイライトロジック・UIは流用。
// 変更点（xLUMINA 適応）:
//  - 保存は localStorage(saveAnalysis) をやめ、サーバ /api/text-analysis/saves に POST
//  - folder はカテゴリに流用しない（auto-categorize 上書き問題の既知ルール）。
//    校正区分は analysis_type='proofread' で持ち、校正前(原文)は input_text に保持（lazy-load対応済）
//  - トーストは xLUMINA の useToast() に差し替え
//  - ハイライト描画は ProofreadDiffPane に集約（モーダル内の比較ペインと共通）
//  - 保存後も比較表示を閉じない（見比べを続けられるようにする）

import { useState } from "react";
import { X } from "lucide-react";
import {
  ProofreadDiffPane,
  type AppliedFix,
} from "@/components/proofread/ProofreadDiffPane";
import { useToast } from "@/components/ui/Toast";
import { createProofreadSave } from "@/lib/proofread-saves";

// 校正の「校正前｜校正後」を大きく表示し、校正後を text_analysis_saves に新規保存する。
// 「📚 比較を保存」は原文＋校正後＋修正リストをペアで proofread_saves に保存し、
// 保存一覧＞校正 からいつでも比較ビューを再現できるようにする（162）。
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
  const [saved, setSaved] = useState(false);
  const [savingPair, setSavingPair] = useState(false);
  const [savedPair, setSavedPair] = useState(false);

  // 前後比較つき保存（proofread_saves）。表示は維持したまま。
  const handleSavePair = async () => {
    if (savingPair) return;
    setSavingPair(true);
    try {
      await createProofreadSave({
        title,
        sourceText: before,
        workText: after,
        corrections: fixes,
      });
      setSavedPair(true);
      showToast("📚 前後比較を保存しました（保存一覧＞校正）", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "保存に失敗しました", "error");
    } finally {
      setSavingPair(false);
    }
  };

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
      // 保存後も比較表示は閉じない（見比べを続けられるようにする）
      setSaved(true);
      showToast("💾 保存しました（保存一覧に追加）", "success");
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
          <ProofreadDiffPane
            text={before}
            fixes={fixes}
            mode="before"
            className="min-h-[50vh] max-h-[72vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50/30 p-4 text-sm leading-relaxed text-gray-700"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-green-600">
            校正後（緑字＝修正箇所）
          </div>
          <ProofreadDiffPane
            text={after}
            fixes={fixes}
            mode="after"
            className="min-h-[50vh] max-h-[72vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-green-200 bg-green-50/30 p-4 text-sm leading-relaxed text-gray-700"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[#1D9E75] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0F6E56] disabled:opacity-50"
        >
          {saving ? "保存中..." : saved ? "保存済み ✓" : "校正内容を保存"}
        </button>
        <button
          onClick={handleSavePair}
          disabled={savingPair}
          className="rounded-lg border border-[#378ADD] px-5 py-2.5 text-sm font-semibold text-[#185FA5] hover:bg-[#E6F1FB] disabled:opacity-50"
          title="原文＋校正後＋適用した修正をペアで保存（保存一覧＞校正からいつでも比較を再現）"
        >
          {savingPair
            ? "保存中..."
            : savedPair
              ? "比較を保存済み ✓"
              : "📚 比較を保存"}
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
