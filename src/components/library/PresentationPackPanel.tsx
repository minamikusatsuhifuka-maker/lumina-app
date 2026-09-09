'use client';

// 317 §3-2: 統合サマリー（保存後）からプレゼン素材パックを**選択式**で作る。1件ずつ独立に実行（R-39）・失敗分だけ再実行。
// 画像系は 315 の流れ（/dashboard/visuals?scope=library&ids=&types=）へ新しいタブで渡す＝プラン→編集→描画（赤い印の規則はそのまま）。
// テキスト系は /api/pack（kind ごとに1リクエスト）。プレゼン原稿は 275 へ localStorage の一回限り handoff
// （noopener で開く新しいタブには sessionStorage が引き継がれないため localStorage。読んだ側が消す）
import { useMemo, useRef, useState } from 'react';
import { formatUsd, pricingNote } from '@/lib/model-pricing';
import {
  PACK_CATALOG,
  PACK_DEFAULT_KINDS,
  PACK_IMAGE_KINDS,
  PRESENTATION_HANDOFF_KEY,
  packEstimateUsd,
  splitIntoSlidePages,
  type PackKind,
} from '@/lib/presentation-pack';

type Status = { state: 'idle' | 'running' | 'done' | 'error' | 'opened'; message?: string; id?: string };

export default function PresentationPackPanel({
  savedIds,
  sourceIds,
  baseTitle,
  sourceChars,
  detailText,
  summaryText,
  onSaved,
}: {
  /** まとめの保存行（要約・詳細）の id。画像系・テキスト系の元 */
  savedIds: string[];
  /** まとめの元になった資料の id（引用集はこちらから抜く） */
  sourceIds: string[];
  baseTitle: string;
  sourceChars: number;
  detailText: string;
  summaryText: string;
  onSaved?: () => void;
}) {
  const [selected, setSelected] = useState<Set<PackKind>>(() => new Set(PACK_DEFAULT_KINDS));
  const [status, setStatus] = useState<Record<string, Status>>({});
  const runningRef = useRef<Set<string>>(new Set()); // R-87
  const [busy, setBusy] = useState(false);
  const totalUsd = useMemo(() => [...selected].reduce((s, k) => s + (packEstimateUsd(k, sourceChars) ?? 0), 0), [selected, sourceChars]);
  const totalSec = useMemo(() => [...selected].reduce((s, k) => s + (PACK_CATALOG.find((e) => e.kind === k)?.estSeconds ?? 0), 0), [selected]);
  const done = Object.values(status).filter((s) => s.state === 'done' || s.state === 'opened').length;
  const failed = Object.values(status).filter((s) => s.state === 'error').length;

  const runKind = async (kind: PackKind) => {
    if (runningRef.current.has(kind)) return; // R-87
    runningRef.current.add(kind);
    setStatus((m) => ({ ...m, [kind]: { state: 'running' } }));
    try {
      if ((PACK_IMAGE_KINDS as readonly string[]).includes(kind)) {
        // 画像系: まとめを元テキストに 315 の画面を開く（選んだ種類だけプランを出す）
        const url = `/dashboard/visuals?scope=library&ids=${encodeURIComponent(savedIds.join(','))}&types=${encodeURIComponent(kind)}`;
        window.open(url, '_blank', 'noopener');
        setStatus((m) => ({ ...m, [kind]: { state: 'opened', message: '図解画面（新しいタブ）でプランを確認して描画してください' } }));
        return;
      }
      if (kind === 'script') {
        const pages = splitIntoSlidePages(detailText || summaryText);
        if (pages.length === 0) throw new Error('まとめに見出しが無いためページに分けられません');
        window.localStorage.setItem(PRESENTATION_HANDOFF_KEY, JSON.stringify({ title: baseTitle, pages, from: 'pack' }));
        window.open('/dashboard/presentation?from=pack', '_blank', 'noopener');
        setStatus((m) => ({ ...m, [kind]: { state: 'opened', message: `プレゼン原稿（新しいタブ）にまとめを ${pages.length} ページとして渡しました` } }));
        return;
      }
      const r = await fetch('/api/pack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ids: savedIds, sourceIds }) });
      const j = (await r.json().catch(() => ({}))) as { id?: string; title?: string; error?: string; count?: number; dropped?: number; adWarnings?: string[] };
      if (!r.ok || !j.id) throw new Error(j.error || `HTTP ${r.status}`);
      const notes = [j.count !== undefined ? `${j.count}件` : '', j.dropped ? `（${j.dropped}件を捨てました）` : '', j.adWarnings?.length ? `⚠️ NG表現の候補 ${j.adWarnings.length}件` : ''].filter(Boolean).join(' ');
      setStatus((m) => ({ ...m, [kind]: { state: 'done', id: j.id, message: `保存しました${notes ? `・${notes}` : ''}` } }));
      onSaved?.();
    } catch (e) {
      setStatus((m) => ({ ...m, [kind]: { state: 'error', message: e instanceof Error ? e.message : String(e) } }));
    } finally {
      runningRef.current.delete(kind);
    }
  };
  const runAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 1件ずつ独立（allSettled）。画像系は同じタブ操作なのでまとめて1回にせず kind ごとに開く
      await Promise.allSettled([...selected].map((k) => runKind(k)));
    } finally {
      setBusy(false);
    }
  };
  const btn: React.CSSProperties = { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' };
  return (
    <div data-pack-panel style={{ marginTop: 12, padding: 12, border: '1px solid #6c63ff', borderRadius: 10, background: 'rgba(108,99,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>🎁 プレゼン素材を作る（選択式・1件ずつ独立に作ります）</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 6 }}>
        {PACK_CATALOG.map((e) => {
          const st = status[e.kind];
          const usd = packEstimateUsd(e.kind, sourceChars);
          return (
            <label key={e.kind} data-pack-kind={e.kind} data-pack-state={st?.state ?? 'idle'} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 8, border: `1px solid ${selected.has(e.kind) ? '#6c63ff' : 'var(--border)'}`, background: 'var(--bg-primary)' }}>
              <input type="checkbox" data-pack-check={e.kind} checked={selected.has(e.kind)} disabled={busy} onChange={(ev) => setSelected((prev) => { const n = new Set(prev); if (ev.target.checked) n.add(e.kind); else n.delete(e.kind); return n; })} style={{ marginTop: 2 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{e.group === 'image' ? '🖼' : '📝'} {e.label}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{e.purpose}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{e.how} ／ 約{e.estSeconds}秒 ／ <span data-pack-cost={e.kind}>{usd === null ? '—' : usd === 0 ? '無料' : formatUsd(usd)}</span></span>
                {st && st.state !== 'idle' && (
                  <span data-pack-status={e.kind} style={{ display: 'block', fontSize: 11, color: st.state === 'error' ? '#B91C1C' : st.state === 'running' ? 'var(--text-secondary)' : '#0d9973' }}>
                    {st.state === 'running' ? '⏳ 作成中…' : st.state === 'error' ? `❌ ${st.message}` : `✅ ${st.message}`}
                    {st.state === 'error' && <button type="button" data-pack-retry={e.kind} onClick={() => void runKind(e.kind)} style={{ ...btn, marginLeft: 6, padding: '2px 8px', fontSize: 11 }}>🔁 この素材だけ再実行</button>}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span data-pack-summary style={{ color: 'var(--text-secondary)' }}>
          {selected.size}件選択 ／ 所要 約{Math.round(totalSec / 60)}分 ／ 費用の目安 <strong data-pack-total-usd={totalUsd.toFixed(4)}>{totalUsd === 0 ? '無料' : formatUsd(totalUsd)}</strong>
          <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>（{pricingNote()}）</span>
        </span>
        <span style={{ flex: 1 }} />
        {(done > 0 || failed > 0) && <span data-pack-progress={`${done}/${selected.size}`} style={{ color: failed > 0 ? '#B45309' : '#0d9973', fontWeight: 700 }}>{done}/{selected.size} 完了{failed > 0 ? `・${failed} 失敗` : ''}</span>}
        <button type="button" data-pack-run onClick={() => void runAll()} disabled={busy || selected.size === 0} style={{ ...btn, background: '#6c63ff', color: '#fff', border: 'none', fontWeight: 700, opacity: busy || selected.size === 0 ? 0.5 : 1 }}>
          {busy ? '⏳ 作成中…' : `🎁 選んだ ${selected.size} 件を作る`}
        </button>
      </div>
    </div>
  );
}
