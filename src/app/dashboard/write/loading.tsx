export default function Loading() {
  const pulse: React.CSSProperties = { background: 'var(--border)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' };
  return (
    <div style={{ padding: 24 }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.15 } }`}</style>
      <div style={{ ...pulse, height: 32, width: 180, marginBottom: 8 }} />
      <div style={{ ...pulse, height: 16, width: 280, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[...Array(8)].map((_, i) => <div key={i} style={{ ...pulse, height: 32, width: 80, borderRadius: 20 }} />)}
      </div>
      <div style={{ ...pulse, height: 160, borderRadius: 12, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 16 }}>
        {[...Array(3)].map((_, i) => <div key={i} style={{ ...pulse, height: 40, flex: 1, borderRadius: 8 }} />)}
      </div>
    </div>
  );
}
