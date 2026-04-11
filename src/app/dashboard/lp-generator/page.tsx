'use client';
import { useState } from 'react';
import { ProgressBar } from '@/components/ProgressBar';
import { useProgress } from '@/components/useProgress';
import { SaveToLibraryButton } from '@/components/SaveToLibraryButton';

const FRAMEWORKS = [
  { id: 'pasona', label: '🎯 PASONA', desc: '問題提起→共感→解決策→提案→行動', color: '#6c63ff' },
  { id: 'aida', label: '✨ AIDA', desc: '注目→興味→欲求→行動', color: '#00d4b8' },
  { id: 'pab', label: '💡 PAB', desc: '問題→煽り→利益', color: '#f5a623' },
  { id: 'quest', label: '🔍 QUEST', desc: '適格→理解→教育→刺激→転換', color: '#4ade80' },
];

interface LPForm {
  productName: string;
  target: string;
  problem: string;
  solution: string;
  price: string;
  cta: string;
}

interface CTASection {
  position: string;
  heading: string;
  text: string;
  button_text: string;
}

interface LPResult {
  headline: string;
  subheadline: string;
  problem_section: { heading: string; points: string[] };
  solution_section: { heading: string; benefits: string[] };
  social_proof: { heading: string; points: string[] };
  offer: { heading: string; price_display: string; guarantee: string };
  faq: { question: string; answer: string }[];
  cta_sections: CTASection[];
}

const INITIAL_FORM: LPForm = {
  productName: '',
  target: '',
  problem: '',
  solution: '',
  price: '',
  cta: '',
};

export default function LPGeneratorPage() {
  const [framework, setFramework] = useState('pasona');
  const [form, setForm] = useState<LPForm>(INITIAL_FORM);
  const [result, setResult] = useState<LPResult | null>(null);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { progress, loading: progressLoading, startProgress, completeProgress, resetProgress } = useProgress();

  const LP_SAMPLES: Record<string, LPForm> = {
    pasona: { productName: 'xLUMINA Pro', target: '副業・フリーランスで情報発信しているビジネスパーソン', problem: '情報収集に毎日3時間かかる・文章が書けない・LP制作に数十万円かかる', solution: '30以上のAI機能で情報収集から文章生成まで全自動。LP・HP・SNS投稿もAIが一括生成。', price: '月額9,800円（税込）・14日間無料トライアルあり', cta: '14日間無料で試す →' },
    aida: { productName: 'AIライティングアシスタント', target: 'ブログ・note・メルマガで情報発信したい個人事業主', problem: '文章を書くのが苦手・時間がかかりすぎる', solution: 'AIが高品質な文章を数分で生成。バズり予測・SEO最適化も自動対応。', price: '月額2,980円（税込）・初月無料', cta: '今すぐ無料で始める' },
    pab: { productName: 'Web情報自動収集ツール', target: 'マーケターやコンサルタント', problem: '競合調査・市場分析に毎週何時間もかけている', solution: 'キーワードを入力するだけでAIが最新情報を自動収集・分析レポートを生成', price: '月額5,800円・7日間無料', cta: '無料で試してみる' },
    quest: { productName: 'AIマーケティング講座', target: 'マーケティングを学びたい中小企業の経営者', problem: 'マーケティングの知識がなく、広告費を無駄にしている', solution: 'AIを活用した現代マーケティングの実践講座。すぐに使えるテンプレート付き。', price: '一括49,800円または月額4,980円×12回', cta: '無料説明会に参加する' },
  };

  const updateForm = (key: keyof LPForm, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const generate = async () => {
    if (!form.productName.trim() || !form.target.trim()) return;
    setLoading(true);
    startProgress();
    setError('');
    setResult(null);
    setRawText('');

    try {
      const res = await fetch('/api/lp-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, framework }),
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

  /** TXTエクスポート */
  const exportTxt = () => {
    if (!result) return;
    const lines: string[] = [];
    lines.push(`【LP構成 — ${FRAMEWORKS.find(f => f.id === framework)?.label}】`);
    lines.push('');
    lines.push(`■ ヘッドライン: ${result.headline}`);
    lines.push(`■ サブヘッドライン: ${result.subheadline}`);
    lines.push('');
    lines.push(`■ ${result.problem_section.heading}`);
    result.problem_section.points.forEach(p => lines.push(`  ・${p}`));
    lines.push('');
    lines.push(`■ ${result.solution_section.heading}`);
    result.solution_section.benefits.forEach(b => lines.push(`  ・${b}`));
    lines.push('');
    lines.push(`■ ${result.social_proof.heading}`);
    result.social_proof.points.forEach(p => lines.push(`  ・${p}`));
    lines.push('');
    lines.push(`■ ${result.offer.heading}`);
    lines.push(`  価格: ${result.offer.price_display}`);
    lines.push(`  保証: ${result.offer.guarantee}`);
    lines.push('');
    lines.push('■ FAQ');
    result.faq.forEach(f => {
      lines.push(`  Q: ${f.question}`);
      lines.push(`  A: ${f.answer}`);
      lines.push('');
    });
    lines.push('■ CTA');
    result.cta_sections.forEach(c => {
      lines.push(`  [${c.position}] ${c.heading}`);
      lines.push(`  ${c.text}`);
      lines.push(`  ボタン: ${c.button_text}`);
      lines.push('');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lp_${form.productName || 'output'}_${Date.now()}.txt`;
    a.click();
  };

  /** HTMLエクスポート — スタンドアロンHTML */
  const exportHtml = () => {
    if (!result) return;

    const faqHtml = result.faq.map(f => `
      <div style="background:#fff;border-radius:12px;padding:24px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <div style="font-weight:700;font-size:17px;margin-bottom:8px;color:#333;">Q. ${f.question}</div>
        <div style="color:#666;font-size:15px;line-height:1.8;">A. ${f.answer}</div>
      </div>`).join('\n');

    const problemPoints = result.problem_section.points.map(p =>
      `<li style="margin-bottom:8px;color:#555;font-size:15px;line-height:1.7;">${p}</li>`
    ).join('\n');

    const benefitPoints = result.solution_section.benefits.map(b =>
      `<li style="margin-bottom:8px;color:#555;font-size:15px;line-height:1.7;">${b}</li>`
    ).join('\n');

    const proofPoints = result.social_proof.points.map(p =>
      `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.06);"><p style="color:#555;font-size:14px;line-height:1.7;">${p}</p></div>`
    ).join('\n');

    const ctaBlock = (cta: CTASection) => `
      <div style="text-align:center;padding:60px 20px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;margin:40px 0;">
        <h2 style="font-size:28px;font-weight:800;margin-bottom:12px;">${cta.heading}</h2>
        <p style="font-size:16px;margin-bottom:24px;opacity:0.9;">${cta.text}</p>
        <a href="#" style="display:inline-block;padding:16px 48px;background:#fff;color:#764ba2;font-size:18px;font-weight:700;border-radius:50px;text-decoration:none;box-shadow:0 4px 15px rgba(0,0,0,0.2);transition:transform 0.2s;">${cta.button_text}</a>
      </div>`;

    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${result.headline}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN", sans-serif; color: #333; }
  a:hover { transform: scale(1.05); }
</style>
</head>
<body>

<!-- ヒーロー -->
<div style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;text-align:center;padding:100px 20px 80px;">
  <h1 style="font-size:36px;font-weight:900;margin-bottom:16px;line-height:1.3;">${result.headline}</h1>
  <p style="font-size:18px;opacity:0.9;max-width:600px;margin:0 auto;line-height:1.6;">${result.subheadline}</p>
</div>

${result.cta_sections[0] ? ctaBlock(result.cta_sections[0]) : ''}

<!-- 問題提起 -->
<div style="max-width:800px;margin:60px auto;padding:0 20px;">
  <h2 style="font-size:24px;font-weight:800;text-align:center;margin-bottom:32px;color:#333;">${result.problem_section.heading}</h2>
  <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <ul style="list-style:none;padding:0;">
      ${problemPoints}
    </ul>
  </div>
</div>

<!-- 解決策 -->
<div style="background:#f8f9ff;padding:60px 20px;">
  <div style="max-width:800px;margin:0 auto;">
    <h2 style="font-size:24px;font-weight:800;text-align:center;margin-bottom:32px;color:#333;">${result.solution_section.heading}</h2>
    <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <ul style="list-style:none;padding:0;">
        ${benefitPoints}
      </ul>
    </div>
  </div>
</div>

${result.cta_sections[1] ? ctaBlock(result.cta_sections[1]) : ''}

<!-- 社会的証明 -->
<div style="max-width:800px;margin:60px auto;padding:0 20px;">
  <h2 style="font-size:24px;font-weight:800;text-align:center;margin-bottom:32px;color:#333;">${result.social_proof.heading}</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;">
    ${proofPoints}
  </div>
</div>

<!-- オファー -->
<div style="background:#f8f9ff;padding:60px 20px;text-align:center;">
  <h2 style="font-size:24px;font-weight:800;margin-bottom:16px;">${result.offer.heading}</h2>
  <div style="font-size:36px;font-weight:900;color:#764ba2;margin-bottom:12px;">${result.offer.price_display}</div>
  <p style="color:#666;font-size:15px;">${result.offer.guarantee}</p>
</div>

<!-- FAQ -->
<div style="max-width:800px;margin:60px auto;padding:0 20px;">
  <h2 style="font-size:24px;font-weight:800;text-align:center;margin-bottom:32px;">よくある質問</h2>
  ${faqHtml}
</div>

${result.cta_sections[2] ? ctaBlock(result.cta_sections[2]) : ''}

<!-- フッター -->
<div style="text-align:center;padding:40px 20px;background:#1a1a2e;color:rgba(255,255,255,0.5);font-size:13px;">
  <p>&copy; ${new Date().getFullYear()} ${form.productName} All Rights Reserved.</p>
</div>

</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lp_${form.productName || 'landing_page'}_${Date.now()}.html`;
    a.click();
  };

  const selectedFramework = FRAMEWORKS.find(f => f.id === framework);

  return (
    <div>
      <ProgressBar loading={progressLoading} progress={progress} label="📄 LP構成を生成中..." />
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        📄 LP自動生成
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
        セールスフレームワークに基づいて、LP（ランディングページ）の構成をAIが自動生成します
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>関連機能：</span>
        {[
          { href: '/dashboard/hp-generator', icon: '🏠', label: 'HP内容生成' },
          { href: '/dashboard/image-prompt', icon: '🎨', label: '画像プロンプト' },
          { href: '/dashboard/doc-prompt', icon: '📋', label: '資料プロンプト' },
          { href: '/dashboard/write', icon: '✍️', label: '文章作成' },
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
            textAlign: 'center' as const, transition: 'all 0.15s',
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
          <span style={{ fontSize: 13, fontWeight: 600, color: selectedFramework?.color }}>{selectedFramework?.label} フレームワークで LP を生成</span>
          <button onClick={() => { const s = LP_SAMPLES[framework]; if (s) setForm(s); }} style={{
            fontSize: 11, padding: '4px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)',
          }}>📋 サンプルを入力</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          {/* 商品名 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>商品・サービス名 *</label>
            <input
              value={form.productName}
              onChange={e => updateForm('productName', e.target.value)}
              placeholder="例：AI集客ツール ProMax"
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          {/* ターゲット */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>ターゲット *</label>
            <input
              value={form.target}
              onChange={e => updateForm('target', e.target.value)}
              placeholder="例：中小企業の経営者・マーケ担当者"
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
        </div>

        {/* 課題 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>ターゲットの課題・悩み</label>
          <textarea
            value={form.problem}
            onChange={e => updateForm('problem', e.target.value)}
            placeholder="例：集客に時間がかかる、広告費が高い、効果測定ができない"
            style={{ width: '100%', minHeight: 80, padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' as const }}
          />
        </div>

        {/* 解決策 */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>解決策・強み</label>
          <textarea
            value={form.solution}
            onChange={e => updateForm('solution', e.target.value)}
            placeholder="例：AIが自動で見込み客を分析、月額1万円から、導入3日で効果"
            style={{ width: '100%', minHeight: 80, padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' as const }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {/* 価格 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>価格・料金</label>
            <input
              value={form.price}
              onChange={e => updateForm('price', e.target.value)}
              placeholder="例：月額9,800円（税込）"
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
          {/* CTA */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>CTA（行動喚起）</label>
            <input
              value={form.cta}
              onChange={e => updateForm('cta', e.target.value)}
              placeholder="例：無料トライアルを始める"
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            * は必須項目です
          </div>
          <button onClick={generate} disabled={loading || !form.productName.trim() || !form.target.trim()} style={{
            padding: '12px 36px',
            background: `linear-gradient(135deg, ${selectedFramework?.color}, ${selectedFramework?.color}cc)`,
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: (loading || !form.productName.trim() || !form.target.trim()) ? 0.5 : 1,
          }}>
            {loading ? '⏳ 生成中...' : '🚀 LP構成を生成'}
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
          LP構成をAIが設計しています...
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* アクションバー */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <SaveToLibraryButton
              title={`LP: ${form.productName}`}
              content={rawText}
              type="lp-generator"
              groupName="LP自動生成"
              tags="LP,ランディングページ"
            />
            <button onClick={exportTxt} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              📝 TXTエクスポート
            </button>
            <button onClick={exportHtml} style={{ padding: '6px 14px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              🌐 HTMLエクスポート
            </button>
            <button onClick={() => navigator.clipboard.writeText(rawText)} style={{ padding: '6px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
              📋 JSONコピー
            </button>
          </div>

          {/* ヘッドライン */}
          <div style={{ background: 'linear-gradient(135deg, #667eea15, #764ba215)', border: '1px solid #667eea30', borderRadius: 12, padding: 24, textAlign: 'center' as const }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.4 }}>
              {result.headline}
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {result.subheadline}
            </div>
          </div>

          {/* 問題提起 */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ff6b6b', marginBottom: 12 }}>
              😰 {result.problem_section.heading}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.problem_section.points.map((p, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.15)', borderRadius: 8, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {p}
                </div>
              ))}
            </div>
          </div>

          {/* 解決策 */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#4ade80', marginBottom: 12 }}>
              ✅ {result.solution_section.heading}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.solution_section.benefits.map((b, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 8, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {b}
                </div>
              ))}
            </div>
          </div>

          {/* 社会的証明 */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f5a623', marginBottom: 12 }}>
              ⭐ {result.social_proof.heading}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.social_proof.points.map((p, i) => (
                <div key={i} style={{ padding: '10px 14px', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.15)', borderRadius: 8, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {p}
                </div>
              ))}
            </div>
          </div>

          {/* オファー */}
          <div style={{ background: 'linear-gradient(135deg, #667eea10, #764ba210)', border: '1px solid #667eea30', borderRadius: 12, padding: 24, textAlign: 'center' as const }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              💰 {result.offer.heading}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#764ba2', marginBottom: 8 }}>
              {result.offer.price_display}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {result.offer.guarantee}
            </div>
          </div>

          {/* FAQ */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              ❓ よくある質問
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.faq.map((f, i) => (
                <div key={i} style={{ padding: '14px 16px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                    Q. {f.question}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    A. {f.answer}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA セクション */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#6c63ff', marginBottom: 12 }}>
              🎯 CTAセクション（3箇所）
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.cta_sections.map((cta, i) => (
                <div key={i} style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #667eea08, #764ba208)', border: '1px solid #667eea20', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#667eea20', color: '#667eea', fontWeight: 600 }}>
                      {cta.position}
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {cta.heading}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.5 }}>
                    {cta.text}
                  </div>
                  <div style={{ display: 'inline-block', padding: '6px 16px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
                    {cta.button_text}
                  </div>
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
