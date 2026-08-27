'use client';

// 271: バッチリサーチ結果の横並び比較（PC最大3列・本文/要約・同期スクロール・列ヘッダーsticky）。
//
// UIの土台は①ペルソナ別note記事の「読み比べて選ぶ」（dr-hub）と同じ:
//   選択カードの並び → 「選択中: n/N件」 → 横並びカード（カード内スクロール）。
// 271が足したのは**長文（3,000〜5,000字）を突き合わせるための2機構**だけ:
//   §3-1 同期スクロール（割合ベース・OFFにできる）／§3-2 列ヘッダーのsticky固定。
//
// 判断（列数・上限・どちらの本文か・同期位置）は lib/batch-compare.ts に集約し、
// ここは描画と入出力に徹する。

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BATCH_COMPARE_MAX,
  type BatchCompareMode,
  type BatchResult,
  compareGridClass,
  loadCompareMode,
  pickCompareText,
  resolveCompareColumns,
  saveCompareMode,
  scrollRatioOf,
  syncScrollTop,
  toggleCompareId,
} from '@/lib/batch-compare';
import { renderMarkdown } from '@/lib/markdown-renderer';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { triggerDownload } from '@/lib/download';
import { useFinePointer } from '@/lib/pointer-device';

type Props = {
  jobId: number;
  results: BatchResult[];
  onClose: () => void;
};

const ACCENT = '#6c63ff';

export default function BatchCompareView({ jobId, results, onClose }: Props) {
  // 258: 端末判定は lib/pointer-device.ts に一本化（255〜260・270と同じ関数を使う）
  const { fine, mounted } = useFinePointer();
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    results.slice(0, BATCH_COMPARE_MAX).map((r) => r.id),
  );
  // 初回の既定は本文。以後は最後に選んだモードで開く（§2-1）
  const [mode, setMode] = useState<BatchCompareMode>('research');
  const [syncScroll, setSyncScroll] = useState(true); // §3-1: 同期は既定ON
  const [copied, setCopied] = useState<number | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const syncingRef = useRef(false);

  useEffect(() => {
    // localStorage はクライアントでしか読めないので、描画後に反映する（SSRと差分を作らない）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(loadCompareMode());
  }, []);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const selected = useMemo(
    () => selectedIds.map((id) => results.find((r) => r.id === id)).filter((r): r is BatchResult => !!r),
    [selectedIds, results],
  );

  // タッチ端末は1列（§4-2）。mounted 前はデスクトップ扱い（pointer-device の方針に合わせる）
  const cols = resolveCompareColumns(selected.length, mounted ? fine : true);

  const applyMode = (next: BatchCompareMode) => {
    setMode(next);
    saveCompareMode(next);
  };

  const handleScroll = (idx: number) => {
    if (!syncScroll || syncingRef.current) return;
    const src = colRefs.current[idx];
    if (!src) return;
    const ratio = scrollRatioOf(src.scrollTop, src.scrollHeight, src.clientHeight);
    syncingRef.current = true;
    colRefs.current.forEach((el, i) => {
      if (!el || i === idx) return;
      el.scrollTop = syncScrollTop(ratio, el.scrollHeight, el.clientHeight);
    });
    // 同期で動かした側の scroll イベントが跳ね返って無限に往復するのを防ぐ
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  const handleCopy = async (text: string, id: number) => {
    if (!text) return;
    // R-71: 貼り付け先を決め打ちしない一般コピー。263の挙動（Word体裁のリッチコピー）をそのまま使う
    await copyRichMarkdown(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleDownload = (text: string, topic: string, label: string) => {
    if (!text) return;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const safeTopic = (topic || 'untitled').replace(/[/\\:*?"<>|]/g, '').slice(0, 30);
    triggerDownload(`${safeTopic}_${label}_${date}.md`, text, 'text/markdown;charset=utf-8');
  };

  const modeBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    border: active ? `2px solid ${ACCENT}` : '1px solid var(--border)',
    background: active ? `${ACCENT}15` : 'var(--bg-primary)',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  });

  const compactBtnStyle: React.CSSProperties = {
    padding: '4px 8px',
    borderRadius: 5,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  };

  return (
    <div
      ref={rootRef}
      data-batch-compare
      style={{
        marginTop: 12,
        padding: 14,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}
    >
      {/* ── 見出し・一括切替・同期トグル ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          ⇔ 結果を横並びで比較（最大{BATCH_COMPARE_MAX}件）
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* §2-1: 全列を一括で切り替える（比較のため揃っている方が自然） */}
          <button type="button" data-compare-mode="research" aria-pressed={mode === 'research'} onClick={() => applyMode('research')} style={modeBtnStyle(mode === 'research')}>
            📄 本文
          </button>
          <button type="button" data-compare-mode="summary" aria-pressed={mode === 'summary'} onClick={() => applyMode('summary')} style={modeBtnStyle(mode === 'summary')}>
            📋 要約
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              data-compare-sync
              checked={syncScroll}
              onChange={(e) => setSyncScroll(e.target.checked)}
            />
            同期スクロール
          </label>
          <button
            type="button"
            data-compare-close
            onClick={onClose}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
          >
            ✕ 閉じる
          </button>
        </div>
      </div>

      {/* ── 比較対象の選択（①の読み比べと同じ形式・上限3件） ── */}
      <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3" style={{ marginBottom: 8 }}>
        {results.map((r) => {
          const checked = selectedIds.includes(r.id);
          const full = !checked && selectedIds.length >= BATCH_COMPARE_MAX;
          return (
            <button
              key={r.id}
              type="button"
              data-compare-pick={r.id}
              aria-pressed={checked}
              disabled={full}
              onClick={() => setSelectedIds((prev) => toggleCompareId(prev, r.id))}
              title={full ? `比較できるのは${BATCH_COMPARE_MAX}件までです（どれかを外してください）` : r.topic}
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                cursor: full ? 'not-allowed' : 'pointer',
                opacity: full ? 0.45 : 1,
                border: checked ? `2px solid ${ACCENT}` : '1px solid var(--border)',
                background: checked ? `${ACCENT}12` : 'var(--bg-primary)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {checked ? '☑' : '☐'} {r.topic}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {(r.research_text || '').length.toLocaleString()}字 ／ {new Date(r.created_at).toLocaleString('ja-JP')}
              </div>
            </button>
          );
        })}
      </div>
      <div data-compare-count style={{ fontSize: 12, color: selected.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', marginBottom: 10 }}>
        選択中: {selected.length}/{BATCH_COMPARE_MAX}件
        {mounted && !fine && '（この端末では1列ずつ表示します）'}
      </div>

      {/* ── 横並び比較（最大3列・横スクロールを出さない） ── */}
      {selected.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          比較したい結果を選んでください。
        </div>
      ) : (
        <div className={compareGridClass(cols)} data-compare-cols={cols}>
          {selected.map((r, i) => {
            const { text, fellBack } = pickCompareText(r, mode);
            const label = mode === 'research' ? 'リサーチ本文' : '要約';
            return (
              <div
                key={r.id}
                data-compare-col={i}
                ref={(el) => {
                  colRefs.current[i] = el;
                }}
                onScroll={() => handleScroll(i)}
                style={{
                  // §4-3: 長文比較なので画面高さをできるだけ使う（カード高さを小さく固定しない）。
                  // 文字サイズ4段階（ルート zoom）でも収まるよう、vh は控えめに取る。
                  maxHeight: '68vh',
                  overflowY: 'auto',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  minWidth: 0,
                }}
              >
                {/* §3-2: 列ヘッダーはsticky固定。5,000字をスクロールしてもどの列か分かるようにする */}
                <div
                  data-compare-header={i}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    padding: '10px 12px',
                    background: 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.topic}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {label} {text.length.toLocaleString()}字 ／ {new Date(r.created_at).toLocaleString('ja-JP')}
                    </span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button type="button" data-compare-copy={i} onClick={() => handleCopy(text, r.id)} style={compactBtnStyle}>
                        {copied === r.id ? '✓' : '📋'}
                      </button>
                      <button type="button" data-compare-dl={i} onClick={() => handleDownload(text, r.topic, label)} style={compactBtnStyle}>
                        📥
                      </button>
                      <a
                        href={`/dashboard/context-library?batch=${jobId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="AI参照素材（保存一覧・マイフォルダ）でこのバッチの結果を開きます"
                        style={{ ...compactBtnStyle, textDecoration: 'none', display: 'inline-block' }}
                      >
                        🧠
                      </a>
                    </span>
                  </div>
                  {fellBack && (
                    <div style={{ fontSize: 10, color: '#92400e', marginTop: 4 }}>
                      ※ この結果には要約が保存されていないため、本文を表示しています
                    </div>
                  )}
                </div>

                {/* R-45: 読む画面は整形表示（生MD記法をUIに出さない） */}
                {text ? (
                  <div
                    className="markdown-body"
                    style={{ padding: 12, fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)' }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
                  />
                ) : (
                  <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>（本文がありません）</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
