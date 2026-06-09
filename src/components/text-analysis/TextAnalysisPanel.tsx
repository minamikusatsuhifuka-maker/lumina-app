'use client';

import { useEffect, useState } from 'react';
import {
  AnalysisType,
  ANALYSIS_OPTIONS,
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
import { renderMarkdown } from '@/lib/markdown-renderer';
import {
  generateTitleWithTimeout,
  sanitizeFilename,
  yyyymmdd,
} from '@/lib/title-generator';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { triggerDownload } from '@/lib/download';

const HEIGHT_PRESETS = [
  { label: 'S', h: 200 },
  { label: 'M', h: 350 },
  { label: 'L', h: 500 },
  { label: '全', h: 9999 },
];

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
  // 保存成功時は true、失敗時は false を返す（state 制御のため）
  onSave: () => Promise<boolean> | boolean | void;
  onCopy: () => void;
  onDownloadTxt: () => void;
  onDownloadMd: () => void;
  onSimplify: () => void;
}

function ResultPanel({
  label,
  text,
  model,
  isStreaming,
  simplifying,
  generatingTitle,
  onSave,
  onCopy,
  onDownloadTxt,
  onDownloadMd,
  onSimplify,
}: ResultPanelProps) {
  const [panelHeight, setPanelHeight] = useState(350);
  // 保存成功フィードバック（3秒間「✅ 保存済」表示）
  const [saved, setSaved] = useState(false);
  const currentLength = text.length;

  const handleSave = async () => {
    try {
      const result = await onSave();
      // 戻り値が undefined（void） or true なら成功扱い、false なら失敗扱い
      if (result !== false) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // 親側で error トーストを出しているのでここでは何もしない（重複防止）
    }
  };

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
          height: panelHeight === 9999 ? 'auto' : panelHeight,
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
          onClick={handleSave}
          disabled={!text || generatingTitle || saved}
          style={btnStyle(saved ? 'success' : 'primary')}
        >
          {generatingTitle
            ? '⏳ タイトル生成中...'
            : saved
              ? '✅ 保存済'
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
      </div>
    </div>
  );
}

function btnStyle(kind: 'primary' | 'success' | 'neutral'): React.CSSProperties {
  const palette: Record<typeof kind, { bg: string; color: string; border: string }> = {
    primary: { bg: 'var(--accent)', color: '#fff', border: 'transparent' },
    success: { bg: '#1D9E75', color: '#fff', border: 'transparent' },
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

  const [gsTarget, setGsTarget] = useState('all_staff');
  const [gsLevel, setGsLevel] = useState('standard');
  const [gsPurpose, setGsPurpose] = useState('inform');
  const [gsTone, setGsTone] = useState('professional');
  const [gsNotes, setGsNotes] = useState('');

  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');

  const analyzeOne = async (
    type: AnalysisType,
    text: string,
  ): Promise<string> => {
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
    return fullText;
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
    setResults(new Map());
    setResultModels(new Map());
    try {
      for (let i = 0; i < types.length; i++) {
        const label = ANALYSIS_OPTIONS.find((o) => o.value === types[i])?.label;
        setProgress(`(${i + 1}/${types.length}) ${label} 分析中...`);
        await analyzeOne(types[i], inputText);
      }
      showToast('分析が完了しました', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '分析に失敗しました';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const saveResult = async (type: AnalysisType, text: string): Promise<boolean> => {
    const label = ANALYSIS_OPTIONS.find((o) => o.value === type)?.label ?? type;
    setGeneratingTitle(type);
    try {
      const fallback = `${label}_${new Date().toLocaleDateString('ja-JP')}`;
      const autoTitle = await generateTitleWithTimeout(text, label, fallback);

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
        }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      const saved = await res.json();
      onSaved?.(saved);
      showToast(`「${autoTitle}」として保存しました`, 'success');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存に失敗しました';
      showToast(msg, 'error');
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
      const autoTitle = await generateTitleWithTimeout(text, label, label);
      const title = sanitizeFilename(autoTitle);
      const model = resultModels.get(type);
      const content = `${autoTitle}\n\n${modelLineTxt(model)}${text}`;
      triggerDownload(`${title}_${yyyymmdd()}.txt`, content, 'text/plain');
    } finally {
      setGeneratingTitle(null);
    }
  };

  const downloadMd = async (type: AnalysisType, text: string) => {
    const label = ANALYSIS_OPTIONS.find((o) => o.value === type)?.label ?? type;
    setGeneratingTitle(type);
    try {
      const autoTitle = await generateTitleWithTimeout(text, label, label);
      const title = sanitizeFilename(autoTitle);
      const model = resultModels.get(type);
      const content = `# ${autoTitle}\n\n${modelLineMd(model)}${text}`;
      triggerDownload(`${title}_${yyyymmdd()}.md`, content, 'text/markdown;charset=utf-8');
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
          setResults((prev) => new Map(prev).set(type, simplified));
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 入力テキスト */}
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
            marginBottom: 8,
          }}
        >
          分析対象テキスト
        </label>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="ここに分析したいテキストを貼り付けてください..."
          rows={8}
          style={{
            width: '100%',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            color: 'var(--text-primary)',
            fontSize: 13,
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
          <button
            type="button"
            onClick={() => setInputText('')}
            disabled={!inputText}
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: inputText ? 'pointer' : 'not-allowed',
            }}
          >
            クリア
          </button>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ANALYSIS_OPTIONS.map((opt) => {
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
          })}
        </div>

        {/* 共通の目的（任意） */}
        <div style={{ marginTop: 14 }}>
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

      {/* 実行ボタン */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading || !inputText.trim() || selectedTypes.size === 0}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor:
              loading || !inputText.trim() || selectedTypes.size === 0
                ? 'not-allowed'
                : 'pointer',
            opacity:
              loading || !inputText.trim() || selectedTypes.size === 0
                ? 0.5
                : 1,
          }}
        >
          {loading ? '⏳ 分析中...' : `🚀 ${selectedTypes.size}件を分析`}
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
              onSave={() => saveResult(type, text)}
              onCopy={() => {
                copyToClipboard(text);
                showToast('コピーしました', 'success');
              }}
              onDownloadTxt={() => downloadTxt(type, text)}
              onDownloadMd={() => downloadMd(type, text)}
              onSimplify={() => simplifyText(type, text)}
            />
          ))}
        </div>
      )}
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
