'use client';
import { useState, useEffect, useRef } from 'react';

interface Message { role: 'user' | 'assistant'; content: string; timestamp: string; }

interface Props {
  contextType: string;
  contextLabel: string;
  onInsightsExtracted?: (insights: any) => void;
}

export function AIDialoguePanel({ contextType, contextLabel, onInsightsExtracted }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [insights, setInsights] = useState<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const startSession = async () => {
    setLoading(true); setInsights(null); setTurnCount(0);
    const res = await fetch(`/api/clinic/dialogue?contextType=${contextType}&contextLabel=${encodeURIComponent(contextLabel)}`);
    const data = await res.json();
    setSessionId(data.session.id);
    setMessages(data.messages);
    setLoading(false);
  };

  useEffect(() => { startSession(); }, [contextType]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || !sessionId || loading) return;
    const msg = input.trim();
    setInput('');
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);

    const res = await fetch('/api/clinic/dialogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, userMessage: msg }) });
    const data = await res.json();
    setMessages(data.messages);
    setTurnCount(data.turnCount);
    if (data.insights) { setInsights(data.insights); onInsightsExtracted?.(data.insights); }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ヘッダー */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(108,99,255,0.08), rgba(59,130,246,0.05))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff' }}>🤖 AI対話ブラッシュアップ</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{contextLabel}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{turnCount}回</span>
            <button onClick={startSession} style={{ fontSize: 10, color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>最初から</button>
          </div>
        </div>
        <div style={{ marginTop: 8, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(turnCount / 5 * 100, 100)}%`, background: '#6c63ff', transition: 'width 0.5s', borderRadius: 2 }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
          {turnCount < 5 ? `あと${5 - turnCount}回で洞察を自動抽出` : '✅ 洞察を抽出しました'}
        </div>
      </div>

      {/* メッセージ */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '10px 14px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-card)',
              border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              color: msg.role === 'user' ? '#fff' : 'var(--text-secondary)',
              fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            }}>
              {msg.role === 'assistant' && <span style={{ fontSize: 10, color: '#6c63ff', fontWeight: 600, display: 'block', marginBottom: 4 }}>🤖 AI</span>}
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>考え中...</div>
          </div>
        )}
        {insights && (
          <div style={{ padding: 14, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6c63ff', marginBottom: 6 }}>✨ 対話から抽出した洞察</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>{insights.summary}</div>
            {insights.criteria?.map((c: any, i: number) => <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 0' }}>• {c.criterion}</div>)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 入力 */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Enterで送信" rows={2} style={{ flex: 1, padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, outline: 'none', resize: 'none' }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: loading || !input.trim() ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', alignSelf: 'flex-end' }}>送信</button>
      </div>
    </div>
  );
}
