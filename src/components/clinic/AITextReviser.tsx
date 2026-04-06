'use client';
import { useState } from 'react';

const PURPOSES = [
  { key: 'patient',    label: '🏥 患者向け',      desc: '分かりやすく温かく' },
  { key: 'official',  label: '📋 公式文書',       desc: '正確・法的に明確に' },
  { key: 'manual',    label: '💼 マニュアル',      desc: '手順的・具体的に' },
  { key: 'philosophy',label: '🌿 哲学を反映',      desc: '理念・ビジョンを込めて' },
  { key: 'simple',    label: '✨ シンプルに',      desc: '簡潔・要点明確に' },
  { key: 'warm',      label: '🤝 温かみ',          desc: '柔らかく人間味を' },
  { key: 'teal',      label: '🩵 ティール文化',    desc: '自律・信頼・主役意識' },
];

interface AITextReviserProps {
  text: string;
  onRevised: (revised: string) => void;
  defaultPurpose?: string;
  purposes?: string[];
  compact?: boolean;
}

export function AITextReviser({
  text,
  onRevised,
  defaultPurpose = 'simple',
  purposes,
  compact = false,
}: AITextReviserProps) {
  const [purpose, setPurpose] = useState(defaultPurpose);
  const [revised, setRevised] = useState('');
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);

  const displayPurposes = purposes
    ? PURPOSES.filter(p => purposes.includes(p.key))
    : PURPOSES;

  const generate = async () => {
    if (!text.trim()) {
      setMessage('テキストが空です');
      setTimeout(() => setMessage(''), 2000);
      return;
    }
    setGenerating(true);
    setRevised('');
    setMessage('');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const res = await fetch('/api/clinic/text-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedText: text, purpose, fullContext: text }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (data.revised) setRevised(data.revised);
      else setMessage(data.error || '生成に失敗しました');
    } catch (e: any) {
      setMessage(e.name === 'AbortError' ? 'タイムアウトしました' : 'エラーが発生しました');
    } finally {
      setGenerating(false);
    }
  };

  const apply = () => {
    if (!revised) return;
    onRevised(revised);
    setRevised('');
    setExpanded(false);
    setMessage('✅ 適用しました');
    setTimeout(() => setMessage(''), 2000);
  };

  const cardStyle: React.CSSProperties = {
    padding: compact ? 12 : 16,
    background: 'rgba(108,99,255,0.05)',
    border: '1px solid rgba(108,99,255,0.2)',
    borderRadius: 12,
    marginTop: 12,
  };

  if (!expanded) {
    return (
      <div style={{ marginTop: 8 }}>
        {message && (
          <div style={{ fontSize: 12, color: '#4ade80', marginBottom: 6 }}>{message}</div>
        )}
        <button
          onClick={() => setExpanded(true)}
          style={{
            fontSize: 12, color: '#6c63ff', background: 'none',
            border: '1px solid rgba(108,99,255,0.3)',
            borderRadius: 8, padding: '5px 12px', cursor: 'pointer',
          }}
        >
          🤖 AIで文章を改善
        </button>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6c63ff' }}>🤖 AIで文章を改善</div>
        <button
          onClick={() => { setExpanded(false); setRevised(''); }}
          style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        >✕ 閉じる</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {displayPurposes.map(p => (
          <button
            key={p.key}
            onClick={() => setPurpose(p.key)}
            style={{
              padding: '4px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', border: '1px solid',
              background: purpose === p.key ? 'rgba(108,99,255,0.12)' : 'var(--bg-card)',
              borderColor: purpose === p.key ? '#6c63ff' : 'var(--border)',
              color: purpose === p.key ? '#6c63ff' : 'var(--text-muted)',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {message && (
        <div style={{ fontSize: 12, color: message.includes('✅') ? '#4ade80' : '#ef4444', marginBottom: 8 }}>
          {message}
        </div>
      )}

      <button
        onClick={generate}
        disabled={generating}
        style={{
          width: '100%', padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: generating ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
          color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: revised ? 12 : 0,
        }}
      >
        {generating ? '🤖 生成中...' : '🤖 AIで改善する'}
      </button>

      {revised && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 700 }}>修正前</div>
              <div style={{
                padding: 8, background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6,
                fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                maxHeight: 150, overflowY: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {text}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#4ade80', marginBottom: 4, fontWeight: 700 }}>修正後</div>
              <div style={{
                padding: 8, background: 'rgba(74,222,128,0.06)',
                border: '1px solid rgba(74,222,128,0.2)', borderRadius: 6,
                fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6,
                maxHeight: 150, overflowY: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {revised}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={generate}
              style={{
                flex: 1, padding: '6px', borderRadius: 6, fontSize: 11,
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-muted)', cursor: 'pointer',
              }}
            >🔄 再生成</button>
            <button
              onClick={apply}
              style={{
                flex: 2, padding: '6px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                border: 'none', background: '#4ade80', color: '#fff', cursor: 'pointer',
              }}
            >✅ この修正を適用する</button>
          </div>
        </div>
      )}
    </div>
  );
}
