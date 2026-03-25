import { useState, useRef, useCallback } from 'react';

export function useProgress() {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startProgress = useCallback(() => {
    setProgress(0);
    setLoading(true);

    // 疑似進捗：最初は速く、後半は遅くなる
    let current = 0;
    timerRef.current = setInterval(() => {
      current += current < 30 ? 3 : current < 60 ? 1.5 : current < 80 ? 0.8 : current < 90 ? 0.3 : 0.1;
      if (current >= 92) current = 92; // 完了前は92%で止める
      setProgress(current);
    }, 200);
  }, []);

  const completeProgress = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);
    setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, 600);
  }, []);

  const resetProgress = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setLoading(false);
    setProgress(0);
  }, []);

  return { progress, loading, setProgress, startProgress, completeProgress, resetProgress };
}
