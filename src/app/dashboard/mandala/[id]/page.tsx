'use client';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 301: 🔲 マンダラ — チャート画面（§3-3 9マス）
//
// - チャート単位APIで全マス本文を取り（§4-3⑥）、グリッドは MandalaGrid（描画順はアウトライン関数から・R-74）
// - マスを押すと編集パネル（サイドパネル・MandalaCellEditor）。別マスへ移るときに未保存なら確認1回（§3-3・R-56）
// - 保存成功後はパネルが返す**保存された行**でグリッドを更新する（R-95）
// - チャート名は中央マスのタイトル（§3-5）。更新日時は JST（R-86）
// - AI 不使用
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import MandalaGrid from '@/components/mandala/MandalaGrid';
import MandalaCellEditor from '@/components/mandala/MandalaCellEditor';
import { jstDateTimeString } from '@/lib/jst';
import {
  MANDALA_DEPTH1_COUNT,
  MANDALA_UNSAVED_CONFIRM,
  centerCell,
  chartDisplayTitle,
  filledCount,
  type MandalaCell,
  type MandalaChartDetail,
} from '@/lib/mandala-shared';

const ACCENT = '#6c63ff';

export default function MandalaChartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [chart, setChart] = useState<MandalaChartDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const [wide, setWide] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mandala/${encodeURIComponent(id)}`, { cache: 'no-store' });
      const json = (await res.json().catch(() => ({}))) as { chart?: MandalaChartDetail; error?: string };
      if (!res.ok || !json.chart) {
        setError({ status: res.status, text: json.error || `読み込みに失敗しました（${res.status}）` });
        setChart(null);
        return;
      }
      setChart(json.chart);
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
  const onSelect = useCallback((cell: MandalaCell) => {
    const cur = selectedRef.current;
    if (cur === cell.id) return;
    // §3-3: 未保存のまま別マスへ移るときは確認1回（R-56）
    if (cur && dirtyRef.current && !window.confirm(MANDALA_UNSAVED_CONFIRM)) return;
    dirtyRef.current = false;
    selectedRef.current = cell.id;
    setSelectedId(cell.id);
  }, []);

  // R-95: 保存された行でグリッドを更新する（送った値では更新しない）
  const onSaved = useCallback((row: MandalaCell) => {
    setChart((c) => (c ? { ...c, updated_at: row.updated_at, cells: c.cells.map((x) => (x.id === row.id ? row : x)) } : c));
  }, []);

  const onDirtyChange = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  const closePanel = useCallback(() => {
    dirtyRef.current = false;
    selectedRef.current = null;
    setSelectedId(null);
  }, []);

  const selected = chart?.cells.find((c) => c.id === selectedId) ?? null;
  const center = chart ? centerCell(chart.cells) : null;
  const filled = chart ? filledCount(chart.cells, 1) : 0;

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
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
          <span data-mandala-chart-filled={filled} style={{ fontWeight: 700, color: filled > 0 ? ACCENT : 'var(--text-muted)' }}>
            {filled}/{MANDALA_DEPTH1_COUNT} マス
          </span>
          <span data-mandala-chart-updated title="更新日時（日本時間）">更新 {jstDateTimeString(chart.updated_at)}</span>
          <span style={{ color: 'var(--text-muted)' }}>マスを押すと編集パネルが開きます。中央がテーマ（＝このマンダラの名前）です。</span>
        </div>
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
          <MandalaGrid cells={chart.cells} selectedCellId={selectedId} onSelect={onSelect} />
          {selected && (
            <MandalaCellEditor key={selected.id} cell={selected} onClose={closePanel} onSaved={onSaved} onDirtyChange={onDirtyChange} />
          )}
        </>
      ) : null}
    </div>
  );
}
