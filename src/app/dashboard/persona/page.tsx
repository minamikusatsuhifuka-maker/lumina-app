'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

const INDUSTRIES = ['IT・SaaS', '医療・ヘルスケア', '飲食・フード', '不動産', '教育・研修', 'コンサルティング', '製造業', '小売・EC', '金融・保険', '美容・エステ', 'その他'];
const AGE_RANGES = ['18〜24歳', '25〜34歳', '35〜44歳', '45〜54歳', '55〜64歳', '65歳以上', '指定なし'];
const GENDERS = ['男性', '女性', '指定なし'];

interface Persona {
  name: string;
  age: number;
  gender: string;
  occupation: string;
  income: string;
  location: string;
  family: string;
  personality: string;
  daily_life: string;
  goals: string[];
  pains: string[];
  information_sources: string[];
  purchase_triggers: string[];
  objections: string[];
  ideal_message: string;
  best_channel: string;
}

interface PersonaResult {
  personas: Persona[];
  common_insights: string;
  marketing_strategy: string;
}

const SAMPLE = {
  product: 'xLUMINA Pro',
  industry: 'IT・SaaS',
  ageRange: '25〜34歳',
  gender: '指定なし',
};

const AVATAR_COLORS = ['#6c63ff', '#00d4b8', '#f5a623'];

export default function PersonaPage() {
  const [product, setProduct] = useState('');
  const [industry, setIndustry] = useState('IT・SaaS');
  const [ageRange, setAgeRange] = useState('25〜34歳');
  const [gender, setGender] = useState('指定なし');
  const [result, setResult] = useState<PersonaResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const fillSample = () => {
    setProduct(SAMPLE.product);
    setIndustry(SAMPLE.industry);
    setAgeRange(SAMPLE.ageRange);
    setGender(SAMPLE.gender);
  };

  const generate = async () => {
    if (!product.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);
    setRawText('');

    try {
      const res = await fetch('/api/persona-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, industry, ageRange, gender }),
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

  const exportTxt = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`【ペルソナ分析 — ${product}】`);
    lines.push('');
    result.personas.forEach((p, i) => {
      lines.push(`=== ペルソナ ${i + 1}: ${p.name} ===`);
      lines.push(`年齢: ${p.age}歳 / 性別: ${p.gender}`);
      lines.push(`職業: ${p.occupation} / 年収: ${p.income}`);
      lines.push(`居住地: ${p.location} / 家族: ${p.family}`);
      lines.push(`性格: ${p.personality}`);
      lines.push(`日常: ${p.daily_life}`);
      lines.push('');
      lines.push('目標:');
      p.goals.forEach(g => lines.push(`  - ${g}`));
      lines.push('悩み:');
      p.pains.forEach(pa => lines.push(`  - ${pa}`));
      lines.push('情報収集源:');
      p.information_sources.forEach(s => lines.push(`  - ${s}`));
      lines.push('購買トリガー:');
      p.purchase_triggers.forEach(t => lines.push(`  - ${t}`));
      lines.push('購入をためらう理由:');
      p.objections.forEach(o => lines.push(`  - ${o}`));
      lines.push(`最適メッセージ: ${p.ideal_message}`);
      lines.push(`最適チャネル: ${p.best_channel}`);
      lines.push('');
    });
    lines.push(`【共通インサイト】`);
    lines.push(result.common_insights);
    lines.push('');
    lines.push(`【マーケティング戦略】`);
    lines.push(result.marketing_strategy);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `persona_${product}_${Date.now()}.txt`;
    a.click();
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="ペルソナを生成中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        ペルソナ生成
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        商品・サービスのターゲットペルソナをAIが詳細に3人分生成します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/copy-generator', icon: '💬', label: 'コピー生成' },
          { href: '/dashboard/ab-test', icon: '🔀', label: 'ABテスト生成' },
          { href: '/dashboard/lp-generator', icon: '📊', label: 'LP自動生成' },
          { href: '/dashboard/email-generator', icon: '📧', label: 'ステップメール' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>ターゲットペルソナを生成</span>
          <button onClick={fillSample} style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
          }}>サンプルを入力</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>商品・サービス名 *</label>
          <input
            value={product}
            onChange={e => setProduct(e.target.value)}
            placeholder="例：xLUMINA Pro"
            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>業界</label>
            <select
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            >
              {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>年齢層</label>
            <select
              value={ageRange}
              onChange={e => setAgeRange(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            >
              {AGE_RANGES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>性別</label>
            <select
              value={gender}
              onChange={e => setGender(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            >
              {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>* は必須項目です</div>
          <button onClick={generate} disabled={loading || !product.trim()} style={{
            padding: '12px 36px',
            background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: (loading || !product.trim()) ? 0.5 : 1,
          }}>
            {loading ? '生成中...' : 'ペルソナを生成'}
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
          リアルなペルソナをAIが設計しています...
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveToLibraryButton
              title={`ペルソナ: ${product}`}
              content={rawText}
              type="persona"
              groupName="ペルソナ生成"
              tags="ペルソナ,マーケティング"
            />
            <button onClick={exportTxt} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              TXTエクスポート
            </button>
          </div>

          {/* 3ペルソナカード */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {(result.personas || []).map((p, i) => {
              const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* アバター・名前 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, ${color}aa)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {p.name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.age}歳 / {p.gender}</div>
                    </div>
                  </div>

                  {/* 基本情報 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                    <div style={{ color: 'var(--text-muted)' }}>職業: <span style={{ color: 'var(--text-secondary)' }}>{p.occupation}</span></div>
                    <div style={{ color: 'var(--text-muted)' }}>年収: <span style={{ color: 'var(--text-secondary)' }}>{p.income}</span></div>
                    <div style={{ color: 'var(--text-muted)' }}>居住地: <span style={{ color: 'var(--text-secondary)' }}>{p.location}</span></div>
                    <div style={{ color: 'var(--text-muted)' }}>家族: <span style={{ color: 'var(--text-secondary)' }}>{p.family}</span></div>
                  </div>

                  {/* 性格 */}
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 8 }}>
                    {p.personality}
                  </div>

                  {/* 日常 */}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {p.daily_life}
                  </div>

                  {/* 目標 */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#4ade80', marginBottom: 4 }}>目標</div>
                    {(p.goals || []).map((g, gi) => (
                      <div key={gi} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '3px 0', lineHeight: 1.5 }}>
                        ・{g}
                      </div>
                    ))}
                  </div>

                  {/* 悩み */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#ff6b6b', marginBottom: 4 }}>悩み・課題</div>
                    {(p.pains || []).map((pa, pi) => (
                      <div key={pi} style={{ fontSize: 12, color: '#ff6b6b', padding: '3px 0', lineHeight: 1.5 }}>
                        ・{pa}
                      </div>
                    ))}
                  </div>

                  {/* 情報収集源 */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>情報収集源</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(p.information_sources || []).map((s, si) => (
                        <span key={si} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12, background: `${color}15`, border: `1px solid ${color}30`, color: 'var(--text-secondary)' }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 購買トリガー */}
                  <div style={{ fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>購買トリガー: </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{(p.purchase_triggers || []).join('、')}</span>
                  </div>

                  {/* 最適メッセージ */}
                  <div style={{ padding: '10px 14px', background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: color, marginBottom: 4 }}>最も響くメッセージ</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.5 }}>
                      &ldquo;{p.ideal_message}&rdquo;
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>最適チャネル: {p.best_channel}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 共通インサイト */}
          {result.common_insights && (
            <div style={{ background: 'linear-gradient(135deg, #6c63ff10, #00d4b810)', border: '1px solid #6c63ff30', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>共通インサイト</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {result.common_insights}
              </div>
            </div>
          )}

          {/* マーケティング戦略 */}
          {result.marketing_strategy && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>マーケティング戦略サマリー</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {result.marketing_strategy}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
