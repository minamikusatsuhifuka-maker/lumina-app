import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/DashboardSidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/auth');
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#07080f' }}>
      <DashboardSidebar userName={session.user?.name || ''} />
      <main style={{ flex: 1, padding: 28, overflowY: 'auto', maxWidth: 'calc(100vw - 220px)' }}>{children}</main>
    </div>
  );
}
