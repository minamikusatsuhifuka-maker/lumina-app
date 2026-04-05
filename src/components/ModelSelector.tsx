'use client';
import { useState, useEffect } from 'react';
import { getSavedModel, saveModel } from '@/lib/model-preference';
import type { AIModel } from '@/lib/model-preference';

const OPTIONS = [
  { id: 'claude' as AIModel, name: 'Claude Sonnet 4.6', provider: 'Anthropic', desc: '高品質・バランス型', icon: '🤖' },
  { id: 'gemini' as AIModel, name: 'Gemini 2.5 Pro', provider: 'Google', desc: '安定・高精度・長文処理', icon: '✨' },
];

export function ModelSelector() {
  const [selected, setSelected] = useState<AIModel>('claude');
  const [open, setOpen] = useState(false);

  useEffect(() => { setSelected(getSavedModel()); }, []);

  const handleSelect = (model: AIModel) => {
    setSelected(model); saveModel(model); setOpen(false);
    window.dispatchEvent(new CustomEvent('modelChanged', { detail: model }));
  };

  const current = OPTIONS.find(m => m.id === selected)!;

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8,
        border: '1px solid var(--border)', background: 'var(--bg-card)',
        color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
      }}>
        <span>{current.icon}</span>
        <span style={{ fontWeight: 600 }}>{current.name}</span>
        <span style={{ fontSize: 10 }}>▼</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', right: 0, top: 36, zIndex: 50, width: 260, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>AIモデルを選択</div>
            {OPTIONS.map(o => (
              <button key={o.id} onClick={() => handleSelect(o.id)} style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', cursor: 'pointer',
                background: selected === o.id ? 'rgba(108,99,255,0.1)' : 'transparent',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>{o.icon}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{o.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{o.provider}</span>
                    {selected === o.id && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6c63ff' }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{o.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
