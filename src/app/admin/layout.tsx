import { requireAdmin } from '@/lib/admin';
import { AdminSidebar } from '@/components/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <AdminSidebar userName={user.name || ''} />
      <main style={{ flex: 1, padding: 28, overflowY: 'auto', maxWidth: 'calc(100vw - 220px)', color: 'var(--text-primary)' }}>
        {children}
      </main>
    </div>
  );
}
