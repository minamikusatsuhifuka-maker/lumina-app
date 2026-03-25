import { auth } from '@/lib/auth';
import Link from 'next/link';
import { neon } from '@neondatabase/serverless';
import TipsSection from '@/components/TipsSection';

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
    { label: '作成した文章', value: draftCount, icon: '✍️', color: 'var(--accent)', borderColor: 'var(--border-accent)' },
    { label: '保存したアイテム', value: libCount, icon: '📌', color: '#00d4b8', borderColor: '#00d4b830' },
  ];

  const cards = [
    { icon: '🧠', title: 'Intelligence Hub', desc: 'ニュース・SNS・市場・学術を統合収集', href: '/dashboard/intelligence', borderColor: 'var(--accent-soft)' },
    { icon: '🧩', title: 'AI分析エンジン', desc: 'SWOT・仮説・トレンド・競合分析', href: '/dashboard/analysis', borderColor: '#f5a62325' },
    { icon: '💼', title: '経営インテリジェンス', desc: 'MVV・採用・人材育成・ブランド戦略', href: '/dashboard/strategy', borderColor: '#4ade8025' },
    { icon: '✍️', title: '文章作成', desc: 'ブログ・note・小説・出版用文章を生成', href: '/dashboard/write', borderColor: '#00d4b825' },
    { icon: '🔬', title: '文献検索', desc: 'Semantic Scholarで1.38億件の論文を検索', href: '/dashboard/research', borderColor: '#a89fff25' },
    { icon: '📚', title: 'ライブラリ', desc: '保存した調査・分析・文章を管理', href: '/dashboard/library', borderColor: '#f8717125' },
  ];

  const modeLabel: Record<string, string> = {
    blog: '📝 ブログ', note: '✏️ note', novel: '📖 小説',
    guide: '📚 解説本', publish: '🗞️ 出版用', social: '📱 SNS', report: '📊 レポート'
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>ダッシュボード</h1>
        <p style={{ color: 'var(--text-muted)' }}>おかえりなさい、{session?.user?.name}さん 👋</p>
      </div>

      {/* 統計カード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 28 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: '#12142a', border: `1px solid ${s.borderColor}`, borderRadius: 12, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 28 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: 'monospace' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* クイックスタート */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#5a5a7a', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>クイックスタート</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {cards.map(card => (
            <Link key={card.href} href={card.href} style={{ background: '#12142a', border: `1px solid ${card.borderColor}`, borderRadius: 14, padding: 22, textDecoration: 'none', display: 'block', transition: 'border-color 0.2s' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>{card.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 5 }}>{card.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{card.desc}</div>
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
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--accent-soft)', color: 'var(--text-secondary)' }}>{modeLabel[d.mode] || '文章'}</span>
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
            { step: '1', title: '情報収集', desc: 'Web情報収集・ディープリサーチ', color: 'var(--accent)', bgColor: 'var(--accent-soft)', borderColor: 'var(--border-accent)', icon: '🌐' },
            { step: '2', title: '文献確認', desc: '学術論文で裏付けを取る', color: '#00d4b8', bgColor: '#00d4b810', borderColor: '#00d4b825', icon: '🔬' },
            { step: '3', title: '文章生成', desc: 'Claude AIで高品質な文章を作成', color: '#f5a623', bgColor: '#f5a62310', borderColor: '#f5a62325', icon: '✍️' },
          ].map((w, i) => (
            <div key={w.step} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, padding: '14px 16px', borderRadius: 10, background: w.bgColor, border: `1px solid ${w.borderColor}` }}>
                <div style={{ fontSize: 11, color: w.color, fontFamily: 'monospace', marginBottom: 4 }}>STEP {w.step}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{w.icon} {w.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{w.desc}</div>
              </div>
              {i < 2 && <div style={{ padding: '0 8px', color: '#3a3a5a', fontSize: 18 }}>→</div>}
            </div>
          ))}
        </div>
      </div>

      <TipsSection />
    </div>
  );
}
