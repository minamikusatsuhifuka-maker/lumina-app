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
import { PageHelp } from '@/components/PageHelp';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/auth');
  return (
    <div className="dashboard-layout" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <DashboardSidebar userName={session.user?.name || ''} />
      <main className="dashboard-main" style={{ flex: 1, padding: 28, overflowY: 'auto', maxWidth: 'calc(100vw - 220px)', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12 }}><PageHelp /><ThemeToggle /><NotificationCenter /><ModelSelector /></div>
        {children}
      </main>
      <FloatingToolbar />
      <GlossaryPanel />
      <AIAssistant />
      <CommandPalette />
      <OnboardingTutorial />
      <style>{`
        @media (max-width: 768px) {
          .dashboard-main {
            max-width: 100vw !important;
            padding: 16px !important;
            padding-top: 56px !important;
          }
        }
      `}</style>
    </div>
  );
}
