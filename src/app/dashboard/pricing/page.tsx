'use client';
import { useState } from 'react';

const PLANS = [
  {
    name: 'Free',
    price: '無料',
    color: '#7878a0',
    features: [
      '文章作成（月20回）',
      'Web情報収集（月10回）',
      'ライブラリ（50件）',
      '文献検索（無制限）',
    ],
    cta: '現在のプラン',
    disabled: true,
  },
  {
    name: 'Pro',
    price: '¥2,980 / 月',
    color: '#6c63ff',
    badge: '🔥 最人気',
    features: [
      '✅ 全機能無制限',
      '✅ Intelligence Hub 全8モード',
      '✅ 経営インテリジェンス 全7種',
      '✅ AI分析エンジン 全6種',
      '✅ カスタムAIペルソナ 無制限',
      '✅ PDF出力・定期アラート',
      '✅ 優先サポート',
    ],
    cta: 'Proにアップグレード',
    disabled: false,
  },
];

export default function PricingPage() {
  const [loading, setLoading] = useState(false);

  const checkout = async () => {
    setLoading(true);
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    setLoading(false);
  };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>💳 プランを選ぶ</h1>
      <p style={{ color: '#7878a0', marginBottom: 32 }}>あなたのビジネスに最適なプランで、LUMINAをフル活用してください</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, maxWidth: 800 }}>
        {PLANS.map(plan => (
          <div key={plan.name} style={{
            background: '#12142a',
            border: `2px solid ${plan.color}${plan.disabled ? '40' : ''}`,
            borderRadius: 16, padding: 28,
            position: 'relative' as const,
          }}>
            {plan.badge && (
              <div style={{ position: 'absolute' as const, top: -12, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#fff', padding: '4px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' as const }}>
                {plan.badge}
              </div>
            )}
            <div style={{ fontSize: 22, fontWeight: 700, color: plan.color, marginBottom: 4 }}>{plan.name}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 20 }}>{plan.price}</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 24 }}>
              {plan.features.map(f => (
                <div key={f} style={{ fontSize: 13, color: '#c0c0e0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!f.startsWith('✅') && <span style={{ color: '#5a5a7a' }}>•</span>}
                  {f}
                </div>
              ))}
            </div>
            <button
              onClick={plan.disabled ? undefined : checkout}
              disabled={plan.disabled || loading}
              style={{
                width: '100%', padding: '12px',
                background: plan.disabled ? '#1a1d36' : `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`,
                color: plan.disabled ? '#5a5a7a' : '#fff',
                border: plan.disabled ? '1px solid rgba(130,140,255,0.2)' : 'none',
                borderRadius: 8, fontWeight: 700, fontSize: 14,
                cursor: plan.disabled ? 'default' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading && !plan.disabled ? '処理中...' : plan.cta}
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24, padding: 16, background: '#12142a', borderRadius: 10, fontSize: 12, color: '#5a5a7a', maxWidth: 800 }}>
        💡 クレジットカード決済（Stripe）/ いつでもキャンセル可能 / 日本円対応
      </div>
    </div>
  );
}
