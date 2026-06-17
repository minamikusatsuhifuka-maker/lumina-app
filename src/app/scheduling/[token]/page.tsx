import { notFound } from 'next/navigation';
import { neon } from '@neondatabase/serverless';
import { ensureSchedulingTables, loadEventByToken, parseCandidateDates } from '@/lib/scheduling';
import PublicSchedulingFlow from './PublicSchedulingFlow';

export const runtime = 'nodejs';
// 公開ページ（認証なし）。常に最新状態を見るため動的レンダリング。
export const dynamic = 'force-dynamic';

const wrap: React.CSSProperties = {
  minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(135deg,#eef1f8,#e7ecfb)', padding: 20, boxSizing: 'border-box',
};

const closedCard: React.CSSProperties = {
  width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18, padding: 28,
  boxShadow: '0 10px 40px rgba(20,24,48,0.18)', border: '1px solid #e6e9f2', textAlign: 'center',
};

export default async function SchedulingPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const sql = neon(process.env.DATABASE_URL!);
  await ensureSchedulingTables(sql);
  const event = await loadEventByToken(sql, token);

  // 存在しない token は 404（推測対策）
  if (!event) notFound();

  // collecting 以外は受付終了表示（draft/ready/finalized/notified/cancelled）
  if (event.status !== 'collecting') {
    return (
      <div style={wrap}>
        <div style={closedCard}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🗓️</div>
          <h1 style={{ fontSize: 18, color: '#1f2433', margin: '0 0 6px' }}>受付は終了しています</h1>
          <p style={{ fontSize: 13, color: '#5a6075', lineHeight: 1.7 }}>
            この日程調整は現在回答を受け付けていません。<br />
            主催者にお問い合わせください。
          </p>
        </div>
      </div>
    );
  }

  const candidateDates = parseCandidateDates(event.candidate_dates);

  return (
    <div style={wrap}>
      <PublicSchedulingFlow
        token={event.id}
        title={event.title}
        description={event.description}
        candidateDates={candidateDates}
      />
    </div>
  );
}
