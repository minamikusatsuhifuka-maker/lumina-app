'use client';

export default function OfflinePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 60, marginBottom: 24 }}>📡</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>オフラインです</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.8 }}>
          インターネット接続を確認してから<br />もう一度お試しください。
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '12px 32px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
          }}
        >
          再接続を試みる
        </button>
      </div>
    </div>
  );
}
