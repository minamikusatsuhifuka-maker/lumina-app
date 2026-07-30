'use client';

import { useState } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { renderMarkdown } from '@/lib/markdown-renderer';
import { useNoteBundleSelection } from '@/components/note-bundle/useNoteBundleSelection';

export interface CrossArticle {
  id: number;
  title: string;
  content: string;
  category?: string;
}

interface Props {
  selectedArticles: CrossArticle[];
  onArticlesChange: (articles: CrossArticle[]) => void;
  onSaved?: () => void;
  onJumpToSaves?: () => void;
  onViewArticle?: (articleId: number) => void;
}

const PRESET_TYPES = [
  { id: 'key_points', label: '🎯 重要ポイント抽出', desc: '共通する重要な知見・主張を整理' },
  { id: 'common_diff', label: '🔄 共通点・相違点', desc: '記事間の一致点と対立点を分析' },
  { id: 'future_prediction', label: '🔮 今後の予測・示唆', desc: 'トレンドから未来を予測' },
  { id: 'learning', label: '📚 学びの要点', desc: '実践に活かせる知識を整理' },
  { id: 'grade_evaluation', label: '🎓 等級評価・人材像', desc: '等級アップに求められる人材像を整理' },
  { id: 'summary', label: '📋 総合まとめ', desc: '全体を統合してインサイトを導く' },
  { id: 'insights', label: '🔍 洞察・パターン', desc: '隠れたパターン・関連性を発見' },
  { id: 'structure', label: '📁 情報の構造化', desc: '体系的に整理・マップ化' },
  { id: 'compare', label: '⚖️ 比較分析', desc: '共通点・相違点・優位性を比較' },
  { id: 'custom', label: '✏️ カスタム', desc: '自由にプロンプトを入力' },
];

const PURPLE = '#9333ea';
const PURPLE_DARK = '#7e22ce';

// 212: 等級評価・人材像の方針適合判定（第2パス /api/text-analysis/grade-fit の応答と同形）
interface FitSegment {
  text: string;
  fitLevel: 'match' | 'caution' | 'neutral';
  axes: string[];
  rationale: string;
  reframe?: string;
}
interface FitSummary {
  matchCount: number;
  cautionCount: number;
  neutralCount: number;
  matchHighlights: string[];
  cautionNotes: string[];
}
interface FitData {
  fitSegments: FitSegment[];
  fitSummary: FitSummary;
}

// 判定レベルごとの表示定義（Tailwind完全リテラル指定・212 §3-2。動的組み立て禁止）
const FIT_STYLE: Record<FitSegment['fitLevel'], { icon: string; className: string; label: string }> = {
  match: { icon: '🟢', className: 'bg-green-50 border-l-4 border-green-400', label: '合致' },
  caution: { icon: '🟡', className: 'bg-yellow-50 border-l-4 border-yellow-400', label: '要注意' },
  neutral: { icon: '⚪', className: 'bg-white border-l-4 border-gray-200', label: '中立' },
};

// 保存用: fitマップをMarkdown化（🟢🟡⚪マーカー先頭付与＝色がなくても判定が読める。213指示1）
function fitToMarkdown(fit: FitData): string {
  const seg = fit.fitSegments
    .map((s) => {
      const st = FIT_STYLE[s.fitLevel];
      const axes = s.fitLevel === 'match' && s.axes.length > 0 ? `［${s.axes.join('・')}］` : '';
      const reframe = s.reframe ? `\n  - 読み替え: ${s.reframe}` : '';
      const rationale = s.rationale ? `\n  - 判定理由: ${s.rationale}` : '';
      return `- ${st.icon} **${st.label}**${axes} ${s.text}${rationale}${reframe}`;
    })
    .join('\n');
  const sum = fit.fitSummary;
  return `\n\n---\n\n## 📋 方針適合マップ\n${seg}\n\n## 🧭 適合サマリー\n- 🟢 合致 ${sum.matchCount}件 ／ 🟡 要注意 ${sum.cautionCount}件 ／ ⚪ 中立 ${sum.neutralCount}件\n${
    sum.matchHighlights.length > 0
      ? `\n**特に方針に合致する点**\n${sum.matchHighlights.map((h) => `- 🟢 ${h}`).join('\n')}\n`
      : ''
  }${
    sum.cautionNotes.length > 0
      ? `\n**要注意の点と読み替え**\n${sum.cautionNotes.map((c) => `- 🟡 ${c}`).join('\n')}\n`
      : ''
  }`;
}

export default function CrossAnalysisPanel({
  selectedArticles,
  onArticlesChange,
  onSaved,
  onJumpToSaves,
  onViewArticle,
}: Props) {
  // 214案③: note選択モード中の案内出し分け用（共有ストア・読み取りのみ）
  const { selectMode: bundleSelectMode } = useNoteBundleSelection();
  const [presetType, setPresetType] = useState('key_points');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  // 212: 方針適合判定（等級評価・人材像のみ・第2パス）。失敗時は本文無傷のまま⚠️＋再試行を出す
  const [fitData, setFitData] = useState<FitData | null>(null);
  const [fitLoading, setFitLoading] = useState(false);
  const [fitError, setFitError] = useState('');

  // 212: 第2パス＝方針適合判定。入力は元資料が主・分析本文は補助（判定対象は元資料。213指示2）
  const fetchGradeFit = async (articles: CrossArticle[], analysisText: string) => {
    setFitLoading(true);
    setFitError('');
    setFitData(null);
    try {
      const res = await fetch('/api/text-analysis/grade-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles: articles.map((a) => ({ title: a.title, content: a.content })),
          analysisText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFitError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setFitData(data as FitData);
    } catch {
      setFitError('通信エラー');
    } finally {
      setFitLoading(false);
    }
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(result);
    setCopyStatus(success ? 'copied' : 'error');
    setTimeout(() => setCopyStatus('idle'), 2000);
  };

  const removeArticle = (id: number) => {
    onArticlesChange(selectedArticles.filter((a) => a.id !== id));
  };

  const handleAnalyze = async () => {
    if (selectedArticles.length < 2) {
      alert('2件以上の記事を選択してください');
      return;
    }
    if (presetType === 'custom' && !customPrompt.trim()) {
      alert('カスタムプロンプトを入力してください');
      return;
    }

    setIsAnalyzing(true);
    setResult('');
    setStreamingText('');
    setSavedId(null);
    setFitData(null);
    setFitError('');

    try {
      const res = await fetch('/api/text-analysis/cross-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles: selectedArticles.map((a) => ({
            id: a.id,
            title: a.title,
            content: a.content,
            category: a.category,
          })),
          presetType,
          customPrompt: presetType === 'custom' ? customPrompt : undefined,
        }),
      });

      const reader = res.body!.getReader();
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
            const event = JSON.parse(line.slice(6));
            if (event.type === 'delta') {
              fullText += event.text;
              setStreamingText(fullText);
            } else if (event.type === 'done') {
              setResult(fullText);
              setStreamingText('');
            } else if (event.type === 'error') {
              alert(`エラー: ${event.message}`);
            }
          } catch {
            /* skip */
          }
        }
      }
      if (fullText && !result) setResult(fullText);

      // 212: 等級評価・人材像のみ、本文完了後に方針適合判定（第2パス）を実行。
      // 本文とは独立＝判定が失敗しても本文表示・保存は無傷（graceful degradation）
      if (presetType === 'grade_evaluation' && fullText) {
        void fetchGradeFit(selectedArticles, fullText);
      }
    } catch (err) {
      alert(`通信エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAnalyzing(false);
      setStreamingText('');
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setIsSaving(true);

    const preset = PRESET_TYPES.find((p) => p.id === presetType);
    const titleBase = presetType === 'custom'
      ? customPrompt.slice(0, 30)
      : preset?.label ?? '横断まとめ';

    const sourceSection = `\n\n---\n\n## 📎 使用記事（${selectedArticles.length}件）\n${
      selectedArticles
        .map((a, i) =>
          `${i + 1}. **${a.title || `記事 ${i + 1}`}**${a.category ? `（${a.category}）` : ''}`,
        )
        .join('\n')
    }`;
    // 212: 方針適合マップがあれば🟢🟡⚪マーカー付きMarkdownで本文末尾に追記（保存後も判定が残る）
    const fitSection = presetType === 'grade_evaluation' && fitData ? fitToMarkdown(fitData) : '';
    const fullContent = result + fitSection + sourceSection;

    try {
      const res = await fetch('/api/text-analysis/saves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `【横断まとめ】${titleBase}（${selectedArticles.length}件）`,
          content: fullContent,
          category: '横断まとめ',
          analysisType: presetType,
          analysisLabel: '横断まとめ',
          isCrossAnalysis: true,
          sourceIds: selectedArticles.map((a) => a.id),
          crossPrompt: presetType === 'custom' ? customPrompt : preset?.label,
        }),
      });
      const data = await res.json();
      const id = data?.save?.id ?? data?.id ?? null;
      setSavedId(id);
      onSaved?.();
    } finally {
      setIsSaving(false);
    }
  };

  const displayText = streamingText || result;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 選択中の記事リスト */}
      <div style={panelStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            📑 分析対象の記事
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>
              {selectedArticles.length}件選択中
            </span>
          </h3>
          {selectedArticles.length < 2 && (
            <span style={{ fontSize: 11, color: '#f97316' }}>
              ⚠️ 保存一覧タブで2件以上を選択してください
            </span>
          )}
        </div>

        {selectedArticles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: 13 }}>保存一覧タブで記事を選択してください</p>
            {/* 214案③: note選択モード中はチェックがnote専用カートに切り替わるため案内を出し分ける */}
            {bundleSelectMode ? (
              <p style={{ fontSize: 11, marginTop: 4, color: '#ec4899' }}>
                📝 note素材の選択モード中です。横断分析の選択は「✕ 選択をやめる」後に行ってください
              </p>
            ) : (
              <p style={{ fontSize: 11, marginTop: 4 }}>
                チェックボックスで2件以上選択 → 「🔀 選択したN件を横断分析する」ボタン
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {selectedArticles.map((article, i) => (
              <div
                key={article.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10,
                  background: 'var(--bg-secondary)', borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'rgba(147,51,234,0.15)', color: PURPLE,
                  fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 2,
                }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {article.title || `記事 ${i + 1}`}
                  </div>
                  {article.category && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{article.category}</span>
                  )}
                  <div style={{
                    fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {article.content.slice(0, 80)}...
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeArticle(article.id)}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12,
                    flexShrink: 0,
                  }}
                  aria-label="削除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分析タイプ選択 */}
      <div style={panelStyle()}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
          🎯 分析タイプを選択
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 8, marginBottom: 12,
        }}>
          {PRESET_TYPES.map((preset) => {
            const active = presetType === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPresetType(preset.id)}
                style={{
                  padding: 12, borderRadius: 10, textAlign: 'left',
                  border: `1px solid ${active ? PURPLE : 'var(--border)'}`,
                  background: active ? 'rgba(147,51,234,0.08)' : 'var(--bg-secondary)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{preset.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{preset.desc}</div>
              </button>
            );
          })}
        </div>

        {presetType === 'custom' && (
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
              どの点に注目してほしいか自由に入力してください
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="例：医院経営に活かせる点を抽出して、優先度順にまとめてください。特にスタッフ教育と患者体験に関する示唆を重点的に。"
              rows={4}
              style={{
                width: '100%', padding: '8px 12px', fontSize: 16, // スマホ自動ズーム防止
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 8,
                resize: 'vertical', fontFamily: 'inherit', outline: 'none',
              }}
            />
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{customPrompt.length}字</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing || selectedArticles.length < 2}
          style={{
            marginTop: 14, width: '100%', padding: '12px 20px',
            background: isAnalyzing || selectedArticles.length < 2 ? 'var(--bg-secondary)' : PURPLE,
            color: isAnalyzing || selectedArticles.length < 2 ? 'var(--text-muted)' : '#fff',
            border: 'none', borderRadius: 12,
            cursor: isAnalyzing || selectedArticles.length < 2 ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 700,
          }}
        >
          {isAnalyzing
            ? `🔄 ${selectedArticles.length}件を横断分析中...`
            : `🔀 ${selectedArticles.length}件をまとめて分析する`}
        </button>
      </div>

      {/* 分析結果 */}
      {(displayText || isAnalyzing) && (
        <div style={panelStyle()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              📊 横断分析結果
              {isAnalyzing && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: PURPLE }}>
                  生成中...
                </span>
              )}
            </h3>
            {result && !isAnalyzing && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{
                    fontSize: 11, padding: '6px 12px', borderRadius: 8,
                    background:
                      copyStatus === 'copied'
                        ? 'rgba(34,197,94,0.10)'
                        : copyStatus === 'error'
                          ? 'rgba(239,68,68,0.10)'
                          : 'var(--bg-secondary)',
                    border: `1px solid ${
                      copyStatus === 'copied'
                        ? 'rgba(34,197,94,0.4)'
                        : copyStatus === 'error'
                          ? 'rgba(239,68,68,0.4)'
                          : 'var(--border)'
                    }`,
                    color:
                      copyStatus === 'copied'
                        ? '#16a34a'
                        : copyStatus === 'error'
                          ? '#dc2626'
                          : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {copyStatus === 'copied'
                    ? '✅ コピーしました'
                    : copyStatus === 'error'
                      ? '❌ コピー失敗'
                      : '📋 コピー'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || !!savedId}
                  style={{
                    fontSize: 11, padding: '6px 12px', borderRadius: 8,
                    background: savedId ? 'var(--bg-secondary)' : PURPLE,
                    color: savedId ? 'var(--text-muted)' : '#fff',
                    border: 'none',
                    cursor: isSaving || !!savedId ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {savedId ? '✅ 保存済み' : isSaving ? '保存中...' : '💾 保存する'}
                </button>
              </div>
            )}
          </div>

          <div style={{
            background: 'var(--bg-primary)', borderRadius: 8, padding: 14,
            maxHeight: 600, overflowY: 'auto',
            border: '1px solid var(--border)',
          }}>
            {displayText && !isAnalyzing ? (
              // 生成完了後は Markdown リッチ描画
              <div
                className="markdown-body"
                style={{ fontSize: 13, color: 'var(--text-primary)' }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(displayText) }}
              />
            ) : (
              // 生成途中は pre-wrap（崩れ防止）
              <div style={{
                fontSize: 13, color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap', lineHeight: 1.7,
              }}>
                {displayText}
                {isAnalyzing && (
                  <span style={{
                    display: 'inline-block', width: 6, height: 14,
                    background: PURPLE, marginLeft: 2,
                    animation: 'pulse 1s infinite',
                  }} />
                )}
              </div>
            )}
          </div>

          {/* 212: 方針適合マップ＋適合サマリー（等級評価・人材像のみ・本文とは独立描画）。
              ###見出し不使用（太字＋箇条書き）・Tailwind完全リテラル・fail-closed表示 */}
          {presetType === 'grade_evaluation' && result && !isAnalyzing && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                📋 方針適合マップ
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>
                  当院の人材育成方針（CDB 2026年7月版）に照らした判定
                </span>
              </p>

              {fitLoading && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏳ 元資料を方針に照らして判定中...</p>
              )}

              {!fitLoading && fitError && (
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.3)',
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: 12, color: '#ef4444' }}>
                    ⚠️ 判定できませんでした（{fitError}）。分析本文には影響ありません。
                  </span>
                  <button
                    type="button"
                    onClick={() => void fetchGradeFit(selectedArticles, result)}
                    style={{
                      padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: 'var(--bg-primary)', border: '1px solid rgba(239,68,68,0.4)',
                      color: '#ef4444', cursor: 'pointer',
                    }}
                  >
                    🔄 再試行
                  </button>
                </div>
              )}

              {!fitLoading && !fitError && fitData && fitData.fitSegments.length > 0 && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {fitData.fitSegments.map((s, i) => {
                      const st = FIT_STYLE[s.fitLevel];
                      return (
                        <div key={i} className={st.className} style={{ padding: '8px 12px', borderRadius: 6 }}>
                          <div style={{ fontSize: 12, color: '#111827', lineHeight: 1.6 }}>
                            {st.icon} {s.text}
                            {s.fitLevel === 'match' && s.axes.length > 0 && (
                              <span style={{ marginLeft: 6, display: 'inline-flex', gap: 4, verticalAlign: 'middle' }}>
                                {s.axes.map((a) => (
                                  <span
                                    key={a}
                                    style={{
                                      fontSize: 10, fontWeight: 700, padding: '1px 7px',
                                      borderRadius: 999, background: 'rgba(22,163,74,0.12)',
                                      color: '#15803d', border: '1px solid rgba(22,163,74,0.3)',
                                    }}
                                  >
                                    {a}
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                          {s.fitLevel === 'caution' && (s.rationale || s.reframe) && (
                            <div style={{ fontSize: 11, color: '#92400e', marginTop: 4, lineHeight: 1.5 }}>
                              {s.rationale && <div>判定理由: {s.rationale}</div>}
                              {s.reframe && <div>読み替え: {s.reframe}</div>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 🧭 適合サマリー（件数はサーバ集計値） */}
                  <div style={{
                    marginTop: 12, padding: '10px 14px', borderRadius: 8,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                      🧭 適合サマリー
                      <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-muted)' }}>
                        🟢 合致 {fitData.fitSummary.matchCount}件 ／ 🟡 要注意 {fitData.fitSummary.cautionCount}件 ／ ⚪ 中立 {fitData.fitSummary.neutralCount}件
                      </span>
                    </p>
                    {fitData.fitSummary.matchHighlights.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        <strong>特に方針に合致する点</strong>
                        <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                          {fitData.fitSummary.matchHighlights.map((h, i) => (
                            <li key={i}>🟢 {h}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {fitData.fitSummary.cautionNotes.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        <strong>要注意の点と読み替え</strong>
                        <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                          {fitData.fitSummary.cautionNotes.map((c, i) => (
                            <li key={i}>🟡 {c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 使用記事リスト（クリックで該当記事へジャンプ） */}
          {result && !isAnalyzing && selectedArticles.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                📎 このまとめに使用した記事（{selectedArticles.length}件）
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selectedArticles.map((article, i) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => onViewArticle?.(article.id)}
                    className="cross-source-link"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: 8, borderRadius: 8, textAlign: 'left',
                      background: 'transparent', border: '1px solid transparent',
                      cursor: onViewArticle ? 'pointer' : 'default',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'rgba(147,51,234,0.15)', color: PURPLE,
                      fontSize: 10, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{
                      flex: 1, fontSize: 12, color: 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {article.title || `記事 ${i + 1}`}
                    </span>
                    {article.category && (
                      <span style={{
                        fontSize: 10, color: 'var(--text-muted)',
                        background: 'var(--bg-secondary)',
                        padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                      }}>
                        {article.category}
                      </span>
                    )}
                    {onViewArticle && (
                      <span className="cross-source-arrow" style={{
                        fontSize: 11, color: PURPLE, flexShrink: 0,
                        opacity: 0, transition: 'opacity 0.15s',
                      }}>
                        開く →
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {savedId && (
            <div style={{
              marginTop: 10, padding: 10, borderRadius: 8,
              background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)',
              fontSize: 12, color: '#16a34a',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              ✅ 「横断まとめ」カテゴリに保存しました
              {onJumpToSaves && (
                <button
                  type="button"
                  onClick={onJumpToSaves}
                  style={{
                    background: 'transparent', border: 'none',
                    color: PURPLE_DARK, textDecoration: 'underline',
                    cursor: 'pointer', fontSize: 12,
                  }}
                >
                  保存一覧で確認 →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .cross-source-link:hover {
          background: rgba(147,51,234,0.08) !important;
          border-color: rgba(147,51,234,0.25) !important;
        }
        .cross-source-link:hover .cross-source-arrow {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}

function panelStyle(): React.CSSProperties {
  return {
    padding: 16, borderRadius: 12,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
  };
}
