'use client';
import { useState } from 'react';

type ChatMode = 'propose' | 'analyze' | 'free';
type Message = { role: 'user' | 'assistant'; content: string };

interface AIBrushupChatProps {
  contextContent: string;      // 現在のページのコンテンツ（判断基準一覧・理念文章など）
  contextLabel: string;        // 例: 'AI判断基準', '理念', '行動基準'
  onApply?: (text: string) => void;  // 対話モードで改善案を適用する場合
}

export function AIBrushupChat({ contextContent, contextLabel, onApply }: AIBrushupChatProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('propose');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingApply, setPendingApply] = useState<string | null>(null);

  const sendChat = async (overrideInput?: string) => {
    const input = overrideInput || chatInput;
    if (!input.trim() && chatMode !== 'analyze') return;
    setChatLoading(true);

    const userMsg = chatMode === 'analyze' && chatMessages.length === 0
      ? `この${contextLabel}を分析してください。`
      : input;

    const newMessages: Message[] = [
      ...chatMessages,
      { role: 'user', content: userMsg },
    ];
    setChatMessages(newMessages);
    setChatInput('');

    try {
      const res = await fetch('/api/clinic/brushup-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatMode,
          contextLabel,
          contextContent,
          messages: newMessages,
        }),
      });
      const data = await res.json();
      if (data.result) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.result }]);
        if (chatMode === 'free' && data.result.includes('---')) {
          const match = data.result.match(/---\n([\s\S]+?)\n---/);
          if (match) setPendingApply(match[1].trim());
        }
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。もう一度お試しください。' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--input-border)', background: 'var(--input-bg)',
    color: 'var(--text-primary)', fontSize: 12, outline: 'none',
  };

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
      {chatOpen && (
        <div style={{ width: 380, height: 560, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ヘッダー */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(108,99,255,0.1), rgba(236,72,153,0.05))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>🤖 {contextLabel}をブラッシュアップ</span>
              <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {([
                { k: 'propose', l: '💬 提案' },
                { k: 'analyze', l: '🔍 分析' },
                { k: 'free',    l: '🎙 対話' },
              ] as const).map(m => (
                <button key={m.k} onClick={() => { setChatMode(m.k); setChatMessages([]); setChatInput(''); setPendingApply(null); }}
                  style={{ flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: chatMode === m.k ? 'rgba(108,99,255,0.15)' : 'transparent', color: chatMode === m.k ? '#6c63ff' : 'var(--text-muted)', borderColor: chatMode === m.k ? 'rgba(108,99,255,0.4)' : 'var(--border)' }}>
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          {/* メッセージ */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chatMessages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                {chatMode === 'propose' && `「もっと${contextLabel}を充実させたい」「この部分を改善したい」など話しかけてください`}
                {chatMode === 'analyze' && (
                  <div>
                    <div style={{ marginBottom: 8 }}>AIが{contextLabel}を分析します</div>
                    <button onClick={() => sendChat('analyze')} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      🔍 今すぐ分析する
                    </button>
                  </div>
                )}
                {chatMode === 'free' && `自由に話しかけてください。AIが${contextLabel}の改善を手伝います`}
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '8px 12px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: msg.role === 'user' ? 'linear-gradient(135deg, #6c63ff, #8b5cf6)' : 'var(--bg-secondary)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                }}>{msg.content}</div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '8px 14px', borderRadius: '12px 12px 12px 2px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>考え中...</div>
              </div>
            )}
          </div>

          {/* 適用バナー */}
          {pendingApply && onApply && (
            <div style={{ padding: '8px 12px', background: 'rgba(74,222,128,0.1)', borderTop: '1px solid rgba(74,222,128,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#4ade80' }}>✅ 改善案があります</span>
              <button onClick={() => { onApply(pendingApply); setPendingApply(null); }} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#4ade80', color: '#000', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>反映する</button>
            </div>
          )}

          {/* 入力 */}
          {chatMode !== 'analyze' && (
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                placeholder={chatMode === 'propose' ? 'こうしたい、を話しかける...' : '自由に話しかける...'}
                rows={2}
                style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }} />
              <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: chatLoading ? 'rgba(108,99,255,0.3)' : 'linear-gradient(135deg, #6c63ff, #8b5cf6)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                送信
              </button>
            </div>
          )}
        </div>
      )}

      {/* トグルボタン */}
      <button onClick={() => { setChatOpen(!chatOpen); if (!chatOpen) { setChatMessages([]); setPendingApply(null); } }}
        style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer', background: chatOpen ? 'var(--bg-card)' : 'linear-gradient(135deg, #6c63ff, #ec4899)', color: chatOpen ? 'var(--text-muted)' : '#fff', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(108,99,255,0.4)' }}>
        {chatOpen ? '✕' : '🤖'}
      </button>
    </div>
  );
}
