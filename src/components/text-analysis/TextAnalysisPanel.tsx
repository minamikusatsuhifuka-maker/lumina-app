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
import { useRunKeyHints, useRunShortcut } from '@/lib/shortcuts';
// 254: クリアして貼付（ボタンとキーで同じ関数を通す）
import { clearAndPaste, CLEAR_PASTE_MESSAGE } from '@/lib/clear-and-paste';
// 255: 「貼り付けたら前の内容を置き換える」（iOSで追加タップを出さずに1操作にする）
import { applyReplacePaste, usePasteReplace } from '@/lib/paste-replace';
// 258: 「📋 クリアして貼付」を出すかの判定（iOSは押すと確認が何段も出るので出さない）
import { useFinePointer } from '@/lib/pointer-device';
// 259: iOSの「クリア」と「ペースト」を別操作にする2部品（長押し貼り付け欄／📋 ペースト）
import { PasteButton } from '@/components/TouchPaste';
import { isAutoStockSaveEnabled } from '@/lib/auto-stock-save';

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
  onSave: () => void;
  onCopy: () => void;
  onDownloadTxt: () => void;
  onDownloadMd: () => void;
  onDownloadDocx: () => void;
  onSimplify: () => void;
  onRefine: () => void;
}

function ResultPanel({
  label,
  text,
  model,
  isStreaming,
  simplifying,
  generatingTitle,
  saveStatus,
  onSave,
  onCopy,
  onDownloadTxt,
  onDownloadMd,
  onDownloadDocx,
  onSimplify,
  onRefine,
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
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
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

      {/* 高さプリセット */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 4 }}>
          高さ:
        </span>
        {HEIGHT_PRESETS.map(({ label: l, h }) => (
          <button
            key={l}
            type="button"
            onClick={() => setPanelHeight(h)}
            style={{
              padding: '2px 8px',
              fontSize: 10,
              borderRadius: 4,
              border: '1px solid',
              borderColor:
                panelHeight === h ? 'var(--accent)' : 'var(--border)',
              background: panelHeight === h ? 'var(--accent)' : 'transparent',
              color:
                panelHeight === h ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {l}
          </button>
        ))}
        {/* 215: 「全」＝全画面ビューア（S/M/L と違い高さは変えない＝閉じたら元の高さのまま） */}
        <button
          type="button"
          onClick={() => setReaderOpen(true)}
          disabled={!text}
          style={{
            padding: '2px 8px',
            fontSize: 10,
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: text ? 'pointer' : 'default',
            opacity: text ? 1 : 0.5,
            transition: 'all 0.15s',
          }}
        >
          全
        </button>
      </div>

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

      {/* アクション */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          borderTop: '1px solid var(--border)',
          paddingTop: 10,
        }}
      >
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
        <button
          type="button"
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
        <button
          type="button"
          onClick={onSimplify}
          disabled={!text || simplifying}
          style={btnStyle('success')}
        >
          {simplifying ? '⏳ 変換中...' : '✨ わかりやすく変換'}
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
        }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      const saved = await res.json();
      onSaved?.(saved);
      setSaveState(type, 'saved');
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

  // ── 258【1】: 「その他の分析タイプ」の開閉 ──────────────────
  // 既定は閉じる。開閉は**保存しない**——「すっきりさせたい」が要望の中身なので、
  // 前回開いたまま次も開いていると元の状態に戻ってしまう。
  // 畳んだ側に選択が残っていても分かるよう、見出しにバッジを出す（要件2）。
  const [moreOpen, setMoreOpen] = useState(false);
  const hiddenSelected = SECONDARY_ANALYSIS_OPTIONS.filter((o) => selectedTypes.has(o.value));

  // ── 255: 貼り付けで置き換え（設定ON時のみ）──────────────────
  // ユーザーが普段どおり貼り付けた瞬間に置き換える＝iOSでも追加のタップが出ない。
  // clipboardData はイベント内なら権限なしで読める（実測済み）。
  const pasteReplace = usePasteReplace();
  // 258【2】: カーソルの無い端末（iPhone等）では「📋 クリアして貼付」を出さない。
  // このボタンは navigator.clipboard.readText() を通るため、iOSでは
  // 「ペーストを許可しますか」→「許可」→「ペースト」と確認が重なり、押すほど手数が増える
  // （Appleの仕様でアプリ側からは消せない）。**ボタンを残す限り多段は避けられない**ので、
  // 代わりに255の「長押し→ペーストで置き換え」を主経路にする。
  const pointer = useFinePointer();
  const showClearPasteButton = pointer.mounted && pointer.fine;

  // ── 254: 「📋 クリアして貼付」 ─────────────────────────────
  // クリア→⌘V の2手を1手に。消えた内容は247と同じ Undo（10秒）で戻せる。
  // ボタンでもキー（⌘⇧V）でもこの関数を通す＝挙動が分かれない。
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [pasting, setPasting] = useState(false);
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
      const msg = CLEAR_PASTE_MESSAGE[result];
      if (msg) showToast(msg.text, msg.kind === 'success' ? 'success' : 'warning');
    } finally {
      setPasting(false);
    }
  };

  // 247: ⌘/Ctrl+Enter=分析実行 / ⌘/Ctrl+Backspace=入力クリア（248で2キー化）。
  // panelRef の可視判定で、タブ切替（display:none）中は発火しない。
  // 「✏️ AIで修正」モーダル表示中も発火しない（refineTarget）
  const panelRef = useRef<HTMLDivElement>(null);
  const canAnalyze = !loading && !!inputText.trim() && selectedTypes.size > 0;
  useRunShortcut({
    containerRef: panelRef,
    active: !refineTarget,
    canRun: canAnalyze,
    onRun: () => void handleAnalyze(),
    canClear: !!inputText,
    onClear: handleClearInput,
    // 254: 入力が空でも「貼るだけ」に使えるので、クリアとは別条件（実行中だけ止める）
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
          padding: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <label
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-secondary)',
            }}
          >
            分析対象テキスト
          </label>
          {loading && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              🔄 分析中...
            </span>
          )}
          {!loading && analysisDone && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#16a34a',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 999,
                padding: '2px 10px',
              }}
            >
              ✅ 分析終了
            </span>
          )}
        </div>
        <textarea
          ref={inputRef}
          onPaste={(e) => {
            // 255: 設定ONのときだけ「置き換え」に変える。OFFなら何もしない＝通常の貼り付け
            const replaced = applyReplacePaste({
              enabled: pasteReplace.enabled,
              current: inputText,
              clipboardText: e.clipboardData?.getData('text/plain') ?? '',
              setText: (next) => {
                setInputText(next);
                setAnalysisDone(false);
              },
              backup: (text) => {
                setClearedText(text);
                stopUndoTimer();
                undoTimerRef.current = window.setTimeout(() => setClearedText(null), 10000);
              },
            });
            if (replaced) e.preventDefault();
          }}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setAnalysisDone(false); // 入力変更で古い完了表示を消す
          }}
          placeholder="ここに分析したいテキストを貼り付けてください..."
          rows={8}
          style={{
            width: '100%',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            color: 'var(--text-primary)',
            fontSize: 16, // スマホ(iOS Safari)の自動ズーム防止のため16px以上
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 6,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <span>{inputText.length.toLocaleString()} 文字</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
            {/* 254: クリア→貼り付けの2手を1手に。既存の「✕ クリア」は残す
                （クリアだけしたい場面もあるため）
                258: カーソルのある端末だけに出す（iOSは押すほど確認が増えるため） */}
            {showClearPasteButton && (
            <button
              type="button"
              data-clear-paste
              onClick={() => void handleClearAndPaste()}
              disabled={pasting || loading}
              title={
                (keyHints
                  ? `入力をクリアしてクリップボードを貼り付け（${keyHints.clearPaste}）／直後に「↩ 元に戻す」で戻せます`
                  : '入力をクリアしてクリップボードを貼り付け（直後に「↩ 元に戻す」で戻せます）') +
                // 255: iPhoneではこのボタンだと確認が入って2タップになる。1操作にする道を案内する
                (pasteReplace.enabled
                  ? ''
                  : '／🎛表示設定の「貼り付けで置き換える」をONにすると、普通に貼り付けるだけで置き換わります（iPhoneでも1操作）')
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
            )}
            {/* 259/260: カーソルの無い端末には「📋 ペースト」を置く（クリアとペーストを別操作に）。
                260でこれ1本に一本化した——編集可能な貼り付け欄はタップでキーボードが出て
                位置がずれるため（部品側で端末を見て出し分ける） */}
            <PasteButton
              value={inputText}
              setValue={(next) => {
                setInputText(next);
                setAnalysisDone(false);
              }}
              targetRef={inputRef}
              disabled={loading}
              notify={(text, kind) => showToast(text, kind)}
            />
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
              }}
            >
              ✕ クリア{keyHints ? ` ${keyHints.clear}` : ''}
            </button>
          </span>
        </div>
      </div>

      {/* 分析タイプ選択 */}
      <div
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

      {/* 実行ボタン */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          data-kb-run
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          title={keyHints ? `分析を実行（${keyHints.run}）` : '分析を実行'}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: canAnalyze ? 'pointer' : 'not-allowed',
            opacity: canAnalyze ? 1 : 0.5,
          }}
        >
          {loading
            ? '⏳ 分析中...'
            : `🚀 ${selectedTypes.size}件を分析${keyHints ? ` ${keyHints.run}` : ''}`}
        </button>
        {progress && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {progress}
          </span>
        )}
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
              onSave={() => void saveResult(type, text)}
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
