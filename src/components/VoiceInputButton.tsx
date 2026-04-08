'use client';

import { useSpeechInput } from '@/hooks/useSpeechInput';

interface VoiceInputButtonProps {
  onResult: (text: string) => void;
  size?: 'sm' | 'md';
}

export function VoiceInputButton({ onResult, size = 'md' }: VoiceInputButtonProps) {
  const {
    isListening, isTranscribing, isCorrecting,
    interimText, isSupported, toggleListening,
  } = useSpeechInput({
    onResult,
    onError: (err) => console.warn('音声入力エラー:', err),
  });

  if (isSupported === false) return null;

  const dim = size === 'sm' ? 30 : 36;
  const processing = isTranscribing || isCorrecting;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <button
        onClick={toggleListening}
        disabled={processing}
        title={
          processing ? (isTranscribing ? '文字起こし中...' : '補正中...') :
          isListening ? 'クリックで音声入力停止' :
          'クリックで音声入力開始'
        }
        style={{
          width: dim, height: dim, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: isListening ? '2px solid #ef4444' : processing ? '2px solid #f59e0b' : '1px solid var(--border)',
          background: isListening ? '#ef4444' : processing ? '#f59e0b' : 'var(--bg-secondary)',
          color: isListening || processing ? '#fff' : 'var(--text-muted)',
          fontSize: size === 'sm' ? 13 : 16,
          cursor: processing ? 'not-allowed' : 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s',
          transform: isListening ? 'scale(1.1)' : 'scale(1)',
          animation: isListening ? 'voicePulse 1s infinite' : processing ? 'voiceSpin 1s linear infinite' : 'none',
          userSelect: 'none', WebkitUserSelect: 'none',
          opacity: processing ? 0.8 : 1,
        }}
      >
        {processing ? '⏳' : isListening ? '⏹' : '🎤'}
      </button>
      {/* リアルタイム認識テキスト表示 */}
      {interimText && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {interimText}...
        </span>
      )}
      {(isListening || processing) && (
        <style>{`
          @keyframes voicePulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
          @keyframes voiceSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      )}
    </div>
  );
}
