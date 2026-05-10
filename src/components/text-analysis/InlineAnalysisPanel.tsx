'use client';

import { useState } from 'react';

// 既存の analyze API の type と対応
const ANALYSIS_TYPES = [
  {
    id: 'summary',
    apiType: 'summary',
    label: '📋 概要・要約',
    desc: '要点を箇条書きで整理',
  },
  {
    id: 'detailed',
    apiType: 'detail_summary',
    label: '📖 詳細にまとめる',
    desc: '背景・意図・示唆まで深掘り',
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
  const [selectedType, setSelectedType] = useState<AnalysisId>('summary');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleAnalyze = async () => {
    if (!text.trim()) {
      setErrorMessage('分析対象のテキストがありません');
      return;
    }
    setIsAnalyzing(true);
    setResult('');
    setStreamingText('');
    setIsSaved(false);
    setErrorMessage('');

    const conf = ANALYSIS_TYPES.find((t) => t.id === selectedType);
    if (!conf) {
      setIsAnalyzing(false);
      return;
    }

    try {
      const res = await fetch('/api/text-analysis/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          type: conf.apiType,
          purpose: topic ? `テーマ: ${topic}` : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        setErrorMessage('分析リクエストに失敗しました');
        setIsAnalyzing(false);
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
                setStreamingText(fullText);
              } else if (event.type === 'done') {
                setResult(fullText);
                setStreamingText('');
              } else if (event.type === 'error') {
                setErrorMessage(event.message ?? 'エラーが発生しました');
              }
            } catch {
              /* skip */
            }
          }
        }
      }
      // 最終的に done イベントが来なかった場合の保険
      if (fullText && !result) {
        setResult(fullText);
        setStreamingText('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!result || isSaved) return;
    setIsSaving(true);
    try {
      const conf = ANALYSIS_TYPES.find((t) => t.id === selectedType);
      const analysisLabel = conf?.label.replace(/^[^\s]+\s/, '') ?? '';
      await fetch('/api/text-analysis/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `【ディープリサーチ分析】${topic || '無題'}`,
          content: result,
          category: 'ディープリサーチ',
          analysisType: conf?.apiType ?? selectedType,
          analysisLabel,
        }),
      });
      setIsSaved(true);
    } catch {
      setErrorMessage('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const displayText = streamingText || result;

  return (
    <div className="mt-4 border rounded-xl overflow-hidden bg-gradient-to-br from-indigo-50 to-blue-50">
      <div className="px-5 py-3 bg-indigo-600 flex items-center justify-between">
        <span className="text-white font-medium text-sm">
          ✨ リサーチ結果をブラッシュアップ
        </span>
      </div>

      <div className="p-5">
        {/* 分析タイプ選択 */}
        <div className="flex gap-3 mb-4 flex-wrap">
          {ANALYSIS_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setSelectedType(type.id)}
              disabled={isAnalyzing}
              className={`px-4 py-2 rounded-lg text-sm border transition-all disabled:opacity-50 ${
                selectedType === type.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'
              }`}
              title={type.desc}
            >
              {type.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing || !text.trim()}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-40 mb-4"
        >
          {isAnalyzing ? '🤖 分析中...' : '🚀 分析・ブラッシュアップする'}
        </button>

        {errorMessage && (
          <div className="text-xs text-red-600 mb-2">{errorMessage}</div>
        )}

        {/* 分析結果 */}
        {displayText && (
          <div>
            <div className="bg-white rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto mb-3">
              {displayText}
              {isAnalyzing && (
                <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse" />
              )}
            </div>
            {result && !isAnalyzing && (
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(result)}
                  className="text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  📋 コピー
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaved || isSaving}
                  className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
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
