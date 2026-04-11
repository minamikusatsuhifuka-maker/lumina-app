'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

interface Source {
  title: string;
  content: string;
}

interface Contradiction {
  topic: string;
  source_a: string;
  source_b: string;
  analysis: string;
}

interface FactCheckResult {
  summary: string;
  agreed_facts: string[];
  contradictions: Contradiction[];
  unverified: string[];
  overall_reliability: string;
  recommendation: string;
}

const SAMPLE_SOURCES: Source[] = [
  {
    title: '日経新聞: AI市場の急成長',
    content: '2025年の生成AI市場規模は世界で約1,800億ドルに達し、前年比40%増となった。特にエンタープライズ向けの導入が加速しており、Fortune 500企業の90%以上がAIを業務に活用している。',
  },
  {
    title: 'TechCrunch: AI市場の現状と課題',
    content: '2025年の生成AI市場は約1,500億ドル規模で、予想を下回る成長率（25%増）となった。多くの企業がPoC段階にとどまり、本格導入はFortune 500企業の約60%にとどまっている。',
  },
  {
    title: 'McKinsey Report: AIの経済的インパクト',
    content: '生成AIは今後10年で世界GDPに最大4.4兆ドルの付加価値をもたらす可能性がある。2025年時点では市場規模1,600億ドル前後と推計。企業のAI導入率は業界により大きなばらつきがある。',
  },
];

const RELIABILITY_COLORS: Record<string, string> = {
  '高': '#4ade80',
  '中': '#f5a623',
  '低': '#ff6b6b',
};

export default function FactCheckPage() {
  const [sources, setSources] = useState<Source[]>([
    { title: '', content: '' },
    { title: '', content: '' },
  ]);
  const [result, setResult] = useState<FactCheckResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const updateSource = (index: number, field: keyof Source, value: string) => {
    const updated = [...sources];
    updated[index] = { ...updated[index], [field]: value };
    setSources(updated);
  };

  const addSource = () => {
    setSources([...sources, { title: '', content: '' }]);
  };

  const removeSource = (index: number) => {
    if (sources.length <= 2) return;
    setSources(sources.filter((_, i) => i !== index));
  };

  const fillSample = () => {
    setSources(SAMPLE_SOURCES);
  };

  const canSubmit = sources.length >= 2 && sources.every(s => s.title.trim() && s.content.trim());

  const generate = async () => {
    if (!canSubmit) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);
    setRawText('');

    try {
      const res = await fetch('/api/fact-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`APIエラー: ${res.status} ${err}`);
      }

      const data = await res.json();
      setResult(data);
      setRawText(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`エラーが発生しました: ${msg}`);
      resetProgress();
    } finally {
      setLoading(false);
      completeProgress();
    }
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="ファクトチェック中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        ファクトチェック
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        複数の情報源を比較し、事実の一致・矛盾・未検証情報を自動分析します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/websearch', icon: '🌐', label: 'Web情報収集' },
          { href: '/dashboard/deepresearch', icon: '🔭', label: 'ディープリサーチ' },
          { href: '/dashboard/research', icon: '🔬', label: '文献検索' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>情報源を入力（最低2つ）</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={fillSample} style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
              border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
            }}>サンプルを入力</button>
            <button onClick={addSource} style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
            }}>+ 情報源を追加</button>
          </div>
        </div>

        {sources.map((source, index) => (
          <div key={index} style={{
            border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12,
            background: 'var(--bg-primary)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                情報源 {index + 1}
              </span>
              {sources.length > 2 && (
                <button onClick={() => removeSource(index)} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.05)',
                  color: '#ff6b6b',
                }}>削除</button>
              )}
            </div>
            <input
              value={source.title}
              onChange={e => updateSource(index, 'title', e.target.value)}
              placeholder="タイトル（例：日経新聞の記事）"
              style={{
                width: '100%', padding: '10px 14px', background: 'var(--bg-secondary)',
                border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
                fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 8,
              }}
            />
            <textarea
              value={source.content}
              onChange={e => updateSource(index, 'content', e.target.value)}
              placeholder="内容（記事本文やポイントを貼り付け）"
              rows={4}
              style={{
                width: '100%', padding: '10px 14px', background: 'var(--bg-secondary)',
                border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
                fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.6,
              }}
            />
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {sources.length}件の情報源
          </div>
          <button onClick={generate} disabled={loading || !canSubmit} style={{
            padding: '12px 36px',
            background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: (loading || !canSubmit) ? 0.5 : 1,
          }}>
            {loading ? 'チェック中...' : 'ファクトチェック開始'}
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div style={{ padding: 16, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 10, color: '#ff6b6b', fontSize: 14, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)', padding: 20 }}>
          <div style={{ width: 20, height: 20, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          複数の情報源をAIが比較分析しています...
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveToLibraryButton
              title="ファクトチェック結果"
              content={rawText}
              type="fact-check"
              groupName="ファクトチェック"
              tags="ファクトチェック,情報検証"
            />
          </div>

          {/* 総合サマリー */}
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>総合サマリー</span>
              <span style={{
                fontSize: 13, fontWeight: 700, padding: '4px 16px', borderRadius: 20,
                background: `${RELIABILITY_COLORS[result.overall_reliability] || '#888'}20`,
                color: RELIABILITY_COLORS[result.overall_reliability] || '#888',
                border: `1px solid ${RELIABILITY_COLORS[result.overall_reliability] || '#888'}40`,
              }}>
                信頼性: {result.overall_reliability}
              </span>
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {result.summary}
            </div>
          </div>

          {/* 一致している事実 */}
          {result.agreed_facts && result.agreed_facts.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>
                一致している事実
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.agreed_facts.map((fact, i) => (
                  <div key={i} style={{
                    padding: '14px 18px', borderRadius: 10,
                    background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <span style={{ color: '#4ade80', fontSize: 16, flexShrink: 0, marginTop: 1 }}>&#10003;</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{fact}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 矛盾点 */}
          {result.contradictions && result.contradictions.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>
                矛盾・食い違い
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.contradictions.map((c, i) => (
                  <div key={i} style={{
                    padding: '16px 18px', borderRadius: 10,
                    background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.2)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f5a623', marginBottom: 10 }}>
                      {c.topic}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                      <div style={{
                        padding: '10px 14px', borderRadius: 8,
                        background: 'var(--bg-primary)', border: '1px solid var(--border)',
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>情報源A</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.source_a}</div>
                      </div>
                      <div style={{
                        padding: '10px 14px', borderRadius: 8,
                        background: 'var(--bg-primary)', border: '1px solid var(--border)',
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>情報源B</div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{c.source_b}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 8, borderLeft: '3px solid #f5a623' }}>
                      {c.analysis}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 未検証情報 */}
          {result.unverified && result.unverified.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ff6b6b', marginBottom: 8 }}>
                未検証情報
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.unverified.map((item, i) => (
                  <div key={i} style={{
                    padding: '14px 18px', borderRadius: 10,
                    background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.2)',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <span style={{ color: '#ff6b6b', fontSize: 16, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>?</span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 推奨コメント */}
          {result.recommendation && (
            <div style={{
              background: 'linear-gradient(135deg, #6c63ff10, #00d4b810)',
              border: '1px solid #6c63ff30', borderRadius: 12, padding: 20,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>推奨</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {result.recommendation}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
