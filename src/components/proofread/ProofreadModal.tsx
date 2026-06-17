"use client";

// DermaPDF Pro の proofread-modal.tsx を移植。ロジック・UIは流用。
// 変更点（xLUMINA 適応）:
//  - AI検出はクライアント直叩き(gemini-client)をやめ、サーバルート /api/proofread/detect 経由に
//  - トーストは xLUMINA の useToast() に差し替え

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export type IssueScope = "line" | "all";
type IssueStatus = "pending" | "applied" | "rejected" | "manual";

// 前後比較ペインのハイライト描画に渡す「適用済み修正」1件分
export interface AppliedFix {
  original: string;
  suggestion: string;
  line: number;
  scope: IssueScope;
}

interface Issue {
  id: number;
  line: number;
  type: string;
  original: string;
  suggestion: string;
  reason: string;
  scope: IssueScope;
  checked: boolean;
  status: IssueStatus;
}

// 1件の校正候補を作業テキストへローカル置換で適用する（原文完全一致が前提）。
function applyToText(
  text: string,
  issue: Issue
): { ok: boolean; text: string } {
  if (!issue.original) return { ok: false, text };
  if (issue.scope === "all") {
    if (!text.includes(issue.original)) return { ok: false, text };
    return { ok: true, text: text.split(issue.original).join(issue.suggestion) };
  }
  const lines = text.split("\n");
  const idx = issue.line - 1;
  if (idx < 0 || idx >= lines.length || !lines[idx].includes(issue.original)) {
    return { ok: false, text };
  }
  lines[idx] = lines[idx].replace(issue.original, issue.suggestion);
  return { ok: true, text: lines.join("\n") };
}

export function ProofreadModal({
  sourceText,
  sourceTitle,
  onSaveCard,
  onClose,
  onComparison,
}: {
  sourceText: string;
  sourceTitle: string;
  // before は校正前（原文）。校正後カードに紐づけて保持するため渡す。
  onSaveCard: (title: string, content: string, before: string) => void;
  onClose: () => void;
  // 指定時：適用後の「校正前/校正後」をメイン画面に大きく表示する導線を出す
  // fixes は適用済み修正の一覧で、比較ペインの該当箇所ハイライトに使う
  onComparison?: (before: string, after: string, fixes: AppliedFix[]) => void;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [workText, setWorkText] = useState(sourceText);
  const [error, setError] = useState("");

  const detect = async () => {
    try {
      // 検出はサーバルート経由（行番号付与・プロンプト・AI呼び出し・JSON抽出はサーバ側）
      const res = await fetch("/api/proofread/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !Array.isArray(data.issues)) {
        setError(data.error || "校正候補の解析に失敗しました。再度お試しください。");
        setIssues([]);
        setLoading(false);
        return;
      }
      setIssues(
        data.issues.map(
          (
            it: {
              line: number;
              type: string;
              original: string;
              suggestion: string;
              reason: string;
              scope: string;
            },
            i: number
          ) => ({
            id: i,
            line: Number(it.line) || 0,
            type: String(it.type || "修正"),
            original: String(it.original || ""),
            suggestion: String(it.suggestion || ""),
            reason: String(it.reason || ""),
            scope: it.scope === "all" ? "all" : "line",
            checked: true,
            status: "pending" as IssueStatus,
          })
        )
      );
      setError("");
      setLoading(false);
    } catch {
      setError("校正候補の解析に失敗しました。再度お試しください。");
      setIssues([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    detect();
    // 初回マウント時のみ検出する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = issues.filter((i) => i.status === "pending");

  const applyOne = (target: Issue) => {
    const result = applyToText(workText, target);
    setIssues((prev) =>
      prev.map((it) =>
        it.id === target.id
          ? { ...it, status: result.ok ? "applied" : "manual" }
          : it
      )
    );
    if (result.ok) setWorkText(result.text);
  };

  const rejectOne = (target: Issue) => {
    setIssues((prev) =>
      prev.map((it) =>
        it.id === target.id ? { ...it, status: "rejected" } : it
      )
    );
  };

  const applyBulk = (onlyChecked: boolean) => {
    let text = workText;
    const next = issues.map((issue) => {
      if (issue.status !== "pending") return issue;
      if (onlyChecked && !issue.checked) return issue;
      const r = applyToText(text, issue);
      if (r.ok) {
        text = r.text;
        return { ...issue, status: "applied" as IssueStatus };
      }
      return { ...issue, status: "manual" as IssueStatus };
    });
    setIssues(next);
    setWorkText(text);
  };

  const toggleAll = (checked: boolean) => {
    setIssues((prev) =>
      prev.map((it) => (it.status === "pending" ? { ...it, checked } : it))
    );
  };

  const handleSave = () => {
    onSaveCard(`【校正済み】${sourceTitle}`, workText, sourceText);
    showToast("校正済みカードを保存しました", "success");
    onClose();
  };

  const appliedCount = issues.filter((i) => i.status === "applied").length;
  const manualCount = issues.filter((i) => i.status === "manual").length;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-700">
            🔎 校正
            <span className="truncate text-xs font-normal text-gray-400">
              {sourceTitle}
            </span>
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 本体 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> 校正候補を検出中...
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-sm text-red-500">{error}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setError("");
                  setWorkText(sourceText);
                  detect();
                }}
                className="mt-3 rounded-lg bg-[#378ADD] px-4 py-2 text-sm font-medium text-white hover:bg-[#185FA5]"
              >
                再検出
              </button>
            </div>
          ) : issues.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#1D9E75]">
              ✅ 問題は見つかりませんでした
            </p>
          ) : (
            <div className="space-y-3">
              {/* 集計・全選択 */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span>
                  検出 {issues.length} 件 / 未処理 {pending.length} 件 / 適用済み{" "}
                  {appliedCount} 件
                  {manualCount > 0 && ` / 要手動確認 ${manualCount} 件`}
                </span>
                <button
                  onClick={() => toggleAll(true)}
                  className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
                >
                  全選択
                </button>
                <button
                  onClick={() => toggleAll(false)}
                  className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
                >
                  全解除
                </button>
              </div>

              {issues.map((it) => (
                <div
                  key={it.id}
                  className={`rounded-xl border p-3 text-sm ${
                    it.status === "applied"
                      ? "border-green-100 bg-green-50/40 opacity-60"
                      : it.status === "rejected"
                        ? "border-gray-100 bg-gray-50 opacity-50"
                        : it.status === "manual"
                          ? "border-amber-200 bg-amber-50/60"
                          : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {it.status === "pending" && (
                      <input
                        type="checkbox"
                        checked={it.checked}
                        onChange={(e) =>
                          setIssues((prev) =>
                            prev.map((p) =>
                              p.id === it.id
                                ? { ...p, checked: e.target.checked }
                                : p
                            )
                          )
                        }
                        className="accent-[#378ADD]"
                      />
                    )}
                    <span className="rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[10px] font-semibold text-[#185FA5]">
                      {it.line > 0 ? `${it.line}行目` : "全体"}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                      {it.type}
                    </span>
                    {it.scope === "all" && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] text-purple-600">
                        全箇所統一
                      </span>
                    )}
                    {it.status === "applied" && (
                      <span className="text-[10px] font-semibold text-green-600">
                        ✓ 適用済み
                      </span>
                    )}
                    {it.status === "rejected" && (
                      <span className="text-[10px] text-gray-400">却下</span>
                    )}
                    {it.status === "manual" && (
                      <span className="text-[10px] font-semibold text-amber-600">
                        ⚠ 要手動確認（原文不一致）
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 line-through">
                      {it.original || "（空）"}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-700">
                      {it.suggestion || "（削除）"}
                    </span>
                  </div>
                  {it.reason && (
                    <p className="mt-1 text-xs text-gray-500">理由: {it.reason}</p>
                  )}

                  {it.status === "pending" && (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => applyOne(it)}
                        className="rounded-lg bg-[#1D9E75] px-3 py-1 text-xs font-medium text-white hover:bg-[#0F6E56]"
                      >
                        ✓ 適用
                      </button>
                      <button
                        onClick={() => rejectOne(it)}
                        className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
                      >
                        ✕ 却下
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* 校正前｜校正後 の比較ビュー（左右並列・独立スクロール、狭幅は縦積み） */}
              <div>
                <div className="mb-1 text-xs text-gray-500">校正前 ｜ 校正後</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[10px] font-semibold text-red-600">
                      校正前（原文）
                    </div>
                    <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-red-100 bg-red-50/30 p-3 text-xs text-gray-700">
                      {sourceText}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-semibold text-green-600">
                      校正後
                    </div>
                    <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border border-green-100 bg-green-50/30 p-3 text-xs text-gray-700">
                      {workText}
                    </pre>
                  </div>
                </div>
                {/* 比較ビュー直下の保存ボタン */}
                <div className="mt-3">
                  <button
                    onClick={handleSave}
                    className="rounded-lg bg-[#1D9E75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F6E56]"
                  >
                    校正内容を保存
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          {!loading && !error && issues.length > 0 && (
            <>
              <button
                onClick={() => applyBulk(true)}
                disabled={pending.length === 0}
                className="rounded-lg bg-[#378ADD] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#185FA5] disabled:opacity-50"
              >
                選択分を適用
              </button>
              <button
                onClick={() => applyBulk(false)}
                disabled={pending.length === 0}
                className="rounded-lg bg-[#378ADD] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#185FA5] disabled:opacity-50"
              >
                すべて適用
              </button>
            </>
          )}
          {onComparison && (
            <button
              onClick={() => {
                const fixes: AppliedFix[] = issues
                  .filter((i) => i.status === "applied")
                  .map((i) => ({
                    original: i.original,
                    suggestion: i.suggestion,
                    line: i.line,
                    scope: i.scope,
                  }));
                onComparison(sourceText, workText, fixes);
                onClose();
              }}
              className="rounded-lg bg-[#378ADD] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#185FA5]"
            >
              📋 メイン画面で大きく前後比較
            </button>
          )}
          <button
            onClick={handleSave}
            className="rounded-lg bg-[#1D9E75] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0F6E56]"
          >
            【校正済み】を保存
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
