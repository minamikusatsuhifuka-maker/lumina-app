'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

interface Variant {
  type: string;
  strategy: string;
  headline: string;
  body: string;
  cta: string;
  target_emotion: string;
  expected_ctr: string;
}

interface ABResult {
  variants: Variant[];
  recommendation: string;
  test_tips: string[];
}

const VARIANT_COLORS: Record<string, string> = {
  '感情訴求型': '#ff6b6b',
  '論理訴求型': '#6c63ff',
  '社会的証明型': '#4ade80',
};

const SAMPLE = {
  product: 'xLUMINA Pro',
  target: '副業・フリーランスで情報発信しているビジネスパーソン',
  content: '30以上のAI機能を搭載。情報収集・文章生成・LP作成を全自動化。月額9,800円で代理店不要のマーケティングツール。',
};

export default function ABTestPage() {
  const [product, setProduct] = useState('');
  const [target, setTarget] = useState('');
  const [content, setContent] = useState('');
  const [result, setResult] = useState<ABResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const fillSample = () => {
    setProduct(SAMPLE.product);
    setTarget(SAMPLE.target);
    setContent(SAMPLE.content);
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const generate = async () => {
    if (!product.trim() || !target.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);
    setRawText('');

    try {
      const res = await fetch('/api/ab-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, target, content }),
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
      <ProgressBar loading={progressLoading} progress={progress} label="ABテストバリアントを生成中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        ABテスト生成
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        3つの心理アプローチでABテスト用のコピーバリエーションを自動生成します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/copy-generator', icon: '💬', label: 'コピー生成' },
          { href: '/dashboard/lp-generator', icon: '📊', label: 'LP自動生成' },
          { href: '/dashboard/persona', icon: '👤', label: 'ペルソナ生成' },
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
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>ABテスト用コピーを生成</span>
          <button onClick={fillSample} style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
          }}>サンプルを入力</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>商品・サービス名 *</label>
            <input
              value={product}
              onChange={e => setProduct(e.target.value)}
              placeholder="例：xLUMINA Pro"
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>ターゲット *</label>
            <input
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="例：副業・フリーランスで情報発信するビジネスパーソン"
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>現在のコピー・訴求内容</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="例：30以上のAI機能を搭載。情報収集・文章生成・LP作成を全自動化。"
            style={{ width: '100%', minHeight: 100, padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>* は必須項目です</div>
          <button onClick={generate} disabled={loading || !product.trim() || !target.trim()} style={{
            padding: '12px 36px',
            background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: (loading || !product.trim() || !target.trim()) ? 0.5 : 1,
          }}>
            {loading ? '生成中...' : 'ABテストを生成'}
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
          3パターンのバリエーションをAIが設計しています...
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveToLibraryButton
              title={`ABテスト: ${product}`}
              content={rawText}
              type="ab-test"
              groupName="ABテスト生成"
              tags="ABテスト,マーケティング"
            />
            <button onClick={() => copyText(rawText, 'json')} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              {copied === 'json' ? 'コピー済み' : 'JSONコピー'}
            </button>
          </div>

          {/* 3バリアントカード */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {(result.variants || []).map((v, i) => {
              const color = VARIANT_COLORS[v.type] || '#6c63ff';
              return (
                <div key={i} style={{ background: 'var(--bg-secondary)', border: `1px solid ${color}30`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* タイプラベル */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: `${color}15`, color: color, fontWeight: 700 }}>
                      {v.type}
                    </span>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: `${color}10`, color: color, fontWeight: 600 }}>
                      CTR: {v.expected_ctr}
                    </span>
                  </div>

                  {/* 戦略 */}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {v.strategy}
                  </div>

                  {/* ヘッドライン */}
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {v.headline}
                  </div>

                  {/* ボディ */}
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, flex: 1 }}>
                    {v.body}
                  </div>

                  {/* CTA */}
                  <div style={{ textAlign: 'center', padding: '10px 16px', background: `linear-gradient(135deg, ${color}, ${color}cc)`, color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700 }}>
                    {v.cta}
                  </div>

                  {/* 狙う感情 */}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    狙う感情: {v.target_emotion}
                  </div>

                  {/* コピーボタン */}
                  <button onClick={() => copyText(`${v.headline}\n\n${v.body}\n\n${v.cta}`, `variant-${i}`)} style={{
                    padding: '8px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
                  }}>
                    {copied === `variant-${i}` ? 'コピー済み' : 'このバリアントをコピー'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* 推奨バリアント */}
          {result.recommendation && (
            <div style={{ background: 'linear-gradient(135deg, #6c63ff10, #00d4b810)', border: '1px solid #6c63ff30', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>推奨バリアント</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {result.recommendation}
              </div>
            </div>
          )}

          {/* テストのヒント */}
          {result.test_tips && result.test_tips.length > 0 && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f5a623', marginBottom: 12 }}>ABテスト実施のヒント</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.test_tips.map((tip, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.15)', borderRadius: 8, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {tip}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
