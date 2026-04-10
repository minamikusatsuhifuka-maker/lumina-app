import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { AIAssistant } from '@/components/AIAssistant';
import { FloatingToolbar } from '@/components/FloatingToolbar';
import { GlossaryPanel } from '@/components/GlossaryPanel';
import { ModelSelector } from '@/components/ModelSelector';
import { CommandPalette } from '@/components/CommandPalette';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ThemeToggle } from '@/components/ThemeToggle';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/auth');
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <DashboardSidebar userName={session.user?.name || ''} />
      <main style={{ flex: 1, padding: 28, overflowY: 'auto', maxWidth: 'calc(100vw - 220px)', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12 }}><ThemeToggle /><NotificationCenter /><ModelSelector /></div>
        {children}
      </main>
      <FloatingToolbar />
      <GlossaryPanel />
      <AIAssistant />
      <CommandPalette />
    </div>
  );
}
