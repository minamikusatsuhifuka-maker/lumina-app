'use client';

// 生成テキストの追加修正（169）。テキスト分析／ディープリサーチの2画面で共用（コピペしない）。
// 設計の芯: AIに全文を再出力させず、変更箇所だけを before/after ペアで扱い、
//           適用はアプリ側で確定的に置換、確認は161の赤/緑ハイライトで行う。
//   モードA: クイック置換（AI不要・確定的な全置換）
//   モードB: AI修正指示（/api/refine/suggest が差分ペアを起案→適用/却下→適用分のみ置換）
//
// 2列比較は161の描画関数 renderProofreadPane を再利用する。ProofreadDiffPane コンポーネント自体は
// 触らない（校正画面 /dashboard/proofread の既定表示・挙動は完全無変更）。スクロール同期と
// 変更箇所ジャンプのため pre への ref が要るので、コンポーネントでなく描画関数を使うのが素直。

import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import {
  renderProofreadPane,
  type AppliedFix,
} from '@/components/proofread/ProofreadDiffPane';

type Mode = 'quick' | 'ai';

// クイック置換の1ペア
interface Pair {
  id: number;
  before: string;
  after: string;
}

// AI修正指示の候補（before/after/reason ＋ 適用状態）
interface AiEdit {
  before: string;
  after: string;
  reason: string;
  status: 'pending' | 'applied' | 'rejected';
}

// 指定ペア群を確定的に全置換（before が複数一致する場合は全件置換）。
function applyPairs(text: string, pairs: { before: string; after: string }[]): string {
  let out = text;
  for (const p of pairs) {
    if (!p.before) continue;
    out = out.split(p.before).join(p.after);
  }
  return out;
}

// text 内の needle の出現回数
function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

let pairSeq = 1;

export function TextRefinePanel({
  open,
  onClose,
  sourceText,
  sourceLabel,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  sourceText: string;
  sourceLabel?: string;
  // 適用確定時に呼ばれる。親が結果 state を新テキストに置き換える（コピー/DL/保存が拾えるように）。
  onApply: (newText: string) => void;
}) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>('quick');
  // originalText は「元に戻す」の基準。開いた時点の結果テキストを固定する。
  const [originalText, setOriginalText] = useState(sourceText);
  const [pairs, setPairs] = useState<Pair[]>([{ id: pairSeq++, before: '', after: '' }]);
  const [instruction, setInstruction] = useState('');
  const [aiEdits, setAiEdits] = useState<AiEdit[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [applied, setApplied] = useState(false);
  const [stacked, setStacked] = useState(false); // 狭幅は縦積みフォールバック

  const beforeRef = useRef<HTMLPreElement>(null);
  const afterRef = useRef<HTMLPreElement>(null);
  const syncing = useRef(false);
  const [jumpIndex, setJumpIndex] = useState(0);

  // 開き直したら元テキストを取り直す（別カード/別結果を対象にできる）
  useEffect(() => {
    if (open) {
      setOriginalText(sourceText);
      setPairs([{ id: pairSeq++, before: '', after: '' }]);
      setInstruction('');
      setAiEdits([]);
      setApplied(false);
      setJumpIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 画面幅で2列/縦積みを切り替え（モーダル内でも潰れないように）
  useEffect(() => {
    if (!open) return;
    const check = () => setStacked(window.innerWidth < 860);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [open]);

  // いま「適用対象」となるペア群（モードごと）
  const activePairs = useMemo(() => {
    if (mode === 'quick') {
      return pairs.filter((p) => p.before);
    }
    return aiEdits.filter((e) => e.status === 'applied');
  }, [mode, pairs, aiEdits]);

  // プレビュー用の適用後テキスト（元テキストに対して適用対象を置換）
  const previewText = useMemo(
    () => applyPairs(originalText, activePairs),
    [originalText, activePairs],
  );

  // ハイライト用 fixes（scope='all' で全出現を色付け。line は使わないので0）
  const fixes = useMemo<AppliedFix[]>(
    () =>
      activePairs
        .filter((p) => p.before && p.before !== p.after)
        .map((p) => ({
          original: p.before,
          suggestion: p.after,
          line: 0,
          scope: 'all' as const,
          reason: 'reason' in p ? (p as AiEdit).reason : '',
        })),
    [activePairs],
  );

  // モードA: 全ペアの合計ヒット数（適用前に何箇所変わるか）
  const totalHits = useMemo(
    () =>
      pairs.reduce((sum, p) => sum + (p.before ? countOccurrences(originalText, p.before) : 0), 0),
    [pairs, originalText],
  );

  // 左右スクロール同期（片方の scrollTop をもう片方へ）
  const onScroll = (from: 'before' | 'after') => {
    if (syncing.current) return;
    const src = from === 'before' ? beforeRef.current : afterRef.current;
    const dst = from === 'before' ? afterRef.current : beforeRef.current;
    if (!src || !dst) return;
    syncing.current = true;
    dst.scrollTop = src.scrollTop;
    // 次フレームで解除（相互発火のループ防止）
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  // 変更箇所ジャンプ（校正後ペインの緑 mark を順に表示）
  const marks = () => afterRef.current?.querySelectorAll('mark') ?? null;
  const markCount = () => marks()?.length ?? 0;

  const jumpTo = (dir: 1 | -1) => {
    const list = marks();
    if (!list || list.length === 0) return;
    let next = jumpIndex + dir;
    if (next < 0) next = list.length - 1;
    if (next >= list.length) next = 0;
    setJumpIndex(next);
    const el = list[next] as HTMLElement;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const addPair = () => setPairs((prev) => [...prev, { id: pairSeq++, before: '', after: '' }]);
  const updatePair = (id: number, key: 'before' | 'after', value: string) =>
    setPairs((prev) => prev.map((p) => (p.id === id ? { ...p, [key]: value } : p)));
  const removePair = (id: number) =>
    setPairs((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));

  // モードB: AIに差分を起案させる（人間確認型・自動適用しない）
  const requestAi = async () => {
    if (!instruction.trim() || loadingAi) return;
    setLoadingAi(true);
    try {
      const res = await fetch('/api/refine/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText: originalText, instruction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !Array.isArray(data.edits)) {
        throw new Error(data.error || '候補を取得できませんでした');
      }
      if (data.edits.length === 0) {
        showToast('該当する修正箇所は見つかりませんでした', 'info');
      }
      // 壊れた結果で state を壊さない: 正常時のみ差し替え
      setAiEdits(
        data.edits.map((e: { before: string; after: string; reason: string }) => ({
          before: e.before,
          after: e.after,
          reason: e.reason,
          status: 'pending' as const,
        })),
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : '取得に失敗しました', 'error');
    } finally {
      setLoadingAi(false);
    }
  };

  const setEditStatus = (idx: number, status: AiEdit['status']) =>
    setAiEdits((prev) => prev.map((e, i) => (i === idx ? { ...e, status } : e)));

  // 適用（結果 state へ反映）。モーダルは閉じない（161方針）。
  const handleApply = () => {
    if (activePairs.length === 0) {
      showToast('適用する修正がありません', 'warning');
      return;
    }
    onApply(previewText);
    setApplied(true);
    showToast('修正を反映しました', 'success');
  };

  // 元に戻す（元テキストへ復帰＋適用状態リセット）
  const handleRevert = () => {
    onApply(originalText);
    setApplied(false);
    setAiEdits((prev) => prev.map((e) => ({ ...e, status: 'pending' })));
    showToast('元に戻しました', 'success');
  };

  if (!open) return null;

  const paneCls =
    'max-h-[52vh] min-h-[200px] flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border p-3 text-sm leading-relaxed text-gray-700';

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-700">
            ✏️ AIで修正
            {sourceLabel && (
              <span className="truncate text-xs font-normal text-gray-400">{sourceLabel}</span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* モード切替 */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode('quick')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                mode === 'quick'
                  ? 'bg-[#378ADD] text-white'
                  : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              🔁 クイック置換（AI不要）
            </button>
            <button
              onClick={() => setMode('ai')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                mode === 'ai'
                  ? 'bg-[#378ADD] text-white'
                  : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              ✏️ AI修正指示
            </button>
          </div>

          {/* モードA: クイック置換 */}
          {mode === 'quick' && (
            <div className="space-y-2">
              {pairs.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2">
                  <input
                    value={p.before}
                    onChange={(e) => updatePair(p.id, 'before', e.target.value)}
                    placeholder="置換前（例：肩トレ）"
                    className="min-w-[140px] flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-[#378ADD]"
                  />
                  <span className="text-gray-400">→</span>
                  <input
                    value={p.after}
                    onChange={(e) => updatePair(p.id, 'after', e.target.value)}
                    placeholder="置換後（例：カタトレ）"
                    className="min-w-[140px] flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-[#378ADD]"
                  />
                  <span className="whitespace-nowrap text-[11px] text-gray-400">
                    {p.before ? `${countOccurrences(originalText, p.before)}件` : '—'}
                  </span>
                  <button
                    onClick={() => removePair(p.id)}
                    disabled={pairs.length <= 1}
                    className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                    aria-label="この行を削除"
                  >
                    🗑
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <button
                  onClick={addPair}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
                >
                  ＋ 行を追加
                </button>
                <span className="text-xs font-semibold text-[#185FA5]">
                  対象件数：{totalHits}件
                </span>
              </div>
            </div>
          )}

          {/* モードB: AI修正指示 */}
          {mode === 'ai' && (
            <div className="space-y-2">
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="修正指示を自由に入力（例：敬体に統一 / 冗長な言い回しを削る / 専門用語に読み仮名を付ける）"
                rows={2}
                className="w-full resize-y rounded-lg border border-gray-200 p-3 text-sm text-gray-700 outline-none focus:border-[#378ADD]"
              />
              <button
                onClick={requestAi}
                disabled={!instruction.trim() || loadingAi}
                className="rounded-lg bg-[#378ADD] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#185FA5] disabled:opacity-50"
              >
                {loadingAi ? '起案中...' : '🔍 修正候補を出す'}
              </button>

              {aiEdits.length > 0 && (
                <div className="space-y-1.5">
                  {aiEdits.map((e, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-2 text-xs ${
                        e.status === 'applied'
                          ? 'border-green-100 bg-green-50/40'
                          : e.status === 'rejected'
                            ? 'border-gray-100 bg-gray-50 opacity-50'
                            : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 line-through">
                          {e.before}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-700">
                          {e.after}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          （{countOccurrences(originalText, e.before)}件）
                        </span>
                        {e.status === 'pending' ? (
                          <span className="ml-auto flex gap-1">
                            <button
                              onClick={() => setEditStatus(i, 'applied')}
                              className="rounded bg-[#1D9E75] px-2 py-0.5 text-[11px] font-semibold text-white"
                            >
                              適用
                            </button>
                            <button
                              onClick={() => setEditStatus(i, 'rejected')}
                              className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500"
                            >
                              却下
                            </button>
                          </span>
                        ) : (
                          <span className="ml-auto flex items-center gap-1">
                            <span
                              className={`text-[11px] font-semibold ${
                                e.status === 'applied' ? 'text-green-600' : 'text-gray-400'
                              }`}
                            >
                              {e.status === 'applied' ? '✓ 適用' : '却下'}
                            </span>
                            <button
                              onClick={() => setEditStatus(i, 'pending')}
                              className="rounded border border-gray-200 px-2 py-0.5 text-[10px] text-gray-400"
                            >
                              戻す
                            </button>
                          </span>
                        )}
                      </div>
                      {e.reason && <p className="mt-1 text-[11px] text-gray-500">理由: {e.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 前後2列比較（左=修正前/右=修正後・赤緑ハイライト・スクロール同期・狭幅は縦積み） */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-gray-500">修正前 ｜ 修正後</span>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => jumpTo(-1)}
                  disabled={markCount() === 0}
                  className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                >
                  ◀ 前の変更
                </button>
                <span className="text-[11px] text-gray-400">
                  {markCount() === 0 ? '0/0' : `${jumpIndex + 1}/${markCount()}`}件目
                </span>
                <button
                  onClick={() => jumpTo(1)}
                  disabled={markCount() === 0}
                  className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                >
                  次の変更 ▶
                </button>
              </span>
            </div>
            <div className={`flex gap-3 ${stacked ? 'flex-col' : 'flex-row'}`}>
              <div className="flex flex-1 flex-col">
                <div className="mb-1 text-[10px] font-semibold text-red-600">修正前</div>
                <pre
                  ref={beforeRef}
                  onScroll={() => onScroll('before')}
                  className={`${paneCls} border-red-200 bg-red-50/30`}
                >
                  {renderProofreadPane(originalText, fixes, 'before')}
                </pre>
              </div>
              <div className="flex flex-1 flex-col">
                <div className="mb-1 text-[10px] font-semibold text-green-600">修正後</div>
                <pre
                  ref={afterRef}
                  onScroll={() => onScroll('after')}
                  className={`${paneCls} border-green-200 bg-green-50/30`}
                >
                  {renderProofreadPane(previewText, fixes, 'after')}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3">
          <button
            onClick={handleApply}
            disabled={activePairs.length === 0}
            className="rounded-lg bg-[#1D9E75] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0F6E56] disabled:opacity-50"
          >
            {applied ? '再適用' : '✅ 適用'}
          </button>
          <button
            onClick={handleRevert}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            ↩︎ 元に戻す
          </button>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
