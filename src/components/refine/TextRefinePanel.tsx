'use client';

// 生成テキストの追加修正（169）。テキスト分析／ディープリサーチの2画面で共用（コピペしない）。
// 設計の芯: AIに全文を再出力させず、変更箇所だけを before/after ペアで扱い、
//           適用はアプリ側で確定的に置換、確認は161の赤/緑ハイライトで行う。
//   モードA: クイック置換（AI不要・確定的な全置換）
//   モードB: AI修正指示（/api/refine/suggest が差分ペアを起案→適用/却下→適用分のみ置換）
//   モードC: 全面リライト（172・2パス=アウトライン→セクション本文で構成ごと刷新・差分ハイライトなし）
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

type Mode = 'quick' | 'ai' | 'rewrite';

// クイック置換の1ペア
interface Pair {
  id: number;
  before: string;
  after: string;
}

// 全面リライト（モードC）パス1で得る構成案の1セクション
interface OutlineSection {
  heading: string;
  points: string[];
}

// 全面リライトの進行段階
type RewritePhase = 'idle' | 'outlining' | 'outlined' | 'writing' | 'done';

// リライトのクイック指示チップ（押すとフリープロンプトに追記＝院長が文言を編集できる状態を保つ）
const REWRITE_CHIPS = ['箇条書き中心に', '見出しを立て直す', '常体に統一', '冗長を削る', '配布資料の体裁に'];

// アウトライン(sections)を編集可能なテキストへ／テキストからsectionsへ（textarea編集方式）
function sectionsToText(sections: OutlineSection[]): string {
  return sections
    .map((s) => `## ${s.heading}\n${s.points.map((p) => `- ${p}`).join('\n')}`)
    .join('\n\n');
}
function parseOutline(text: string): OutlineSection[] {
  const sections: OutlineSection[] = [];
  let cur: OutlineSection | null = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const p = line.match(/^[-*・]\s+(.*)$/);
    if (h) {
      cur = { heading: h[1].trim(), points: [] };
      sections.push(cur);
    } else if (p) {
      if (!cur) {
        cur = { heading: '', points: [] };
        sections.push(cur);
      }
      cur.points.push(p[1].trim());
    } else if (line.trim() && cur) {
      cur.points.push(line.trim());
    }
  }
  return sections.filter((s) => s.heading || s.points.length > 0);
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

  // モードC 全面リライト
  const [freePrompt, setFreePrompt] = useState('');
  const [phase, setPhase] = useState<RewritePhase>('idle');
  const [outlineText, setOutlineText] = useState(''); // 編集可能なアウトライン（textarea）
  const [rewrittenText, setRewrittenText] = useState('');
  const [secProgress, setSecProgress] = useState({ done: 0, total: 0 });
  const [secFails, setSecFails] = useState(0);

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
      setFreePrompt('');
      setPhase('idle');
      setOutlineText('');
      setRewrittenText('');
      setSecProgress({ done: 0, total: 0 });
      setSecFails(0);
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

  // プレビュー用の適用後テキスト。rewrite は生成結果、それ以外は元テキストへの置換結果。
  const previewText = useMemo(
    () => (mode === 'rewrite' ? rewrittenText : applyPairs(originalText, activePairs)),
    [mode, rewrittenText, originalText, activePairs],
  );

  // ハイライト用 fixes（scope='all' で全出現を色付け。line は0）。
  // rewrite は全部変わるので差分ハイライトを付けない（色が意味を成さない）＝空配列。
  const fixes = useMemo<AppliedFix[]>(
    () =>
      mode === 'rewrite'
        ? []
        : activePairs
            .filter((p) => p.before && p.before !== p.after)
            .map((p) => ({
              original: p.before,
              suggestion: p.after,
              line: 0,
              scope: 'all' as const,
              reason: 'reason' in p ? (p as AiEdit).reason : '',
            })),
    [mode, activePairs],
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

  // モードC パス1: 新しい構成案（アウトライン）を生成 → 編集可能テキストで提示（人間確認型）
  const runOutline = async () => {
    if (!freePrompt.trim() || phase === 'outlining' || phase === 'writing') return;
    setPhase('outlining');
    setRewrittenText('');
    setSecFails(0);
    try {
      const res = await fetch('/api/refine/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText: originalText, instruction: freePrompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !Array.isArray(data.sections)) {
        throw new Error(data.error || '構成案を作成できませんでした');
      }
      setOutlineText(sectionsToText(data.sections as OutlineSection[]));
      setPhase('outlined');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '構成案の作成に失敗しました', 'error');
      setPhase('idle');
    }
  };

  // モードC パス2: アウトラインの各見出しごとに本文を並列生成 → 結合。部分失敗は注記して残す。
  const runSections = async () => {
    const sections = parseOutline(outlineText);
    if (sections.length === 0) {
      showToast('構成案が空です', 'warning');
      return;
    }
    setPhase('writing');
    setSecProgress({ done: 0, total: sections.length });
    setSecFails(0);

    const bodies: string[] = new Array(sections.length).fill('');
    let fails = 0;
    await Promise.all(
      sections.map(async (s, i) => {
        try {
          const res = await fetch('/api/refine/section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              heading: s.heading,
              points: s.points,
              instruction: freePrompt,
              fullText: originalText,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success || !data.text) throw new Error(data.error || 'failed');
          bodies[i] = String(data.text);
        } catch {
          fails += 1;
          // 失敗セクションは見出しと注記を残し、原文の該当情報を失わないよう要点も併記
          bodies[i] =
            `（⚠️ このセクションの本文生成に失敗しました。元の要点：${s.points.join(' / ') || '—'}）`;
        } finally {
          setSecProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        }
      }),
    );

    const joined = sections
      .map((s, i) => (s.heading ? `## ${s.heading}\n\n${bodies[i]}` : bodies[i]))
      .join('\n\n');
    setRewrittenText(joined);
    setSecFails(fails);
    setPhase('done');
    if (fails > 0) {
      showToast(`${sections.length}件中${fails}件のセクションが失敗しました`, 'warning');
    }
  };

  // 適用（結果 state へ反映）。モーダルは閉じない（161方針）。
  const handleApply = () => {
    if (mode === 'rewrite') {
      if (!rewrittenText) {
        showToast('先にリライトを実行してください', 'warning');
        return;
      }
    } else if (activePairs.length === 0) {
      showToast('適用する修正がありません', 'warning');
      return;
    }
    onApply(previewText);
    setApplied(true);
    showToast('反映しました', 'success');
  };

  // 元に戻す（元テキストへ復帰＋適用状態リセット）。刷新の失敗時に戻せることが生命線。
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
            <button
              onClick={() => setMode('rewrite')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                mode === 'rewrite'
                  ? 'bg-[#378ADD] text-white'
                  : 'border border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              ✨ 全面リライト
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

          {/* モードC: 全面リライト（2パス＝アウトライン→セクション本文） */}
          {mode === 'rewrite' && (
            <div className="space-y-2">
              <textarea
                value={freePrompt}
                onChange={(e) => setFreePrompt(e.target.value)}
                placeholder="どう作り直すかを指示（例：見出しを立て直して、箇条書き中心の読みやすい配布資料の体裁に。常体で統一。）"
                rows={2}
                className="w-full resize-y rounded-lg border border-gray-200 p-3 text-sm text-gray-700 outline-none focus:border-[#378ADD]"
              />
              <div className="flex flex-wrap gap-1.5">
                {REWRITE_CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() =>
                      setFreePrompt((prev) => (prev.trim() ? `${prev.replace(/\s*$/, '')} ${c}` : c))
                    }
                    className="rounded-full border border-gray-200 px-2.5 py-0.5 text-[11px] text-gray-500 hover:bg-gray-50"
                  >
                    ＋ {c}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={runOutline}
                  disabled={!freePrompt.trim() || phase === 'outlining' || phase === 'writing'}
                  className="rounded-lg bg-[#378ADD] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#185FA5] disabled:opacity-50"
                >
                  {phase === 'outlining' ? '構成を作成中...' : '✨ 構成案を作る'}
                </button>
                {phase === 'writing' && (
                  <span className="text-xs text-gray-500">
                    本文生成中... {secProgress.done}/{secProgress.total} セクション
                  </span>
                )}
                {phase === 'done' && secFails > 0 && (
                  <span className="text-xs font-semibold text-amber-600">
                    ⚠️ {secProgress.total}件中{secFails}件が失敗（本文に注記を残しました）
                  </span>
                )}
              </div>

              {/* パス1の結果＝編集可能な構成案（見出し＋要点）。確認・編集してから本文生成 */}
              {(phase === 'outlined' || phase === 'writing' || phase === 'done') && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-gray-500">
                    構成案（`## 見出し` と `- 要点` で編集できます）
                  </div>
                  <textarea
                    value={outlineText}
                    onChange={(e) => setOutlineText(e.target.value)}
                    rows={8}
                    className="w-full resize-y rounded-lg border border-gray-200 p-3 font-mono text-xs text-gray-700 outline-none focus:border-[#378ADD]"
                  />
                  <button
                    onClick={runSections}
                    disabled={!outlineText.trim() || phase === 'writing'}
                    className="rounded-lg bg-[#1D9E75] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0F6E56] disabled:opacity-50"
                  >
                    {phase === 'writing' ? '本文を生成中...' : 'この構成で本文を作る'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 前後2列比較（左=修正前/右=修正後・スクロール同期・狭幅は縦積み）
              rewrite は全部変わるので差分ハイライトと変更ジャンプは出さず、左右並置のみ */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {mode === 'rewrite' ? '元の文章 ｜ リライト後' : '修正前 ｜ 修正後'}
                {mode === 'rewrite' && (
                  <span className="ml-2 text-[11px] text-gray-400">
                    {originalText.length.toLocaleString()}字 → {previewText.length.toLocaleString()}字（全面変更のため差分の色分けはしません）
                  </span>
                )}
              </span>
              {mode !== 'rewrite' && (
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
              )}
            </div>
            <div className={`flex gap-3 ${stacked ? 'flex-col' : 'flex-row'}`}>
              <div className="flex flex-1 flex-col">
                <div className={`mb-1 text-[10px] font-semibold ${mode === 'rewrite' ? 'text-gray-500' : 'text-red-600'}`}>
                  {mode === 'rewrite' ? '元の文章' : '修正前'}
                </div>
                <pre
                  ref={beforeRef}
                  onScroll={() => onScroll('before')}
                  className={`${paneCls} ${mode === 'rewrite' ? 'border-gray-200 bg-gray-50/40' : 'border-red-200 bg-red-50/30'}`}
                >
                  {renderProofreadPane(originalText, fixes, 'before')}
                </pre>
              </div>
              <div className="flex flex-1 flex-col">
                <div className={`mb-1 text-[10px] font-semibold ${mode === 'rewrite' ? 'text-gray-500' : 'text-green-600'}`}>
                  {mode === 'rewrite' ? 'リライト後' : '修正後'}
                </div>
                <pre
                  ref={afterRef}
                  onScroll={() => onScroll('after')}
                  className={`${paneCls} ${mode === 'rewrite' ? 'border-gray-200 bg-gray-50/40' : 'border-green-200 bg-green-50/30'}`}
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
            disabled={mode === 'rewrite' ? !rewrittenText : activePairs.length === 0}
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
