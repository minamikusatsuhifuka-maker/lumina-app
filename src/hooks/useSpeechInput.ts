'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

/** MediaRecorder対応チェック */
function isMediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!window.MediaRecorder
  );
}

/** Web Speech API の初期化（リアルタイム表示用） */
function createRealtimeSpeechRecognition(): any {
  const W = window as any;
  const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
  if (!SR) return null;
  const recognition = new SR();
  recognition.lang = 'ja-JP';
  recognition.continuous = true;
  recognition.interimResults = true;
  return recognition;
}

interface UseSpeechInputOptions {
  onResult: (text: string) => void;
  onError?: (error: string) => void;
}

export function useSpeechInput({ onResult, onError }: UseSpeechInputOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [hasRealtimeSpeech, setHasRealtimeSpeech] = useState(false);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalTranscriptRef = useRef('');
  const onResultRef = useRef(onResult);

  // onResult の最新値を常に参照
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);

  // 初期化
  useEffect(() => {
    const rec = createRealtimeSpeechRecognition();
    if (rec) {
      setHasRealtimeSpeech(true);
      setIsSupported(true);
    } else if (isMediaRecorderSupported()) {
      setIsSupported(true);
    } else {
      setIsSupported(false);
    }
  }, []);

  // アンマウント時クリーンアップ
  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      mediaRecorderRef.current?.stop();
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    };
  }, []);

  /** Gemini APIでテキスト補正 */
  const correctWithGemini = useCallback(async (text: string): Promise<string> => {
    try {
      setIsCorrecting(true);
      const res = await fetch('/api/speech-to-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'correct', text }),
      });
      const data = await res.json();
      return data.transcript || text;
    } catch {
      return text;
    } finally {
      setIsCorrecting(false);
    }
  }, []);

  /** MediaRecorderで録音した音声をGemini APIで文字起こし（フォールバック用） */
  const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string> => {
    setIsTranscribing(true);
    try {
      const buffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      const res = await fetch('/api/speech-to-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, mimeType: audioBlob.type }),
      });
      const data = await res.json();
      return data.transcript || '';
    } catch {
      return '';
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  /** 録音停止 */
  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    mediaRecorderRef.current?.stop();
    if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
    setIsListening(false);
    setInterimText('');
  }, []);

  /** 録音開始 */
  const startListening = useCallback(() => {
    finalTranscriptRef.current = '';
    setInterimText('');
    audioChunksRef.current = [];

    if (hasRealtimeSpeech) {
      // Web Speech API + MediaRecorder 並行モード
      const recognition = createRealtimeSpeechRecognition();
      if (!recognition) return;

      recognition.onresult = (e: any) => {
        let interim = '';
        let final = '';
        for (let i = 0; i < e.results.length; i++) {
          const result = e.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        finalTranscriptRef.current = final;
        setInterimText(interim);
      };
      recognition.onerror = () => {};
      recognition.onend = () => {};
      recognitionRef.current = recognition;

      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      }).then((stream) => {
        if (isMediaRecorderSupported()) {
          const recorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : MediaRecorder.isTypeSupported('audio/mp4')
                ? 'audio/mp4'
                : 'audio/webm',
          });
          mediaRecorderRef.current = recorder;
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };
          recorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            const rawText = finalTranscriptRef.current;
            if (rawText.trim()) {
              // SpeechRecognition のテキストをGemini で補正
              const corrected = await correctWithGemini(rawText);
              onResultRef.current(corrected);
            } else {
              // フォールバック: 音声blobをGeminiで文字起こし
              const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
              if (blob.size > 0) {
                const text = await transcribeAudio(blob);
                if (text) onResultRef.current(text);
              }
            }
          };
          recorder.start();
        }

        try { recognition.start(); } catch { /* 開始失敗 */ }
        setIsListening(true);

        recordingTimerRef.current = setTimeout(() => {
          stopListening();
        }, 60000); // 最大60秒
      }).catch(() => {
        setIsListening(false);
        onError?.('マイクの使用が許可されていません');
      });

    } else if (isMediaRecorderSupported()) {
      // MediaRecorder のみモード（Safari/Firefox）
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      }).then((stream) => {
        const recorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/mp4')
              ? 'audio/mp4'
              : 'audio/webm',
        });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          if (blob.size > 0) {
            const text = await transcribeAudio(blob);
            if (text) onResultRef.current(text);
          }
        };
        recorder.start();
        setIsListening(true);
        recordingTimerRef.current = setTimeout(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
            setIsListening(false);
          }
        }, 60000);
      }).catch(() => {
        setIsListening(false);
        onError?.('マイクの使用が許可されていません');
      });
    }
  }, [hasRealtimeSpeech, stopListening, correctWithGemini, transcribeAudio, onError]);

  /** トグル */
  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isTranscribing,
    isCorrecting,
    interimText,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
  };
}
