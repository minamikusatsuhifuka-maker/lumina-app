'use client';

import { useState } from 'react';
import { getSavedModel } from '@/lib/model-preference';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { renderMarkdown } from '@/lib/markdown-renderer';

// 既存の analyze API の type と対応
const ANALYSIS_TYPES = [
  {
    id: 'summary',
    apiType: 'summary',
    label: '概要・要約',
    desc: '要点を箇条書きで整理',
  },
  {
    id: 'detailed',
    apiType: 'detail_summary',
    label: '詳細にまとめる',
    desc: '背景・意図・示唆まで深掘り',
  },
  {
    id: 'genspark',
    apiType: 'genspark_slide',
    label: 'Genspark資料用',
    desc: 'スライド構成案付き',
  },
] as const;

type AnalysisId = (typeof ANALYSIS_TYPES)[number]['id'];

interface UrlResult {
  url: string;
  success: boolean;
  text?: string;
  charCount?: number;
  error?: string;
  // 1つのURLに対して複数タイプの分析結果を保持
  analyses?: { typeId: AnalysisId; label: string; content: string; saved?: boolean }[];
}

export default function UrlBatchAnalysisPanel() {
  const [urlInput, setUrlInput] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<AnalysisId[]>(['summary']);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<UrlResult[]>([]);
  const [currentStep, setCurrentStep] = useState<
    'input' | 'extracted' | 'analyzed'
  >('input');
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // URL一覧をパース（http/httpsのみ）
  const parseUrls = (): string[] =>
    urlInput
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'));

  // Step1: 本文抽出
  const handleExtract = async () => {
    const urls = parseUrls();
    if (urls.length === 0) {
      setErrorMessage('URLを1行に1つで入力してください');
      return;
    }
    if (urls.length > 10) {
      setErrorMessage('一度に処理できるURLは10件までです');
      return;
    }

    setErrorMessage('');
    setIsExtracting(true);
    setResults(urls.map((url) => ({ url, success: false })));

    try {
      const res = await fetch('/api/text-analysis/extract-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error ?? '本文抽出に失敗しました');
        setIsExtracting(false);
        return;
      }
      const { results: extractResults } = (await res.json()) as {
        results: UrlResult[];
      };
      setResults(extractResults);
      setCurrentStep('extracted');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // SSEストリームを読んでテキストを取得
  const readStream = async (res: Response): Promise<string> => {
    if (!res.body) return '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let analysisText = '';
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
            if (event.type === 'delta') analysisText += event.text;
          } catch {
            /* skip */
          }
        }
      }
    }
    return analysisText;
  };

  // Step2: 一括分析
  const handleAnalyze = async () => {
    const successResults = results.filter((r) => r.success && r.text);
    if (successResults.length === 0) {
      setErrorMessage('抽出に成功したURLがありません');
      return;
    }
    if (selectedTypes.length === 0) {
      setErrorMessage('分析タイプを選択してください');
      return;
    }

    setErrorMessage('');
    setIsAnalyzing(true);

    for (const result of results) {
      if (!result.success || !result.text) continue;

      for (const typeId of selectedTypes) {
        const conf = ANALYSIS_TYPES.find((t) => t.id === typeId);
        if (!conf) continue;

        try {
          const res = await fetch('/api/text-analysis/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: result.text,
              type: conf.apiType,
              purpose: `元URL: ${result.url}`,
              model: getSavedModel(),
            }),
          });

          if (!res.ok) {
            console.error('分析リクエスト失敗:', res.status);
            continue;
          }

          const analysisText = await readStream(res);

          // 結果を更新（同じURLの分析結果に追加）
          setResults((prev) =>
            prev.map((r) =>
              r.url === result.url
                ? {
                    ...r,
                    analyses: [
                      ...(r.analyses ?? []).filter((a) => a.typeId !== typeId),
                      {
                        typeId,
                        label: conf.label,
                        content: analysisText,
                      },
                    ],
                  }
                : r,
            ),
          );
        } catch (err) {
          console.error('分析エラー:', err);
        }
      }
    }

    setIsAnalyzing(false);
    setCurrentStep('analyzed');
  };

  // 全件保存
  const handleSaveAll = async () => {
    setIsSavingAll(true);
    for (const result of results) {
      if (!result.analyses || result.analyses.length === 0) continue;
      for (const analysis of result.analyses) {
        if (analysis.saved) continue;
        try {
          let host = result.url;
          try {
            host = new URL(result.url).hostname;
          } catch {
            /* fallback */
          }
          await fetch('/api/text-analysis/saves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `【URL分析】${host}（${analysis.label}）`,
              content: `元URL: ${result.url}\n\n${analysis.content}`,
              category: 'URL分析',
              analysisType:
                ANALYSIS_TYPES.find((t) => t.id === analysis.typeId)?.apiType ??
                analysis.typeId,
              analysisLabel: analysis.label,
            }),
          });
          // 保存済みフラグ更新
          setResults((prev) =>
            prev.map((r) =>
              r.url === result.url
                ? {
                    ...r,
                    analyses: r.analyses?.map((a) =>
                      a.typeId === analysis.typeId ? { ...a, saved: true } : a,
                    ),
                  }
                : r,
            ),
          );
        } catch {
          /* skip */
        }
      }
    }
    setIsSavingAll(false);
  };

  const successCount = results.filter((r) => r.success).length;

  return (
    <div className="space-y-5">
      {/* Step1: URL入力 */}
      <div className="bg-white border rounded-xl p-5">
        <h3 className="font-semibold text-gray-800 mb-1">
          🌐 URL一括本文抽出・分析
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          1行に1つのURLを入力してください（最大10件）。広告・メニューを除いた本文を自動抽出します。
        </p>
        <textarea
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder={`https://example.com/article1\nhttps://example.com/article2\nhttps://example.com/article3`}
          rows={6}
          className="w-full border rounded-lg px-3 py-2 text-sm resize-y font-mono"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">
            {parseUrls().length}件のURL
          </span>
          <button
            type="button"
            onClick={handleExtract}
            disabled={isExtracting || parseUrls().length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40"
          >
            {isExtracting ? '🔄 本文抽出中...' : '📄 本文を抽出する'}
          </button>
        </div>
        {errorMessage && (
          <div className="text-xs text-red-600 mt-2">{errorMessage}</div>
        )}
      </div>

      {/* Step2: 抽出結果 + 分析タイプ選択 */}
      {currentStep !== 'input' && (
        <div className="bg-white border rounded-xl p-5">
          <h3 className="font-semibold text-gray-800 mb-3">📄 抽出結果</h3>
          <div className="space-y-2 mb-4">
            {results.map((r, i) => (
              <div
                key={`${r.url}-${i}`}
                className={`p-3 rounded-lg border text-sm ${
                  r.success
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{r.success ? '✅' : '❌'}</span>
                  <span className="text-xs text-gray-600 truncate flex-1">
                    {r.url}
                  </span>
                  {r.success && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {r.charCount?.toLocaleString()}字
                    </span>
                  )}
                </div>
                {!r.success && (
                  <p className="text-xs text-red-600 mt-1 ml-6">{r.error}</p>
                )}
              </div>
            ))}
          </div>

          {/* 分析タイプ選択 */}
          <h3 className="font-semibold text-gray-800 mb-2">
            🎯 分析タイプを選択
          </h3>
          <div className="flex gap-3 flex-wrap mb-4">
            {ANALYSIS_TYPES.map((type) => (
              <label
                key={type.id}
                className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedTypes.includes(type.id)
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type.id)}
                  onChange={(e) => {
                    setSelectedTypes((prev) =>
                      e.target.checked
                        ? [...prev, type.id]
                        : prev.filter((t) => t !== type.id),
                    );
                  }}
                  className="mt-0.5 accent-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800">
                    {type.label}
                  </div>
                  <div className="text-xs text-gray-500">{type.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={
              isAnalyzing || successCount === 0 || selectedTypes.length === 0
            }
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            {isAnalyzing
              ? '🤖 分析中...'
              : `🚀 ${successCount}件を一括分析する`}
          </button>
        </div>
      )}

      {/* Step3: 分析結果 */}
      {currentStep === 'analyzed' &&
        results.some((r) => r.analyses && r.analyses.length > 0) && (
          <div className="bg-white border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">📊 分析結果</h3>
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={isSavingAll}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40"
              >
                {isSavingAll ? '保存中...' : '💾 全件保存する'}
              </button>
            </div>
            <div className="space-y-4">
              {results
                .filter((r) => r.analyses && r.analyses.length > 0)
                .map((r, i) =>
                  r.analyses!.map((a, j) => (
                    <div
                      key={`${r.url}-${a.typeId}-${i}-${j}`}
                      className="border rounded-lg overflow-hidden"
                    >
                      <div className="bg-gray-50 px-4 py-2 flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded shrink-0">
                          {a.label}
                        </span>
                        <span className="text-xs text-gray-500 truncate flex-1">
                          {r.url}
                        </span>
                        {a.saved && (
                          <span className="text-xs text-green-600 shrink-0">
                            ✅ 保存済み
                          </span>
                        )}
                      </div>
                      <div
                        className="markdown-body p-4 text-sm text-gray-700 max-h-80 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(a.content) }}
                      />
                      <div className="px-4 pb-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(a.content)
                          }
                          className="text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50"
                        >
                          📋 コピー
                        </button>
                      </div>
                    </div>
                  )),
                )}
            </div>
          </div>
        )}
    </div>
  );
}
