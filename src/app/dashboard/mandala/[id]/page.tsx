'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラ — チャート画面（§3-3 9マス）
// 302: A 複数マスの比較（§3）／B リンク件数（§4-3）／C 一次情報あり n/m（§5）
//
// - チャート単位APIで全マス本文＋軽いリンク一覧を取り（§4-3⑥）、グリッドは MandalaGrid（描画順はアウトライン関数から・R-74）
// - マスを押すと編集パネル（サイドパネル・MandalaCellEditor）。別マスへ移るときに未保存なら確認1回（§3-3・R-56）
// - 保存成功後はパネルが返す**保存された行**でグリッドを更新する（R-95）
// - 302 §3-1 比較の選択: 「☑ マスを選んで比較」で選択モードに入る（常時チェックにしない＝マスのクリックは編集が主。
//   全選択は置かない・R-106）。上限は全9マス（MANDALA_COMPARE_MAX）、列数は幅で折り返す（R-94）。空のマスは選べない
// - 302 §5 一次情報あり n/m は primaryInfoSummary（純関数・R-74）で導出。別の状態を保存しない
// - チャート名は中央マスのタイトル（§3-5）。更新日時は JST（R-86）。AI 不使用
// 308: 見出しに「📈 反応記録 n/m」（reactionSummary）と、型のチャートに「無料 xx%」（freeRatio・子マスは親の区分）。
//   どちらも純関数で導出（R-74）。meta が空の既存チャートでは何も増えない（§7）。📈 バッジのポップアップは 304 の HoverPopover
// 307: 「📕 Kindleの目次にする」（ウィザードを ?mandala=<chartId> で開く）と「📕 起こした本: n件」（本の側の記録から導出・
//   API の books。mandala_charts.meta には書かない・R-107）。マンダラ本体（301〜305）の挙動は変えない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import MandalaGrid from '@/components/mandala/MandalaGrid';
import MandalaCellEditor from '@/components/mandala/MandalaCellEditor';
import MandalaCompareView from '@/components/mandala/MandalaCompareView';
import Mandala81 from '@/components/mandala/Mandala81';
import { MandalaLinkPopoverContent, MandalaReactionPopoverContent } from '@/components/mandala/MandalaLinks';
import { useToast } from '@/components/ui/Toast';
import { useHoverPopover } from '@/components/HoverPopover';
import { jstDateTimeString } from '@/lib/jst';
import { mandalaBooksLabel } from '@/lib/mandala-kindle';
import { MANDALA_PRESETS, isMandalaPresetKey } from '@/lib/mandala-presets';
import {
  MANDALA_CENTER,
  MANDALA_CHILD_TOTAL,
  MANDALA_DEPTH1_COUNT,
  MANDALA_UNSAVED_CONFIRM,
  MANDALA_VIEW_STORAGE_KEY,
  type MandalaView,
  cellPathLabel,
  centerCell,
  chartDisplayTitle,
  chartPreset,
  compareCellsOf,
  expansionSummary,
  filledCount,
  freeRatio,
  freeRatioLabel,
  reactionSummary,
  shouldShowFreeRatio,
  parseMandalaView,
  linkCountsByCell,
  mandalaCompareState,
  popoverKeyOf,
  primaryInfoSummary,
  toggleCellSelection,
  type MandalaCell,
  type MandalaChartDetail,
  type MandalaLinkLite,
  type MandalaLinkResolved,
  type MandalaPopoverFrom,
} from '@/lib/mandala-shared';

const ACCENT = '#6c63ff';
const btn: CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

export default function MandalaChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [chart, setChart] = useState<MandalaChartDetail | null>(null);
  const [links, setLinks] = useState<MandalaLinkLite[]>([]);
  // 307: このチャートから起こした Kindle 案件（本の側の記録から導出）
  const [books, setBooks] = useState<{ id: number; title: string; status: string; importedAt: string }[]>([]);
  const [booksOpen, setBooksOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const [wide, setWide] = useState(false);
  // 302 §3: 比較の選択モード
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  // 305: 9マス／81マスの切替（localStorage・303 と同じ仕組み）。狭幅ではブロック単位モード
  const [view, setView] = useState<MandalaView>('9');
  const [narrow, setNarrow] = useState(false);
  const { showToast } = useToast();
  const expandingRef = useRef(false); // R-87: 展開の二重発火は同期的な ref で閉じる
  const [expanding, setExpanding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mandala/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as {
        chart?: MandalaChartDetail;
        links?: MandalaLinkLite[];
        books?: { id: number; title: string; status: string; importedAt: string }[];
        error?: string;
      };
      if (!res.ok || !json.chart) {
        setError({ status: res.status, text: json.error || `読み込みに失敗しました（${res.status}）` });
        setChart(null);
        return;
      }
      setChart(json.chart);
      setLinks(Array.isArray(json.links) ? json.links : []);
      setBooks(Array.isArray(json.books) ? json.books : []);
    } catch (e: unknown) {
      setError({ status: 0, text: e instanceof Error ? e.message : '読み込みに失敗しました' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // パネルが開いている間はグリッドを左へ寄せる（広い画面のみ。狭い画面ではパネルが全幅で重なる）
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)');
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  // 305: 表示モードの復元と、狭幅（81をブロック単位に落とす）の判定
  useEffect(() => {
    try {
      setView(parseMandalaView(localStorage.getItem(MANDALA_VIEW_STORAGE_KEY)));
    } catch {}
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const applyView = (v: MandalaView) => {
    setView(v);
    try {
      localStorage.setItem(MANDALA_VIEW_STORAGE_KEY, v);
    } catch {}
  };

  // 選択中の id は ref にも持つ（confirm を setState の更新関数の中で呼ばない＝StrictMode の二重実行で2回出さない）
  const selectedRef = useRef<string | null>(null);
  const openEditor = useCallback((cell: MandalaCell) => {
    const cur = selectedRef.current;
    if (cur === cell.id) return;
    // §3-3: 未保存のまま別マスへ移るときは確認1回（R-56）
    if (cur && dirtyRef.current && !window.confirm(MANDALA_UNSAVED_CONFIRM)) return;
    dirtyRef.current = false;
    selectedRef.current = cell.id;
    setSelectedId(cell.id);
  }, []);

  const closePanel = useCallback(() => {
    dirtyRef.current = false;
    selectedRef.current = null;
    setSelectedId(null);
  }, []);

  // R-95: 保存された行でグリッドを更新する（送った値では更新しない）
  const onSaved = useCallback((row: MandalaCell) => {
    setChart((c) => (c ? { ...c, updated_at: row.updated_at, cells: c.cells.map((x) => (x.id === row.id ? row : x)) } : c));
  }, []);

  const onDirtyChange = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  // 302: パネルでリンクを付け外ししたら、そのマスの分だけ軽い一覧を差し替える（件数は純関数で導出）。
  // 304: 解決済み（タイトル付き）はポップアップのキャッシュにも同じ値を入れる＝同じデータ源から描く（§3-2・R-95）
  const [resolvedByCell, setResolvedByCell] = useState<Map<string, { links: MandalaLinkResolved[] | null; status: 'loading' | 'ready' | 'failed' }>>(new Map());
  const onLinksChanged = useCallback((cellId: string, resolved: MandalaLinkResolved[]) => {
    setLinks((prev) => [
      ...prev.filter((l) => l.cell_id !== cellId),
      ...resolved.map((l) => ({ id: l.id, cell_id: l.cell_id, scope: l.scope, item_key: l.item_key, created_at: l.created_at })),
    ]);
    setResolvedByCell((prev) => new Map(prev).set(cellId, { links: resolved, status: 'ready' }));
  }, []);

  // 304 §3-1: チャート取得は軽いリンク（タイトル無し）なので、最初のホバー時にそのマス分だけ解決済みを取ってキャッシュする
  // （9マス分の先読みはしない＝N+1にしない）。取得はパネルのリンク欄と同じ GET /api/mandala/links?cellId=（別の解決処理を書かない）
  const fetchResolved = useCallback(async (cellId: string) => {
    let need = true;
    setResolvedByCell((prev) => {
      const cur = prev.get(cellId);
      if (cur && cur.status !== 'failed') { need = false; return prev; }
      return new Map(prev).set(cellId, { links: cur?.links ?? null, status: 'loading' });
    });
    if (!need) return;
    try {
      const res = await fetch(`/api/mandala/links?cellId=${encodeURIComponent(cellId)}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as { links?: MandalaLinkResolved[] };
      if (!res.ok || !Array.isArray(json.links)) throw new Error(String(res.status));
      setResolvedByCell((prev) => new Map(prev).set(cellId, { links: json.links!, status: 'ready' }));
    } catch {
      setResolvedByCell((prev) => new Map(prev).set(cellId, { links: prev.get(cellId)?.links ?? null, status: 'failed' }));
    }
  }, []);

  // 304: バッジのホバーポップアップ（共通部品 HoverPopover）。中身は同じキャッシュから描く
  const popover = useHoverPopover<{ cell: MandalaCell; from: MandalaPopoverFrom }>(
    ({ cell, from }, api) => {
      // 308: 📈 はマスの meta から描く（取得なし）。押せる要素は「パネルで記録する」だけ
      if (from === 'reaction') {
        const latest = chart?.cells.find((c) => c.id === cell.id) ?? cell;
        return (
          <MandalaReactionPopoverContent
            cell={latest}
            onOpenPanel={() => {
              api.close();
              openEditor(latest);
            }}
          />
        );
      }
      const entry = resolvedByCell.get(cell.id);
      return (
        <MandalaLinkPopoverContent
          links={entry?.links ?? null}
          status={entry?.status ?? 'loading'}
          from={from}
          onOpenPanel={() => {
            api.close();
            openEditor(cell);
          }}
        />
      );
    },
    { onOpen: (_key, { cell, from }) => { if (from !== 'reaction') void fetchResolved(cell.id); } },
  );
  const popoverBind = useCallback(
    (cell: MandalaCell, from: MandalaPopoverFrom) => popover.bind(popoverKeyOf(cell.id), { cell, from }),
    [popover],
  );

  // 305 §2-4: 未展開ブロックの空枠を押したら、子8マスを1文で作ってから（成功後に・R-76）その枠の編集を開く。
  // 二重発火は ref で閉じ（R-87）、サーバー側は NOT EXISTS＋一意制約で二重に作らない。失敗は見せる（1行も作らない）
  const expandBlock = useCallback(
    async (parentCellId: string, position: number) => {
      if (expandingRef.current || !chart) return;
      if (selectedRef.current && dirtyRef.current && !window.confirm(MANDALA_UNSAVED_CONFIRM)) return;
      expandingRef.current = true;
      setExpanding(parentCellId);
      try {
        const res = await fetch(`/api/mandala/${encodeURIComponent(chart.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'expand', parentCellId }),
        });
        const json = (await res.json().catch(() => ({}))) as { children?: MandalaCell[]; created?: boolean; error?: string };
        if (!res.ok || !Array.isArray(json.children)) throw new Error(json.error || `子マスの作成に失敗しました（${res.status}）`);
        const children = json.children;
        setChart((c) => (c ? { ...c, cells: [...c.cells.filter((x) => x.parent_cell_id !== parentCellId), ...children] } : c));
        const target = children.find((x) => x.position === position) ?? children[0];
        if (target) {
          dirtyRef.current = false;
          selectedRef.current = target.id;
          setSelectedId(target.id);
        }
        if (json.created) showToast('8マスを作成しました', 'success');
      } catch (e: unknown) {
        showToast(e instanceof Error ? e.message : '子マスの作成に失敗しました', 'error');
      } finally {
        expandingRef.current = false;
        setExpanding(null);
      }
    },
    [chart, showToast],
  );

  // 302 §3-1: 選択モードの出入り。入るときは編集パネルを閉じる（未保存なら確認1回）
  const enterSelectMode = () => {
    if (selectedRef.current && dirtyRef.current && !window.confirm(MANDALA_UNSAVED_CONFIRM)) return;
    closePanel();
    setSelectMode(true);
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setCheckedIds([]);
    setCompareOpen(false);
  };
  const toggleChecked = useCallback((cell: MandalaCell) => {
    setCheckedIds((ids) => toggleCellSelection(ids, cell.id));
  }, []);

  const selected = chart?.cells.find((c) => c.id === selectedId) ?? null;
  const center = chart ? centerCell(chart.cells) : null;
  const filled = chart ? filledCount(chart.cells, 1) : 0;
  const linkCounts = useMemo(() => linkCountsByCell(links), [links]);
  const primary = useMemo(() => (chart ? primaryInfoSummary(chart.cells, links) : { withPrimary: 0, filled: 0 }), [chart, links]);
  const compareCells = useMemo(() => (chart ? compareCellsOf(chart.cells, checkedIds) : []), [chart, checkedIds]);
  const expansion = useMemo(() => (chart ? expansionSummary(chart.cells, links) : { expandedBlocks: 0, childFilled: 0, childWithPrimary: 0 }), [chart, links]);
  const pathLabelOf = useCallback((cell: MandalaCell) => (chart ? cellPathLabel(cell, chart.cells) : ''), [chart]);
  const compareState = mandalaCompareState(compareCells.length);
  // 308: 反応記録 n/m と無料比率（純関数・R-74）
  const reaction = useMemo(() => (chart ? reactionSummary(chart.cells) : { withReaction: 0, filled: 0 }), [chart]);
  const presetKey = chart ? chartPreset(chart.meta) : null;
  const presetDef = isMandalaPresetKey(presetKey) ? MANDALA_PRESETS[presetKey] : null;
  const ratio = useMemo(() => (chart && shouldShowFreeRatio(chart.meta, chart.cells) ? freeRatio(chart.cells) : null), [chart]);
  const checkedSet = useMemo(() => new Set(checkedIds), [checkedIds]);

  return (
    <div data-mandala-page style={{ maxWidth: 1100, paddingRight: selected && wide ? 496 : 0, transition: 'padding-right 0.15s' }}>
      <div style={{ marginBottom: 8 }}>
        <Link href="/dashboard/mandala" data-mandala-back style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← マンダラ一覧へ
        </Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🔲 マンダラ</h1>
        {chart && (
          <span data-mandala-chart-title style={{ fontSize: 16, fontWeight: 700, color: center?.title.trim() ? 'var(--text-primary)' : 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
            {chartDisplayTitle(center?.title)}
          </span>
        )}
      </div>
      {chart && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          <span data-mandala-chart-filled={filled} style={{ fontWeight: 700, color: filled > 0 ? ACCENT : 'var(--text-muted)' }}>
            {filled}/{MANDALA_DEPTH1_COUNT} マス
          </span>
          {/* 302 §5: 一次情報あり n/m（m＝埋まっているマス数）。📔エピソードのリンク件数から決定的に導出 */}
          <span
            data-mandala-primary={primary.withPrimary}
            data-mandala-primary-total={primary.filled}
            title="一次情報（📔エピソード記録）のリンクが1件以上あるマス数／埋まっているマス数"
            style={{ fontWeight: 700, color: primary.withPrimary > 0 ? '#B45309' : 'var(--text-muted)' }}
          >
            📔 一次情報あり {primary.withPrimary}/{primary.filled}
          </span>
          {/* 308 §3-3: 反応記録 n/m（m＝埋まっているマス数）。0件なら出さない（既存チャートで増えない・§7） */}
          {reaction.withReaction > 0 && (
            <span
              data-mandala-reaction-count={reaction.withReaction}
              data-mandala-reaction-total={reaction.filled}
              title="反応記録（アクセス・スキ・共有・購入）があるマス数／埋まっているマス数"
              style={{ fontWeight: 700, color: '#1D9E75' }}
            >
              📈 反応記録 {reaction.withReaction}/{reaction.filled}
            </span>
          )}
          {/* 308 §4: 無料比率（型のチャート、または区分のあるマスがあるとき。両方0なら出さない） */}
          {ratio && ratio.ratio !== null && (
            <span
              data-mandala-free-ratio={String(ratio.ratio)}
              data-mandala-free-chars={ratio.freeChars}
              data-mandala-paid-chars={ratio.paidChars}
              title={`無料側の本文文字数 ${ratio.freeChars.toLocaleString()}字 ÷ 全体 ${(ratio.freeChars + ratio.paidChars).toLocaleString()}字（中央を除く・子マスは親の区分）。目安は仮説（N-08）`}
              style={{ fontWeight: 700, color: '#B45309' }}
            >
              {freeRatioLabel(ratio.ratio)}
            </span>
          )}
          <span data-mandala-chart-updated title="更新日時（日本時間）">更新 {jstDateTimeString(chart.updated_at)}</span>
          {/* 305 §2-6: 81表示のときだけ追加で出す（9マス分の n/9・📔 n/m は表示モードに関係なく同じ値） */}
          {view === '81' && (
            <span data-mandala-expansion={expansion.childFilled} data-mandala-expansion-blocks={expansion.expandedBlocks} title={`展開済みブロック ${expansion.expandedBlocks}/${MANDALA_DEPTH1_COUNT - 1}・埋まっている子マス ${expansion.childFilled}/${MANDALA_CHILD_TOTAL}`} style={{ fontWeight: 700, color: expansion.childFilled > 0 ? ACCENT : 'var(--text-muted)' }}>
              展開 {expansion.childFilled}/{MANDALA_CHILD_TOTAL}
              <span data-mandala-expansion-primary={expansion.childWithPrimary} style={{ marginLeft: 8, color: expansion.childWithPrimary > 0 ? '#B45309' : 'var(--text-muted)' }}>
                📔 {expansion.childWithPrimary}/{expansion.childFilled}（子マス）
              </span>
            </span>
          )}
          {/* 307 §3-4: 起こした本 n件（0件は出さない）。押すと案件の一覧を開き、案件へ飛ぶ */}
          {books.length > 0 && (
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <button
                type="button"
                data-mandala-books={books.length}
                aria-expanded={booksOpen}
                onClick={() => setBooksOpen((v) => !v)}
                title="このマンダラから起こした Kindle の案件"
                style={{ ...btn, padding: '4px 10px', fontWeight: 700, color: '#B45309', borderColor: 'rgba(180,83,9,0.4)' }}
              >
                {mandalaBooksLabel(books.length)}
              </button>
              {booksOpen && (
                <div data-mandala-books-list style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, minWidth: 260, maxWidth: 360, padding: 8, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {books.map((b) => (
                    <Link
                      key={b.id}
                      data-mandala-book={b.id}
                      href={`/dashboard/kindle-wizard?bookId=${b.id}`}
                      style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 8px', borderRadius: 6, textDecoration: 'none', color: 'var(--text-primary)', fontSize: 12 }}
                    >
                      <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📕 {b.title || '無題'}</span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{jstDateTimeString(b.importedAt)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {/* 307 §3-1: ウィザードをこのチャートを選んだ状態で開く（入口はボタン1つ） */}
          <Link
            data-mandala-kindle
            href={`/dashboard/kindle-wizard?mandala=${encodeURIComponent(id)}`}
            title="このマンダラの章・節・著者メモ・素材から Kindle の目次を起こす（ウィザードが開きます）"
            style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            📕 Kindleの目次にする
          </Link>
          {/* 305 §2-1: 9マス／81マスの切替（幅を取らない2択・保存） */}
          <span data-mandala-view-toggle style={{ display: 'inline-flex', gap: 2 }}>
            {(['9', '81'] as MandalaView[]).map((v) => (
              <button
                key={v}
                type="button"
                data-mandala-view={v}
                aria-pressed={view === v}
                onClick={() => applyView(v)}
                title={v === '9' ? '9マス（3×3）' : '81マス（各マスを3×3に展開）'}
                style={{ ...btn, padding: '4px 10px', borderColor: view === v ? ACCENT : 'var(--border)', background: view === v ? `${ACCENT}15` : 'transparent', color: view === v ? ACCENT : 'var(--text-muted)', fontWeight: view === v ? 700 : 600 }}
              >
                {v}マス
              </button>
            ))}
          </span>
          {!selectMode ? (
            <button type="button" data-mandala-select-toggle onClick={enterSelectMode} title="複数のマスを選んで横並びで比較する" style={{ ...btn, borderColor: ACCENT, color: ACCENT }}>
              ☑ マスを選んで比較
            </button>
          ) : (
            <span data-mandala-select-bar style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span data-mandala-select-count={compareCells.length} style={{ fontWeight: 700 }}>
                {compareCells.length}件選択中
              </span>
              <button
                type="button"
                data-mandala-compare-open
                onClick={() => setCompareOpen(true)}
                disabled={!compareState.enabled}
                title={compareState.reason ?? '選んだマスを横並びで比較する'}
                style={{ ...btn, background: ACCENT, borderColor: ACCENT, color: '#fff', opacity: compareState.enabled ? 1 : 0.5, cursor: compareState.enabled ? 'pointer' : 'default' }}
              >
                {compareState.label}
              </button>
              <button type="button" data-mandala-select-clear onClick={() => setCheckedIds([])} disabled={checkedIds.length === 0} style={{ ...btn, opacity: checkedIds.length === 0 ? 0.5 : 1 }}>
                選択を解除
              </button>
              <button type="button" data-mandala-select-exit onClick={exitSelectMode} style={btn}>
                ✕ 選択をやめる
              </button>
            </span>
          )}
        </div>
      )}
      {chart && !selectMode && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>マスを押すと編集パネルが開きます。中央がテーマ（＝このマンダラの名前）です。</div>
      )}
      {chart && selectMode && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>比較するマスを押して選んでください（空のマスは選べません・最大{MANDALA_DEPTH1_COUNT}件・1行最大4列で折り返します）。</div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>読み込み中…</div>
      ) : error ? (
        <div data-mandala-chart-error style={{ background: 'var(--bg-secondary)', border: '1px solid #B91C1C', borderRadius: 12, padding: 16, color: '#B91C1C', fontSize: 13 }}>
          ⚠️ {error.status === 404 ? 'このマンダラは見つかりません（削除されたか、URLが違います）' : error.text}
          <div style={{ marginTop: 8 }}>
            <Link href="/dashboard/mandala" style={{ color: ACCENT }}>
              一覧へ戻る
            </Link>
          </div>
        </div>
      ) : chart ? (
        <>
          {selectMode && compareOpen && (
            <MandalaCompareView
              cells={compareCells}
              labelOf={pathLabelOf}
              onClose={() => setCompareOpen(false)}
              onEdit={(cell) => {
                setCompareOpen(false);
                setSelectMode(false);
                setCheckedIds([]);
                openEditor(cell);
              }}
            />
          )}
          {view === '81' ? (
            <div data-mandala-expanding={expanding ?? undefined} style={{ opacity: expanding ? 0.7 : 1 }}>
              <Mandala81
                cells={chart.cells}
                selectedCellId={selectedId}
                onSelect={openEditor}
                linkCounts={linkCounts}
                selectMode={selectMode}
                checkedIds={checkedSet}
                onToggleSelect={toggleChecked}
                popoverBind={popoverBind}
                onExpand={(parentCellId, position) => void expandBlock(parentCellId, position)}
                narrow={narrow}
              />
            </div>
          ) : (
            // 9マス表示は 301 の描画経路そのまま（density 省略＝normal・R-88）
            <MandalaGrid
              cells={chart.cells}
              selectedCellId={selectedId}
              onSelect={openEditor}
              linkCounts={linkCounts}
              selectMode={selectMode}
              checkedIds={checkedSet}
              onToggleSelect={toggleChecked}
              popoverBind={popoverBind}
            />
          )}
          {popover.layer}
          {selected && !selectMode && (
            <MandalaCellEditor
              key={selected.id}
              cell={selected}
              pathLabel={pathLabelOf(selected)}
              // 308 §2-1: 型のチャートの中央は空のまま＝プレースホルダで「読者の着地点（After）を1行で」
              titlePlaceholder={selected.depth === 1 && selected.position === MANDALA_CENTER && presetDef ? presetDef.centerPlaceholder : undefined}
              onClose={closePanel}
              onSaved={onSaved}
              onDirtyChange={onDirtyChange}
              onLinksChanged={onLinksChanged}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
