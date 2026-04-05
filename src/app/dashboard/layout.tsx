import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { AIAssistant } from '@/components/AIAssistant';
import { ModelSelector } from '@/components/ModelSelector';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/auth');
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <DashboardSidebar userName={session.user?.name || ''} />
      <main style={{ flex: 1, padding: 28, overflowY: 'auto', maxWidth: 'calc(100vw - 220px)', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><ModelSelector /></div>
        {children}
      </main>
      <AIAssistant />
    </div>
  );
}
