"use client";

// 保存一覧（/dashboard/saved）の「🔎 校正」タブ。
// proofread_saves に明示保存した「原文＋校正後＋適用した修正リスト」を一覧し、
// 開くと161の ProofreadDiffPane で赤/緑ハイライト付きの前後比較を再現する。

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { ProofreadDiffPane } from "@/components/proofread/ProofreadDiffPane";
import { useToast } from "@/components/ui/Toast";
import {
  deleteProofreadSave,
  getProofreadSave,
  listProofreadSaves,
  setProofreadHandoff,
  type ProofreadSaveDetail,
  type ProofreadSaveSummary,
} from "@/lib/proofread-saves";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ProofreadSavedList() {
  const { showToast } = useToast();
  const router = useRouter();
  const [saves, setSaves] = useState<ProofreadSaveSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<number | null>(null);
  const [viewing, setViewing] = useState<ProofreadSaveDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listProofreadSaves();
        if (!cancelled) setSaves(rows);
      } catch {
        // 取得失敗時は空一覧のまま（画面表示は妨げない）
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 比較ビューを開く（本文はここで単体取得＝一覧のペイロードを軽く保つ）
  const openViewer = async (id: number) => {
    setOpening(id);
    try {
      setViewing(await getProofreadSave(id));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "取得に失敗しました", "error");
    } finally {
      setOpening(null);
    }
  };

  // 校正画面のメイン比較（大画面）として開き直す
  const openInProofread = async (id: number) => {
    setOpening(id);
    try {
      const save = await getProofreadSave(id);
      setProofreadHandoff({
        title: save.title,
        before: save.source_text,
        after: save.work_text,
        fixes: save.corrections,
      });
      router.push("/dashboard/proofread");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "取得に失敗しました", "error");
      setOpening(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("この校正の保存を削除しますか？")) return;
    try {
      await deleteProofreadSave(id);
      setSaves((prev) => prev.filter((s) => s.id !== id));
      if (viewing?.id === id) setViewing(null);
      showToast("削除しました", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "削除に失敗しました", "error");
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("コピーしました", "success");
    } catch {
      // クリップボード権限なしなどは無視
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
        読み込み中...
      </div>
    );
  }

  if (saves.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: 40,
          color: "var(--text-muted)",
          fontSize: 13,
          lineHeight: 1.8,
        }}
      >
        保存された校正はまだありません。
        <br />
        テキスト校正で修正を適用し、「📚 比較を保存」を押すとここに残ります。
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {saves.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-[#B5D4F4] bg-white/70 p-4 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-bold text-gray-700">
                🔎 {s.title}
              </h3>
              <span className="shrink-0 rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[10px] font-semibold text-[#185FA5]">
                校正
              </span>
            </div>
            <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
              <span>{formatDate(s.created_at)}</span>
              <span>
                原文 {s.source_char_count}字 → 校正後 {s.work_char_count}字
              </span>
              <span className="font-semibold text-green-700">
                修正 {s.fix_count}件
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => openViewer(s.id)}
                disabled={opening === s.id}
                className="rounded-lg bg-[#378ADD] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#185FA5] disabled:opacity-50"
              >
                {opening === s.id ? "読み込み中..." : "🔎 前後比較を開く"}
              </button>
              <button
                onClick={() => openInProofread(s.id)}
                disabled={opening === s.id}
                className="rounded-lg border border-[#378ADD] px-3 py-1.5 text-xs font-semibold text-[#185FA5] hover:bg-[#E6F1FB] disabled:opacity-50"
              >
                📋 校正画面で大きく開く
              </button>
              <button
                onClick={() => handleDelete(s.id)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
              >
                🗑 削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 比較ビューア（保存時の状態をそのまま再現） */}
      {viewing && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-700">
                🔎 校正 前後比較
                <span className="truncate text-xs font-normal text-gray-400">
                  {viewing.title}（{formatDate(viewing.created_at)}）
                </span>
              </h2>
              <button
                onClick={() => setViewing(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-semibold text-red-600">
                    校正前（原文・赤字＝修正箇所）
                  </div>
                  <ProofreadDiffPane
                    text={viewing.source_text}
                    fixes={viewing.corrections}
                    mode="before"
                    className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50/30 p-4 text-sm leading-relaxed text-gray-700"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-green-600">
                    校正後（緑字＝修正箇所）
                  </div>
                  <ProofreadDiffPane
                    text={viewing.work_text}
                    fixes={viewing.corrections}
                    mode="after"
                    className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-green-200 bg-green-50/30 p-4 text-sm leading-relaxed text-gray-700"
                  />
                </div>
              </div>

              {/* 適用した修正の一覧（保存時のもの） */}
              {viewing.corrections.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold text-gray-500">
                    適用した修正（{viewing.corrections.length}件）
                  </div>
                  <div className="space-y-1.5">
                    {viewing.corrections.map((c, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 text-xs"
                      >
                        <span className="rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[10px] font-semibold text-[#185FA5]">
                          {c.scope === "all"
                            ? "全箇所"
                            : c.line > 0
                              ? `${c.line}行目`
                              : "全体"}
                        </span>
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 line-through">
                          {c.original || "（空）"}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-700">
                          {c.suggestion || "（削除）"}
                        </span>
                        {c.reason && (
                          <span className="text-gray-500">理由: {c.reason}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3">
              <button
                onClick={() => handleCopy(viewing.work_text)}
                className="rounded-lg border border-[#1D9E75] px-4 py-1.5 text-xs font-semibold text-[#1D9E75] hover:bg-[#1D9E75]/10"
                title="校正後テキストをコピー（色なしのプレーンテキスト）"
              >
                📋 校正後をコピー
              </button>
              <button
                onClick={() => handleCopy(viewing.source_text)}
                className="rounded-lg border border-red-300 px-4 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                title="校正前（原文）をコピー（色なしのプレーンテキスト）"
              >
                📋 校正前をコピー
              </button>
              <button
                onClick={() => openInProofread(viewing.id)}
                disabled={opening === viewing.id}
                className="rounded-lg bg-[#378ADD] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#185FA5] disabled:opacity-50"
              >
                {opening === viewing.id ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> open...
                  </span>
                ) : (
                  "📋 校正画面で大きく開く"
                )}
              </button>
              <button
                onClick={() => setViewing(null)}
                className="ml-auto rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
