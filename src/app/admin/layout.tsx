import { requireAdmin } from '@/lib/admin';
import { AdminSidebar } from '@/components/AdminSidebar';
import { ModelSelector } from '@/components/ModelSelector';
import { AdminBreadcrumb } from '@/components/AdminBreadcrumb';
import { CommandPalette } from '@/components/CommandPalette';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <AdminSidebar userName={user.name || ''} />
      <main style={{ flex: 1, padding: 28, overflowY: 'auto', maxWidth: 'calc(100vw - 220px)', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><ModelSelector /></div>
        <AdminBreadcrumb />
        {children}
      </main>
      <CommandPalette />
    </div>
  );
}
