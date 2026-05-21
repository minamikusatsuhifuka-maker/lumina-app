'use client';

import { useState } from 'react';
import {
  getSavedModel,
  getModelLabel,
  getModelIcon,
  type AIModel,
} from '@/lib/model-preference';
import {
  generateTitleWithTimeout,
  sanitizeFilename,
  yyyymmdd,
} from '@/lib/title-generator';

// 既存の analyze API の type と対応
const ANALYSIS_TYPES = [
  {
    id: 'summary',
    apiType: 'summary',
    label: '📋 概要・要約',
  },
  {
    id: 'detailed',
    apiType: 'detail_summary',
    label: '📖 詳細にまとめる',
  },
] as const;

type AnalysisId = (typeof ANALYSIS_TYPES)[number]['id'];

interface InlineAnalysisPanelProps {
  text: string;
  topic: string;
}

export default function InlineAnalysisPanel({
  text,
  topic,
}: InlineAnalysisPanelProps) {
  const [selectedTypes, setSelectedTypes] = useState<AnalysisId[]>(['summary']);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const [streamingResults, setStreamingResults] = useState<
    Record<string, string>
  >({});
  // 各結果を生成したモデル（リクエスト送信時の getSavedModel() を記録）
  const [resultModels, setResultModels] = useState<Record<string, AIModel>>({});
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // どのパネルがタイトル生成中か（null = なし）
  const [generatingTitleId, setGeneratingTitleId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const handleAnalyze = async () => {
    if (selectedTypes.length === 0) {
      setErrorMessage('分析タイプを選択してください');
      return;
    }
    if (!text.trim()) {
      setErrorMessage('分析対象のテキストがありません');
      return;
    }

    setErrorMessage('');
    setIsAnalyzing(true);
    setResults({});
    setStreamingResults({});
    setResultModels({});
    setIsSaved(false);

    // 選択したタイプを並列で実行
    await Promise.all(
      selectedTypes.map(async (typeId) => {
        const conf = ANALYSIS_TYPES.find((t) => t.id === typeId);
        if (!conf) return;
        try {
          // リクエスト送信時のモデルを固定して記録
          const modelAtRequest = getSavedModel();
          setResultModels((prev) => ({ ...prev, [typeId]: modelAtRequest }));
          const res = await fetch('/api/text-analysis/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              type: conf.apiType,
              purpose: topic ? `テーマ: ${topic}` : undefined,
              model: modelAtRequest,
            }),
          });
          if (!res.ok || !res.body) {
            console.error('分析リクエスト失敗:', res.status);
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';
            for (const part of parts) {
              for (const line of part.split('\n')) {
                if (!line.startsWith('data: ')) continue;
                try {
                  const event = JSON.parse(line.slice(6));
                  if (event.type === 'delta') {
                    fullText += event.text;
                    setStreamingResults((prev) => ({
                      ...prev,
                      [typeId]: fullText,
                    }));
                  } else if (event.type === 'done') {
                    setResults((prev) => ({ ...prev, [typeId]: fullText }));
                    setStreamingResults((prev) => {
                      const next = { ...prev };
                      delete next[typeId];
                      return next;
                    });
                  }
                } catch {
                  /* skip */
                }
              }
            }
          }
          // doneイベントが来なかった場合の保険
          if (fullText) {
            setResults((prev) =>
              prev[typeId] ? prev : { ...prev, [typeId]: fullText },
            );
            setStreamingResults((prev) => {
              const next = { ...prev };
              delete next[typeId];
              return next;
            });
          }
        } catch (err) {
          console.error(`分析エラー (${typeId}):`, err);
        }
      }),
    );

    setIsAnalyzing(false);
  };

  const handleCopyAll = () => {
    const allText = ANALYSIS_TYPES.filter((t) => results[t.id])
      .map((t) => `## ${t.label}\n\n${results[t.id]}`)
      .join('\n\n---\n\n');
    if (allText) navigator.clipboard.writeText(allText);
  };

  // 個別パネルの .md ダウンロード（AIタイトル生成 + モデル表記付き）
  const handleDownloadPanelMd = async (typeId: AnalysisId) => {
    const conf = ANALYSIS_TYPES.find((t) => t.id === typeId);
    const content = results[typeId];
    if (!conf || !content) return;

    // ラベルから先頭の絵文字を除去
    const labelText = conf.label.replace(/^[^\s]+\s/, '').trim();
    setGeneratingTitleId(typeId);
    try {
      const fallback = labelText;
      const autoTitle = await generateTitleWithTimeout(
        content,
        labelText,
        fallback,
      );
      const fileTitle = sanitizeFilename(autoTitle);
      const model = resultModels[typeId];
      const modelLine = model
        ? `> 生成AI: ${getModelIcon(model)} ${getModelLabel(model)}\n\n---\n\n`
        : '';
      const md = `# ${autoTitle}\n\n${modelLine}${content}`;

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileTitle}_${yyyymmdd()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGeneratingTitleId(null);
    }
  };

  const handleSave = async () => {
    if (Object.keys(results).length === 0 || isSaved) return;
    setIsSaving(true);
    try {
      const allText = ANALYSIS_TYPES.filter((t) => results[t.id])
        .map((t) => `## ${t.label}\n\n${results[t.id]}`)
        .join('\n\n---\n\n');
      const apiTypes = ANALYSIS_TYPES.filter((t) => selectedTypes.includes(t.id))
        .map((t) => t.apiType)
        .join(',');
      const labels = ANALYSIS_TYPES.filter((t) => results[t.id])
        .map((t) => t.label.replace(/^[^\s]+\s/, ''))
        .join('・');

      await fetch('/api/text-analysis/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `【ディープリサーチ分析】${topic || '無題'}`,
          content: allText,
          category: 'ディープリサーチ',
          analysisType: apiTypes,
          analysisLabel: labels,
        }),
      });
      setIsSaved(true);
    } catch {
      setErrorMessage('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const hasAnyResult =
    Object.keys(results).length > 0 || Object.keys(streamingResults).length > 0;

  return (
    <div
      style={{
        marginTop: 16,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* ヘッダー（白ベース） */}
      <div
        style={{
          padding: '12px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #e5e7eb',
          color: '#374151',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        ✨ リサーチ結果をブラッシュアップ
      </div>

      <div style={{ padding: 20 }}>
        {/* 分析タイプ選択（チェックボックス） */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          {ANALYSIS_TYPES.map((type) => {
            const checked = selectedTypes.includes(type.id);
            return (
              <label
                key={type.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  background: checked ? '#ede9fe' : '#f9fafb',
                  border: `1px solid ${checked ? '#a78bfa' : '#e5e7eb'}`,
                  borderRadius: 8,
                  cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                  fontSize: 13,
                  color: checked ? '#5b21b6' : '#374151',
                  userSelect: 'none',
                  opacity: isAnalyzing ? 0.6 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isAnalyzing}
                  onChange={(e) => {
                    setSelectedTypes((prev) =>
                      e.target.checked
                        ? [...prev, type.id]
                        : prev.filter((t) => t !== type.id),
                    );
                  }}
                  style={{ accentColor: '#6d28d9' }}
                />
                {type.label}
              </label>
            );
          })}
        </div>

        {/* 実行ボタン */}
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing || !text.trim() || selectedTypes.length === 0}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: '#4f46e5',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor:
              isAnalyzing || !text.trim() || selectedTypes.length === 0
                ? 'not-allowed'
                : 'pointer',
            opacity:
              isAnalyzing || !text.trim() || selectedTypes.length === 0
                ? 0.5
                : 1,
            marginBottom: 16,
          }}
        >
          {isAnalyzing ? '🤖 分析中...' : '🚀 分析・ブラッシュアップする'}
        </button>

        {errorMessage && (
          <div
            style={{
              fontSize: 12,
              color: '#dc2626',
              marginBottom: 8,
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* 分析結果（タイプごとに表示） */}
        {hasAnyResult && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {ANALYSIS_TYPES.filter(
              (t) =>
                results[t.id] !== undefined ||
                streamingResults[t.id] !== undefined,
            ).map((type) => {
              const content =
                streamingResults[type.id] ?? results[type.id] ?? '';
              const isStreaming = !!streamingResults[type.id];
              const hasFinalResult = !!results[type.id];
              const isGenTitle = generatingTitleId === type.id;
              return (
                <div
                  key={type.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  {/* タイプヘッダー */}
                  <div
                    style={{
                      padding: '6px 12px',
                      background: '#f3f4f6',
                      borderBottom: '1px solid #e5e7eb',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#4b5563',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {type.label}
                    {isStreaming && (
                      <span
                        style={{
                          fontSize: 11,
                          color: '#6d28d9',
                          animation: 'pulse 1s infinite',
                        }}
                      >
                        生成中...
                      </span>
                    )}
                  </div>
                  {/* 本文 */}
                  <div
                    style={{
                      padding: 12,
                      fontSize: 13,
                      color: '#374151',
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                      maxHeight: 280,
                      overflowY: 'auto',
                      background: '#fff',
                    }}
                  >
                    {content}
                    {isStreaming && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 6,
                          height: 14,
                          background: '#6d28d9',
                          marginLeft: 2,
                          animation: 'pulse 0.8s infinite',
                          verticalAlign: 'middle',
                        }}
                      />
                    )}
                  </div>
                  {/* 文字数表示 + 個別MDダウンロード */}
                  {content && (
                    <div
                      style={{
                        padding: '6px 12px',
                        borderTop: '1px solid #e5e7eb',
                        background: '#fafafa',
                        fontSize: 12,
                        color: '#6b7280',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span>📝 文字数: {content.length.toLocaleString()}字</span>
                      {hasFinalResult && (
                        <button
                          type="button"
                          onClick={() => handleDownloadPanelMd(type.id)}
                          disabled={isGenTitle}
                          style={{
                            fontSize: 11,
                            padding: '4px 10px',
                            border: '1px solid #e5e7eb',
                            borderRadius: 6,
                            background: '#fff',
                            color: '#6b7280',
                            cursor: isGenTitle ? 'not-allowed' : 'pointer',
                            opacity: isGenTitle ? 0.6 : 1,
                          }}
                        >
                          {isGenTitle
                            ? '⏳ タイトル生成中...'
                            : '📥 MDダウンロード'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ボタン */}
            {!isAnalyzing && Object.keys(results).length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  type="button"
                  onClick={handleCopyAll}
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    background: '#fff',
                    color: '#6b7280',
                    cursor: 'pointer',
                  }}
                >
                  📋 全てコピー
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaved || isSaving}
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: 6,
                    background: isSaved ? '#d1fae5' : '#4f46e5',
                    color: isSaved ? '#065f46' : '#fff',
                    cursor: isSaved || isSaving ? 'default' : 'pointer',
                    opacity: isSaving ? 0.6 : 1,
                  }}
                >
                  {isSaved
                    ? '✅ 保存済み'
                    : isSaving
                      ? '保存中...'
                      : '💾 テキスト分析に保存'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
