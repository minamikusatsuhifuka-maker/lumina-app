'use client';
import { useState, useEffect } from 'react';
import { getSavedModel, saveModel } from '@/lib/model-preference';
import type { AIModel } from '@/lib/model-preference';

const MODELS = [
  { id: 'claude' as AIModel, name: 'Claude', fullName: 'Claude Sonnet 4.6', icon: '🤖', color: '#6c63ff' },
  { id: 'gemini' as AIModel, name: 'Gemini', fullName: 'Gemini 2.5 Pro', icon: '✨', color: '#4285f4' },
];

export function ModelSelector() {
  const [selected, setSelected] = useState<AIModel>('claude');
  const [switching, setSwitching] = useState(false);

  useEffect(() => { setSelected(getSavedModel()); }, []);

  const switchModel = async (newModel: AIModel) => {
    if (newModel === selected || switching) return;
    setSwitching(true);
    saveModel(newModel);
    setSelected(newModel);
    window.dispatchEvent(new CustomEvent('modelChanged', { detail: newModel }));
    // サーバーにも保存（エラーは無視）
    try {
      await fetch('/api/clinic/model-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: newModel }),
      });
    } catch {}
    setSwitching(false);
  };

  return (
    <div style={{
      display: 'flex',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 20,
      padding: 3,
      gap: 2,
    }}>
      {MODELS.map(m => (
        <button
          key={m.id}
          onClick={() => switchModel(m.id)}
          disabled={switching}
          title={m.fullName}
          style={{
            padding: '4px 12px',
            borderRadius: 16,
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 700,
            transition: 'all 0.2s',
            background: selected === m.id ? m.color : 'transparent',
            color: selected === m.id ? '#fff' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span>{m.icon}</span>
          <span>{m.name}</span>
        </button>
      ))}
    </div>
  );
}
