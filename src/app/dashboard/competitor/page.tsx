'use client';

import { useState } from 'react';

// ─── 型定義 ───
interface CompetitorData {
  url: string;
  title: string;
  description: string;
  h1: string[];
  h2: string[];
  textLength: number;
  approxPageCount: number;
}

interface OwnQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

interface Differentiator {
  title: string;
  description: string;
}

interface Recommendation {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface AnalyzeResponse {
  competitor: CompetitorData;
  ownQueries: OwnQuery[];
  ai: {
    summary: string;
    differentiators: Differentiator[];
    recommendations: Recommendation[];
  };
  period: { startDate: string; endDate: string };
}

const PRIORITY_CONFIG = {
  high: { label: '高', bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#ef4444' },
  medium: { label: '中', bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#f59e0b' },
  low: { label: '低', bg: 'rgba(34,197,94,0.12)', border: '#22c55e', text: '#22c55e' },
};

export default function CompetitorPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);

  const analyze = async () => {
    if (!url.trim()) {
      setError('競合クリニックのURLを入力してください');
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch('/api/competitor/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorUrl: url.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '分析に失敗しました');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '分析に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .comp-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 14px;
          animation: slideUp 0.4s ease both;
        }
        .comp-card:hover {
          box-shadow: 0 8px 32px rgba(0,0,0,0.08);
        }
        .chip {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          background: rgba(108,99,255,0.08);
          color: #6c63ff;
          margin: 2px 4px 2px 0;
        }
      `}</style>

      {/* ヘッダー */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: 'var(--text-primary)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
              fontSize: 18,
            }}
          >
            🔬
          </span>
          競合分析ツール
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
          競合クリニックのサイトを分析し、自院との差別化ポイントをAIが提案します。
        </p>
      </div>

      {/* 入力フォーム */}
      <div
        className="comp-card"
        style={{
          padding: 18,
          marginBottom: 20,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="例: https://example-clinic.com"
          style={{
            flex: 1,
            minWidth: 280,
            padding: '11px 14px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 14,
          }}
          onKeyDown={(e) => e.key === 'Enter' && analyze()}
        />
        <button
          onClick={analyze}
          disabled={loading}
          style={{
            padding: '11px 22px',
            borderRadius: 10,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: loading
              ? 'rgba(108,99,255,0.4)'
              : 'linear-gradient(135deg, #6c63ff, #00d4b8)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            boxShadow: '0 4px 14px rgba(108,99,255,0.25)',
          }}
        >
          {loading ? '🤖 分析中…' : '🔬 競合を分析'}
        </button>
      </div>

      {/* エラー */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            color: '#ef4444',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* 未取得 */}
      {!data && !loading && !error && (
        <div
          className="comp-card"
          style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}
        >
          競合クリニックのURLを入力して「競合を分析」をクリックしてください。
        </div>
      )}

      {data && (
        <>
          {/* AIサマリー */}
          {data.ai.summary && (
            <div
              className="comp-card"
              style={{
                padding: 18,
                marginBottom: 20,
                background:
                  'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(0,212,184,0.08))',
                border: '1px solid rgba(108,99,255,0.3)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#6c63ff',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                🤖 AIサマリー
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-primary)' }}>
                {data.ai.summary}
              </div>
            </div>
          )}

          {/* 比較テーブル: 自院 vs 競合 */}
          <div className="comp-card" style={{ padding: 18, marginBottom: 20 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 12,
              }}
            >
              ⚖️ 比較: 自院 vs 競合
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th
                      style={{
                        padding: '10px 8px',
                        textAlign: 'left',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      項目
                    </th>
                    <th
                      style={{
                        padding: '10px 8px',
                        textAlign: 'left',
                        fontSize: 11,
                        color: '#6c63ff',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      🏥 自院（南草津皮フ科）
                    </th>
                    <th
                      style={{
                        padding: '10px 8px',
                        textAlign: 'left',
                        fontSize: 11,
                        color: '#f59e0b',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      🔬 競合
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      ページタイトル
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>
                      南草津皮フ科クリニック
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-primary)' }}>
                      {data.competitor.title || '—'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      メタディスクリプション
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'var(--text-secondary)',
                        fontSize: 11,
                      }}
                    >
                      （自院サイト記述に準拠）
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'var(--text-primary)',
                        fontSize: 11,
                        lineHeight: 1.5,
                      }}
                    >
                      {data.competitor.description || '—'}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      コンテンツ量（文字数）
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>—</td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-primary)' }}>
                      {data.competitor.textLength.toLocaleString()}文字
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      ページ数概算
                    </td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>—</td>
                    <td style={{ padding: '10px 8px', color: 'var(--text-primary)' }}>
                      約 {data.competitor.approxPageCount} ページ
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                        verticalAlign: 'top',
                      }}
                    >
                      主要キーワード（H1/H2）
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        color: 'var(--text-secondary)',
                        fontSize: 11,
                        verticalAlign: 'top',
                      }}
                    >
                      {data.ownQueries.length > 0 ? (
                        data.ownQueries.slice(0, 8).map((q, i) => (
                          <span key={i} className="chip">
                            {q.query}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>GSCデータなし</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        verticalAlign: 'top',
                        fontSize: 11,
                      }}
                    >
                      {[...data.competitor.h1, ...data.competitor.h2].slice(0, 12).map((h, i) => (
                        <span
                          key={i}
                          className="chip"
                          style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}
                        >
                          {h}
                        </span>
                      ))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 自院のGSCキーワード */}
          {data.ownQueries.length > 0 && (
            <div className="comp-card" style={{ padding: 18, marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 4,
                }}
              >
                🔤 自院の主要検索キーワード
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                期間: {data.period.startDate} 〜 {data.period.endDate}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th
                        style={{
                          padding: '10px 8px',
                          textAlign: 'left',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          fontWeight: 700,
                        }}
                      >
                        キーワード
                      </th>
                      <th
                        style={{
                          padding: '10px 8px',
                          textAlign: 'right',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          fontWeight: 700,
                        }}
                      >
                        クリック
                      </th>
                      <th
                        style={{
                          padding: '10px 8px',
                          textAlign: 'right',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          fontWeight: 700,
                        }}
                      >
                        表示
                      </th>
                      <th
                        style={{
                          padding: '10px 8px',
                          textAlign: 'right',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          fontWeight: 700,
                        }}
                      >
                        自院平均順位
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ownQueries.map((q, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {q.query}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {q.clicks.toLocaleString()}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {q.impressions.toLocaleString()}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#6c63ff', fontWeight: 600 }}>
                          {q.position.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 差別化ポイント */}
          {data.ai.differentiators.length > 0 && (
            <div className="comp-card" style={{ padding: 18, marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 14,
                }}
              >
                💎 差別化ポイント
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: 12,
                }}
              >
                {data.ai.differentiators.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 14,
                      background: 'rgba(16,185,129,0.06)',
                      border: '1px solid rgba(16,185,129,0.25)',
                      borderRadius: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#10b981',
                        marginBottom: 6,
                      }}
                    >
                      ✨ {d.title}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                      {d.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 改善推奨 */}
          {data.ai.recommendations.length > 0 && (
            <div className="comp-card" style={{ padding: 18, marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 14,
                }}
              >
                📋 改善アクションプラン
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.ai.recommendations.map((r, i) => {
                  const p = PRIORITY_CONFIG[r.priority] ?? PRIORITY_CONFIG.medium;
                  return (
                    <div
                      key={i}
                      style={{
                        padding: 12,
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        background: 'var(--bg-primary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 700,
                            borderRadius: 4,
                            background: p.bg,
                            border: `1px solid ${p.border}`,
                            color: p.text,
                          }}
                        >
                          優先度{p.label}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          marginBottom: 4,
                        }}
                      >
                        {r.title}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.6,
                        }}
                      >
                        {r.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
