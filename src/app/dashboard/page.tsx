import { auth } from '@/lib/auth';
import Link from 'next/link';
import { neon } from '@neondatabase/serverless';

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id;

  let draftCount = 0;
  let libCount = 0;
  let recentDrafts: any[] = [];

  if (userId) {
    try {
      const sql = neon(process.env.DATABASE_URL!);
      const dc = await sql`SELECT COUNT(*) as c FROM drafts WHERE user_id = ${userId}`;
      draftCount = dc[0]?.c || 0;
      const lc = await sql`SELECT COUNT(*) as c FROM library WHERE user_id = ${userId}`;
      libCount = lc[0]?.c || 0;
      recentDrafts = await sql`SELECT * FROM drafts WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 3`;
    } catch {}
  }

  const stats = [
    { label: '作成した文章', value: draftCount, icon: '✍️', color: '#6c63ff' },
    { label: '保存したアイテム', value: libCount, icon: '📌', color: '#00d4b8' },
  ];

  const cards = [
    { icon: '🧠', title: 'Intelligence Hub', desc: 'ニュース・SNS・市場・学術を統合収集', href: '/dashboard/intelligence', color: '#6c63ff' },
    { icon: '🧩', title: 'AI分析エンジン', desc: 'SWOT・仮説・トレンド・競合分析', href: '/dashboard/analysis', color: '#f5a623' },
    { icon: '💼', title: '経営インテリジェンス', desc: 'MVV・採用・人材育成・ブランド戦略', href: '/dashboard/strategy', color: '#4ade80' },
    { icon: '✍️', title: '文章作成', desc: 'ブログ・note・小説・出版用文章を生成', href: '/dashboard/write', color: '#00d4b8' },
    { icon: '🔬', title: '文献検索', desc: 'Semantic Scholarで1.38億件の論文を検索', href: '/dashboard/research', color: '#a89fff' },
    { icon: '📚', title: 'ライブラリ', desc: '保存した調査・分析・文章を管理', href: '/dashboard/library', color: '#f87171' },
  ];

  const modeLabel: Record<string, string> = {
    blog: '📝 ブログ', note: '✏️ note', novel: '📖 小説',
    guide: '📚 解説本', publish: '🗞️ 出版用', social: '📱 SNS', report: '📊 レポート'
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>ダッシュボード</h1>
        <p style={{ color: '#7878a0' }}>おかえりなさい、{session?.user?.name}さん 👋</p>
      </div>

      {/* 統計カード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 28 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#12142a', border: `1px solid ${s.color}30`, borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 28 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#7878a0', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* クイックスタート */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#5a5a7a', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>クイックスタート</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {cards.map(card => (
            <Link key={card.href} href={card.href} style={{ background: '#12142a', border: `1px solid ${card.color}25`, borderRadius: 14, padding: 22, textDecoration: 'none', display: 'block', transition: 'border-color 0.2s' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>{card.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#f0f0ff', marginBottom: 5 }}>{card.title}</div>
              <div style={{ fontSize: 12, color: '#7878a0', lineHeight: 1.6 }}>{card.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* 最近の下書き */}
      {recentDrafts.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#5a5a7a', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>最近の下書き</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentDrafts.map((d: any) => (
              <Link key={d.id} href="/dashboard/write" style={{ background: '#12142a', border: '1px solid rgba(130,140,255,0.1)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>{modeLabel[d.mode]?.split(' ')[0] || '✍️'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#e0e0f0' }}>{d.title || '無題'}</div>
                    <div style={{ fontSize: 11, color: '#5a5a7a', fontFamily: 'monospace' }}>{d.updated_at ? new Date(d.updated_at).toLocaleDateString('ja-JP') : ''}</div>
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(108,99,255,0.1)', color: '#a89fff' }}>{modeLabel[d.mode] || '文章'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {/* ワークフローガイド */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#5a5a7a', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>推奨ワークフロー</div>
        <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
          {[
            { step: '1', title: '情報収集', desc: 'Web情報収集・ディープリサーチ', color: '#6c63ff', icon: '🌐' },
            { step: '2', title: '文献確認', desc: '学術論文で裏付けを取る', color: '#00d4b8', icon: '🔬' },
            { step: '3', title: '文章生成', desc: 'Claude AIで高品質な文章を作成', color: '#f5a623', icon: '✍️' },
          ].map((w, i) => (
            <div key={w.step} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, padding: '14px 16px', borderRadius: 10, background: `${w.color}10`, border: `1px solid ${w.color}25` }}>
                <div style={{ fontSize: 11, color: w.color, fontFamily: 'monospace', marginBottom: 4 }}>STEP {w.step}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f0ff', marginBottom: 3 }}>{w.icon} {w.title}</div>
                <div style={{ fontSize: 12, color: '#7878a0' }}>{w.desc}</div>
              </div>
              {i < 2 && <div style={{ padding: '0 8px', color: '#3a3a5a', fontSize: 18 }}>→</div>}
            </div>
          ))}
        </div>
      </div>

      {/* AI Tips コーナー */}
      <div style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>
          💡 AI活用・コーディング裏技Tips
        </h2>
        <p style={{ color: '#7878a0', fontSize: 13, marginBottom: 20 }}>
          毎日更新。AIをもっとうまく使うための厳選テクニック。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {[
            {
              category: '🤖 Claude活用',
              tip: 'プロンプトの冒頭に「あなたは〇〇の専門家です」と役割を与えると、回答の質が大幅に向上します。',
              tag: '初級',
              tagColor: '#4ade80',
            },
            {
              category: '⚡ 時短テクニック',
              tip: '長文を要約させるときは「3行で」「箇条書き5つで」と形式を指定すると、使いやすいアウトプットが得られます。',
              tag: '初級',
              tagColor: '#4ade80',
            },
            {
              category: '🧠 思考整理',
              tip: '迷ったときは「メリット・デメリットをそれぞれ5つ挙げて」と依頼すると、意思決定が格段に早くなります。',
              tag: '中級',
              tagColor: '#f5a623',
            },
            {
              category: '💻 コーディング',
              tip: 'バグ修正を依頼するときは「エラーメッセージ」「該当コード」「期待する動作」の3点をセットで伝えると一発で解決しやすくなります。',
              tag: '中級',
              tagColor: '#f5a623',
            },
            {
              category: '🚀 上級テクニック',
              tip: '複雑なタスクは「まずステップに分解して」と先に計画を立てさせてから実行させると、精度が飛躍的に上がります。',
              tag: '上級',
              tagColor: '#f87171',
            },
            {
              category: '📋 プロンプト設計',
              tip: '出力形式をJSON・Markdown・表など具体的に指定すると、後処理が不要になり開発効率が大幅に上がります。',
              tag: '中級',
              tagColor: '#f5a623',
            },
            {
              category: '🔁 反復改善',
              tip: '一度の回答に満足せず「もっと具体的に」「別のアプローチで」と追加指示することで、理想のアウトプットに近づけられます。',
              tag: '初級',
              tagColor: '#4ade80',
            },
            {
              category: '🛡️ セキュリティ',
              tip: 'APIキーや個人情報はプロンプトに直接含めず、環境変数で管理しましょう。AIに渡す情報は最小限に。',
              tag: '重要',
              tagColor: '#a89fff',
            },
            {
              category: '📊 データ分析',
              tip: 'CSVやJSONデータをそのまま貼り付けて「このデータから示唆を3つ教えて」と依頼すると、即座に洞察が得られます。',
              tag: '中級',
              tagColor: '#f5a623',
            },
          ].map((item, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '16px 20px',
              transition: 'border-color 0.2s',
            }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#a89fff' }}>{item.category}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: item.tagColor,
                  background: `${item.tagColor}22`, padding: '2px 8px', borderRadius: 20,
                  border: `1px solid ${item.tagColor}44`,
                }}>{item.tag}</span>
              </div>
              <p style={{ fontSize: 13, color: '#c0c0d8', lineHeight: 1.7, margin: 0 }}>{item.tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
