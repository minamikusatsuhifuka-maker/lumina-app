'use client';

import { useCallback, useEffect, useState } from 'react';

interface MonthlyStats {
  total_input: number | string;
  total_output: number | string;
  total_cost_usd: number | string;
  total_cost_jpy: number | string;
  total_calls: number | string;
}

interface DailyStats {
  date: string;
  input_tokens: number | string;
  output_tokens: number | string;
  cost_jpy: number | string;
  calls: number | string;
}

interface FeatureStats {
  feature_key: string;
  input_tokens: number | string;
  output_tokens: number | string;
  cost_jpy: number | string;
  calls: number | string;
}

const FEATURE_LABELS: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  orchestrator: { label: 'AIオーケストレーター', icon: '🤖', color: '#4f46e5' },
  deepresearch: { label: 'ディープリサーチ', icon: '🔭', color: '#059669' },
  text_analysis: { label: 'テキスト分析', icon: '📝', color: '#0891b2' },
  kindle: { label: 'Kindle生成', icon: '📚', color: '#d97706' },
  medical: { label: '医療文書', icon: '🏥', color: '#dc2626' },
  hr: { label: '人材育成', icon: '🌱', color: '#16a34a' },
  business: { label: '収益化スタジオ', icon: '💰', color: '#ea580c' },
  blog: { label: 'nexusブログ', icon: '📰', color: '#7c3aed' },
  nexus: { label: 'nexusサイト生成', icon: '🌐', color: '#6366f1' },
  other: { label: 'その他', icon: '⚙️', color: '#6b7280' },
};

// PG数値カラムは文字列で返ることがあるので統一的に整数化
const toInt = (v: unknown): number => {
  if (typeof v === 'number') return Math.floor(v);
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

export default function ApiUsagePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthly, setMonthly] = useState<MonthlyStats | null>(null);
  const [daily, setDaily] = useState<DailyStats[]>([]);
  const [byFeature, setByFeature] = useState<FeatureStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadUsage = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/usage?year=${year}&month=${month}`);
      if (!res.ok) return;
      const data = await res.json();
      setMonthly(data.monthly ?? null);
      setDaily(data.daily ?? []);
      setByFeature(data.byFeature ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  // 日別グラフの最大値
  const maxCostJpy = Math.max(...daily.map((d) => toInt(d.cost_jpy)), 1);

  // 月の全日付を生成
  const daysInMonth = new Date(year, month, 0).getDate();
  const allDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const found = daily.find((x) => x.date?.startsWith(dateStr));
    return {
      day: d,
      dateStr,
      costJpy: found ? toInt(found.cost_jpy) : 0,
      calls: found ? toInt(found.calls) : 0,
    };
  });

  const totalCostJpy = toInt(monthly?.total_cost_jpy);
  const totalInput = toInt(monthly?.total_input);
  const totalOutput = toInt(monthly?.total_output);
  const totalCalls = toInt(monthly?.total_calls);
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  const handlePrevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const handleNextMonth = () => {
    if (isCurrentMonth) return;
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* ヘッダー */}
      <div
        style={{
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            📊 API使用量レポート
          </h1>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginTop: 4,
            }}
          >
            Claude APIのトークン消費量と利用コストを確認できます
          </p>
        </div>
        {/* 月選択 */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={handlePrevMonth}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--bg-primary)',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            ‹
          </button>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              minWidth: 80,
              textAlign: 'center',
              color: 'var(--text-primary)',
            }}
          >
            {year}年{month}月
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            disabled={isCurrentMonth}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--bg-primary)',
              cursor: isCurrentMonth ? 'not-allowed' : 'pointer',
              opacity: isCurrentMonth ? 0.4 : 1,
              color: 'var(--text-primary)',
            }}
          >
            ›
          </button>
        </div>
      </div>

      {isLoading ? (
        <div
          style={{
            textAlign: 'center',
            padding: 60,
            color: 'var(--text-secondary)',
          }}
        >
          読み込み中...
        </div>
      ) : (
        <>
          {/* 月次サマリーカード */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {/* 合計コスト（横長） */}
            <div
              style={{
                gridColumn: '1 / -1',
                padding: 20,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                color: '#fff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>
                  {year}年{month}月のAPI使用料（合計）
                </div>
                <div style={{ fontSize: 36, fontWeight: 800 }}>
                  ¥{totalCostJpy.toLocaleString()}
                </div>
                <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
                  ${(totalCostJpy / 150).toFixed(3)} USD
                </div>
              </div>
              <div style={{ textAlign: 'right', opacity: 0.9 }}>
                <div style={{ fontSize: 12, marginBottom: 8 }}>
                  API呼び出し回数
                </div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {totalCalls.toLocaleString()}回
                </div>
              </div>
            </div>

            {/* 入力トークン */}
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                }}
              >
                入力トークン
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#4f46e5' }}>
                {totalInput >= 1_000_000
                  ? `${(totalInput / 1_000_000).toFixed(2)}M`
                  : `${(totalInput / 1000).toFixed(1)}K`}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  marginTop: 4,
                }}
              >
                ¥
                {Math.ceil(
                  (totalInput * 3) / 1_000_000 * 150,
                ).toLocaleString()}{' '}
                相当
              </div>
            </div>

            {/* 出力トークン */}
            <div
              style={{
                padding: 16,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                }}
              >
                出力トークン
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#7c3aed' }}>
                {totalOutput >= 1_000_000
                  ? `${(totalOutput / 1_000_000).toFixed(2)}M`
                  : `${(totalOutput / 1000).toFixed(1)}K`}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  marginTop: 4,
                }}
              >
                ¥
                {Math.ceil(
                  (totalOutput * 15) / 1_000_000 * 150,
                ).toLocaleString()}{' '}
                相当
              </div>
            </div>
          </div>

          {/* 日別グラフ */}
          <div
            style={{
              padding: 20,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              marginBottom: 20,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 16,
                color: 'var(--text-primary)',
              }}
            >
              📅 日別使用量（¥）
            </h3>

            {daily.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: 30,
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                }}
              >
                この月のデータはありません
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 3,
                  height: 140,
                  overflowX: 'auto',
                  paddingBottom: 4,
                }}
              >
                {allDays.map(({ day, costJpy, calls }) => {
                  const heightPct =
                    costJpy > 0
                      ? Math.max((costJpy / maxCostJpy) * 100, 4)
                      : 0;
                  const isToday = isCurrentMonth && day === now.getDate();
                  return (
                    <div
                      key={day}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flex: '1 0 auto',
                        minWidth: 24,
                        maxWidth: 40,
                        position: 'relative',
                      }}
                    >
                      <div
                        title={`${month}/${day}: ¥${costJpy.toLocaleString()}（${calls}回）`}
                        style={{
                          width: '100%',
                          height: `${heightPct}%`,
                          minHeight: costJpy > 0 ? 4 : 0,
                          background: isToday
                            ? '#f59e0b'
                            : costJpy > 0
                              ? '#4f46e5'
                              : 'var(--bg-secondary)',
                          borderRadius: '3px 3px 0 0',
                          transition: 'height 0.3s',
                          cursor: costJpy > 0 ? 'pointer' : 'default',
                        }}
                      />
                      <div
                        style={{
                          fontSize: 9,
                          color: isToday
                            ? '#f59e0b'
                            : 'var(--text-secondary)',
                          marginTop: 3,
                          fontWeight: isToday ? 700 : 400,
                        }}
                      >
                        {day}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 凡例 */}
            <div
              style={{
                display: 'flex',
                gap: 16,
                marginTop: 8,
                fontSize: 11,
                color: 'var(--text-secondary)',
              }}
            >
              <span
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: '#4f46e5',
                    borderRadius: 2,
                    display: 'inline-block',
                  }}
                />
                使用あり
              </span>
              <span
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: '#f59e0b',
                    borderRadius: 2,
                    display: 'inline-block',
                  }}
                />
                今日
              </span>
              <span style={{ marginLeft: 'auto' }}>
                最大: ¥{maxCostJpy.toLocaleString()}
              </span>
            </div>
          </div>

          {/* 機能別ドーナツチャート */}
          {byFeature.length > 0 && totalCostJpy > 0 && (
            <div
              style={{
                padding: 20,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                marginBottom: 20,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 16,
                  color: 'var(--text-primary)',
                }}
              >
                🥧 機能別コスト割合
              </h3>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 24,
                  flexWrap: 'wrap',
                }}
              >
                {/* SVGドーナツチャート */}
                <svg
                  width="160"
                  height="160"
                  viewBox="0 0 160 160"
                  style={{ flexShrink: 0 }}
                >
                  {(() => {
                    const total = byFeature.reduce(
                      (sum, f) => sum + toInt(f.cost_jpy),
                      0,
                    );
                    if (total === 0) return null;
                    const radius = 60;
                    const cx = 80;
                    const cy = 80;
                    const strokeWidth = 24;
                    const dashArray = 2 * Math.PI * radius;
                    let cumulative = 0;
                    return byFeature.map((feature) => {
                      const config =
                        FEATURE_LABELS[feature.feature_key] ??
                        FEATURE_LABELS.other;
                      const costJpy = toInt(feature.cost_jpy);
                      const pct = costJpy / total;
                      const rotation = cumulative * 360 - 90;
                      cumulative += pct;
                      return (
                        <circle
                          key={feature.feature_key}
                          cx={cx}
                          cy={cy}
                          r={radius}
                          fill="none"
                          stroke={config.color}
                          strokeWidth={strokeWidth}
                          strokeDasharray={`${dashArray * pct} ${dashArray * (1 - pct)}`}
                          strokeDashoffset={0}
                          transform={`rotate(${rotation}, ${cx}, ${cy})`}
                          style={{ transition: 'all 0.5s' }}
                        />
                      );
                    });
                  })()}
                  {/* 中央テキスト */}
                  <text
                    x="80"
                    y="75"
                    textAnchor="middle"
                    style={{
                      fontSize: 12,
                      fill: 'var(--text-secondary)',
                    }}
                  >
                    合計
                  </text>
                  <text
                    x="80"
                    y="95"
                    textAnchor="middle"
                    style={{
                      fontSize: 14,
                      fontWeight: 'bold',
                      fill: 'var(--text-primary)',
                    }}
                  >
                    ¥{totalCostJpy.toLocaleString()}
                  </text>
                </svg>

                {/* 凡例 */}
                <div
                  style={{
                    flex: 1,
                    minWidth: 240,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {byFeature.map((feature) => {
                    const config =
                      FEATURE_LABELS[feature.feature_key] ??
                      FEATURE_LABELS.other;
                    const costJpy = toInt(feature.cost_jpy);
                    const pct =
                      totalCostJpy > 0
                        ? ((costJpy / totalCostJpy) * 100).toFixed(1)
                        : '0';
                    return (
                      <div
                        key={feature.feature_key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: config.color,
                            flexShrink: 0,
                            display: 'inline-block',
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            flex: 1,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {config.icon} {config.label}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {pct}%
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: config.color,
                            minWidth: 60,
                            textAlign: 'right',
                          }}
                        >
                          ¥{costJpy.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 機能別内訳 */}
          {byFeature.length > 0 && (
            <div
              style={{
                padding: 20,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                marginBottom: 20,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 14,
                  color: 'var(--text-primary)',
                }}
              >
                🔧 機能別使用量
              </h3>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {byFeature.map((feature) => {
                  const config =
                    FEATURE_LABELS[feature.feature_key] ??
                    FEATURE_LABELS.other;
                  const costJpy = toInt(feature.cost_jpy);
                  const pct = totalCostJpy > 0 ? (costJpy / totalCostJpy) * 100 : 0;
                  const inputK = toInt(feature.input_tokens) / 1000;
                  const outputK = toInt(feature.output_tokens) / 1000;
                  const calls = toInt(feature.calls);
                  return (
                    <div key={feature.feature_key}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                          flexWrap: 'wrap',
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span style={{ fontSize: 16 }}>{config.icon}</span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {config.label}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {calls}回
                          </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: config.color,
                            }}
                          >
                            ¥{costJpy.toLocaleString()}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                              marginLeft: 6,
                            }}
                          >
                            in:{inputK.toFixed(1)}K / out:{outputK.toFixed(1)}K
                          </span>
                        </div>
                      </div>
                      {/* 割合バー */}
                      <div
                        style={{
                          height: 6,
                          background: 'var(--bg-secondary)',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: config.color,
                            borderRadius: 3,
                            transition: 'width 0.5s',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 料金説明 */}
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}
          >
            <strong>料金計算について：</strong>
            Claude Sonnet 4.6
            の料金（入力 $3/1Mトークン・出力 $15/1Mトークン）で計算しています。
            1USD = 150JPY で換算。実際の請求額はAnthropicの公式料金に基づきます。
          </div>
        </>
      )}
    </div>
  );
}
