'use client';

// 271: バッチリサーチ結果の横並び比較（本文/要約・同期スクロール・列ヘッダーsticky）。
// 285: 選択上限は4件（BATCH_COMPARE_MAX）。列数は幅で折り返す（2xl:4列／md〜:2列＝4件なら2×2／それ未満:1列）。
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
  COMPARE_COLUMN_CHOICES,
  type CompareColumnChoice,
  type CompareHeightPreset,
  compareColumnLabel,
  compareGridClass,
  loadColumnChoice,
  loadCompareMode,
  loadHeightPreset,
  pickCompareText,
  resolveCompareColumns,
  saveColumnChoice,
  saveCompareMode,
  saveHeightPreset,
  toggleCompareId,
} from '@/lib/batch-compare';
import { renderMarkdown } from '@/lib/markdown-renderer';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { triggerDownload } from '@/lib/download';
import { useFinePointer } from '@/lib/pointer-device';
// 290: 同期スクロール・高さプリセット・列の外枠（sticky ヘッダー）は共通部品へ（モデル比較と共用）
import {
  COMPARE_ACCENT,
  CompareColumnShell,
  CompareHeightPicker,
  CompareSyncToggle,
  compareCompactBtnStyle,
  useSyncedScroll,
} from '@/components/deepresearch/CompareGrid';

type Props = {
  jobId: number;
  results: BatchResult[];
  onClose: () => void;
};

const ACCENT = COMPARE_ACCENT;

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
  // 289: 列数（既定 auto＝従来の幅による自動）と高さ（既定 high＝従来の68vh）。選んだ値は次回も使う
  const [colChoice, setColChoice] = useState<CompareColumnChoice>('auto');
  const [heightPreset, setHeightPreset] = useState<CompareHeightPreset>('high');

  const rootRef = useRef<HTMLDivElement | null>(null);
  // 271 §3-1: 同期スクロール（割合ベース）。290で共通フックへ
  const { setColRef, handleScroll } = useSyncedScroll(syncScroll);

  useEffect(() => {
    // localStorage はクライアントでしか読めないので、描画後に反映する（SSRと差分を作らない）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(loadCompareMode());
    setColChoice(loadColumnChoice());
    setHeightPreset(loadHeightPreset());
  }, []);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const selected = useMemo(
    () => selectedIds.map((id) => results.find((r) => r.id === id)).filter((r): r is BatchResult => !!r),
    [selectedIds, results],
  );

  // タッチ端末は1列（§4-2）。mounted 前はデスクトップ扱い（pointer-device の方針に合わせる）
  const cols = resolveCompareColumns(selected.length, mounted ? fine : true, colChoice);
  const applyColChoice = (c: CompareColumnChoice) => {
    setColChoice(c);
    saveColumnChoice(c);
  };
  const applyHeight = (h: CompareHeightPreset) => {
    setHeightPreset(h);
    saveHeightPreset(h);
  };

  const applyMode = (next: BatchCompareMode) => {
    setMode(next);
    saveCompareMode(next);
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

  const compactBtnStyle = compareCompactBtnStyle;

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
          {/* 289 §3-1: 列数の手動指定（タッチ端末は1列固定なので出さない）。狭い画面でも制限・警告はかけない */}
          {(!mounted || fine) && (
            <span data-compare-cols-picker style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} title="横に並べる列数（自動＝画面幅で決める）">
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>列</span>
              {COMPARE_COLUMN_CHOICES.map((c) => (
                <button
                  key={String(c)}
                  type="button"
                  data-compare-cols-choice={String(c)}
                  aria-pressed={colChoice === c}
                  onClick={() => applyColChoice(c)}
                  style={{ ...compactBtnStyle, padding: '4px 8px', borderColor: colChoice === c ? ACCENT : 'var(--border)', background: colChoice === c ? `${ACCENT}15` : 'var(--bg-primary)', fontWeight: colChoice === c ? 700 : 600 }}
                >
                  {c === 'auto' ? '自動' : c}
                </button>
              ))}
            </span>
          )}
          {/* 289 §4: カード高さのプリセット（低＝2×2で4枚が1画面に収まる／高＝従来68vh） */}
          <CompareHeightPicker value={heightPreset} onChange={applyHeight} />
          <CompareSyncToggle checked={syncScroll} onChange={setSyncScroll} />
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

      {/* ── 比較対象の選択（①の読み比べと同じ形式・上限は BATCH_COMPARE_MAX 件） ── */}
      <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-4" style={{ marginBottom: 8 }}>
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

      {/* ── 横並び比較（横スクロールを出さない。4件は 2xl で4列、それ未満は2列×2行） ── */}
      {selected.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          比較したい結果を選んでください。
        </div>
      ) : (
        <div className={compareGridClass(cols, colChoice)} data-compare-cols={cols} data-compare-cols-mode={colChoice === 'auto' ? 'auto' : 'manual'} data-compare-height={heightPreset}>
          {selected.map((r, i) => {
            const { text, fellBack } = pickCompareText(r, mode);
            // 285§3-2: フォールバック列はラベルも「本文（要約なし）」。文字数は text（＝実際に出している内容）のもの
            const label = compareColumnLabel(mode, fellBack);
            return (
              <CompareColumnShell
                key={r.id}
                index={i}
                heightPreset={heightPreset}
                colRef={setColRef(i)}
                onScroll={() => handleScroll(i)}
                header={<>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.topic}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span data-compare-label={i} style={{ fontSize: 10, color: 'var(--text-muted)' }}>
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
                </>}
              >
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
              </CompareColumnShell>
            );
          })}
        </div>
      )}
    </div>
  );
}
