'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

const FRAMEWORKS = [
  { id: 'PASONA', label: 'PASONA', desc: '共感→解決→限定→行動', color: '#6c63ff' },
  { id: 'AIDA', label: 'AIDA', desc: '注目→興味→欲求→行動', color: '#00d4b8' },
  { id: 'PAB', label: 'PAB', desc: '問題→深掘り→ベネフィット', color: '#f5a623' },
  { id: 'QUEST', label: 'QUEST', desc: '絞込→共感→教育→刺激→行動', color: '#4ade80' },
];

const COPY_TYPES = ['LP・HP全般', 'SNS広告', 'メルマガ件名', 'バナー広告', 'YouTube広告', 'DM・チラシ'];

interface CopyResult {
  headline: string;
  subheadline: string;
  body: string;
  cta: string;
  tagline: string;
  hooks: string[];
  psychology_used: string[];
  improvement_tips: string[];
}

const SAMPLE = {
  product: 'xLUMINA Pro',
  target: '副業・フリーランスで情報発信しているビジネスパーソン',
  problem: '情報収集に毎日3時間かかる。文章が書けない。LP制作に数十万円かかる。SNS投稿のネタが尽きる。',
  benefit: '30以上のAI機能で情報収集から文章生成まで全自動。LP・HP・SNS投稿もAIが一括生成。月額9,800円で代理店不要。',
};

export default function CopyGeneratorPage() {
  const [framework, setFramework] = useState('PASONA');
  const [product, setProduct] = useState('');
  const [target, setTarget] = useState('');
  const [problem, setProblem] = useState('');
  const [benefit, setBenefit] = useState('');
  const [copyType, setCopyType] = useState('LP・HP全般');
  const [result, setResult] = useState<CopyResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const fillSample = () => {
    setProduct(SAMPLE.product);
    setTarget(SAMPLE.target);
    setProblem(SAMPLE.problem);
    setBenefit(SAMPLE.benefit);
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
      const res = await fetch('/api/copy-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, target, problem, benefit, framework, copyType }),
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

  const selectedFramework = FRAMEWORKS.find(f => f.id === framework);

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="コピーを生成中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        コピー生成
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        セールスフレームワークに基づいて、マーケティングコピーをAIが自動生成します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/lp-generator', icon: '📊', label: 'LP自動生成' },
          { href: '/dashboard/hp-generator', icon: '🏠', label: 'HP内容生成' },
          { href: '/dashboard/ab-test', icon: '🔀', label: 'ABテスト生成' },
          { href: '/dashboard/persona', icon: '👤', label: 'ペルソナ生成' },
          { href: '/dashboard/email-generator', icon: '📧', label: 'ステップメール' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* フレームワーク選択 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {FRAMEWORKS.map(f => (
          <button key={f.id} onClick={() => setFramework(f.id)} style={{
            padding: '14px 10px', borderRadius: 10, cursor: 'pointer',
            textAlign: 'center', transition: 'all 0.15s',
            border: framework === f.id ? `2px solid ${f.color}` : '1px solid var(--border)',
            background: framework === f.id ? `${f.color}15` : 'var(--bg-secondary)',
            color: framework === f.id ? f.color : 'var(--text-muted)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{f.desc}</div>
          </button>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: `1px solid ${selectedFramework?.color}30`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: selectedFramework?.color }}>{selectedFramework?.label} フレームワークでコピーを生成</span>
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

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>悩み・課題</label>
          <textarea
            value={problem}
            onChange={e => setProblem(e.target.value)}
            placeholder="例：情報収集に毎日3時間かかる、文章が書けない、LP制作に数十万円かかる"
            style={{ width: '100%', minHeight: 80, padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>ベネフィット・強み</label>
          <textarea
            value={benefit}
            onChange={e => setBenefit(e.target.value)}
            placeholder="例：30以上のAI機能で情報収集から文章生成まで全自動。月額9,800円。"
            style={{ width: '100%', minHeight: 80, padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>コピーの用途</label>
          <select
            value={copyType}
            onChange={e => setCopyType(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          >
            {COPY_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>* は必須項目です</div>
          <button onClick={generate} disabled={loading || !product.trim() || !target.trim()} style={{
            padding: '12px 36px',
            background: `linear-gradient(135deg, ${selectedFramework?.color}, ${selectedFramework?.color}cc)`,
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: (loading || !product.trim() || !target.trim()) ? 0.5 : 1,
          }}>
            {loading ? '生成中...' : 'コピーを生成'}
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
          <div style={{ width: 20, height: 20, border: `2px solid ${selectedFramework?.color}40`, borderTopColor: selectedFramework?.color, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          マーケティングコピーをAIが設計しています...
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveToLibraryButton
              title={`コピー: ${product}`}
              content={rawText}
              type="copy-generator"
              groupName="コピー生成"
              tags="コピー,マーケティング"
            />
            <button onClick={() => copyText(rawText, 'json')} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              {copied === 'json' ? 'コピー済み' : 'JSONコピー'}
            </button>
          </div>

          {/* ヘッドライン */}
          <div style={{ background: 'linear-gradient(135deg, #6c63ff15, #00d4b815)', border: '1px solid #6c63ff30', borderRadius: 12, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
              {result.headline}
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
              {result.subheadline}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => copyText(result.headline, 'headline')} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                {copied === 'headline' ? 'コピー済み' : 'ヘッドラインをコピー'}
              </button>
              <button onClick={() => copyText(result.subheadline, 'sub')} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                {copied === 'sub' ? 'コピー済み' : 'サブヘッドをコピー'}
              </button>
            </div>
          </div>

          {/* ボディコピー */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>ボディコピー</div>
              <button onClick={() => copyText(result.body, 'body')} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                {copied === 'body' ? 'コピー済み' : 'コピー'}
              </button>
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {result.body}
            </div>
          </div>

          {/* CTAボタンプレビュー */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>CTAプレビュー</div>
            <div style={{ display: 'inline-block', padding: '14px 40px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', color: '#fff', borderRadius: 8, fontSize: 16, fontWeight: 700 }}>
              {result.cta}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              タグライン: {result.tagline}
            </div>
            <button onClick={() => copyText(result.cta, 'cta')} style={{ marginTop: 8, fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-muted)', cursor: 'pointer' }}>
              {copied === 'cta' ? 'コピー済み' : 'CTAをコピー'}
            </button>
          </div>

          {/* SNSフック */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>SNSオープニング文（フック）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(result.hooks || []).map((hook, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1 }}>
                    {hook}
                  </div>
                  <button onClick={() => copyText(hook, `hook-${i}`)} style={{ marginLeft: 12, fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {copied === `hook-${i}` ? 'コピー済み' : 'コピー'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 使用した心理テクニック */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>使用した心理テクニック</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(result.psychology_used || []).map((p, i) => (
                <span key={i} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 20, background: 'linear-gradient(135deg, #6c63ff15, #00d4b815)', border: '1px solid #6c63ff30', color: 'var(--text-secondary)' }}>
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* 改善アドバイス */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f5a623', marginBottom: 12 }}>改善アドバイス</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(result.improvement_tips || []).map((tip, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.15)', borderRadius: 8, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {tip}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
