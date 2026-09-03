'use client';

// 291: 📚リサーチ保存の「選択した成果物を横並びで比較」。
//
// 新規に組まない（§1-3）: 271→285→289→290 で整備した比較UIの共通部品（CompareGrid：同期スクロール・
// sticky列ヘッダー・高さプリセット・列数の手動指定）と判断（lib/batch-compare.ts：列数の解決・
// 列クラス・保持）をそのまま使う。BatchCompareView は BatchResult（topic/research_text/context_text）と
// jobId（🧠AI参照素材への導線）に結びついた部品で、リサーチ保存の行（title/content/種別）には型も
// 操作（本文/要約の一括切替・選択カード）も合わないため、290（ModelCompareView）と同じく
// **判断ロジックと CompareGrid の部品を共有し、列の中身だけをこの部品で描く**方針を採る。
//
// 比較の単位は成果物（行）。283/286 のカードまとめは変えず、選んだ行を選んだ順に列へ置く。
// 列ヘッダーには種別（本文／要約／詳細／活用アドバイス）を必ず出す（§2-4）。
// 292: 🗂テキスト分析の保存一覧（SavedAnalysisList）からも同じ部品を使う。そちらの種別は分析タイプ
//（全文書き起こし／詳細にまとめる／概要・要約…）で、kind/label は呼び出し側が決める（この部品は体系を持たない）。
// 全画面は 282 の共通 FullscreenReader（呼び出し元が1つだけマウント）へ onFullscreen で渡す（§2-5）。
// 本文の整形は MarkdownBody（R-45/R-97）。コピー・DLは原文のまま（R-71）。

import { useEffect, useRef, useState } from 'react';
import { MarkdownBody } from '@/components/MarkdownBody';
import {
  type CompareColumnChoice,
  type CompareHeightPreset,
  compareGridClass,
  loadColumnChoice,
  loadHeightPreset,
  resolveCompareColumns,
  saveColumnChoice,
  saveHeightPreset,
} from '@/lib/batch-compare';
import { LIBRARY_COMPARE_MAX, type LibraryCompareEntry } from '@/lib/library-view';
import type { LibraryLike } from '@/lib/library-groups';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { useFinePointer } from '@/lib/pointer-device';
import {
  CompareColumnShell,
  CompareColumnsPicker,
  CompareHeightPicker,
  CompareSyncToggle,
  compareCompactBtnStyle,
  useSyncedScroll,
} from '@/components/deepresearch/CompareGrid';

type Row = LibraryLike & { id: string; content?: string | null; char_count?: number };

type Props<T extends Row> = {
  entries: LibraryCompareEntry<T>[];
  onClose: () => void;
  /** 282 の共通リーダーを開く（呼び出し元の FullscreenReader を使う＝ここでは持たない） */
  onFullscreen: (item: T) => void;
  /** 一覧のカードと同じ MD ダウンロード（原文のまま） */
  onExportMd: (item: T) => void;
  /** 292: 列ヘッダーに出す種別の説明文（画面ごとの体系に合わせて呼び出し側が渡す。省略時は📚の文言） */
  kindNote?: string;
};

export default function LibraryCompareView<T extends Row>({
  entries,
  onClose,
  onFullscreen,
  onExportMd,
  kindNote = '各列の見出しに種別（本文／要約／詳細／活用アドバイス）を表示しています。',
}: Props<T>) {
  const { fine, mounted } = useFinePointer();
  const [syncScroll, setSyncScroll] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  // 289 の列数・高さは localStorage を共有（バッチ比較・モデル比較と同じ値＝画面ごとに覚え直させない）
  const [colChoice, setColChoice] = useState<CompareColumnChoice>('auto');
  const [heightPreset, setHeightPreset] = useState<CompareHeightPreset>('high');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { setColRef, handleScroll } = useSyncedScroll(syncScroll);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColChoice(loadColumnChoice());
    setHeightPreset(loadHeightPreset());
  }, []);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const cols = resolveCompareColumns(entries.length, mounted ? fine : true, colChoice);
  const applyColChoice = (c: CompareColumnChoice) => {
    setColChoice(c);
    saveColumnChoice(c);
  };
  const applyHeight = (h: CompareHeightPreset) => {
    setHeightPreset(h);
    saveHeightPreset(h);
  };

  const textOf = (item: T): string => (typeof item.content === 'string' ? item.content : '');
  const charCountOf = (item: T): number =>
    typeof item.char_count === 'number' ? item.char_count : textOf(item).length;

  const handleCopy = async (item: T) => {
    const text = textOf(item);
    if (!text) return;
    await copyRichMarkdown(text);
    setCopied(item.id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div
      ref={rootRef}
      data-library-compare
      style={{ marginBottom: 16, padding: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          ⇔ 選択した{entries.length}件を横並びで比較（最大{LIBRARY_COMPARE_MAX}件）
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {(!mounted || fine) && <CompareColumnsPicker value={colChoice} onChange={applyColChoice} />}
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
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
        列は選んだ順。{kindNote}
        {mounted && !fine && '（この端末では1列ずつ表示します）'}
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)' }}>
          比較する成果物がありません（削除された可能性があります）。選択し直してください。
        </div>
      ) : (
        <div className={compareGridClass(cols, colChoice)} data-compare-cols={cols} data-compare-cols-mode={colChoice === 'auto' ? 'auto' : 'manual'} data-compare-height={heightPreset}>
          {entries.map((e, i) => {
            const text = textOf(e.item);
            const created = e.item.created_at ? new Date(e.item.created_at).toLocaleString('ja-JP') : '';
            return (
              <CompareColumnShell
                key={e.item.id}
                index={i}
                heightPreset={heightPreset}
                colRef={setColRef(i)}
                onScroll={() => handleScroll(i)}
                extraAttrs={{ 'data-compare-item': e.item.id, 'data-compare-kind': e.kind }}
                header={<>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.item.title ?? ''}>
                    {e.item.title || '(無題)'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span data-compare-label={i} style={{ fontSize: 10, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {/* §2-4: 種別を必ず出す（どれを比べているか分からなくなるため） */}
                      <span
                        data-compare-kind-label={e.kind}
                        style={{ padding: '1px 7px', borderRadius: 8, background: 'rgba(108,99,255,0.12)', color: '#6c63ff', fontWeight: 700 }}
                      >
                        {e.label}
                      </span>
                      <span>{charCountOf(e.item).toLocaleString()}字{created ? ` ／ ${created}` : ''}</span>
                    </span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button type="button" data-compare-copy={i} onClick={() => handleCopy(e.item)} style={compareCompactBtnStyle} title={`${e.label}をコピー`}>
                        {copied === e.item.id ? '✓' : '📋'}
                      </button>
                      <button type="button" data-compare-dl={i} onClick={() => onExportMd(e.item)} style={compareCompactBtnStyle} title="Markdownをダウンロード">
                        📥
                      </button>
                      {/* §2-5: 各列から個別に全画面（282 の共通リーダー） */}
                      {text && (
                        <button type="button" data-compare-fullscreen={i} onClick={() => onFullscreen(e.item)} style={compareCompactBtnStyle} title={`${e.label}を全画面のリーダー表示で読む`}>
                          ⛶
                        </button>
                      )}
                    </span>
                  </div>
                </>}
              >
                {text ? (
                  <MarkdownBody text={text} style={{ padding: 12, fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)' }} />
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
