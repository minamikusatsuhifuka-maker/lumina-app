'use client';
import { useState, useEffect, useRef } from 'react';

type ChatMode = 'propose' | 'analyze' | 'free';
type Message = { role: 'user' | 'assistant'; content: string };
type History = { id: string; before_text: string; after_text: string; instruction: string; created_at: string };

interface BeforeAfter { before: string; after: string; title?: string }

interface AIBrushupChatProps {
  contextContent: string;
  contextLabel: string;
  onApply?: (text: string) => void;
}

function parseBeforeAfter(text: string): BeforeAfter[] {
  const results: BeforeAfter[] = [];
  // 【案①】形式
  const casePattern = /【案[①②③④⑤\d]+】([^\n]*)\nBEFORE:\n([\s\S]*?)AFTER:\n([\s\S]*?)(?=【案|$)/g;
  let match;
  while ((match = casePattern.exec(text)) !== null) {
    results.push({ title: match[1].trim(), before: match[2].trim(), after: match[3].trim() });
  }
  if (results.length > 0) return results;
  // シンプルなBEFORE/AFTER形式
  const simplePattern = /BEFORE:\n([\s\S]*?)AFTER:\n([\s\S]*?)(?=BEFORE:|$)/g;
  while ((match = simplePattern.exec(text)) !== null) {
    results.push({ before: match[1].trim(), after: match[2].trim() });
  }
  return results;
}

function BeforeAfterCard({ item, onApply, onSave }: { item: BeforeAfter; onApply?: (t: string) => void; onSave: (b: string, a: string) => void }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginTop: 8 }}>
      {item.title && (
        <div style={{ padding: '6px 12px', background: 'rgba(108,99,255,0.1)', fontSize: 12, fontWeight: 700, color: '#6c63ff' }}>
          {item.title}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ padding: 10, borderRight: '1px solid var(--border)', background: 'rgba(239,68,68,0.04)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>BEFORE</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.before}</div>
        </div>
        <div style={{ padding: 10, background: 'rgba(74,222,128,0.04)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', marginBottom: 4 }}>AFTER</div>
          <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.after}</div>
        </div>
      </div>
      <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, background: 'var(--bg-secondary)' }}>
        {onApply && (
          <button onClick={() => onApply(item.after)} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#4ade80', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            反映する
          </button>
        )}
        <button onClick={() => onSave(item.before, item.after)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
          保存
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg, onApply, onSave }: { msg: Message; onApply?: (t: string) => void; onSave: (b: string, a: string) => void }) {
  const baItems = msg.role === 'assistant' ? parseBeforeAfter(msg.content) : [];
  const textWithoutBA = msg.content.replace(/【案[①②③④⑤\d]+】[\s\S]*?(?=【案|$)/g, '').replace(/BEFORE:\n[\s\S]*?AFTER:\n[\s\S]*?(?=BEFORE:|$)/g, '').trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
      {textWithoutBA && (
        <div style={{
          maxWidth: '90%', padding: '8px 12px',
          borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          background: msg.role === 'user' ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-secondary)',
          color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
          fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap',
          border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
        }}>{textWithoutBA}</div>
      )}
      {baItems.map((item, i) => (
        <div key={i} style={{ width: '95%' }}>
          <BeforeAfterCard item={item} onApply={onApply} onSave={onSave} />
        </div>
      ))}
    </div>
  );
}

export function AIBrushupChat({ contextContent, contextLabel, onApply }: AIBrushupChatProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('propose');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [histories, setHistories] = useState<History[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatOpen) loadSession();
  }, [chatOpen, contextLabel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const loadSession = async () => {
    const res = await fetch(`/api/clinic/brushup-chat?contextLabel=${encodeURIComponent(contextLabel)}`);
    const data = await res.json();
    if (data.session) {
      setSessionId(data.session.id);
      setChatMessages(data.messages || []);
    }
    setHistories(data.histories || []);
  };

  const sendChat = async (overrideInput?: string) => {
    const input = overrideInput || chatInput;
    if (!input.trim() && chatMode !== 'analyze') return;
    setChatLoading(true);

    const userMsg = chatMode === 'analyze' && chatMessages.length === 0
      ? `この${contextLabel}を分析してください。`
      : input;

    const newMessages: Message[] = [...chatMessages, { role: 'user', content: userMsg }];
    setChatMessages(newMessages);
    setChatInput('');

    try {
      const res = await fetch('/api/clinic/brushup-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatMode, contextLabel, contextContent, messages: newMessages, sessionId }),
      });
      const data = await res.json();
      if (data.result) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.result }]);
        if (data.sessionId) setSessionId(data.sessionId);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const saveHistory = async (before: string, after: string) => {
    await fetch('/api/clinic/brushup-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saveHistory: true, contextLabel, beforeText: before, afterText: after, instruction: chatMessages.find(m => m.role === 'user')?.content || '' }),
    });
    setSavedMsg('保存しました！');
    setTimeout(() => setSavedMsg(''), 2000);
    loadSession();
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--input-border)', background: 'var(--input-bg)',
    color: 'var(--text-primary)', fontSize: 12, outline: 'none', resize: 'none',
  };

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
      {chatOpen && (
        <div style={{ width: 420, height: 600, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ヘッダー */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(108,99,255,0.1), rgba(236,72,153,0.05))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>🤖 {contextLabel}をブラッシュアップ</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setShowHistory(!showHistory)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: showHistory ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)', color: showHistory ? '#6c63ff' : 'var(--text-muted)', cursor: 'pointer' }}>
                  📜 履歴
                </button>
                <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {([{ k: 'propose', l: '💬 提案' }, { k: 'analyze', l: '🔍 分析' }, { k: 'free', l: '🎙 対話' }] as const).map(m => (
                <button key={m.k} onClick={() => { setChatMode(m.k); setChatMessages([]); setChatInput(''); setSessionId(null); }}
                  style={{ flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: chatMode === m.k ? 'rgba(108,99,255,0.15)' : 'transparent', color: chatMode === m.k ? '#6c63ff' : 'var(--text-muted)', borderColor: chatMode === m.k ? 'rgba(108,99,255,0.4)' : 'var(--border)' }}>
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          {/* 履歴パネル */}
          {showHistory && (
            <div style={{ maxHeight: 200, overflowY: 'auto', borderBottom: '1px solid var(--border)', padding: '10px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>📜 保存済み改善履歴</div>
              {histories.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 10 }}>まだ保存された改善履歴がありません</div>
              ) : histories.map(h => (
                <div key={h.id} style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '4px 8px', background: 'var(--bg-secondary)', fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(h.created_at).toLocaleDateString('ja-JP')} {h.instruction && `— ${h.instruction.slice(0, 30)}`}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)', background: 'rgba(239,68,68,0.04)' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', marginBottom: 2 }}>BEFORE</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{h.before_text?.slice(0, 60)}...</div>
                    </div>
                    <div style={{ padding: '6px 8px', background: 'rgba(74,222,128,0.04)' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', marginBottom: 2 }}>AFTER</div>
                      <div style={{ fontSize: 10, color: 'var(--text-primary)', lineHeight: 1.5 }}>{h.after_text?.slice(0, 60)}...</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* メッセージ */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                {chatMode === 'propose' && `「もっと${contextLabel}を充実させたい」など話しかけてください`}
                {chatMode === 'analyze' && (
                  <div>
                    <div style={{ marginBottom: 8 }}>AIが{contextLabel}を分析します</div>
                    <button onClick={() => sendChat('analyze')} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>🔍 今すぐ分析する</button>
                  </div>
                )}
                {chatMode === 'free' && `自由に話しかけてください`}
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} onApply={onApply} onSave={saveHistory} />
            ))}
            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '8px 14px', borderRadius: '12px 12px 12px 2px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>考え中...</div>
              </div>
            )}
            {savedMsg && <div style={{ textAlign: 'center', fontSize: 12, color: '#4ade80' }}>{savedMsg}</div>}
            <div ref={messagesEndRef} />
          </div>

          {/* 入力 */}
          {chatMode !== 'analyze' && (
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)} rows={2}
                placeholder={chatMode === 'propose' ? 'こうしたい、を話しかける...' : '自由に話しかける...'}
                style={inputStyle} />
              <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: chatLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end' }}>
                送信
              </button>
            </div>
          )}
        </div>
      )}

      <button onClick={() => setChatOpen(!chatOpen)}
        style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer', background: chatOpen ? 'var(--bg-card)' : 'linear-gradient(135deg, #6c63ff, #ec4899)', color: chatOpen ? 'var(--text-muted)' : '#fff', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(108,99,255,0.4)' }}>
        {chatOpen ? '✕' : '🤖'}
      </button>
    </div>
  );
}
