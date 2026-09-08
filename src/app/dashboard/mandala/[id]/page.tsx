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
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import MandalaGrid from '@/components/mandala/MandalaGrid';
import MandalaCellEditor from '@/components/mandala/MandalaCellEditor';
import MandalaCompareView from '@/components/mandala/MandalaCompareView';
import { jstDateTimeString } from '@/lib/jst';
import {
  MANDALA_DEPTH1_COUNT,
  MANDALA_UNSAVED_CONFIRM,
  centerCell,
  chartDisplayTitle,
  compareCellsOf,
  filledCount,
  linkCountsByCell,
  mandalaCompareState,
  primaryInfoSummary,
  toggleCellSelection,
  type MandalaCell,
  type MandalaChartDetail,
  type MandalaLinkLite,
  type MandalaLinkResolved,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const [wide, setWide] = useState(false);
  // 302 §3: 比較の選択モード
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mandala/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as { chart?: MandalaChartDetail; links?: MandalaLinkLite[]; error?: string };
      if (!res.ok || !json.chart) {
        setError({ status: res.status, text: json.error || `読み込みに失敗しました（${res.status}）` });
        setChart(null);
        return;
      }
      setChart(json.chart);
      setLinks(Array.isArray(json.links) ? json.links : []);
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

  // 302: パネルでリンクを付け外ししたら、そのマスの分だけ軽い一覧を差し替える（件数は純関数で導出）
  const onLinksChanged = useCallback((cellId: string, resolved: MandalaLinkResolved[]) => {
    setLinks((prev) => [
      ...prev.filter((l) => l.cell_id !== cellId),
      ...resolved.map((l) => ({ id: l.id, cell_id: l.cell_id, scope: l.scope, item_key: l.item_key, created_at: l.created_at })),
    ]);
  }, []);

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
  const compareState = mandalaCompareState(compareCells.length);
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
          <span data-mandala-chart-updated title="更新日時（日本時間）">更新 {jstDateTimeString(chart.updated_at)}</span>
          <span style={{ flex: 1 }} />
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
              onClose={() => setCompareOpen(false)}
              onEdit={(cell) => {
                setCompareOpen(false);
                setSelectMode(false);
                setCheckedIds([]);
                openEditor(cell);
              }}
            />
          )}
          <MandalaGrid
            cells={chart.cells}
            selectedCellId={selectedId}
            onSelect={openEditor}
            linkCounts={linkCounts}
            selectMode={selectMode}
            checkedIds={checkedSet}
            onToggleSelect={toggleChecked}
          />
          {selected && !selectMode && (
            <MandalaCellEditor key={selected.id} cell={selected} onClose={closePanel} onSaved={onSaved} onDirtyChange={onDirtyChange} onLinksChanged={onLinksChanged} />
          )}
        </>
      ) : null}
    </div>
  );
}
