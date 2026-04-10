export default function Loading() {
  const pulse: React.CSSProperties = { background: 'var(--border)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' };
  return (
    <div style={{ padding: 24 }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.15 } }`}</style>
      <div style={{ ...pulse, height: 32, width: 140, marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[...Array(5)].map((_, i) => <div key={i} style={{ ...pulse, height: 32, width: 80, borderRadius: 20 }} />)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[...Array(8)].map((_, i) => <div key={i} style={{ ...pulse, height: 56, borderRadius: 10 }} />)}
      </div>
    </div>
  );
}
