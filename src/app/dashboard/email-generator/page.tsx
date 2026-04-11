'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

const EMAIL_TYPES = ['ウェルカム', 'セールス', 'リテンション', 'カート放棄', 'ローンチ'];
const STEP_COUNTS = ['3', '5', '7', '10'];

interface Email {
  step: number;
  timing: string;
  subject: string;
  preheader: string;
  body: string;
  cta_text: string;
  cta_url_placeholder: string;
  psychology: string;
  goal: string;
}

interface EmailResult {
  emails: Email[];
  sequence_strategy: string;
  open_rate_tips: string[];
}

const SAMPLE = {
  product: 'xLUMINA Pro',
  target: '副業・フリーランスで情報発信しているビジネスパーソン',
  goal: '無料トライアルから有料プランへの転換率を上げる',
  steps: '5',
  emailType: 'セールス',
};

export default function EmailGeneratorPage() {
  const [product, setProduct] = useState('');
  const [target, setTarget] = useState('');
  const [goal, setGoal] = useState('');
  const [steps, setSteps] = useState('5');
  const [emailType, setEmailType] = useState('セールス');
  const [result, setResult] = useState<EmailResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const fillSample = () => {
    setProduct(SAMPLE.product);
    setTarget(SAMPLE.target);
    setGoal(SAMPLE.goal);
    setSteps(SAMPLE.steps);
    setEmailType(SAMPLE.emailType);
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
    setActiveStep(0);

    try {
      const res = await fetch('/api/email-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, target, goal, steps, emailType }),
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
    lines.push(`【ステップメール — ${product}】`);
    lines.push(`タイプ: ${emailType} / ${result.emails.length}通`);
    lines.push('');
    lines.push(`【シーケンス戦略】`);
    lines.push(result.sequence_strategy);
    lines.push('');
    result.emails.forEach(email => {
      lines.push(`=== STEP ${email.step}（${email.timing}） ===`);
      lines.push(`件名: ${email.subject}`);
      lines.push(`プリヘッダー: ${email.preheader}`);
      lines.push(`心理テクニック: ${email.psychology}`);
      lines.push(`目標: ${email.goal}`);
      lines.push('');
      lines.push(email.body);
      lines.push('');
      lines.push(`CTA: ${email.cta_text}`);
      lines.push(`URL: ${email.cta_url_placeholder}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    });
    lines.push(`【開封率アップのヒント】`);
    result.open_rate_tips.forEach(tip => lines.push(`  - ${tip}`));

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `step_email_${product}_${Date.now()}.txt`;
    a.click();
  };

  const copyCurrentEmail = () => {
    if (!result) return;
    const email = result.emails[activeStep];
    if (!email) return;
    const text = `件名: ${email.subject}\nプリヘッダー: ${email.preheader}\n\n${email.body}\n\nCTA: ${email.cta_text}`;
    copyText(text, `email-${activeStep}`);
  };

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="ステップメールを生成中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        ステップメール生成
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        高開封率・高クリック率のステップメールシーケンスをAIが自動設計します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/copy-generator', icon: '💬', label: 'コピー生成' },
          { href: '/dashboard/ab-test', icon: '🔀', label: 'ABテスト生成' },
          { href: '/dashboard/persona', icon: '👤', label: 'ペルソナ生成' },
          { href: '/dashboard/lp-generator', icon: '📊', label: 'LP自動生成' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>ステップメールを設計</span>
          <button onClick={fillSample} style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
          }}>サンプルを入力</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>メールタイプ</label>
            <select
              value={emailType}
              onChange={e => setEmailType(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            >
              {EMAIL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>通数</label>
            <select
              value={steps}
              onChange={e => setSteps(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            >
              {STEP_COUNTS.map(s => <option key={s} value={s}>{s}通</option>)}
            </select>
          </div>
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
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>シーケンスの目的</label>
          <input
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="例：無料トライアルから有料プランへの転換率を上げる"
            style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
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
            {loading ? '生成中...' : 'メールを生成'}
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
          ステップメールシーケンスをAIが設計しています...
        </div>
      )}

      {/* 結果表示 */}
      {result && result.emails && result.emails.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <SaveToLibraryButton
              title={`ステップメール: ${product}`}
              content={rawText}
              type="email-generator"
              groupName="ステップメール"
              tags="メール,マーケティング"
            />
            <button onClick={exportTxt} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              TXTエクスポート
            </button>
          </div>

          {/* シーケンス戦略 */}
          {result.sequence_strategy && (
            <div style={{ background: 'linear-gradient(135deg, #6c63ff10, #00d4b810)', border: '1px solid #6c63ff30', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#6c63ff', marginBottom: 8 }}>シーケンス戦略</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {result.sequence_strategy}
              </div>
            </div>
          )}

          {/* ステップタブ */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {result.emails.map((email, i) => (
              <button key={i} onClick={() => setActiveStep(i)} style={{
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
                border: activeStep === i ? '2px solid #6c63ff' : '1px solid var(--border)',
                background: activeStep === i ? '#6c63ff15' : 'var(--bg-secondary)',
                color: activeStep === i ? '#6c63ff' : 'var(--text-muted)',
              }}>
                STEP {email.step}
              </button>
            ))}
          </div>

          {/* アクティブなメール表示 */}
          {(() => {
            const email = result.emails[activeStep];
            if (!email) return null;
            return (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
                {/* タイミング */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: '#6c63ff15', border: '1px solid #6c63ff30', color: '#6c63ff', fontWeight: 700 }}>
                      STEP {email.step}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{email.timing}</span>
                  </div>
                  <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.2)', color: '#f5a623', fontWeight: 600 }}>
                    {email.psychology}
                  </span>
                </div>

                {/* 件名 */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>件名</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {email.subject}
                  </div>
                </div>

                {/* プリヘッダー */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>プリヘッダー</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {email.preheader}
                  </div>
                </div>

                {/* 本文 */}
                <div style={{ marginBottom: 20, padding: '16px 20px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {email.body}
                  </div>
                </div>

                {/* CTAプレビュー */}
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'inline-block', padding: '14px 40px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', color: '#fff', borderRadius: 8, fontSize: 16, fontWeight: 700 }}>
                    {email.cta_text}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>URL: {email.cta_url_placeholder}</div>
                </div>

                {/* 目標 */}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 8 }}>
                  このメールの目標: {email.goal}
                </div>

                {/* アクション */}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button onClick={copyCurrentEmail} style={{
                    padding: '8px 20px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600,
                  }}>
                    {copied === `email-${activeStep}` ? 'コピー済み' : 'このメールをコピー'}
                  </button>
                  {activeStep < result.emails.length - 1 && (
                    <button onClick={() => setActiveStep(activeStep + 1)} style={{
                      padding: '8px 20px', background: 'linear-gradient(135deg, #6c63ff, #00d4b8)',
                      color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}>
                      次のステップへ →
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 開封率のヒント */}
          {result.open_rate_tips && result.open_rate_tips.length > 0 && (
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f5a623', marginBottom: 12 }}>開封率アップのヒント</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.open_rate_tips.map((tip, i) => (
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
