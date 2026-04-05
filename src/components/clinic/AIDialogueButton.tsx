'use client';
import { useState } from 'react';
import { AIDialoguePanel } from './AIDialoguePanel';

interface Props {
  contextType: string;
  contextLabel: string;
  onInsightsExtracted?: (insights: any) => void;
}

export function AIDialogueButton({ contextType, contextLabel, onInsightsExtracted }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* フローティングボタン */}
      <button onClick={() => setOpen(true)} style={{
        position: 'fixed', bottom: 96, right: 24, zIndex: 40,
        background: 'linear-gradient(135deg, #6c63ff, #3b82f6)',
        color: '#fff', padding: '10px 18px', borderRadius: 24,
        border: 'none', boxShadow: '0 4px 20px rgba(108,99,255,0.4)',
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 700, cursor: 'pointer',
      }}>
        🤖 AIと対話
      </button>

      {/* スライドインパネル */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(0,0,0,0.3)' }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
            width: 380, background: 'var(--bg-primary)',
            borderLeft: '1px solid var(--border)',
            boxShadow: '-8px 0 30px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px' }}>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <AIDialoguePanel contextType={contextType} contextLabel={contextLabel} onInsightsExtracted={onInsightsExtracted} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
