export const runtime = 'nodejs';

// 予約サブドメインのルート（token無し）。管理画面・ログインには絶対に飛ばさない。
// 「URLが必要です」的な軽い案内のみ。
const card: React.CSSProperties = {
  width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18, padding: 28,
  boxShadow: '0 10px 40px rgba(20,24,48,0.18)', border: '1px solid #e6e9f2', textAlign: 'center',
};

export default function SchedulingRootPage() {
  return (
    <div style={card}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🗓️</div>
      <h1 style={{ fontSize: 18, color: '#1f2433', margin: '0 0 8px' }}>日程調整ページ</h1>
      <p style={{ fontSize: 13, color: '#5a6075', lineHeight: 1.8 }}>
        ご案内された専用URL（リンク）からアクセスしてください。<br />
        URLが分からない場合は、主催者までお問い合わせください。
      </p>
    </div>
  );
}
