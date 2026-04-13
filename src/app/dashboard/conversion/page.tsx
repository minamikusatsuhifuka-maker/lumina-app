'use client';

import { useState } from 'react';

interface CategoryData {
  key: string;
  label: string;
  sessions: number;
  pageviews: number;
  conversions: number;
  bounceRate: number;
  avgSessionDuration: number;
  cvr: number;
  paths: string[];
}

interface Improvement {
  pageKey: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface AnalyzeResponse {
  startDate: string;
  endDate: string;
  categories: CategoryData[];
  ai: {
    summary: string;
    improvements: Improvement[];
  };
}

const PRIORITY_CONFIG = {
  high: { label: '高', bg: 'rgba(239,68,68,0.12)', border: '#ef4444', text: '#ef4444' },
  medium: { label: '中', bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#f59e0b' },
  low: { label: '低', bg: 'rgba(34,197,94,0.12)', border: '#22c55e', text: '#22c55e' },
};

function formatPercent(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m > 0) return `${m}分${s}秒`;
  return `${s}秒`;
}

export default function ConversionPage() {
  const [daysRange, setDaysRange] = useState<number>(28);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const end = new Date();
      const start = new Date(Date.now() - daysRange * 24 * 60 * 60 * 1000);
      const startDate = start.toISOString().split('T')[0];
      const endDate = end.toISOString().split('T')[0];

      const res = await fetch('/api/conversion/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'データの取得に失敗しました');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  };

  // 散布図の座標計算
  const scatterPoints = data?.categories.map((c) => ({
    label: c.label,
    key: c.key,
    x: c.sessions,
    y: c.bounceRate * 100,
  })) ?? [];
  const maxSessions = Math.max(1, ...scatterPoints.map((p) => p.x));

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cv-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 14px;
          animation: slideUp 0.4s ease both;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .cv-card:hover {
          box-shadow: 0 8px 32px rgba(0,0,0,0.08);
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
              background: 'linear-gradient(135deg, #f59e0b, #f97316)',
              fontSize: 18,
            }}
          >
            💰
          </span>
          自費診療ページ CV分析
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
          GA4データから自費診療ページのパフォーマンスを分析し、CVR改善策をAIが提案します。
        </p>
      </div>

      {/* コントロール */}
      <div
        className="cv-card"
        style={{
          padding: '14px 16px',
          marginBottom: 20,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={daysRange}
          onChange={(e) => setDaysRange(parseInt(e.target.value))}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: 13,
          }}
        >
          <option value={7}>過去7日</option>
          <option value={28}>過去28日</option>
          <option value={90}>過去90日</option>
        </select>
        <button
          onClick={analyze}
          disabled={loading}
          style={{
            padding: '9px 20px',
            borderRadius: 10,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: loading
              ? 'rgba(245,158,11,0.4)'
              : 'linear-gradient(135deg, #f59e0b, #f97316)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            boxShadow: '0 4px 14px rgba(245,158,11,0.25)',
          }}
        >
          {loading ? '分析中…' : '💰 自費診療ページを分析'}
        </button>
        {data && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            期間: {data.startDate} 〜 {data.endDate}
          </span>
        )}
      </div>

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

      {!data && !loading && (
        <div
          className="cv-card"
          style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}
        >
          「自費診療ページを分析」をクリックしてGA4データを取得してください。
        </div>
      )}

      {data && data.categories.length === 0 && (
        <div
          className="cv-card"
          style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}
        >
          対象期間に自費診療ページのセッションが見つかりませんでした。
        </div>
      )}

      {data && data.categories.length > 0 && (
        <>
          {/* AIサマリー */}
          {data.ai.summary && (
            <div
              className="cv-card"
              style={{
                padding: 18,
                marginBottom: 20,
                background:
                  'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(249,115,22,0.08))',
                border: '1px solid rgba(245,158,11,0.3)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#f59e0b',
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

          {/* ページ別メトリクス */}
          <div className="cv-card" style={{ padding: 18, marginBottom: 20 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 12,
              }}
            >
              📊 自費診療ページ別パフォーマンス
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
                      診療メニュー
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
                      セッション
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
                      直帰率
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
                      平均滞在
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
                      CV数
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
                      CVR
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr key={c.key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 8px', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {c.label}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {c.sessions.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'right',
                          color: c.bounceRate > 0.7 ? '#ef4444' : 'var(--text-secondary)',
                          fontWeight: c.bounceRate > 0.7 ? 700 : 400,
                        }}
                      >
                        {formatPercent(c.bounceRate)}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {formatDuration(c.avgSessionDuration)}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {c.conversions.toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: '10px 8px',
                          textAlign: 'right',
                          color: c.cvr > 0.02 ? '#10b981' : '#f59e0b',
                          fontWeight: 700,
                        }}
                      >
                        {formatPercent(c.cvr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 改善優先度マトリクス（散布図） */}
          <div className="cv-card" style={{ padding: 18, marginBottom: 20 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 4,
              }}
            >
              🎯 改善優先度マトリクス
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
              X軸: セッション数 / Y軸: 直帰率 — 右上（高セッション × 高直帰率）が最優先
            </div>
            <div
              style={{
                position: 'relative',
                height: 360,
                padding: '20px 40px 40px 50px',
                background: 'var(--bg-primary)',
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}
            >
              {/* Y軸 */}
              <div
                style={{
                  position: 'absolute',
                  left: 6,
                  top: 16,
                  bottom: 40,
                  width: 40,
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  textAlign: 'right',
                  paddingRight: 6,
                }}
              >
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>
              {/* 上下左右の軸線 */}
              <div
                style={{
                  position: 'absolute',
                  left: 48,
                  right: 16,
                  top: 16,
                  bottom: 40,
                  borderLeft: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                }}
              />
              {/* 中央線（50%） */}
              <div
                style={{
                  position: 'absolute',
                  left: 48,
                  right: 16,
                  top: '50%',
                  borderTop: '1px dashed rgba(239,68,68,0.3)',
                }}
              />
              {/* データ点 */}
              {scatterPoints.map((p, i) => {
                const xPct = (p.x / maxSessions) * 100;
                const yPct = 100 - p.y;
                const size = Math.min(24, 8 + (p.x / maxSessions) * 20);
                return (
                  <div
                    key={i}
                    title={`${p.label}: ${p.x}セッション / 直帰率${p.y.toFixed(1)}%`}
                    style={{
                      position: 'absolute',
                      left: `calc(48px + (100% - 64px) * ${xPct / 100})`,
                      top: `calc(16px + (100% - 56px) * ${yPct / 100})`,
                      width: size,
                      height: size,
                      borderRadius: '50%',
                      background: p.y > 70 ? 'rgba(239,68,68,0.7)' : 'rgba(108,99,255,0.7)',
                      transform: 'translate(-50%, -50%)',
                      border: '2px solid #fff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: -18,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.label}
                    </span>
                  </div>
                );
              })}
              {/* X軸ラベル */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: 48,
                  right: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                }}
              >
                <span>0</span>
                <span>{Math.round(maxSessions / 2).toLocaleString()}</span>
                <span>{maxSessions.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* AI改善提案 */}
          {data.ai.improvements.length > 0 && (
            <div className="cv-card" style={{ padding: 18, marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 14,
                }}
              >
                🤖 CVR改善提案
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.ai.improvements.map((imp, i) => {
                  const p = PRIORITY_CONFIG[imp.priority] ?? PRIORITY_CONFIG.medium;
                  const cat = data.categories.find((c) => c.key === imp.pageKey);
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
                        {cat && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            対象: {cat.label}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          marginBottom: 4,
                        }}
                      >
                        {imp.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {imp.description}
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
