import Link from 'next/link';

export const metadata = {
  title: 'xLUMINA - AIで情報収集・文章作成・LP生成を全自動化',
  description: '30以上のAI機能で情報収集から収益化まで一気通貫。月2,980円から。14日間無料トライアル実施中。',
};

export default function LandingPage() {
  const problems = [
    { emoji: '😩', text: '情報収集に毎日2〜3時間かかって本業に集中できない' },
    { emoji: '✍️', text: 'ブログ・SNS・メルマガの文章を書くのが苦手で時間がかかる' },
    { emoji: '💸', text: 'LP・HPの制作費に毎回数十万円かけている' },
    { emoji: '📊', text: '競合他社の動向を把握する仕組みがない' },
    { emoji: '🌐', text: '多言語対応が必要だが翻訳コストが高い' },
    { emoji: '🔄', text: 'マーケティング施策が属人化していて再現性がない' },
  ];

  const features = [
    { icon: '🧠', title: 'AI情報収集', desc: 'Intelligence Hubでニュース・SNS・市場・学術情報を一度に自動収集。毎日の情報収集を数分に短縮。', badge: '自動化' },
    { icon: '✍️', title: '文章自動生成', desc: 'ブログ・SNS・メルマガ・プレスリリースを高品質AI生成。バズり予測・SEOタイトル提案付き。', badge: '品質向上' },
    { icon: '📄', title: 'LP・HP自動生成', desc: 'PASONA法則に基づくLPをAIが自動生成。商品情報を入力するだけで高転換率のLPが完成。', badge: '収益化' },
    { icon: '⚡', title: 'ワークフロー自動化', desc: '「競合調査→レポート作成→SNS投稿」などの複雑な作業をAIが全自動実行。', badge: '時短' },
    { icon: '🌍', title: '多言語翻訳', desc: '7言語（英/中/韓/西/仏/独/葡）に高品質翻訳。海外展開のコストを大幅削減。', badge: 'グローバル' },
    { icon: '📊', title: 'マーケ分析・戦略', desc: 'SWOT分析・競合調査・市場トレンドをAIが自動分析。データに基づいた戦略立案が可能。', badge: '戦略' },
  ];

  const benefits = [
    { before: '毎日3時間', after: '15分以下', label: '情報収集時間' },
    { before: '数十万円', after: '数分で完成', label: 'LP制作コスト' },
    { before: '週1〜2本', after: '毎日更新可能', label: 'コンテンツ量' },
  ];

  const faqs = [
    { q: '無料トライアルにクレジットカードは必要ですか？', a: '不要です。14日間は完全無料でご利用いただけます。トライアル終了後に継続する場合のみ、お支払い情報を入力いただきます。' },
    { q: 'どんな文章が生成できますか？', a: 'ブログ記事・SNS投稿・プレスリリース・メール・商品説明・LP・HP・議事録など15種類以上のフォーマットに対応しています。' },
    { q: 'AIの精度はどのくらいですか？', a: 'Anthropic社のClaude Sonnet 4.6（最新モデル）を使用しています。自然で高品質な日本語文章を生成します。' },
    { q: 'いつでも解約できますか？', a: 'はい、いつでも解約可能です。解約後も契約期間終了まで全機能をご利用いただけます。' },
    { q: 'データは安全ですか？', a: '保存データは暗号化されており、第三者への提供は一切行いません。いつでもデータの削除が可能です。' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#1a1a2e' }}>
      {/* ヘッダー */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 20, color: '#6c63ff' }}>xLUMINA</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/auth" style={{ fontSize: 14, color: '#666', textDecoration: 'none' }}>ログイン</Link>
            <Link href="/auth" style={{ fontSize: 14, padding: '8px 20px', borderRadius: 999, background: '#6c63ff', color: '#fff', textDecoration: 'none' }}>無料で始める</Link>
          </div>
        </div>
      </header>

      {/* ヒーロー */}
      <section style={{ paddingTop: 128, paddingBottom: 80, textAlign: 'center', background: 'linear-gradient(180deg, #f0f0ff 0%, #fff 100%)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, background: '#eef', color: '#6c63ff', fontSize: 14, fontWeight: 500, marginBottom: 24 }}>
            🎉 現在 限定公開中 — 先着100名様は永久20%OFF
          </div>
          <h1 style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.3, marginBottom: 20 }}>
            AIが<span style={{ color: '#6c63ff' }}>情報収集・文章作成・LP生成</span>を<br/>全自動化する
          </h1>
          <p style={{ fontSize: 18, color: '#666', lineHeight: 1.8, marginBottom: 32 }}>
            毎日の情報収集に何時間かけていますか？<br/>
            xLUMINAなら、30以上のAI機能で<strong>情報収集から収益化まで一気通貫</strong>で自動化できます。
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/auth" style={{ padding: '14px 32px', borderRadius: 12, background: '#6c63ff', color: '#fff', fontWeight: 600, fontSize: 16, textDecoration: 'none', boxShadow: '0 4px 16px rgba(108,99,255,0.3)' }}>14日間無料で試す →</Link>
            <a href="#features" style={{ padding: '14px 32px', borderRadius: 12, border: '1px solid #ddd', color: '#333', fontWeight: 500, fontSize: 16, textDecoration: 'none' }}>機能を見る</a>
          </div>
          <p style={{ fontSize: 13, color: '#aaa', marginTop: 16 }}>クレジットカード不要 · いつでもキャンセル可能</p>
        </div>
      </section>

      {/* 課題提示 */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 40 }}>こんな悩みありませんか？</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {problems.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 12, border: '1px solid #f0f0f0', background: '#fafafa' }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{p.emoji}</span>
                <p style={{ fontSize: 14, color: '#444', lineHeight: 1.7 }}>{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 解決策 */}
      <section id="features" style={{ padding: '80px 24px', background: '#f8f7ff' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 8 }}>xLUMINAが<span style={{ color: '#6c63ff' }}>すべて解決</span>します</h2>
          <p style={{ textAlign: 'center', color: '#666', fontSize: 16, marginBottom: 40 }}>30以上のAI機能を1つのプラットフォームで</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {features.map((f, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e8e6ff' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 15 }}>{f.title}</h3>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#eef', color: '#6c63ff' }}>{f.badge}</span>
                </div>
                <p style={{ fontSize: 13, color: '#666', lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ベネフィット */}
      <section style={{ padding: '80px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 40 }}>xLUMINAを使うと<span style={{ color: '#6c63ff' }}>こう変わります</span></h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, maxWidth: 700, margin: '0 auto' }}>
          {benefits.map((b, i) => (
            <div key={i} style={{ padding: 24, borderRadius: 16, border: '1px solid #f0f0f0' }}>
              <p style={{ fontSize: 13, color: '#aaa', marginBottom: 8 }}>{b.label}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, color: '#aaa', textDecoration: 'line-through' }}>{b.before}</span>
                <span style={{ fontSize: 20 }}>→</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#6c63ff' }}>{b.after}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 料金 */}
      <section style={{ padding: '80px 24px', background: '#fafafa' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 40 }}>シンプルな料金プラン</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 32, border: '1px solid #ddd' }}>
              <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Starter</h3>
              <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>個人・フリーランス向け</p>
              <div style={{ marginBottom: 24 }}><span style={{ fontSize: 36, fontWeight: 700 }}>¥2,980</span><span style={{ color: '#888' }}>/月</span></div>
              {['全機能利用可能', '月100回のAI実行', 'ライブラリ保存無制限', 'メールサポート'].map(f => (
                <p key={f} style={{ fontSize: 13, color: '#555', padding: '4px 0' }}>✓ {f}</p>
              ))}
              <Link href="/auth" style={{ display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 12, border: '1px solid #6c63ff', color: '#6c63ff', fontWeight: 600, textDecoration: 'none', marginTop: 24 }}>無料で始める</Link>
            </div>
            <div style={{ background: '#6c63ff', borderRadius: 16, padding: 32, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '4px 16px', borderRadius: 999, background: '#fbbf24', color: '#78350f', fontSize: 12, fontWeight: 700 }}>おすすめ</div>
              <h3 style={{ fontWeight: 700, fontSize: 18, color: '#fff', marginBottom: 4 }}>Pro</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>ビジネス・企業向け</p>
              <div style={{ marginBottom: 24 }}><span style={{ fontSize: 36, fontWeight: 700, color: '#fff' }}>¥9,800</span><span style={{ color: 'rgba(255,255,255,0.7)' }}>/月</span></div>
              {['Starterの全機能', 'AI実行回数無制限', 'ワークフロー自動化', 'LP・HP自動生成', '優先サポート', 'GA4連携分析'].map(f => (
                <p key={f} style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', padding: '4px 0' }}>✓ {f}</p>
              ))}
              <Link href="/auth" style={{ display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 12, background: '#fff', color: '#6c63ff', fontWeight: 600, textDecoration: 'none', marginTop: 24 }}>14日間無料で試す →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 40 }}>よくある質問</h2>
          {faqs.map((faq, i) => (
            <details key={i} style={{ border: '1px solid #eee', borderRadius: 12, padding: 20, marginBottom: 12 }}>
              <summary style={{ fontWeight: 600, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {faq.q}
              </summary>
              <p style={{ marginTop: 12, fontSize: 14, color: '#666', lineHeight: 1.8 }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 最終CTA */}
      <section style={{ padding: '80px 24px', background: '#6c63ff', textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 16 }}>今すぐ始めて、業務を自動化しましょう</h2>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, marginBottom: 32 }}>14日間無料 · クレジットカード不要 · いつでもキャンセル可能</p>
        <Link href="/auth" style={{ display: 'inline-block', padding: '14px 40px', borderRadius: 12, background: '#fff', color: '#6c63ff', fontWeight: 700, fontSize: 16, textDecoration: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>無料トライアルを始める →</Link>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 16 }}>先着100名様は永久20%OFF適用中</p>
      </section>

      {/* フッター */}
      <footer style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: '#aaa', borderTop: '1px solid #f0f0f0' }}>
        <p>© 2026 xLUMINA. All rights reserved.</p>
      </footer>
    </div>
  );
}
