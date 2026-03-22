import { auth } from '@/lib/auth';
import Link from 'next/link';
import db from '@/lib/db';

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as any)?.id;

  const draftCount = userId ? (db.prepare('SELECT COUNT(*) as c FROM drafts WHERE user_id = ?').get(userId) as any)?.c || 0 : 0;
  const libCount = userId ? (db.prepare('SELECT COUNT(*) as c FROM library WHERE user_id = ?').get(userId) as any)?.c || 0 : 0;
  const recentDrafts = userId ? db.prepare('SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 3').all(userId) : [];

  const stats = [
    { label: '作成した文章', value: draftCount, icon: '✍️', color: '#6c63ff' },
    { label: '保存したアイテム', value: libCount, icon: '📌', color: '#00d4b8' },
  ];

  const cards = [
    { icon: '🔬', title: '文献検索', desc: 'Semantic Scholarで1.38億件の学術論文を検索', href: '/dashboard/research', color: '#6c63ff' },
    { icon: '✍️', title: '文章作成', desc: 'Claude AIが高品質な文章をストリーミング生成', href: '/dashboard/write', color: '#00d4b8' },
    { icon: '📚', title: 'ライブラリ', desc: '保存した論文・記事・下書きを管理', href: '/dashboard/library', color: '#f5a623' },
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
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
                    <div style={{ fontSize: 11, color: '#5a5a7a', fontFamily: 'monospace' }}>{d.updated_at?.slice(0, 10)}</div>
                  </div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(108,99,255,0.1)', color: '#a89fff' }}>{modeLabel[d.mode] || '文章'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
