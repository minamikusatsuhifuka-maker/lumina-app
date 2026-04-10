'use client';

import { useState } from 'react';

const INDUSTRIES = ['IT・SaaS', '医療・ヘルスケア', '飲食・フード', '不動産', '教育', 'コンサルティング', '製造業', '小売・EC', 'その他'];
const TONES = ['親しみやすくプロフェッショナル', 'フォーマル・高級感', 'カジュアル・フレンドリー', 'シンプル・ミニマル'];

export default function HpGeneratorPage() {
  const [form, setForm] = useState({ companyName: '', industry: 'IT・SaaS', target: '', usp: '', tone: '親しみやすくプロフェッショナル' });
  const [result, setResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!form.companyName || !form.target || !form.usp) { alert('会社名・ターゲット・強みを入力してください'); return; }
    setIsLoading(true);
    try {
      const res = await fetch('/api/hp-generator', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setResult(await res.json());
    } finally { setIsLoading(false); }
  };

  const copyText = (text: string, key: string) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); };

  const exportAll = () => {
    if (!result) return;
    const text = `# ${form.companyName} HP コンテンツ\n\n## ヒーローセクション\nキャッチコピー：${result.hero?.headline}\nサブキャッチ：${result.hero?.subheadline}\n説明文：${result.hero?.description}\nCTAボタン：${result.hero?.cta}\n\n## サービス\n${result.services?.map((s: any) => `### ${s.icon} ${s.title}\n${s.description}`).join('\n\n')}\n\n## 特徴\n${result.features?.map((f: any) => `### ${f.title}\n${f.description}`).join('\n\n')}\n\n## 会社概要\n${result.about}\n\n## FAQ\n${result.faq?.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}\n\n## メタディスクリプション\n${result.meta_description}`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${form.companyName}_HP_コンテンツ.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', paddingBottom: 60 }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🏠 HP内容自動生成</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>企業情報を入力するだけで、HPの全セクションコンテンツをAIが自動生成します。</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/lp-generator', icon: '📊', label: 'LP自動生成' },
          { href: '/dashboard/image-prompt', icon: '🎨', label: '画像プロンプト' },
          { href: '/dashboard/doc-prompt', icon: '📋', label: '資料プロンプト' },
          { href: '/dashboard/write', icon: '✍️', label: '文章作成' },
        ].map(link => (
          <a key={link.href} href={link.href} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12 }}>{link.icon}</span>{link.label}
          </a>
        ))}
      </div>

      {/* 入力フォーム */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>会社名・サービス名 *</div>
            <input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="例：xLUMINA"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>業種</div>
            <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
              {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>ターゲット顧客 *</div>
          <input value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} placeholder="例：中小企業のマーケティング担当者"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>強み・USP *</div>
          <textarea value={form.usp} onChange={e => setForm(f => ({ ...f, usp: e.target.value }))} placeholder="例：30以上のAI機能で情報収集から文章生成まで一気通貫"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', minHeight: 70, resize: 'vertical', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>トーン・文体</div>
          <select value={form.tone} onChange={e => setForm(f => ({ ...f, tone: e.target.value }))}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}>
            {TONES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <button onClick={handleGenerate} disabled={isLoading} style={{
          width: '100%', padding: 14, borderRadius: 10, border: 'none', cursor: isLoading ? 'not-allowed' : 'pointer',
          background: isLoading ? 'rgba(108,99,255,0.4)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
          color: '#fff', fontWeight: 700, fontSize: 15,
        }}>
          {isLoading ? '🤖 AIがHP内容を生成中...' : '✨ HP内容を自動生成'}
        </button>
      </div>

      {/* 生成結果 */}
      {result && !result.error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>生成結果</span>
            <button onClick={exportAll} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>💾 全文TXTで保存</button>
          </div>

          {/* ヒーロー */}
          {result.hero && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>🎯 ヒーローセクション</span>
                <button onClick={() => copyText(`${result.hero.headline}\n${result.hero.subheadline}\n${result.hero.description}`, 'hero')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  {copied === 'hero' ? '✅' : '📋 コピー'}
                </button>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>キャッチコピー：</span><strong>{result.hero.headline}</strong></div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>サブキャッチ：</span>{result.hero.subheadline}</div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>説明文：</span>{result.hero.description}</div>
                <div><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>CTA：</span><span style={{ padding: '3px 12px', borderRadius: 20, background: 'var(--accent)', color: '#fff', fontSize: 12 }}>{result.hero.cta}</span></div>
              </div>
            </div>
          )}

          {/* サービス */}
          {result.services && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 12 }}>🛠️ サービス・機能</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {result.services.map((s: any, i: number) => (
                  <div key={i} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.icon} {s.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 会社概要 */}
          {result.about && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>🏢 会社概要</span>
                <button onClick={() => copyText(result.about, 'about')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>{copied === 'about' ? '✅' : '📋 コピー'}</button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{result.about}</p>
            </div>
          )}

          {/* FAQ */}
          {result.faq && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 12 }}>❓ FAQ</span>
              {result.faq.map((f: any, i: number) => (
                <div key={i} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Q: {f.question}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>A: {f.answer}</div>
                </div>
              ))}
            </div>
          )}

          {/* メタディスクリプション */}
          {result.meta_description && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>🔍 メタディスクリプション</span>
                <button onClick={() => copyText(result.meta_description, 'meta')} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>{copied === 'meta' ? '✅' : '📋 コピー'}</button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{result.meta_description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
