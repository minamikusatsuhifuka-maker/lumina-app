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
import { TextSizeToggle } from '@/components/TextSizeToggle';
import { PageHelp } from '@/components/PageHelp';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';
import ShortcutPalette, { ShortcutHelpButton } from '@/components/ShortcutPalette';
import { ToastProvider } from '@/components/ui/Toast';
import { BackToTopButton } from '@/components/BackToTopButton';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/auth');
  return (
    <ToastProvider>
    <div className="dashboard-layout" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <DashboardSidebar userName={session.user?.name || ''} />
      <main className="dashboard-main page-enter" style={{ flex: 1, padding: 28, overflowY: 'auto', maxWidth: 'calc(100vw - 220px)', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12 }}><PageHelp /><ShortcutHelpButton /><TextSizeToggle /><ThemeToggle /><NotificationCenter /><ModelSelector /></div>
        {children}
      </main>
      <FloatingToolbar />
      <GlossaryPanel />
      <AIAssistant />
      {/* 243: 追従ボタン列の最上段。onにした浮遊ボタンの上に出るので、
          スクロールで出入りしても下のボタンの位置がずれない */}
      <BackToTopButton />
      <CommandPalette />
      <OnboardingTutorial />
      <ShortcutPalette />
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
    </ToastProvider>
  );
}
