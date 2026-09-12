'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AnalysisType,
  type AnalysisOption,
  ANALYSIS_OPTIONS,
  PRIMARY_ANALYSIS_OPTIONS,
  SECONDARY_ANALYSIS_OPTIONS,
  TARGET_OPTIONS,
  LEVEL_OPTIONS,
  PURPOSE_OPTIONS,
  TONE_OPTIONS,
} from '@/lib/analysis-prompts';
import { useToast } from '@/components/ui/Toast';
import type { AnalysisRecord } from '@/components/text-analysis/SavedAnalysisList';
import {
  getSavedModel,
  getModelLabel,
  getModelIcon,
  type AIModel,
} from '@/lib/model-preference';
import { ModelBadge } from '@/components/ModelBadge';
import { renderMarkdown, sanitizeLatex } from '@/lib/markdown-renderer';
import {
  generateTitleWithTimeout,
  sanitizeFilename,
  yyyymmdd,
} from '@/lib/title-generator';
import { copyRichMarkdown } from '@/lib/rich-copy';
import { triggerDownload } from '@/lib/download';
import { markdownToReadableText } from '@/lib/markdownToText';
import {
  loadFeatureDraft,
  saveFeatureDraft,
  clearFeatureDraft,
} from '@/lib/feature-drafts';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';
import { TextRefinePanel } from '@/components/refine/TextRefinePanel';
import FullscreenReader from '@/components/text-analysis/FullscreenReader';
// 319: 結果カードから追加リサーチ（保存済みの行が前提資料）
import { FollowUpResearchButton } from '@/components/deepresearch/FollowUpResearchDialog';
// 320: 成果物から直接「🖼 図解・画像を作る」
import { VisualQuickButton } from '@/components/visuals/VisualQuickButton';
// 322: 成果物の操作行を共通部品に統一（321・中の要素とハンドラは不変）
import ResultActionBar from '@/components/ResultActionBar';
import { MemorizeButton } from '@/components/SaveToLibraryButton';
import { useRunKeyHints, useRunShortcut } from '@/lib/shortcuts';
// 313改訂: 「📋 クリアして貼付」は院長の実機判断で廃止（クリア→ペーストの2操作で同じ結果）。lib/clear-and-paste は 🔭DR で引き続き使う
// 255: 「貼り付けたら前の内容を置き換える」（iOSで追加タップを出さずに1操作にする）
// 270: 「貼り付けで置き換える」設定はこの画面では使わない（3ボタン構成と機能が重複するため）。
// 設定そのもの・保存値・🔭ディープリサーチでの動作は残す（lib/paste-replace.ts）
// 259/270: 「📋 ペースト」ボタン（270からは全端末に出す）
// 313再改訂（院長判断 2026/9/9 23:44）: 「📋 クリアして貼付」を復元（254/270・R-76）。「📋 ペースト」（末尾追記）は🗂から外す
import { clearAndPaste, clearPasteMessage } from '@/lib/clear-and-paste';
// 332【B】: 案内文の出し分けは端末名（UA）ではなく入力手段で決める（R-74: 決定的）
import { useFinePointer } from '@/lib/pointer-device';
// 332【D】: 分析対象テキスト欄の高さ（S／M／L／自動）と、その記憶
import {
  TA_HEIGHT_CHOICES,
  TA_HEIGHT_DEFAULT,
  TA_HEIGHT_LABEL,
  TA_HEIGHT_TITLE,
  autoHeightPx,
  loadTextareaHeight,
  saveTextareaHeight,
  textareaHeightStyle,
  type TextareaHeightChoice,
} from '@/lib/textarea-height';
import { isAutoStockSaveEnabled } from '@/lib/auto-stock-save';
// 313改訂: 実行ボタンは狭幅・広幅とも**テキスト欄直下の行の先頭**（🚀 → ✕ クリア → 📋 ペースト）。固定バー（共通部品）はこの画面では使わない
// （院長の実機判断: 追従バーは邪魔・フォーカス中の非表示で押せなくなる）。部品は横展開候補用に残す。無効化の理由は lib の純関数
import { runDisabledReason } from '@/lib/sticky-action-bar';

// 215: 「全」は高さプリセットではなく FullscreenReader（保存一覧と同じ全画面ビューア）を
// 開くボタンに変更。panelHeight は触らないため、閉じた後は押下前の S/M/L に自動復帰する
const HEIGHT_PRESETS = [
  { label: 'S', h: 350 },
  { label: 'M', h: 550 },
  { label: 'L', h: 800 },
];

// 247: 結果カードの保存状態。親（TextAnalysisPanel）が type ごとに持つ
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ResultPanelProps {
  type: AnalysisType;
  label: string;
  text: string;
  // この結果を生成したモデル（リクエスト送信時の値）。旧データは undefined
  model?: AIModel;
  // ストリーミング中（生成途中）は Markdown が崩れるので pre-wrap 表示にする
  isStreaming?: boolean;
  simplifying: boolean;
  generatingTitle: boolean;
  // 247: 保存状態は親が持つ（自動保存＝生成完了時に親が走らせるため、カード内に閉じられない）。
  // 本文が変わったら親が 'idle' に戻す＝修正後はまた保存できる
  saveStatus: SaveStatus;
  /** 319: 保存済みの行 id（追加リサーチの前提資料）。未保存は null */
  savedId: number | null;
  onSave: () => void;
  onCopy: () => void;
  onDownloadTxt: () => void;
  onDownloadMd: () => void;
  onDownloadDocx: () => void;
  onSimplify: () => void;
  onRefine: () => void;
  /** 322: ➡ 送る（再分析＝入力欄にこの本文を入れて分析タイプを選び直す／文章作成に使う／AI参照素材として保存）・⭐ お気に入り（保存済みの行） */
  onReanalyze: () => void;
  onSendToWrite: () => void;
  onSaveContext: () => void;
  onFavorite: () => void;
  favoriteDone: boolean;
  contextSaving: boolean;
}

function ResultPanel({
  type,
  label,
  text,
  model,
  isStreaming,
  simplifying,
  generatingTitle,
  saveStatus,
  savedId,
  onSave,
  onCopy,
  onDownloadTxt,
  onDownloadMd,
  onDownloadDocx,
  onSimplify,
  onRefine,
  onReanalyze,
  onSendToWrite,
  onSaveContext,
  onFavorite,
  favoriteDone,
  contextSaving,
}: ResultPanelProps) {
  const [panelHeight, setPanelHeight] = useState(350);
  // 215: 全画面ビューア（保存一覧の FullscreenReader 流用）の開閉
  const [readerOpen, setReaderOpen] = useState(false);
  const currentLength = text.length;

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* ヘッダー（見出し・モデル・字数）。326 §3-3: 狭幅は1行にまとめる（globals.css の [data-result-head]） */}
      <div data-result-head style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
            {label}
          </span>
          {model && <ModelBadge model={model} size="sm" />}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {currentLength.toLocaleString()} 文字
        </span>
      </div>

      {/* 322 §3-2: 操作行は共通部品 ResultActionBar（321）。従来の下部9ボタンを上部1箇所に集約。中の要素・ハンドラ・活性条件は不変。
          右端＝高さプリセット（S/M/L/全）。2段目＝⬇ダウンロード／➡送る／🧠記憶する／⭐お気に入り */}
      <ResultActionBar
        attrs={{ 'data-ta-result-actions': type }}
        primary={
        <button
          type="button"
          data-save-library
          onClick={onSave}
          // 247: 保存済みの間は押せない＝同じ本文を二重にストックへ入れない。
          // 本文を直すと親が 'idle' に戻すので、修正後はまた保存できる（従来の意図は維持）
          disabled={!text || generatingTitle || saveStatus === 'saving' || saveStatus === 'saved'}
          title={
            saveStatus === 'saved'
              ? 'この内容はストックに保存済みです（本文を修正するとまた保存できます）'
              : saveStatus === 'error'
                ? '保存に失敗しました。押すと再試行します（結果は画面に残っています）'
                : 'ストック（🗂保存一覧）に保存します'
          }
          style={
            saveStatus === 'saved'
              ? // 緑系（v36「分析終了」バッジと配色を統一）
                {
                  ...btnStyle('primary'),
                  background: '#f0fdf4',
                  color: '#16a34a',
                  border: '1px solid #bbf7d0',
                  cursor: 'default',
                }
              : saveStatus === 'error'
                ? btnStyle('warning')
                : btnStyle('primary')
          }
        >
          {generatingTitle
            ? '⏳ タイトル生成中...'
            : saveStatus === 'saving'
              ? '⏳ 保存中...'
              : saveStatus === 'saved'
                ? '✅ 保存済み'
                : saveStatus === 'error'
                  ? '⚠️ 保存に失敗・再試行'
                  : '💾 ストック保存'}
        </button>
        }
        keepVisible={
        <VisualQuickButton
          text={text}
          title={label}
          saved={savedId && saveStatus === 'saved' ? { scope: 'text_analysis', id: String(savedId) } : null}
          from="text_analysis"
          dataKey={savedId && saveStatus === 'saved' ? String(savedId) : 'unsaved'}
          disabled={!text || isStreaming}
          style={btnStyle('neutral')}
        />
        }
        main={<>
        {/* 324/325: 9マスシート・プレゼン構成（種類を固定して直接開く・ダイアログなし） */}
        <VisualQuickButton
          text={text}
          title={label}
          saved={savedId && saveStatus === 'saved' ? { scope: 'text_analysis', id: String(savedId) } : null}
          from="text_analysis"
          disabled={!text || isStreaming}
          style={btnStyle('neutral')}
          dataKey={`grid9-${savedId && saveStatus === 'saved' ? String(savedId) : 'unsaved'}`}
          fixedTypes={['grid9']}
          label="🔲 9マスシートにする"
        />
        <VisualQuickButton
          text={text}
          title={label}
          saved={savedId && saveStatus === 'saved' ? { scope: 'text_analysis', id: String(savedId) } : null}
          from="text_analysis"
          disabled={!text || isStreaming}
          style={btnStyle('neutral')}
          dataKey={`talk-${savedId && saveStatus === 'saved' ? String(savedId) : 'unsaved'}`}
          fixedTypes={['grid9_talk']}
          label="🎤 プレゼン構成を考える"
        />
        <FollowUpResearchButton
          refs={savedId ? [{ scope: 'text_analysis', id: String(savedId) }] : []}
          dataKey={savedId ? String(savedId) : 'unsaved'}
          label="🔭 追加リサーチ"
          disabled={!savedId || saveStatus !== 'saved'}
          disabledReason="先に「💾 ストック保存」でこの結果を保存してください（保存した行が前提資料になります）"
          style={btnStyle('neutral')}
        />
        <button
          type="button"
          onClick={onCopy}
          disabled={!text}
          style={btnStyle('neutral')}
        >
          📋 コピー
        </button>
        <button
          type="button"
          onClick={onRefine}
          disabled={!text || isStreaming}
          style={btnStyle('neutral')}
          title="クイック置換またはAI修正指示で、この結果テキストをその場で直します"
        >
          ✏️ AIで修正
        </button>
        </>}
        aside={<>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 4 }}>高さ:</span>
          {HEIGHT_PRESETS.map(({ label: l, h }) => (
            <button key={l} type="button" data-ta-height={l} onClick={() => setPanelHeight(h)} title={`本文の高さ ${l}`} style={{ color: panelHeight === h ? 'var(--accent)' : undefined, fontWeight: panelHeight === h ? 700 : undefined }}>
              {l}
            </button>
          ))}
          {/* 215: 「全」＝全画面ビューア（S/M/L と違い高さは変えない＝閉じたら元の高さのまま） */}
          <button type="button" onClick={() => setReaderOpen(true)} disabled={!text} title="全画面で読む">全</button>
        </>}
        menus={[
          { key: 'download', label: '⬇ ダウンロード', title: 'テキスト／Markdown／Word で書き出す', items: (<>
        <button
          type="button"
          onClick={onDownloadTxt}
          disabled={!text || generatingTitle}
          style={btnStyle('neutral')}
        >
          {generatingTitle ? '⏳ タイトル生成中...' : '⬇ テキスト'}
        </button>
        <button
          type="button"
          onClick={onDownloadMd}
          disabled={!text || generatingTitle}
          style={btnStyle('neutral')}
        >
          {generatingTitle ? '⏳ タイトル生成中...' : '📥 MD'}
        </button>
        <button
          type="button"
          onClick={onDownloadDocx}
          disabled={!text || generatingTitle}
          style={btnStyle('neutral')}
          title="院内配布・回覧用に体裁の整った Word(.docx) で書き出します"
        >
          {generatingTitle ? '⏳ タイトル生成中...' : '📄 Word'}
        </button>
          </>) },
          { key: 'send', label: '➡ 送る', title: '再分析・他の画面へ渡す・素材として保存・わかりやすく変換', items: (<>
            <button type="button" data-ta-reanalyze onClick={onReanalyze} disabled={!text || isStreaming} title="この結果を入力欄に入れて、分析タイプ（概要・要約／詳細 など）を選び直して分析します">
              🔁 テキスト分析へ（再分析）
            </button>
            <a href="/dashboard/dr-hub" title="保存済みの記事から、note記事・X投稿・Kindle本・戦略・画像への展開をまとめて行えます">
              🚀 発信ハブで展開する
            </a>
            <button type="button" data-ta-send-write onClick={onSendToWrite} disabled={!text} title="この結果を文章作成の参考資料として渡します">
              ✍️ 文章作成に使う
            </button>
            <button type="button" data-ta-save-context onClick={onSaveContext} disabled={!text || contextSaving} title="この結果をAI参照素材（🧠）として保存し、各スタジオでAIに読み込ませられます">
              {contextSaving ? '💾 保存中...' : '🧠 AI参照素材として保存'}
            </button>
        <button
          type="button"
          onClick={onSimplify}
          disabled={!text || simplifying}
          style={btnStyle('success')}
        >
          {simplifying ? '⏳ 変換中...' : '✨ わかりやすく変換'}
        </button>
          </>) },
        ]}
        extra={<>
          <MemorizeButton title={label} content={text} groupName="テキスト分析" />
          <button type="button" data-ta-favorite onClick={onFavorite} disabled={!savedId || saveStatus !== 'saved' || favoriteDone} title={savedId && saveStatus === 'saved' ? '保存した行をお気に入り（⭐）にします' : '先に「💾 ストック保存」で保存すると付けられます'}>
            {favoriteDone ? '⭐ お気に入り済み' : '⭐ お気に入りに追加'}
          </button>
        </>}
      />

      {/* 本文 */}
      <div
        style={{
          overflowY: 'auto',
          resize: 'vertical',
          borderRadius: 6,
          border: '1px solid var(--border)',
          padding: 10,
          background: 'rgba(255,255,255,0.02)',
          height: panelHeight,
          minHeight: 120,
        }}
      >
        {text && !isStreaming ? (
          // 生成完了後は Markdown をリッチ描画
          <div
            className="markdown-body"
            style={{ color: 'var(--text-primary)', fontSize: 13 }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
          />
        ) : (
          // 生成途中・未生成は生テキスト（崩れ防止）
          <div
            style={{
              whiteSpace: 'pre-wrap',
              color: 'var(--text-primary)',
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            {text || '（分析結果がここに表示されます）'}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <span>📝 {currentLength.toLocaleString()} 文字</span>
        {model && <ModelBadge model={model} size="sm" />}
      </div>

      {/* 215: 全画面ビューア（保存一覧と同じ FullscreenReader 流用・portal描画のためカード内配置でOK）。
          actions は保存一覧の全画面と同じ4操作（コピー/テキスト/MD/Word）を既存ハンドラ共有で渡す。
          保存・変換・修正のような状態を変える操作は保存一覧と同様、誤操作防止のため入れない */}
      <FullscreenReader
        open={readerOpen}
        title={label}
        content={text}
        onClose={() => setReaderOpen(false)}
        actions={
          <>
            <button type="button" onClick={onCopy} style={btnStyle('neutral')}>
              📋 コピー
            </button>
            <button
              type="button"
              onClick={onDownloadTxt}
              disabled={generatingTitle}
              style={btnStyle('neutral')}
            >
              {generatingTitle ? '⏳ タイトル生成中...' : '⬇ テキスト'}
            </button>
            <button
              type="button"
              onClick={onDownloadMd}
              disabled={generatingTitle}
              style={btnStyle('neutral')}
            >
              {generatingTitle ? '⏳ タイトル生成中...' : '📥 MD'}
            </button>
            <button
              type="button"
              onClick={onDownloadDocx}
              disabled={generatingTitle}
              style={btnStyle('neutral')}
              title="院内配布・回覧用に体裁の整った Word(.docx) で書き出します"
            >
              {generatingTitle ? '⏳ タイトル生成中...' : '📄 Word'}
            </button>
          </>
        }
      />
    </div>
  );
}

function btnStyle(kind: 'primary' | 'success' | 'neutral' | 'warning'): React.CSSProperties {
  const palette: Record<typeof kind, { bg: string; color: string; border: string }> = {
    primary: { bg: 'var(--accent)', color: '#fff', border: 'transparent' },
    success: { bg: '#1D9E75', color: '#fff', border: 'transparent' },
    // 247: 保存失敗の再試行。#B45309 に白文字＝コントラスト 5.02:1（R-43 の 4.5:1 以上）
    warning: { bg: '#B45309', color: '#fff', border: 'transparent' },
    neutral: { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: 'var(--border)' },
  };
  const c = palette[kind];
  return {
    fontSize: 11,
    padding: '6px 12px',
    borderRadius: 8,
    background: c.bg,
    color: c.color,
    border: `1px solid ${c.border}`,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  };
}

interface TextAnalysisPanelProps {
  onSaved?: (record: AnalysisRecord) => void;
  // ディープリサーチからの引き継ぎ用
  initialText?: string;
  initialTopic?: string;
  onInitialTextConsumed?: () => void;
  /** 311: マンダラからの発注の付帯情報。保存APIへそのまま渡す（サーバがマスへ紐づける）。無ければ従来どおり */
  mandala?: Record<string, unknown> | null;
}

// 自動下書き（feature_result_drafts feature_key='text-analysis'）のpayload
interface TextAnalysisDraftPayload {
  inputText?: string;
  purpose?: string;
  results?: Record<string, string>;
  models?: Record<string, AIModel>;
}

export default function TextAnalysisPanel({
  onSaved,
  initialText,
  initialTopic,
  onInitialTextConsumed,
  mandala = null,
}: TextAnalysisPanelProps) {
  const { showToast } = useToast();

  const [inputText, setInputText] = useState('');

  // initialTextが渡されたら入力欄に自動セット（ディープリサーチからの引き継ぎ）
  useEffect(() => {
    if (initialText) {
      setInputText(initialText);
      // トピックはpurposeに参考情報として入れる（空のときのみ）
      if (initialTopic) {
        setPurpose((prev) => (prev ? prev : initialTopic));
      }
      onInitialTextConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);
  const [selectedTypes, setSelectedTypes] = useState<Set<AnalysisType>>(
    new Set(['summary', 'detail_summary']),
  );
  const [typeLengths, setTypeLengths] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Map<AnalysisType, string>>(new Map());
  // 各結果を生成したモデル（リクエスト送信時の getSavedModel() を記録）
  const [resultModels, setResultModels] = useState<Map<AnalysisType, AIModel>>(new Map());

  const [generatingTitle, setGeneratingTitle] = useState<AnalysisType | null>(null);
  const [simplifying, setSimplifying] = useState<AnalysisType | null>(null);
  // 247: type ごとの保存状態（自動保存と手動保存が同じ表示を共有する）
  const [saveStates, setSaveStates] = useState<Map<AnalysisType, SaveStatus>>(new Map());
  const setSaveState = useCallback((type: AnalysisType, status: SaveStatus) => {
    setSaveStates((prev) => new Map(prev).set(type, status));
  }, []);
  // 319: type ごとの保存済み行 id（追加リサーチの前提資料）。本文が変わって 'idle' に戻るとき（saveState 'saved' でなくなる）は使わない
  const [savedIds, setSavedIds] = useState<Map<AnalysisType, number>>(new Map());

  // 216: type毎のAIタイトルキャッシュ。初回生成したタイトルを保存（saveResult）と
  // ダウンロードで共有し、「保存タイトルとDLファイル名が別物になる」のを防ぐ。
  // 再分析や結果テキストの変更（変換・AI修正）時は破棄して旧タイトルが新しい結果に付かないようにする
  const titleCacheRef = useRef<Map<AnalysisType, string>>(new Map());
  const getOrGenerateTitle = async (
    type: AnalysisType,
    text: string,
    label: string,
    fallback: string,
  ): Promise<string> => {
    const cached = titleCacheRef.current.get(type);
    if (cached) return cached;
    const title = await generateTitleWithTimeout(text, label, fallback);
    titleCacheRef.current.set(type, title);
    return title;
  };

  const [gsTarget, setGsTarget] = useState('all_staff');
  const [gsLevel, setGsLevel] = useState('standard');
  const [gsPurpose, setGsPurpose] = useState('inform');
  const [gsTone, setGsTone] = useState('professional');
  const [gsNotes, setGsNotes] = useState('');

  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  // 分析が全タイプ完了したか（ラベル横の「✅ 分析終了」バッジ用）
  const [analysisDone, setAnalysisDone] = useState(false);
  // 自動下書きから復元した日時（バナー表示用。新規実行で消える）
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  // 追加修正（169）: いま「✏️ AIで修正」を開いている対象カード
  const [refineTarget, setRefineTarget] = useState<{ type: AnalysisType; label: string } | null>(null);

  // 復元取得が返ってきた時点でユーザーが既に入力/実行を始めていたら復元しない
  const draftGuardRef = useRef(false);
  draftGuardRef.current = loading || results.size > 0 || !!inputText.trim();

  // マウント時に前回の実行結果（自動下書き）を復元。正はDB＝端末をまたいで復元できる
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadFeatureDraft<TextAnalysisDraftPayload>('text-analysis');
      if (cancelled || !draft?.payload) return;
      const entries = Object.entries(draft.payload.results ?? {}) as [
        AnalysisType,
        string,
      ][];
      if (entries.length === 0) return;
      if (draftGuardRef.current) return;
      setInputText(draft.payload.inputText ?? '');
      setPurpose(draft.payload.purpose ?? '');
      setResults(new Map(entries));
      setResultModels(
        new Map(
          Object.entries(draft.payload.models ?? {}) as [AnalysisType, AIModel][],
        ),
      );
      setAnalysisDone(true);
      setRestoredAt(draft.updated_at);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 「クリア」= 下書き削除 + 画面を新規状態に戻す（復元は表示のみで副作用なし）
  const handleClearDraft = () => {
    setRestoredAt(null);
    setInputText('');
    setPurpose('');
    setResults(new Map());
    setResultModels(new Map());
    setSaveStates(new Map());
    setAnalysisDone(false);
    titleCacheRef.current.clear(); // 216: 結果が消えるためタイトルキャッシュも破棄
    clearFeatureDraft('text-analysis');
  };

  const analyzeOne = async (
    type: AnalysisType,
    text: string,
  ): Promise<{ text: string; model: AIModel }> => {
    // リクエスト送信時のモデルを固定（途中で切替えられても結果に影響しないように）
    const modelAtRequest = getSavedModel();
    setResultModels((prev) => new Map(prev).set(type, modelAtRequest));
    const res = await fetch('/api/text-analysis/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        type,
        purpose,
        targetLength: typeLengths[type] || '',
        model: modelAtRequest,
        gsTarget,
        gsLevel,
        gsPurpose,
        gsTone,
        gsNotes,
      }),
    });
    if (!res.body) throw new Error('レスポンスボディがありません');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'delta') {
            fullText += data.text;
            setResults((prev) => new Map(prev).set(type, fullText));
          } else if (data.type === 'error') {
            throw new Error(data.message || '分析エラー');
          }
        } catch {
          // JSON parse失敗は無視
        }
      }
    }
    return { text: fullText, model: modelAtRequest };
  };

  const handleAnalyze = async () => {
    if (!inputText.trim()) {
      showToast('分析するテキストを入力してください', 'warning');
      return;
    }
    if (selectedTypes.size === 0) {
      showToast('分析タイプを1つ以上選択してください', 'warning');
      return;
    }
    const types = Array.from(selectedTypes);
    setLoading(true);
    setAnalysisDone(false); // 再分析開始時にリセット
    setResults(new Map());
    setResultModels(new Map());
    setSaveStates(new Map()); // 本文が総入れ替えになるので保存状態も未保存へ
    // 216追加指示: 再分析時はタイトルキャッシュを破棄（旧タイトルが新しい結果に付かないように）
    titleCacheRef.current.clear();
    // 完了した結果を自動下書き保存するためのローカル収集（エラー中断時は完了分のみ）
    const collected: Record<string, string> = {};
    const collectedModels: Record<string, AIModel> = {};
    try {
      for (let i = 0; i < types.length; i++) {
        const label = ANALYSIS_OPTIONS.find((o) => o.value === types[i])?.label;
        setProgress(`(${i + 1}/${types.length}) ${label} 分析中...`);
        const done = await analyzeOne(types[i], inputText);
        collected[types[i]] = done.text;
        collectedModels[types[i]] = done.model;
      }
      showToast('分析が完了しました', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '分析に失敗しました';
      showToast(msg, 'error');
    } finally {
      // 全タイプの実行が終わった時点で完了（エラー終了も「終了」として表示）
      setLoading(false);
      setProgress('');
      setAnalysisDone(true);
      // 生成完了時に自動UPSERT（押し忘れても結果が失われない。手動保存とは別物）
      if (Object.keys(collected).length > 0) {
        setRestoredAt(null); // 新規実行結果は「復元」ではない
        saveFeatureDraft('text-analysis', {
          inputText,
          purpose,
          results: collected,
          models: collectedModels,
        });
        // 247: 生成完了時に自動ストック保存（既定ON／🎛表示設定でOFFにできる）。
        // 自動下書き（feature_result_drafts）とは別物＝こちらは手動と同じ🗂保存一覧に入る。
        // 失敗しても結果は画面に残り、カードの ⚠️ ボタンから再試行できる（R-39）
        if (isAutoStockSaveEnabled()) void autoStockSave(collected);
      }
    }
  };

  // 生成完了分をまとめてストックへ自動保存する（保存APIの直列呼び出し＝順序と件数を数えられる形）
  const autoStockSave = async (collected: Record<string, string>) => {
    const entries = Object.entries(collected) as [AnalysisType, string][];
    let ok = 0;
    for (const [type, text] of entries) {
      if (!text.trim()) continue;
      if (await saveResult(type, text, { silent: true })) ok++;
    }
    if (ok === entries.length) {
      showToast(`ストックに自動保存しました（${ok}件）`, 'success');
    } else if (ok > 0) {
      showToast(
        `自動保存: ${ok}/${entries.length}件。失敗分は「⚠️ 保存に失敗・再試行」から保存できます`,
        'warning',
      );
    } else {
      showToast(
        '自動保存に失敗しました。結果は画面に残っています（⚠️ ボタンから再試行できます）',
        'error',
      );
    }
  };

  // 322 §3-2: ➡ 送る の中身（既存の仕組みだけ・新しい生成経路なし）
  const [favoriteDone, setFavoriteDone] = useState<Set<AnalysisType>>(new Set());
  const [contextSavingType, setContextSavingType] = useState<AnalysisType | null>(null);
  /** 再分析＝この本文を入力欄に入れて、分析タイプを選び直してもらう（上へスクロール） */
  const reanalyzeFrom = (text: string) => {
    setInputText(text);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    showToast('結果を入力欄に入れました。分析タイプを選んで実行してください', 'success');
  };
  /** 文章作成に使う（🔭DR の sendToWrite と同じ受け渡し） */
  const sendToWrite = (text: string) => {
    try { localStorage.setItem('lumina_research_context', text); } catch {}
    window.location.href = '/dashboard/write';
  };
  /** AI参照素材として保存（🧠 context_saves・既存 API） */
  const saveAsContext = async (type: AnalysisType, text: string) => {
    if (!text || contextSavingType) return;
    const label = ANALYSIS_OPTIONS.find((o) => o.value === type)?.label ?? type;
    setContextSavingType(type);
    try {
      const res = await fetch('/api/context-saves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: `${label}: ${text.slice(0, 40).replace(/\s+/g, ' ')}`, contextText: text, tags: ['テキスト分析'] }) });
      if (!res.ok) throw new Error('保存に失敗しました');
      showToast('🧠 AI参照素材として保存しました', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存に失敗しました', 'error');
    } finally {
      setContextSavingType(null);
    }
  };
  /** ⭐ 保存済みの行をお気に入りに（saves API の toggle_favorite・保存済みのときだけ） */
  const favoriteSaved = async (type: AnalysisType) => {
    const id = savedIds.get(type);
    if (!id || favoriteDone.has(type)) return;
    try {
      const res = await fetch('/api/text-analysis/saves', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'toggle_favorite', id }) });
      if (!res.ok) throw new Error('お気に入りに追加できませんでした');
      setFavoriteDone((prev) => new Set(prev).add(type));
      showToast('⭐ お気に入りに追加しました', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'お気に入りに追加できませんでした', 'error');
    }
  };

  const saveResult = async (
    type: AnalysisType,
    text: string,
    opts?: { silent?: boolean },
  ): Promise<boolean> => {
    const label = ANALYSIS_OPTIONS.find((o) => o.value === type)?.label ?? type;
    setGeneratingTitle(type);
    setSaveState(type, 'saving');
    try {
      // R-39: タイトル生成はAI。失敗・タイムアウトでも fallback が返るので保存自体は止まらない
      const fallback = `${label}_${new Date().toLocaleDateString('ja-JP')}`;
      const autoTitle = await getOrGenerateTitle(type, text, label, fallback);

      const res = await fetch('/api/text-analysis/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: autoTitle,
          autoTitle,
          analysisType: type,
          analysisLabel: label,
          content: text,
          tags: [],
          folder: '',
          charCount: text.length,
          // 分析した元の入力テキストを一緒に保存（空なら送らない＝APIでNULL扱い）
          inputText: inputText.trim() ? inputText : undefined,
          // 311: マンダラからの発注なら付帯情報を渡す（保存APIがマスへ紐づける・無ければ送らない）
          ...(mandala ? { mandala } : {}),
        }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      const saved = await res.json();
      onSaved?.(saved);
      setSaveState(type, 'saved');
      const savedRowId = Number(saved?.save?.id ?? saved?.id);
      if (Number.isFinite(savedRowId)) setSavedIds((prev) => new Map(prev).set(type, savedRowId));
      setFavoriteDone((prev) => { const n = new Set(prev); n.delete(type); return n; }); // 322: 新しい行なので⭐は付け直せる
      // 自動保存はカード単位のトーストを出さない（件数分は騒がしいので実行側でまとめて1回出す）
      if (!opts?.silent) showToast(`「${autoTitle}」として保存しました`, 'success');
      return true;
    } catch (err) {
      // 247/R-39: 保存に失敗しても結果は画面に残す。⚠️ボタンから手動で再試行できる
      setSaveState(type, 'error');
      const msg = err instanceof Error ? err.message : '保存に失敗しました';
      if (!opts?.silent) showToast(msg, 'error');
      return false;
    } finally {
      setGeneratingTitle(null);
    }
  };

  // ファイル内に挿入する「生成AI: ...」表記（モデル未記録の旧データは出力なし）
  const modelLineTxt = (model: AIModel | undefined) =>
    model ? `[生成AI: ${getModelIcon(model)} ${getModelLabel(model)}]\n\n---\n\n` : '';
  const modelLineMd = (model: AIModel | undefined) =>
    model ? `> 生成AI: ${getModelIcon(model)} ${getModelLabel(model)}\n\n---\n\n` : '';

  const downloadTxt = async (type: AnalysisType, text: string) => {
    const label = ANALYSIS_OPTIONS.find((o) => o.value === type)?.label ?? type;
    setGeneratingTitle(type);
    try {
      const autoTitle = await getOrGenerateTitle(type, text, label, label);
      const title = sanitizeFilename(autoTitle);
      const model = resultModels.get(type);
      const content = `${autoTitle}\n\n${modelLineTxt(model)}${sanitizeLatex(text)}`;
      // .txt は Markdown 記号を除去した読みやすいプレーンテキストへ変換して書き出す
      triggerDownload(
        `${title}_${yyyymmdd()}.txt`,
        markdownToReadableText(content),
        'text/plain;charset=utf-8',
      );
    } finally {
      setGeneratingTitle(null);
    }
  };

  const downloadMd = async (type: AnalysisType, text: string) => {
    const label = ANALYSIS_OPTIONS.find((o) => o.value === type)?.label ?? type;
    setGeneratingTitle(type);
    try {
      const autoTitle = await getOrGenerateTitle(type, text, label, label);
      const title = sanitizeFilename(autoTitle);
      const model = resultModels.get(type);
      const content = `# ${autoTitle}\n\n${modelLineMd(model)}${sanitizeLatex(text)}`;
      triggerDownload(`${title}_${yyyymmdd()}.md`, content, 'text/markdown;charset=utf-8');
    } finally {
      setGeneratingTitle(null);
    }
  };

  // Word(.docx) 出力。タイトル生成・sanitizeLatex・ファイル名規則は txt/MD と同一。
  // markdown→docx 変換は共通関数（markdownToDocx.ts）に集約。docx はバンドルが大きいため
  // dynamic import。AI は一切通さず、アプリ側の機械変換のみ（152：数値を作り直させない）。
  const downloadDocx = async (type: AnalysisType, text: string) => {
    const label = ANALYSIS_OPTIONS.find((o) => o.value === type)?.label ?? type;
    setGeneratingTitle(type);
    try {
      const autoTitle = await getOrGenerateTitle(type, text, label, label);
      const title = sanitizeFilename(autoTitle);
      const model = resultModels.get(type);
      const metaLines = model
        ? [`生成AI: ${getModelIcon(model)} ${getModelLabel(model)}`]
        : [];
      const { downloadMarkdownAsDocx } = await import('@/lib/markdownToDocx');
      await downloadMarkdownAsDocx({
        title: autoTitle,
        metaLines,
        markdown: sanitizeLatex(text),
        fileName: `${title}_${yyyymmdd()}.docx`,
      });
    } finally {
      setGeneratingTitle(null);
    }
  };

  const simplifyText = async (type: AnalysisType, text: string) => {
    setSimplifying(type);
    try {
      const res = await fetch('/api/simplifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, level: 'general', addExamples: false }),
      });
      if (res.ok) {
        const data = await res.json();
        const simplified = data.converted_text;
        if (simplified) {
          const next = new Map(results).set(type, simplified);
          setResults(next);
          // 216: 本文が変わったためこのtypeのタイトルキャッシュを破棄
          titleCacheRef.current.delete(type);
          setSaveState(type, 'idle'); // 247: 本文が変わったので「保存済み」を解除＝また保存できる
          // 変換後の内容で自動下書きも更新（復元時に表示中の内容と揃える）
          saveFeatureDraft('text-analysis', {
            inputText,
            purpose,
            results: Object.fromEntries(next),
            models: Object.fromEntries(resultModels),
          });
          showToast('わかりやすく変換しました', 'success');
        } else {
          showToast('変換結果が空でした', 'warning');
        }
      } else {
        showToast('変換に失敗しました', 'error');
      }
    } catch {
      showToast('変換に失敗しました', 'error');
    } finally {
      setSimplifying(null);
    }
  };

  // ── 247: 「✕ クリア」の Undo ─────────────────────────────
  // クリアは破壊的だが、確認ダイアログを挟むと「キーで速く消す」目的が消える。
  // そこで消した内容を10秒だけ持っておき、「↩ 元に戻す」で戻せるようにする。
  // ボタン押下でもキー（⌘⌫）でも同じ経路を通す＝挙動が分かれない
  const [clearedText, setClearedText] = useState<string | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const stopUndoTimer = () => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };
  const handleClearInput = () => {
    if (!inputText) return;
    setClearedText(inputText);
    setInputText('');
    setAnalysisDone(false);
    stopUndoTimer();
    undoTimerRef.current = window.setTimeout(() => setClearedText(null), 10000);
  };
  const handleUndoClear = () => {
    if (clearedText === null) return;
    setInputText(clearedText);
    setClearedText(null);
    stopUndoTimer();
  };
  useEffect(() => stopUndoTimer, []);
  // 254/270/313再改訂: クリアして貼付（ボタンとキー ⌘⇧V で同じ関数を通す）。
  // 読み取りに成功してからクリア→貼付（R-76）。読めなければ入力はそのまま・Undo も出さない
  const [pasting, setPasting] = useState(false);
  // 332【A】: 「クリアして貼付」の案内。トースト（fixed・画面右下）ではなく**操作行の直下**に
  // 差し込む＝ボタンの上に載らない（出ると下の要素が押し下がるだけ）。✕ で閉じられる。
  // 成功だけ数秒で自動的に消す（覆わないので消える前提にできる）。警告は自分で閉じるまで残す
  const [pasteNotice, setPasteNotice] = useState<
    { text: string; kind: 'success' | 'warning' } | null
  >(null);
  const noticeTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
    if (pasteNotice?.kind !== 'success') return;
    noticeTimerRef.current = window.setTimeout(() => setPasteNotice(null), 3000);
    return () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    };
  }, [pasteNotice]);
  // 332【B】: カーソルのある端末か（SSR中は fine 扱い＝デスクトップは現状維持）
  const { fine: finePointer } = useFinePointer();
  const handleClearAndPaste = async () => {
    if (pasting || loading) return;
    setPasting(true);
    try {
      const result = await clearAndPaste({
        current: inputText,
        setText: (next) => {
          setInputText(next);
          setAnalysisDone(false);
        },
        textareaRef: inputRef,
        backup: (text) => {
          setClearedText(text);
          stopUndoTimer();
          undoTimerRef.current = window.setTimeout(() => setClearedText(null), 10000);
        },
      });
      // 332【A】: 案内は**操作行の下に差し込む**（トーストは画面右下の固定表示で、
      // iPhone幅では操作行に重なってボタンが押せなくなっていた）。
      // 332【B】: 文言は端末で出し分ける（⌘V／長押しして「ペースト」）
      const msg = clearPasteMessage(result, finePointer);
      setPasteNotice({ text: msg.text, kind: msg.kind === 'success' ? 'success' : 'warning' });
    } finally {
      setPasting(false);
    }
  };

  // ── 258【1】: 「その他の分析タイプ」の開閉 ──────────────────
  // 既定は閉じる。開閉は**保存しない**——「すっきりさせたい」が要望の中身なので、
  // 前回開いたまま次も開いていると元の状態に戻ってしまう。
  // 畳んだ側に選択が残っていても分かるよう、見出しにバッジを出す（要件2）。
  const [moreOpen, setMoreOpen] = useState(false);
  const hiddenSelected = SECONDARY_ANALYSIS_OPTIONS.filter((o) => selectedTypes.has(o.value));

  // ── 270: この画面は全端末で3ボタン（✕ クリア／📋 ペースト／📋 クリアして貼付）──────
  // 258は「iOSでは📋クリアして貼付を出さない（確認が何段も出るため）」としていたが、
  // 270で**デスクトップと操作を揃える**という院長判断により上書きした（2026/8/26）。
  // iOSの確認ポップアップはApple仕様で消せない——それは**受け入れたうえで**ボタンを置く
  // （R-61に反しない。ポップアップを回避する方法は探さない）。
  // 事故（キャンセルで本文が消える）は lib/clear-and-paste.ts の順序で防いでいる（R-76）。
  //
  // 255の「貼り付けで置き換える」設定は、260でiOSから📋クリアして貼付を撤去した
  // **代替**として置かれたもの。3ボタンが揃った以上この画面では役目が終わっているので、
  // ここでは参照しない（設定値は消さない＝🔭ディープリサーチでは従来どおり効く）。

  // ── 254: 「📋 クリアして貼付」 ─────────────────────────────
  // クリア→⌘V の2手を1手に。消えた内容は247と同じ Undo（10秒）で戻せる。
  // ボタンでもキー（⌘⇧V）でもこの関数を通す＝挙動が分かれない。
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // 313再改訂: クリアして貼付（254/270）を復元＝上の handleClearAndPaste（R-76: 読み取り成功→クリア→貼付）。末尾追記の「📋 ペースト」は🗂に置かない

  // ── 332【D】: 分析対象テキスト欄の高さ（S／M／L／自動）──────────────
  // 既定は M（約12行）。選択は端末に記憶（313/320と同じ localStorage）。
  // SSRとの描画差異を作らないため、保存値の読み出しはマウント後に行う（既定で描いてから差し替える）
  const [inputHeight, setInputHeight] = useState<TextareaHeightChoice>(TA_HEIGHT_DEFAULT);
  useEffect(() => {
    setInputHeight(loadTextareaHeight());
  }, []);
  const heightStyle = textareaHeightStyle(inputHeight);
  const changeInputHeight = (next: TextareaHeightChoice) => {
    setInputHeight(next);
    saveTextareaHeight(next);
  };
  // 「自動」だけは内容に合わせて伸ばす（上限は画面の60%＝ここを超えたら中でスクロールする）。
  // S／M／L は rows 属性に任せる＝ブラウザが行の高さから計算する（🔤文字サイズにも追随する）
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!heightStyle.auto) {
      el.style.height = '';
      el.style.maxHeight = '';
      return;
    }
    el.style.height = 'auto';
    el.style.maxHeight = `${autoHeightPx(Number.MAX_SAFE_INTEGER, window.innerHeight)}px`;
    el.style.height = `${autoHeightPx(el.scrollHeight, window.innerHeight)}px`;
  }, [heightStyle.auto, inputText]);

  // 247: ⌘/Ctrl+Enter=分析実行 / ⌘/Ctrl+Backspace=入力クリア（248で2キー化）。
  // panelRef の可視判定で、タブ切替（display:none）中は発火しない。
  // 「✏️ AIで修正」モーダル表示中も発火しない（refineTarget）
  const panelRef = useRef<HTMLDivElement>(null);
  const canAnalyze = !loading && !!inputText.trim() && selectedTypes.size > 0;
  const runReason = runDisabledReason({ loading, hasText: !!inputText.trim(), typeCount: selectedTypes.size });
  useRunShortcut({
    containerRef: panelRef,
    active: !refineTarget,
    canRun: canAnalyze,
    onRun: () => void handleAnalyze(),
    canClear: !!inputText,
    onClear: handleClearInput,
    // 254/313再改訂: ⌘⇧V＝クリアして貼付。入力が空でも「貼るだけ」に使えるので、クリアとは別条件（実行中だけ止める）
    canClearPaste: !loading,
    onClearPaste: () => void handleClearAndPaste(),
  });
  const keyHints = useRunKeyHints();

  // 追加修正（169）: 対象カードと、そのテキストを差し替える適用処理
  const applyRefine = (type: AnalysisType, newText: string) => {
    const next = new Map(results).set(type, newText);
    setResults(next);
    // 216: 本文が変わったためこのtypeのタイトルキャッシュを破棄
    titleCacheRef.current.delete(type);
    setSaveState(type, 'idle'); // 247: 本文が変わったので「保存済み」を解除＝また保存できる
    // 修正後の内容で自動下書きも更新（simplifyText と同じ扱い＝表示中の内容と揃える）
    saveFeatureDraft('text-analysis', {
      inputText,
      purpose,
      results: Object.fromEntries(next),
      models: Object.fromEntries(resultModels),
    });
  };

  // 258: 分析タイプ1件分の描画。常時表示の2件と折りたたみ側で**同じ描画**を使うため、
  // map のコールバックから関数へ切り出した（2箇所に書き写すと片方だけ直る事故になる）
  const renderAnalysisOption = (opt: AnalysisOption) => {
    const checked = selectedTypes.has(opt.value);
    const isGsSlide = opt.value === 'genspark_slide';
    return (
      <div key={opt.value}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              flex: 1,
              fontSize: 13,
              color: 'var(--text-primary)',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                setSelectedTypes((prev) => {
                  const next = new Set(prev);
                  if (next.has(opt.value)) next.delete(opt.value);
                  else next.add(opt.value);
                  return next;
                });
              }}
              style={{ accentColor: 'var(--accent)' }}
            />
            {opt.label}
          </label>

          {checked && (
            <select
              value={typeLengths[opt.value] || ''}
              onChange={(e) =>
                setTypeLengths((prev) => ({
                  ...prev,
                  [opt.value]: e.target.value,
                }))
              }
              style={selectStyle()}
            >
              <option value="">文字数指定なし</option>
              <option value="200">200字</option>
              <option value="400">400字</option>
              <option value="600">600字</option>
              <option value="1000">1000字</option>
              <option value="2000">2000字</option>
              <option value="3000">3000字</option>
            </select>
          )}
        </div>

        {isGsSlide && checked && (
          <div
            style={{
              marginTop: 8,
              marginLeft: 24,
              padding: 12,
              borderRadius: 12,
              border: '1px solid rgba(108,99,255,0.3)',
              background: 'rgba(108,99,255,0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--accent)',
                margin: 0,
              }}
            >
              🎯 Gensparkプレゼン設定
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 8,
              }}
            >
              {[
                {
                  label: '聴講ターゲット',
                  value: gsTarget,
                  set: setGsTarget,
                  opts: TARGET_OPTIONS,
                },
                {
                  label: '内容レベル',
                  value: gsLevel,
                  set: setGsLevel,
                  opts: LEVEL_OPTIONS,
                },
                {
                  label: 'プレゼンの目的',
                  value: gsPurpose,
                  set: setGsPurpose,
                  opts: PURPOSE_OPTIONS,
                },
                {
                  label: 'スライドのトーン',
                  value: gsTone,
                  set: setGsTone,
                  opts: TONE_OPTIONS,
                },
              ].map((it) => (
                <div key={it.label}>
                  <label
                    style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      marginBottom: 4,
                      display: 'block',
                    }}
                  >
                    {it.label}
                  </label>
                  <select
                    value={it.value}
                    onChange={(e) => it.set(e.target.value)}
                    style={{ ...selectStyle(), width: '100%' }}
                  >
                    {it.opts.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div>
              <label
                style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  marginBottom: 4,
                  display: 'block',
                }}
              >
                追加要望（任意）
              </label>
              <textarea
                value={gsNotes}
                onChange={(e) => setGsNotes(e.target.value)}
                placeholder="スライドへの追加要望..."
                rows={2}
                style={{
                  width: '100%',
                  fontSize: 11,
                  padding: 6,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  resize: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // 313: 実行ボタンは**この1要素だけ**（狭幅は固定バー・広幅はテキスト欄の直下に置く）。ハンドラ・活性条件・件数表示は不変（R-88）
  const runButton = (
    <button
      type="button"
      data-kb-run
      onClick={handleAnalyze}
      disabled={!canAnalyze}
      title={runReason ?? (keyHints ? `分析を実行（${keyHints.run}）` : '分析を実行')}
      // 313改訂: 行の先頭の主ボタン＝他の2つ（クリア・ペースト）より大きく塗りつぶしで目立たせる
      style={{
        padding: '10px 22px',
        borderRadius: 10,
        background: 'var(--accent)',
        color: '#fff',
        border: 'none',
        fontSize: 14,
        fontWeight: 700,
        cursor: canAnalyze ? 'pointer' : 'not-allowed',
        opacity: canAnalyze ? 1 : 0.5,
        whiteSpace: 'nowrap',
        boxShadow: canAnalyze ? '0 4px 12px rgba(108,99,255,0.3)' : 'none',
      }}
    >
      {loading
        ? '⏳ 分析中...'
        : `🚀 ${selectedTypes.size}件を分析${keyHints ? ` ${keyHints.run}` : ''}`}
    </button>
  );

  return (
    <div ref={panelRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 自動下書きからの復元バナー */}
      {restoredAt && (
        <FeatureDraftBanner restoredAt={restoredAt} onClear={handleClearDraft} />
      )}

      {/* 入力テキスト */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          // 332【C】: 上部の圧縮。左右は据え置き、上だけ詰める
          padding: '10px 16px 16px',
        }}
      >
        {/* 332【C】: 「分析対象テキスト ✅分析終了」を1行に（左＝ラベルと状態バッジ・右＝高さの切替） */}
        <div
          data-ta-label-row
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 6,
            // 1行に収めるため折り返さない（入りきらないときはラベル側が縮む）
            flexWrap: 'nowrap',
            minWidth: 0,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.3,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              分析対象テキスト
            </label>
            {loading && (
              <span style={{ fontSize: 11, lineHeight: 1.3, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                🔄 分析中...
              </span>
            )}
            {!loading && analysisDone && (
              <span
                data-ta-done-badge
                style={{
                  fontSize: 10,
                  lineHeight: 1.3,
                  fontWeight: 700,
                  color: '#16a34a',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 999,
                  padding: '1px 8px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                ✅ 分析終了
              </span>
            )}
          </span>
          {/* 332【D】: 高さの切替。選んだ値は端末に記憶する（既定 M） */}
          <span
            data-ta-height
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
          >
            {TA_HEIGHT_CHOICES.map((c) => {
              const on = inputHeight === c;
              return (
                <button
                  key={c}
                  type="button"
                  data-ta-height-choice={c}
                  aria-pressed={on}
                  onClick={() => changeInputHeight(c)}
                  title={TA_HEIGHT_TITLE[c]}
                  style={{
                    padding: '1px 6px',
                    fontSize: 10,
                    lineHeight: 1.3,
                    fontWeight: on ? 700 : 500,
                    color: on ? '#fff' : 'var(--text-muted)',
                    background: on ? 'var(--accent)' : 'transparent',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {TA_HEIGHT_LABEL[c]}
                </button>
              );
            })}
          </span>
        </div>
        <textarea
          ref={inputRef}
          // 270: 貼り付けは常に「いつもどおり」（カーソル位置に入る）。
          // 置き換えたいときは 📋 クリアして貼付 ボタン／⌘⇧V を使う＝操作が二重化しない
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setAnalysisDone(false); // 入力変更で古い完了表示を消す
          }}
          placeholder="ここに分析したいテキストを貼り付けてください..."
          // 332【D】: 高さはプリセット（S/M/L/自動）。rows はブラウザに行数で計算させる
          rows={heightStyle.rows}
          style={{
            width: '100%',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            color: 'var(--text-primary)',
            fontSize: 16, // スマホ(iOS Safari)の自動ズーム防止のため16px以上
            // PCはドラッグでも変えられる（iOSでは効かないのでプリセットが主）。
            // 「自動」は次の入力で高さを入れ直すためドラッグを受け付けない
            resize: heightStyle.resize,
            fontFamily: 'inherit',
          }}
        />
        <div
          data-ta-action-row
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            // 270: 3ボタンになったので、狭い画面では文字数表示ごと折り返させる
            flexWrap: 'wrap',
            gap: 6,
            // 332【A】: 操作行の上下に余白（16px以上）。警告・iOSの「ペースト」確認が
            // 近づいてもボタンが埋もれないようにする
            marginTop: 16,
            marginBottom: 16,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <span>{inputText.length.toLocaleString()} 文字</span>
          {/* 313再改訂（院長判断 2026/9/9）: 🚀 n件を分析（主ボタン） → ✕ クリア → 📋 クリアして貼付 の順（狭幅・広幅とも同じ配置）。
              313改訂で置いた「📋 ペースト」（末尾追記）は🗂から外し、「📋 クリアして貼付」（254/270・R-76）を復元。
              スマホの幅では折り返させる——押せない位置に押し出すより、2行になる方が事故が小さい */}
          <span
            data-ta-actions
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {runButton}
            {progress && (
              <span data-ta-progress style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {progress}
              </span>
            )}
            {/* 247: クリア直後だけ出る Undo（10秒）。確認ダイアログの代わり */}
            {clearedText !== null && (
              <button
                type="button"
                onClick={handleUndoClear}
                title="クリアした入力を元に戻します（10秒間）"
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#fff',
                  background: '#B45309',
                  border: '1px solid transparent',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                ↩ 元に戻す
              </button>
            )}
            <button
              type="button"
              onClick={handleClearInput}
              disabled={!inputText}
              title={
                keyHints
                  ? `入力をクリア（${keyHints.clear}）／直後に「↩ 元に戻す」で戻せます`
                  : '入力をクリア（直後に「↩ 元に戻す」で戻せます）'
              }
              style={{
                padding: '4px 10px',
                fontSize: 12,
                color: inputText ? 'var(--text-secondary)' : 'var(--text-muted)',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                opacity: inputText ? 1 : 0.5,
                cursor: inputText ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
            >
              ✕ クリア{keyHints ? ` ${keyHints.clear}` : ''}
            </button>
            {/* 254/270/313再改訂: クリア→貼り付けの2手を1手に。全端末に出す。
                iOSで確認をキャンセルしても本文は消えない（clear-and-paste.ts・R-76） */}
            <button
              type="button"
              data-clear-paste
              onClick={() => void handleClearAndPaste()}
              disabled={pasting || loading}
              title={
                keyHints
                  ? `入力をクリアしてクリップボードを貼り付け（${keyHints.clearPaste}）／直後に「↩ 元に戻す」で戻せます`
                  : '入力をクリアしてクリップボードを貼り付け（読み取れなかったときは入力をそのままにします）'
              }
              style={{
                padding: '4px 10px',
                fontSize: 12,
                color: pasting || loading ? 'var(--text-muted)' : 'var(--text-secondary)',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                opacity: pasting || loading ? 0.5 : 1,
                cursor: pasting || loading ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {pasting ? '⏳ 貼付中...' : `📋 クリアして貼付${keyHints ? ` ${keyHints.clearPaste}` : ''}`}
            </button>
          </span>
        </div>

        {/* 332【A】: 「クリアして貼付」の案内は**操作行の下**（in-flow）。
            position: absolute/fixed を使わないので、出てもボタンの上に載らない＝常に押せる。
            出ると下の要素が押し下がるだけ（レイアウトが動く）。✕ で閉じられる */}
        {pasteNotice && (
          <div
            data-ta-paste-notice
            data-ta-paste-notice-kind={pasteNotice.kind}
            role="status"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              background:
                pasteNotice.kind === 'success' ? 'rgba(29,158,117,0.12)' : 'rgba(239,159,39,0.12)',
              border: `1px solid ${pasteNotice.kind === 'success' ? '#1D9E75' : '#EF9F27'}40`,
              color: pasteNotice.kind === 'success' ? '#1D9E75' : '#B45309',
            }}
          >
            <span style={{ flexShrink: 0 }}>{pasteNotice.kind === 'success' ? '✅' : '⚠️'}</span>
            <span style={{ minWidth: 0, flex: 1 }}>{pasteNotice.text}</span>
            <button
              type="button"
              data-ta-paste-notice-close
              onClick={() => setPasteNotice(null)}
              title="この案内を閉じます"
              aria-label="案内を閉じる"
              style={{
                flexShrink: 0,
                padding: '0 6px',
                fontSize: 12,
                lineHeight: 1.5,
                color: 'inherit',
                background: 'transparent',
                border: '1px solid currentColor',
                borderRadius: 6,
                opacity: 0.7,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 分析タイプ選択 */}
      <div
        data-ta-types
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <label
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            marginBottom: 10,
          }}
        >
          分析タイプ（複数選択可）
        </label>

        {/* 258: よく使う2つだけ常時表示。残りは「▶ その他の分析タイプ」に畳む。
            畳んだ側に選択が残っていても分かるよう、見出しにバッジを出す（指示書258【1】要件2） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PRIMARY_ANALYSIS_OPTIONS.map((opt) => renderAnalysisOption(opt))}
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            data-analysis-more-toggle
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textAlign: 'left',
            }}
          >
            <span style={{ width: 12, display: 'inline-block' }}>{moreOpen ? '▼' : '▶'}</span>
            <span>その他の分析タイプ</span>
            {/* 畳んだせいで選択に気づけない状態を作らない。選択中は名前まで出す */}
            {hiddenSelected.length > 0 && (
              <span
                data-analysis-more-badge
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  background: 'var(--accent)',
                  borderRadius: 999,
                  padding: '2px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
                選択中 {hiddenSelected.length}・{hiddenSelected.map((o) => o.label).join('／')}
              </span>
            )}
            {/* 目的もこの中に畳んでいるので、入っていることが分かるようにする */}
            {purpose.trim() !== '' && (
              <span
                data-analysis-purpose-badge
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  borderRadius: 999,
                  padding: '2px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
                目的あり
              </span>
            )}
          </button>

          {moreOpen && (
            <div
              data-analysis-more-body
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginTop: 10,
                paddingLeft: 6,
              }}
            >
              {SECONDARY_ANALYSIS_OPTIONS.map((opt) => renderAnalysisOption(opt))}

              {/* 共通の目的（任意） */}
              <div style={{ marginTop: 6 }}>
                <label
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginBottom: 4,
                    display: 'block',
                  }}
                >
                  目的・コンテキスト（任意）
                </label>
                <input
                  type="text"
                  data-analysis-purpose
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="例: 院内ミーティング用、新人研修用..."
                  style={{
                    width: '100%',
                    fontSize: 12,
                    padding: 8,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 結果グリッド */}
      {results.size > 0 && (
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns:
              results.size >= 2
                ? 'repeat(auto-fit, minmax(360px, 1fr))'
                : '1fr',
          }}
        >
          {Array.from(results.entries()).map(([type, text]) => (
            <ResultPanel
              key={type}
              type={type}
              label={
                ANALYSIS_OPTIONS.find((o) => o.value === type)?.label ?? type
              }
              text={text}
              model={resultModels.get(type)}
              isStreaming={loading}
              simplifying={simplifying === type}
              generatingTitle={generatingTitle === type}
              saveStatus={saveStates.get(type) ?? 'idle'}
              savedId={savedIds.get(type) ?? null}
              onSave={() => void saveResult(type, text)}
              // 322: ➡ 送る・⭐（新しい生成経路は作らない）
              onReanalyze={() => reanalyzeFrom(text)}
              onSendToWrite={() => sendToWrite(text)}
              onSaveContext={() => void saveAsContext(type, text)}
              onFavorite={() => void favoriteSaved(type)}
              favoriteDone={favoriteDone.has(type)}
              contextSaving={contextSavingType === type}
              onCopy={() => {
                // コピー内容にも LaTeX 正規化を適用（$\rightarrow$ 等を残さない）
                copyRichMarkdown(sanitizeLatex(text));
                showToast('コピーしました', 'success');
              }}
              onDownloadTxt={() => downloadTxt(type, text)}
              onDownloadMd={() => downloadMd(type, text)}
              onDownloadDocx={() => downloadDocx(type, text)}
              onSimplify={() => simplifyText(type, text)}
              onRefine={() =>
                setRefineTarget({
                  type,
                  label: ANALYSIS_OPTIONS.find((o) => o.value === type)?.label ?? type,
                })
              }
            />
          ))}
        </div>
      )}

      {/* 追加修正（169）: 対象カードの結果テキストをその場で直す */}
      <TextRefinePanel
        open={!!refineTarget}
        onClose={() => setRefineTarget(null)}
        sourceText={refineTarget ? results.get(refineTarget.type) ?? '' : ''}
        sourceLabel={refineTarget?.label}
        onApply={(newText) => {
          if (refineTarget) applyRefine(refineTarget.type, newText);
        }}
      />
    </div>
  );
}

function selectStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '4px 8px',
    background: 'var(--input-bg)',
    color: 'var(--text-primary)',
  };
}
