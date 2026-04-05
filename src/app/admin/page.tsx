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
