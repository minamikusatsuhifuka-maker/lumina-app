'use client';

import { useState } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';

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
  { id: 'summary', label: '📋 総合まとめ', desc: '全体を統合してインサイトを導く' },
  { id: 'insights', label: '🔍 洞察・パターン', desc: '隠れたパターン・関連性を発見' },
  { id: 'structure', label: '📁 情報の構造化', desc: '体系的に整理・マップ化' },
  { id: 'compare', label: '⚖️ 比較分析', desc: '共通点・相違点・優位性を比較' },
  { id: 'custom', label: '✏️ カスタム', desc: '自由にプロンプトを入力' },
];

const PURPLE = '#9333ea';
const PURPLE_DARK = '#7e22ce';

export default function CrossAnalysisPanel({
  selectedArticles,
  onArticlesChange,
  onSaved,
  onJumpToSaves,
  onViewArticle,
}: Props) {
  const [presetType, setPresetType] = useState('key_points');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

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
    const fullContent = result + sourceSection;

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
            <p style={{ fontSize: 11, marginTop: 4 }}>
              チェックボックスで複数選択 → 「横断分析する」ボタン
            </p>
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
                width: '100%', padding: '8px 12px', fontSize: 13,
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
          </div>

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
