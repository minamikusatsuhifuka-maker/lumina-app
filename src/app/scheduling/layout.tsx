import type { Metadata } from 'next';

// 参加者向け公開ページ専用レイアウト。
// ダッシュボードのサイドバー/ヘッダ/ナビは一切含まない、独立した最小レイアウト。
// 院内システム感を出さず、中立的な「南草津皮フ科 日程調整」表記のみ。内部名 xLUMINA は出さない。

export const metadata: Metadata = {
  title: '南草津皮フ科 日程調整',
  description: '日程調整のご回答ページ',
  robots: { index: false, follow: false },
};

const CLINIC_NAME = '南草津皮フ科クリニック';

export default function SchedulingPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    // 全体を明色で塗り、グローバルのダークテーマを上書き（独立した参加者向け体験）
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(160deg,#eef1f8 0%,#e7ecfb 100%)',
        color: '#1f2433',
      }}
    >
      {/* 中立なヘッダー（ナビ・ログイン導線なし） */}
      <header style={{ padding: '18px 20px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 26, height: 26, borderRadius: 8,
              background: 'linear-gradient(135deg,#6c63ff,#00d4b8)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 13, fontWeight: 700,
            }}
          >
            🗓️
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#2a3146' }}>
            {CLINIC_NAME} 日程調整
          </span>
        </div>
      </header>

      {/* 中央寄せの本体（1カラム・余白広め） */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 20px 32px' }}>
        {children}
      </main>

      {/* 最小限のフッター（ブランドは中立表記のみ） */}
      <footer style={{ padding: '16px 20px 28px', textAlign: 'center', color: '#9098ad', fontSize: 11, lineHeight: 1.7 }}>
        {CLINIC_NAME}<br />
        ご不明な点は主催者までお問い合わせください。
      </footer>
    </div>
  );
}
