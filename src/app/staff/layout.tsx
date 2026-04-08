import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { StaffNav } from '@/components/StaffNav';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/auth');
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* ヘッダー */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--sidebar-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #6c63ff, #00d4b8)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>x</div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>xLUMINA</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-muted)' }}>
          <span>{session.user?.name}</span>
        </div>
      </header>
      <div style={{ display: 'flex' }}>
        <StaffNav />
        <main style={{ flex: 1, padding: 24, overflowY: 'auto', paddingBottom: 80 }}>{children}</main>
      </div>
    </div>
  );
}
