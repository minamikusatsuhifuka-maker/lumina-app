import { neon } from '@neondatabase/serverless';
import Link from 'next/link';

export default async function AdminDashboardPage() {
  const sql = neon(process.env.DATABASE_URL!);

  // 各データの件数を取得
  const [philRows, gradeRows, taskRows] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM clinic_philosophy`.catch(() => [{ count: 0 }]),
    sql`SELECT COUNT(*) as count FROM grade_levels`.catch(() => [{ count: 0 }]),
    sql`SELECT COUNT(*) as count FROM action_tasks WHERE status != 'done'`.catch(() => [{ count: 0 }]),
  ]);

  const hasPhilosophy = Number(philRows[0]?.count) > 0;
  const gradeCount = Number(gradeRows[0]?.count);
  const taskCount = Number(taskRows[0]?.count);

  const cards = [
    { icon: '📖', label: '理念', value: hasPhilosophy ? '登録済み' : '未登録', color: hasPhilosophy ? '#4ade80' : '#f87171', href: '/admin/philosophy' },
    { icon: '🏅', label: '等級制度', value: `${gradeCount}件`, color: '#6c63ff', href: '/admin/grade' },
    { icon: '✅', label: '進行中タスク', value: `${taskCount}件`, color: '#f5a623', href: '/admin/tasks' },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* ティール組織ビジョンバナー */}
      <div style={{ marginBottom: 28, padding: 24, borderRadius: 16, background: 'linear-gradient(135deg, rgba(6,182,212,0.1), rgba(139,92,246,0.1))', border: '1px solid rgba(6,182,212,0.3)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#06b6d4', marginBottom: 12 }}>🩵 私たちが目指す組織の姿</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { color: '#ef4444', label: '🔴 レッド', desc: '力・恐怖', opacity: 0.4, current: false },
            { color: '#f97316', label: '🟠 アンバー', desc: 'ルール・階層', opacity: 0.4, current: false },
            { color: '#eab308', label: '🟡 オレンジ', desc: '目標・競争', opacity: 0.4, current: false },
            { color: '#4ade80', label: '🟢 グリーン', desc: '関係・合意', opacity: 0.7, current: false },
            { color: '#06b6d4', label: '🩵 ティール', desc: '自律・全体性', opacity: 1, current: true },
          ].map((stage) => (
            <div key={stage.label} style={{
              flex: 1, minWidth: 100, padding: '8px 12px',
              background: `${stage.color}${stage.current ? '20' : '10'}`,
              border: `1px solid ${stage.color}${stage.current ? '60' : '20'}`,
              borderRadius: 10, textAlign: 'center',
              opacity: stage.opacity,
              transform: stage.current ? 'scale(1.05)' : 'none',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: stage.color }}>{stage.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stage.desc}</div>
              {stage.current && (
                <div style={{ fontSize: 9, color: stage.color, marginTop: 2, fontWeight: 700 }}>← 目指す姿</div>
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          全員がリーダー。誰かに言われなくても最善の行動を選択できる組織。<br/>
          G1→G5は「ティール度の成長」であり、同心円の広がり。
        </div>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>📊 管理ダッシュボード</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 28 }}>クリニックマネジメント機能の概要</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
        {cards.map(card => (
          <Link key={card.label} href={card.href} style={{ textDecoration: 'none' }}>
            <div style={{
              padding: 24, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 16, transition: 'border-color 0.15s', cursor: 'pointer',
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{card.icon}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
            </div>
          </Link>
        ))}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>クイックリンク</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { href: '/admin/philosophy', label: '理念を登録・編集する', icon: '📖', desc: 'クリニックの理念をテキストまたはPDFで登録し、AIで解析' },
          { href: '/admin/grade', label: '等級制度を設計する', icon: '🏅', desc: '理念に基づいた等級制度をAIと共に構築（Phase B）' },
          { href: '/admin/evaluation', label: '評価制度を設計する', icon: '📋', desc: '等級に紐づいた評価シートを自動生成（Phase B）' },
        ].map(link => (
          <Link key={link.href} href={link.href} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12,
            textDecoration: 'none', transition: 'border-color 0.15s',
          }}>
            <span style={{ fontSize: 22 }}>{link.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{link.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{link.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
