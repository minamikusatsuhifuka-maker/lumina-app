'use client';

import { useCallback, useEffect, useState } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';

const TREATMENT_CATEGORIES = [
  {
    id: 'botox_filler',
    label: '💉 ボトックス・フィラー',
    examples: [
      'ボトックス（額）',
      'ボトックス（眉間）',
      'ヒアルロン酸（唇）',
      'ヒアルロン酸（ほうれい線）',
    ],
  },
  {
    id: 'laser_light',
    label: '✨ レーザー・光治療',
    examples: [
      'レーザートーニング',
      'IPL光治療',
      'フラクショナルレーザー',
      'ピコレーザー',
    ],
  },
  {
    id: 'skincare_drip',
    label: '💧 スキンケア・点滴',
    examples: [
      'ケミカルピーリング',
      'イオン導入',
      '美白点滴',
      'プラセンタ注射',
    ],
  },
];

interface CompetitorClinic {
  name: string;
  price?: number;
  price_display?: string;
  notes?: string;
  region?: string;
}

interface CollectedData {
  famous?: CompetitorClinic[];
  regional?: CompetitorClinic[];
  summary?: {
    min_price?: number;
    max_price?: number;
    avg_price?: number;
    median_price?: number;
    price_segments?: Record<string, string>;
    regional_trend?: string;
    notes?: string;
  };
  rawText?: string;
}

interface PricingSession {
  id: number;
  treatment_name: string;
  region: string | null;
  recommended_price: number | null;
  price_range_min: number | null;
  price_range_max: number | null;
  created_at: string;
}

interface MarketStats {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
}

export default function PricingStrategyPage() {
  // 設定
  const [treatmentName, setTreatmentName] = useState('');
  const [treatmentCategory, setTreatmentCategory] = useState('botox_filler');
  const [region, setRegion] = useState('');
  const [bedCostPerHour, setBedCostPerHour] = useState(0);
  const [treatmentTimeMinutes, setTreatmentTimeMinutes] = useState(30);
  const [includeRegional, setIncludeRegional] = useState(true);
  const [includeFamous, setIncludeFamous] = useState(true);

  // 手動入力競合
  const [manualCompetitors, setManualCompetitors] = useState<
    Array<{ name: string; price: string; notes: string }>
  >([{ name: '', price: '', notes: '' }]);

  // 実行状態
  const [isCollecting, setIsCollecting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [collectedData, setCollectedData] = useState<CollectedData | null>(
    null,
  );
  const [analysisResult, setAnalysisResult] = useState('');
  const [recommendedPrice, setRecommendedPrice] = useState<number | null>(null);
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  const [sessions, setSessions] = useState<PricingSession[]>([]);
  const [activeTab, setActiveTab] = useState<'analyze' | 'history'>('analyze');
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/pricing-strategy');
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      /* skip */
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleCollect = async () => {
    if (!treatmentName.trim()) {
      setErrorMessage('施術名を入力してください');
      return;
    }
    if (includeRegional && !region.trim()) {
      setErrorMessage('地域を入力してください');
      return;
    }
    setErrorMessage('');
    setIsCollecting(true);
    setCollectedData(null);
    setAnalysisResult('');
    setRecommendedPrice(null);
    setIsSaved(false);
    try {
      const res = await fetch('/api/pricing-strategy/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          treatmentName,
          region,
          includeRegional,
          includeFamous,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? '競合価格の収集に失敗しました');
        return;
      }
      setCollectedData(data.results ?? null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '通信エラー');
    } finally {
      setIsCollecting(false);
    }
  };

  const handleAnalyze = async () => {
    const manualData = manualCompetitors
      .filter((c) => c.name && c.price)
      .map((c) => ({
        name: c.name,
        price: parseInt(c.price.replace(/,/g, ''), 10) || 0,
        notes: c.notes,
      }));

    if (!collectedData && manualData.length === 0) {
      setErrorMessage('競合データを収集するか手動入力してください');
      return;
    }
    setErrorMessage('');
    setIsAnalyzing(true);
    setAnalysisResult('');
    setIsSaved(false);

    const competitorData = {
      famous: [...(collectedData?.famous ?? []), ...manualData],
      regional: collectedData?.regional ?? [],
      summary: collectedData?.summary ?? {},
    };

    try {
      const res = await fetch('/api/pricing-strategy/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          treatmentName,
          treatmentCategory,
          region,
          bedCostPerHour,
          treatmentTimeMinutes,
          competitorData,
          clinicInfo: `地域: ${region}、1ベッド時間単価: ¥${bedCostPerHour.toLocaleString()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? 'AI分析に失敗しました');
        return;
      }
      setAnalysisResult(data.content);
      setRecommendedPrice(data.recommendedPrice);
      setMarketStats(data.marketStats);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '通信エラー');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!analysisResult) return;
    const manualData = manualCompetitors
      .filter((c) => c.name && c.price)
      .map((c) => ({
        name: c.name,
        price: parseInt(c.price.replace(/,/g, ''), 10) || 0,
        notes: c.notes,
      }));
    await fetch('/api/pricing-strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        treatmentName,
        treatmentCategory,
        region,
        bedCostPerHour,
        treatmentTimeMinutes,
        competitorData: {
          famous: [...(collectedData?.famous ?? []), ...manualData],
          regional: collectedData?.regional ?? [],
        },
        analysisResult,
        recommendedPrice,
        priceRangeMin: marketStats?.minPrice,
        priceRangeMax: marketStats?.maxPrice,
      }),
    });
    setIsSaved(true);
    await loadSessions();
  };

  const bedCostPerTreatment = Math.ceil(
    (bedCostPerHour * treatmentTimeMinutes) / 60,
  );
  const currentCategory = TREATMENT_CATEGORIES.find(
    (c) => c.id === treatmentCategory,
  );

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 24 }}>
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
          💴 価格戦略アナライザー
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginTop: 4,
          }}
        >
          競合クリニックの価格を収集・分析し、ベッド単価を加味した最適価格をAIが提案します
        </p>
      </div>

      {/* タブ */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--border)',
          marginBottom: 24,
        }}
      >
        {[
          { id: 'analyze' as const, label: '📊 価格分析・提案' },
          { id: 'history' as const, label: `📁 分析履歴（${sessions.length}件）` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              fontSize: 14,
              borderBottom: `2px solid ${activeTab === tab.id ? '#ea580c' : 'transparent'}`,
              color: activeTab === tab.id ? '#ea580c' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              background: 'none',
              border: 'none',
              borderBottomStyle: 'solid',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {errorMessage && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: 16,
            background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.25)',
            borderRadius: 8,
            fontSize: 13,
            color: '#dc2626',
          }}
        >
          {errorMessage}
        </div>
      )}

      {activeTab === 'analyze' && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* 左：設定パネル */}
          <div
            style={{
              width: 320,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* 施術情報 */}
            <div
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 12,
                  color: 'var(--text-primary)',
                }}
              >
                🏥 施術情報
              </h3>

              {/* カテゴリ */}
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  施術カテゴリ
                </label>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  {TREATMENT_CATEGORIES.map((cat) => {
                    const active = treatmentCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setTreatmentCategory(cat.id)}
                        style={{
                          padding: '7px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          background: active
                            ? 'rgba(234,88,12,0.1)'
                            : 'var(--bg-secondary)',
                          border: `1px solid ${active ? '#ea580c' : 'var(--border)'}`,
                          color: active ? '#ea580c' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 施術名 */}
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  施術名 *
                </label>
                <input
                  value={treatmentName}
                  onChange={(e) => setTreatmentName(e.target.value)}
                  placeholder="例：ボトックス（額）"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 13,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 4,
                    marginTop: 6,
                  }}
                >
                  {currentCategory?.examples.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setTreatmentName(ex)}
                      style={{
                        fontSize: 10,
                        padding: '2px 7px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* 施術時間 */}
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  施術時間（分）
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[10, 15, 20, 30, 45, 60].map((t) => {
                    const active = treatmentTimeMinutes === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setTreatmentTimeMinutes(t)}
                        style={{
                          flex: 1,
                          padding: '5px',
                          fontSize: 12,
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: active ? '#ea580c' : 'var(--bg-secondary)',
                          color: active ? '#fff' : 'var(--text-secondary)',
                          border: `1px solid ${active ? '#ea580c' : 'var(--border)'}`,
                        }}
                      >
                        {t}分
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 自院コスト */}
            <div
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 12,
                  color: 'var(--text-primary)',
                }}
              >
                💰 自院コスト設定
              </h3>
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  1ベッド時間単価（円）
                </label>
                <input
                  type="number"
                  value={bedCostPerHour || ''}
                  onChange={(e) =>
                    setBedCostPerHour(parseInt(e.target.value, 10) || 0)
                  }
                  placeholder="例：5000"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 13,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <p
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    marginTop: 4,
                  }}
                >
                  賃料・光熱費・設備費等をベッド数×稼働時間で割った値
                </p>
              </div>
              {bedCostPerHour > 0 && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(234,88,12,0.06)',
                    border: '1px solid rgba(234,88,12,0.2)',
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                  >
                    本施術のベッドコスト
                  </div>
                  <div
                    style={{ fontSize: 20, fontWeight: 700, color: '#ea580c' }}
                  >
                    ¥{bedCostPerTreatment.toLocaleString()}
                  </div>
                  <div
                    style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                  >
                    ¥{bedCostPerHour.toLocaleString()}/h × {treatmentTimeMinutes}分
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#dc2626',
                      marginTop: 4,
                    }}
                  >
                    ※これを下回る価格設定はコスト割れになります
                  </div>
                </div>
              )}
            </div>

            {/* 競合調査 */}
            <div
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 12,
                  color: 'var(--text-primary)',
                }}
              >
                🔍 競合調査設定
              </h3>
              <div style={{ marginBottom: 10 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  地域
                </label>
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="例：滋賀県草津市、東京都渋谷区"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 13,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeFamous}
                    onChange={(e) => setIncludeFamous(e.target.checked)}
                    style={{ accentColor: '#ea580c' }}
                  />
                  有名クリニック（湘南・聖心・Ritz等）
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeRegional}
                    onChange={(e) => setIncludeRegional(e.target.checked)}
                    style={{ accentColor: '#ea580c' }}
                  />
                  地域クリニック（{region || '地域名を入力'}周辺）
                </label>
              </div>
              <button
                onClick={handleCollect}
                disabled={isCollecting || !treatmentName.trim()}
                style={{
                  width: '100%',
                  marginTop: 12,
                  padding: '10px',
                  background: isCollecting ? '#9ca3af' : '#ea580c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: !treatmentName.trim() ? 0.4 : 1,
                }}
              >
                {isCollecting
                  ? '🔍 収集中（30秒程度）...'
                  : '🔍 競合価格を自動収集'}
              </button>
            </div>

            {/* 手動入力 */}
            <div
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  ✏️ 手動で競合を追加
                </h3>
                <button
                  onClick={() =>
                    setManualCompetitors((prev) => [
                      ...prev,
                      { name: '', price: '', notes: '' },
                    ])
                  }
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    background: '#ea580c',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  ＋追加
                </button>
              </div>
              {manualCompetitors.map((comp, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', gap: 6, marginBottom: 6 }}
                >
                  <input
                    value={comp.name}
                    onChange={(e) => {
                      const next = [...manualCompetitors];
                      next[i] = { ...next[i], name: e.target.value };
                      setManualCompetitors(next);
                    }}
                    placeholder="クリニック名"
                    style={{
                      flex: 2,
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '6px 8px',
                      fontSize: 12,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <input
                    value={comp.price}
                    onChange={(e) => {
                      const next = [...manualCompetitors];
                      next[i] = { ...next[i], price: e.target.value };
                      setManualCompetitors(next);
                    }}
                    placeholder="価格(円)"
                    style={{
                      flex: 1,
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '6px 8px',
                      fontSize: 12,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    onClick={() =>
                      setManualCompetitors((prev) =>
                        prev.filter((_, idx) => idx !== i),
                      )
                    }
                    style={{
                      padding: '4px 6px',
                      background: 'none',
                      border: '1px solid #fca5a5',
                      borderRadius: 4,
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* 分析実行 */}
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              style={{
                width: '100%',
                padding: '14px',
                background: isAnalyzing
                  ? '#9ca3af'
                  : 'linear-gradient(135deg, #ea580c, #dc2626)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isAnalyzing
                ? '🤖 AI分析中...'
                : '🤖 最適価格をAIが分析・提案する'}
            </button>
          </div>

          {/* 右：結果パネル */}
          <div style={{ flex: 1, minWidth: 300 }}>
            {/* 競合データ */}
            {collectedData && (
              <div
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 12,
                    color: 'var(--text-primary)',
                  }}
                >
                  📊 収集した競合価格データ
                </h3>

                {collectedData.summary && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    {[
                      {
                        label: '最安値',
                        value: collectedData.summary.min_price,
                        color: '#059669',
                      },
                      {
                        label: '平均価格',
                        value: collectedData.summary.avg_price,
                        color: '#4f46e5',
                      },
                      {
                        label: '最高値',
                        value: collectedData.summary.max_price,
                        color: '#dc2626',
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        style={{
                          padding: 10,
                          background: 'var(--bg-secondary)',
                          borderRadius: 8,
                          textAlign: 'center',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-secondary)',
                            marginBottom: 2,
                          }}
                        >
                          {stat.label}
                        </div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: stat.color,
                          }}
                        >
                          {typeof stat.value === 'number'
                            ? `¥${stat.value.toLocaleString()}`
                            : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 有名クリニック */}
                {(collectedData.famous?.length ?? 0) > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <h4
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 6,
                        color: '#4f46e5',
                      }}
                    >
                      🏆 有名クリニック
                    </h4>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      {collectedData.famous?.map((clinic, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            background: 'var(--bg-secondary)',
                            borderRadius: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              flex: 1,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {clinic.name}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#4f46e5',
                            }}
                          >
                            {typeof clinic.price === 'number'
                              ? `¥${clinic.price.toLocaleString()}`
                              : (clinic.price_display ?? '—')}
                          </span>
                          {clinic.notes && (
                            <span
                              style={{
                                fontSize: 10,
                                color: 'var(--text-secondary)',
                                marginLeft: 6,
                              }}
                            >
                              {clinic.notes}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 地域クリニック */}
                {(collectedData.regional?.length ?? 0) > 0 && (
                  <div>
                    <h4
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        marginBottom: 6,
                        color: '#059669',
                      }}
                    >
                      📍 地域クリニック
                    </h4>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      {collectedData.regional?.map((clinic, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            background: 'var(--bg-secondary)',
                            borderRadius: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              flex: 1,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {clinic.name}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#059669',
                            }}
                          >
                            {typeof clinic.price === 'number'
                              ? `¥${clinic.price.toLocaleString()}`
                              : (clinic.price_display ?? '—')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {collectedData.rawText &&
                  !collectedData.famous?.length &&
                  !collectedData.regional?.length && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        padding: 10,
                        background: 'var(--bg-secondary)',
                        borderRadius: 6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <strong>JSON抽出に失敗しました。生応答:</strong>
                      <br />
                      {collectedData.rawText.slice(0, 800)}...
                    </div>
                  )}
              </div>
            )}

            {/* AI分析結果 */}
            {analysisResult && (
              <div
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {recommendedPrice && (
                  <div
                    style={{
                      padding: '16px 20px',
                      background:
                        'linear-gradient(135deg, #ea580c, #dc2626)',
                      color: '#fff',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          opacity: 0.9,
                          marginBottom: 4,
                        }}
                      >
                        🤖 AI推奨価格 - {treatmentName}
                      </div>
                      <div style={{ fontSize: 32, fontWeight: 800 }}>
                        ¥{recommendedPrice.toLocaleString()}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.8,
                          marginTop: 4,
                        }}
                      >
                        ベッドコスト ¥{bedCostPerTreatment.toLocaleString()} を加味
                      </div>
                    </div>
                    {marketStats && (
                      <div style={{ textAlign: 'right', opacity: 0.9 }}>
                        <div style={{ fontSize: 12, marginBottom: 4 }}>
                          市場平均
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700 }}>
                          ¥{marketStats.avgPrice?.toLocaleString() ?? '—'}
                        </div>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>
                          ¥{marketStats.minPrice?.toLocaleString()}〜¥
                          {marketStats.maxPrice?.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ padding: 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      📋 価格戦略レポート
                    </h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() =>
                          copyToClipboard(analysisResult)
                        }
                        style={{
                          fontSize: 12,
                          padding: '5px 10px',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          background: 'var(--bg-primary)',
                          cursor: 'pointer',
                          color: 'var(--text-primary)',
                        }}
                      >
                        📋 コピー
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={isSaved}
                        style={{
                          fontSize: 12,
                          padding: '5px 10px',
                          background: isSaved ? '#d1fae5' : '#ea580c',
                          color: isSaved ? '#065f46' : '#fff',
                          border: 'none',
                          borderRadius: 6,
                          cursor: isSaved ? 'default' : 'pointer',
                        }}
                      >
                        {isSaved ? '✅ 保存済み' : '💾 保存'}
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.8,
                      whiteSpace: 'pre-wrap',
                      color: 'var(--text-primary)',
                      maxHeight: 600,
                      overflowY: 'auto',
                    }}
                  >
                    {analysisResult}
                  </div>
                </div>
              </div>
            )}

            {/* 初期状態 */}
            {!collectedData && !analysisResult && (
              <div
                style={{
                  height: 400,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px dashed var(--border)',
                  borderRadius: 12,
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 48 }}>💴</div>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    maxWidth: 300,
                  }}
                >
                  施術名・地域を入力して「競合価格を自動収集」を押してください
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    maxWidth: 300,
                  }}
                >
                  有名クリニック・地域クリニックの価格を収集し、ベッド単価を加味した最適価格をAIが提案します
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 履歴タブ */}
      {activeTab === 'history' && (
        <div>
          {sessions.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 60,
                border: '2px dashed var(--border)',
                borderRadius: 12,
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
              <p>まだ分析履歴がありません</p>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: '14px 16px',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    background: 'var(--bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 2,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {s.treatment_name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      📍 {s.region ?? '—'} •{' '}
                      {new Date(s.created_at).toLocaleDateString('ja-JP')}
                    </div>
                  </div>
                  {s.recommended_price && (
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        AI推奨価格
                      </div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: '#ea580c',
                        }}
                      >
                        ¥{s.recommended_price.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
