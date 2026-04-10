export default function Loading() {
  const pulse: React.CSSProperties = { background: 'var(--border)', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' };
  return (
    <div style={{ padding: 24 }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.15 } }`}</style>
      <div style={{ ...pulse, height: 32, width: 200, marginBottom: 8 }} />
      <div style={{ ...pulse, height: 16, width: 260, marginBottom: 20 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {[...Array(6)].map((_, i) => <div key={i} style={{ ...pulse, height: 120, borderRadius: 12 }} />)}
      </div>
    </div>
  );
}
