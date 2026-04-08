'use client';

import { useSpeechInput } from '@/hooks/useSpeechInput';

interface VoiceInputButtonProps {
  onResult: (text: string) => void;
  size?: 'sm' | 'md';
}

export function VoiceInputButton({ onResult, size = 'md' }: VoiceInputButtonProps) {
  const { isListening, isSupported, toggleListening } = useSpeechInput({
    onResult,
    onError: (err) => console.warn('音声入力エラー:', err),
  });

  if (isSupported === false) return null;

  const dim = size === 'sm' ? 30 : 36;

  return (
    <button
      onClick={toggleListening}
      title={isListening ? 'クリックで音声入力停止' : 'クリックで音声入力開始'}
      style={{
        width: dim, height: dim, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: isListening ? '2px solid #ef4444' : '1px solid var(--border)',
        background: isListening ? '#ef4444' : 'var(--bg-secondary)',
        color: isListening ? '#fff' : 'var(--text-muted)',
        fontSize: size === 'sm' ? 13 : 16,
        cursor: 'pointer', flexShrink: 0,
        transition: 'all 0.15s',
        transform: isListening ? 'scale(1.1)' : 'scale(1)',
        animation: isListening ? 'voicePulse 1s infinite' : 'none',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {isListening ? '⏹' : '🎤'}
      {/* pulse animation via inline style tag (一度だけ挿入) */}
      {isListening && (
        <style>{`@keyframes voicePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }`}</style>
      )}
    </button>
  );
}
