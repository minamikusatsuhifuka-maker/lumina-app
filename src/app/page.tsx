import Link from 'next/link';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#07080f', color: '#f0f0ff', fontFamily: 'system-ui, sans-serif' }}>

      {/* ナビゲーション */}
      <nav style={{ position: 'fixed' as const, top: 0, left: 0, right: 0, zIndex: 100, padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(7,8,15,0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(130,140,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>x</div>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>xLUMINA</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/auth" style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid rgba(130,140,255,0.3)', color: '#a89fff', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
            ログイン
          </Link>
          <Link href="/auth" style={{ padding: '8px 20px', borderRadius: 8, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            無料で始める
          </Link>
        </div>
      </nav>

      {/* ヒーローセクション */}
      <section style={{ paddingTop: 140, paddingBottom: 100, textAlign: 'center' as const, padding: '140px 40px 100px', position: 'relative' as const, overflow: 'hidden' }}>
        {/* 背景グロー */}
        <div style={{ position: 'absolute' as const, top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, background: 'radial-gradient(circle, rgba(108,99,255,0.15) 0%, transparent 70%)', pointerEvents: 'none' as const }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 20, background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.3)', fontSize: 13, color: '#a89fff', marginBottom: 24 }}>
          🚀 AI経営インテリジェンスプラットフォーム
        </div>

        <h1 style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 24, letterSpacing: '-0.03em', maxWidth: 800, margin: '0 auto 24px' }}>
          情報収集から
          <span style={{ background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}> 経営戦略 </span>
          まで、AIが一気通貫で支援
        </h1>

        <p style={{ fontSize: 18, color: '#7878a0', lineHeight: 1.7, maxWidth: 600, margin: '0 auto 40px' }}>
          最新ニュース収集・学術論文検索・SWOT分析・MVV策定・採用戦略・文章生成まで。
          経営に必要なすべてをxLUMINAひとつで。
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <Link href="/auth" style={{ padding: '14px 32px', borderRadius: 10, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', textDecoration: 'none', fontSize: 16, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            無料で始める →
          </Link>
          <Link href="#features" style={{ padding: '14px 32px', borderRadius: 10, border: '1px solid rgba(130,140,255,0.3)', color: '#a89fff', textDecoration: 'none', fontSize: 16, fontWeight: 500 }}>
            機能を見る
          </Link>
        </div>

        {/* 統計 */}
        <div style={{ display: 'flex', gap: 40, justifyContent: 'center', marginTop: 60, flexWrap: 'wrap' as const }}>
          {[
            { num: '11', label: '文章生成モード' },
            { num: '8', label: '情報収集モード' },
            { num: '7', label: '経営戦略AI' },
            { num: '1.38億', label: '学術論文データベース' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' as const }}>
              <div style={{ fontSize: 32, fontWeight: 800, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.num}</div>
              <div style={{ fontSize: 13, color: '#5a5a7a', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 機能紹介 */}
      <section id="features" style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
          <div style={{ fontSize: 13, color: '#6c63ff', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 12 }}>FEATURES</div>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>経営に必要な機能がすべて揃う</h2>
          <p style={{ fontSize: 16, color: '#7878a0' }}>情報収集から意思決定、発信まで一気通貫で対応</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            { icon: '🧠', title: 'Intelligence Hub', desc: 'ニュース・SNS・市場・学術論文を8つのモードで横断収集。最新情報を常に把握。', color: '#6c63ff' },
            { icon: '🧩', title: 'AI分析エンジン', desc: 'SWOT分析・仮説生成・トレンド予測・競合分析・アクションプランを自動生成。', color: '#f5a623' },
            { icon: '💼', title: '経営インテリジェンス', desc: 'MVV策定・採用戦略・人材育成・ブランド戦略・組織設計をAIが支援。', color: '#4ade80' },
            { icon: '🤖', title: 'カスタムAIペルソナ', desc: '医療・IT・マーケなど業界特化のAIアドバイザーを設定。専門的な回答を即座に。', color: '#00d4b8' },
            { icon: '✍️', title: '文章作成', desc: 'ブログ・note・プレスリリース・LP・メールなど11モードで高品質な文章を生成。', color: '#a89fff' },
            { icon: '🔔', title: '定期リサーチアラート', desc: '指定テーマの最新情報を毎日・週次で自動収集。重要情報を見逃さない。', color: '#f87171' },
          ].map(f => (
            <div key={f.title} style={{ background: '#12142a', border: `1px solid ${f.color}20`, borderRadius: 16, padding: 28, transition: 'all 0.2s' }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f0f0ff', marginBottom: 10 }}>{f.title}</div>
              <div style={{ fontSize: 14, color: '#7878a0', lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ユースケース */}
      <section style={{ padding: '80px 40px', background: 'rgba(108,99,255,0.03)', borderTop: '1px solid rgba(130,140,255,0.1)', borderBottom: '1px solid rgba(130,140,255,0.1)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 13, color: '#6c63ff', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 12 }}>USE CASES</div>
            <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em' }}>こんな方に使ってほしい</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { icon: '🏥', title: 'クリニック院長', desc: '最新医療情報の収集・スタッフ育成計画・患者向けコンテンツ作成' },
              { icon: '🏢', title: '経営者・起業家', desc: 'MVV策定・競合分析・採用戦略・投資家向け資料作成' },
              { icon: '📣', title: 'マーケター', desc: 'トレンド収集・コンテンツ戦略・SNS投稿・ブログ記事量産' },
              { icon: '🎓', title: 'コンサルタント', desc: '業界リサーチ・提案書作成・クライアント向け戦略立案' },
              { icon: '✍️', title: 'ライター・編集者', desc: '情報収集・記事構成・文章生成・note・ブログ投稿' },
              { icon: '🔬', title: '研究者・医療従事者', desc: '学術論文検索・エビデンス収集・最新研究のキャッチアップ' },
              { icon: '💻', title: 'スタートアップ', desc: '市場調査・ビジネスプラン・投資家向けピッチ資料作成' },
              { icon: '🌱', title: 'HR・人事担当者', desc: '採用戦略・JD作成・育成計画・エンゲージメント向上施策' },
            ].map(u => (
              <div key={u.title} style={{ background: '#12142a', borderRadius: 12, padding: '20px 18px', border: '1px solid rgba(130,140,255,0.08)' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>{u.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f0f0ff', marginBottom: 8 }}>{u.title}</div>
                <div style={{ fontSize: 12, color: '#7878a0', lineHeight: 1.6 }}>{u.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ワークフロー */}
      <section style={{ padding: '80px 40px', maxWidth: 900, margin: '0 auto', textAlign: 'center' as const }}>
        <div style={{ fontSize: 13, color: '#6c63ff', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 12 }}>WORKFLOW</div>
        <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>3ステップで完結</h2>
        <p style={{ fontSize: 16, color: '#7878a0', marginBottom: 60 }}>調べる・考える・書く・共有するが一気通貫</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 0, justifyContent: 'center' }}>
          {[
            { step: '01', icon: '🌐', title: '情報収集', desc: 'ニュース・学術論文・SNSトレンド・市場動向を一括収集', color: '#6c63ff' },
            { step: '02', icon: '🧩', title: 'AI分析', desc: 'SWOT・仮説・アクションプランを自動生成', color: '#f5a623' },
            { step: '03', icon: '✍️', title: '文章・戦略', desc: 'MVV・採用・記事・報告書をAIが即座に作成', color: '#00d4b8' },
          ].map((w, i) => (
            <div key={w.step} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ background: '#12142a', border: `2px solid ${w.color}30`, borderRadius: 16, padding: '28px 24px', width: 220, textAlign: 'center' as const }}>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: w.color, fontWeight: 700, marginBottom: 12, letterSpacing: '0.1em' }}>STEP {w.step}</div>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{w.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f0f0ff', marginBottom: 8 }}>{w.title}</div>
                <div style={{ fontSize: 12, color: '#7878a0', lineHeight: 1.6 }}>{w.desc}</div>
              </div>
              {i < 2 && <div style={{ padding: '0 16px', color: '#3a3a5a', fontSize: 24, fontWeight: 300 }}>→</div>}
            </div>
          ))}
        </div>
      </section>

      {/* 料金プラン */}
      <section id="pricing" style={{ padding: '80px 40px', background: 'rgba(108,99,255,0.03)', borderTop: '1px solid rgba(130,140,255,0.1)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
            <div style={{ fontSize: 13, color: '#6c63ff', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 12 }}>PRICING</div>
            <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>シンプルな料金体系</h2>
            <p style={{ fontSize: 16, color: '#7878a0' }}>まずは無料で始めて、必要に応じてアップグレード</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Free */}
            <div style={{ background: '#12142a', border: '1px solid rgba(130,140,255,0.15)', borderRadius: 20, padding: 32 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#7878a0', marginBottom: 4 }}>Free</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: '#f0f0ff', marginBottom: 4 }}>¥0</div>
              <div style={{ fontSize: 13, color: '#5a5a7a', marginBottom: 24 }}>クレジットカード不要</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 28 }}>
                {['文章作成（月20回）', 'Web情報収集（月10回）', 'ライブラリ（50件）', '文献検索（無制限）'].map(f => (
                  <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: '#c0c0e0' }}>
                    <span style={{ color: '#4ade80' }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <Link href="/auth" style={{ display: 'block', textAlign: 'center' as const, padding: '12px', borderRadius: 10, border: '1px solid rgba(130,140,255,0.3)', color: '#a89fff', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
                無料で始める
              </Link>
            </div>

            {/* Pro */}
            <div style={{ background: '#12142a', border: '2px solid #6c63ff', borderRadius: 20, padding: 32, position: 'relative' as const }}>
              <div style={{ position: 'absolute' as const, top: -14, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', padding: '4px 20px', borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' as const }}>
                🔥 最人気
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#6c63ff', marginBottom: 4 }}>Pro</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: '#f0f0ff', marginBottom: 4 }}>¥2,980<span style={{ fontSize: 16, fontWeight: 400, color: '#7878a0' }}>/月</span></div>
              <div style={{ fontSize: 13, color: '#5a5a7a', marginBottom: 24 }}>いつでもキャンセル可能</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 28 }}>
                {['全機能無制限', 'Intelligence Hub 全8モード', '経営インテリジェンス 全7種', 'AI分析エンジン 全6種', 'カスタムAIペルソナ', 'PDF出力・定期アラート', '優先サポート'].map(f => (
                  <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: '#c0c0e0' }}>
                    <span style={{ color: '#4ade80' }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <Link href="/auth" style={{ display: 'block', textAlign: 'center' as const, padding: '12px', borderRadius: 10, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
                Proで始める
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '80px 40px', maxWidth: 700, margin: '0 auto' }}>
        <div style={{ textAlign: 'center' as const, marginBottom: 60 }}>
          <div style={{ fontSize: 13, color: '#6c63ff', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 12 }}>FAQ</div>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.02em' }}>よくある質問</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          {[
            { q: 'どんな情報を収集できますか？', a: 'ニュース・SNSトレンド・市場動向・学術論文・医療情報など8つのモードで幅広く収集できます。Claude AIとPerplexity AIを活用した高精度な情報収集が可能です。' },
            { q: 'AIが生成した文章の品質は？', a: 'Anthropicの最新モデル Claude Sonnet 4.6を使用しています。ブログ・note・プレスリリース・LP・メールなど11のモードで目的に応じた高品質な文章を生成します。' },
            { q: '経営戦略の策定にどう使えますか？', a: 'MVV策定・採用戦略・人材育成計画・ブランド戦略・組織設計など7種の経営戦略AIが、テンプレート入力をもとに具体的な戦略を生成します。' },
            { q: 'セキュリティは大丈夫ですか？', a: 'データはVercel + Neon PostgreSQL（シンガポール）で安全に管理されます。認証にはNextAuth.js + bcryptを使用し、通信はすべてHTTPS暗号化されています。' },
            { q: 'キャンセルはいつでもできますか？', a: 'はい、いつでもキャンセル可能です。Stripeの安全な決済システムを使用しており、次回更新日の前であればいつでも解約できます。' },
          ].map(faq => (
            <div key={faq.q} style={{ background: '#12142a', border: '1px solid rgba(130,140,255,0.1)', borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#f0f0ff', marginBottom: 10 }}>Q. {faq.q}</div>
              <div style={{ fontSize: 14, color: '#7878a0', lineHeight: 1.7 }}>A. {faq.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* フッターCTA */}
      <section style={{ padding: '80px 40px', textAlign: 'center' as const, background: 'linear-gradient(180deg, transparent, rgba(108,99,255,0.05))' }}>
        <h2 style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 16 }}>
          今すぐ始めましょう
        </h2>
        <p style={{ fontSize: 18, color: '#7878a0', marginBottom: 40 }}>
          無料プランで試して、必要に応じてアップグレード
        </p>
        <Link href="/auth" style={{ padding: '16px 40px', borderRadius: 12, background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', textDecoration: 'none', fontSize: 18, fontWeight: 700, display: 'inline-block' }}>
          無料アカウントを作成する →
        </Link>
        <div style={{ marginTop: 20, fontSize: 13, color: '#5a5a7a' }}>
          クレジットカード不要・30秒で登録完了
        </div>
      </section>

      {/* フッター */}
      <footer style={{ padding: '32px 40px', borderTop: '1px solid rgba(130,140,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>x</div>
          <span style={{ fontSize: 14, fontWeight: 600 }}>xLUMINA</span>
        </div>
        <div style={{ fontSize: 13, color: '#5a5a7a' }}>© 2026 xLUMINA. AI Research & Writing Suite.</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <Link href="/auth" style={{ fontSize: 13, color: '#7878a0', textDecoration: 'none' }}>ログイン</Link>
          <Link href="/auth" style={{ fontSize: 13, color: '#7878a0', textDecoration: 'none' }}>新規登録</Link>
        </div>
      </footer>

    </div>
  );
}
