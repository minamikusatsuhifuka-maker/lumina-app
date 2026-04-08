'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { VoiceInputButton } from '@/components/VoiceInputButton';

type Message = { role: 'user' | 'assistant'; content: string; };
type ChatSize = 'normal' | 'max';

const MIN_W = 320, MIN_H = 400, MAX_W = 900, MAX_H = 900;
const DEFAULT_SIZE = { width: 384, height: 500 };

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [chatSize, setChatSize] = useState<ChatSize>('normal');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'こんにちは！xLUMINAアシスタントです。何でも聞いてください 😊\n\n例：「競合分析の結果を要約して」「このデータからSNS投稿を作って」' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // リサイズ用state/ref
  const [size, setSize] = useState(DEFAULT_SIZE);
  const isResizing = useRef(false);
  const resizeDir = useRef<'right' | 'bottom' | 'corner' | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ width: 0, height: 0 });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // localStorage から復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lumina_chat_size');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.width && parsed.height) setSize(parsed);
      }
    } catch {}
  }, []);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMsg,
          context: 'xLUMINAというAIビジネスインテリジェンスプラットフォームのアシスタントとして回答してください。',
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.result || '申し訳ありません、エラーが発生しました。' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。もう一度お試しください。' }]);
    } finally {
      setLoading(false);
    }
  };

  const QUICK = ['使い方を教えて', '最近の調査をまとめて', 'ワークフローを提案して', '今日やることを整理して'];

  const toggleMaximize = () => setChatSize(prev => prev === 'max' ? 'normal' : 'max');

  // リサイズハンドラー
  const handleResizeStart = (e: React.MouseEvent, direction: 'right' | 'bottom' | 'corner') => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    resizeDir.current = direction;
    startPos.current = { x: e.clientX, y: e.clientY };
    startSize.current = { ...size };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return;
    // ウィンドウは右下固定なので、左・上方向にドラッグして広げる → dx/dy を反転
    const dx = startPos.current.x - e.clientX;
    const dy = startPos.current.y - e.clientY;
    const dir = resizeDir.current;

    const newW = dir === 'bottom' ? startSize.current.width : Math.min(MAX_W, Math.max(MIN_W, startSize.current.width + dx));
    const newH = dir === 'right' ? startSize.current.height : Math.min(MAX_H, Math.max(MIN_H, startSize.current.height + dy));
    setSize({ width: newW, height: newH });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isResizing.current) return;
    isResizing.current = false;
    resizeDir.current = null;
    // 現在のサイズを保存（setSize後にrefで取れないのでDOMから取得せず次のrenderで保存）
    setSize(prev => {
      localStorage.setItem('lumina_chat_size', JSON.stringify(prev));
      return prev;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const windowStyle: React.CSSProperties = chatSize === 'max'
    ? { position: 'fixed', inset: 0, zIndex: 9998, width: '100vw', height: '100vh', background: 'var(--bg-secondary)', borderRadius: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { position: 'fixed', bottom: 88, right: 24, zIndex: 9998, width: size.width, height: size.height, background: 'var(--bg-secondary)', border: '1px solid var(--border-accent)', borderRadius: 20, display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.2)', overflow: 'hidden' };

  // リサイズハンドルの共通スタイル
  const handleBase: React.CSSProperties = { position: 'absolute', zIndex: 10 };

  return (
    <>
      {/* フローティングボタン（最大化時は非表示） */}
      {chatSize !== 'max' && (
        <button
          onClick={() => setOpen(!open)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            width: 52, height: 52, borderRadius: '50%', border: 'none',
            background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)',
            color: '#fff', fontSize: 22, cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(108,99,255,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.2s',
          }}
          title="AIアシスタント"
        >
          {open ? '✕' : '💬'}
        </button>
      )}

      {/* チャットウィンドウ */}
      {open && (
        <div style={{ ...windowStyle, position: 'fixed' }}>
          {/* リサイズハンドル（通常モード・PC のみ） */}
          {chatSize !== 'max' && !isMobile && (
            <>
              {/* 左端 */}
              <div
                onMouseDown={e => handleResizeStart(e, 'right')}
                style={{ ...handleBase, left: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize' }}
              />
              {/* 上端 */}
              <div
                onMouseDown={e => handleResizeStart(e, 'bottom')}
                style={{ ...handleBase, top: 0, left: 0, right: 0, height: 6, cursor: 'row-resize' }}
              />
              {/* 左上角 */}
              <div
                onMouseDown={e => handleResizeStart(e, 'corner')}
                style={{ ...handleBase, top: 0, left: 0, width: 14, height: 14, cursor: 'nw-resize', borderRadius: '20px 0 0 0' }}
              />
            </>
          )}

          {/* ヘッダー */}
          <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>xLUMINAアシスタント</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>AI powered by Claude</div>
            </div>
            <button
              onClick={toggleMaximize}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: '4px 10px', color: '#fff', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}
              title={chatSize === 'max' ? '縮小' : '最大化'}
            >
              {chatSize === 'max' ? '縮小' : '最大化'}
            </button>
            {chatSize === 'max' && (
              <button
                onClick={() => { setChatSize('normal'); setOpen(false); }}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#fff', fontSize: 14, cursor: 'pointer' }}
                title="閉じる"
              >
                ✕
              </button>
            )}
          </div>

          {/* メッセージ */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: msg.role === 'user' ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-card)',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-secondary)',
                  fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
                  考え中...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* クイックボタン（初回のみ） */}
          {messages.length === 1 && (
            <div style={{ padding: '0 14px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK.map(q => (
                <button key={q} onClick={() => { setInput(q); }} style={{ padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>{q}</button>
              ))}
            </div>
          )}

          {/* 入力 */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="メッセージを入力..."
              style={{ flex: 1, padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 20, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
            />
            <VoiceInputButton size="sm" onResult={(text) => setInput(prev => prev + text)} />
            <button onClick={send} disabled={loading || !input.trim()} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: loading || !input.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
