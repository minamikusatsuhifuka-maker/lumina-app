'use client';

import { useEffect, useRef, useState } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface TechStack { category: string; tech: string; reason: string }
interface AiFlow { step: number; action: string; automation: string; tool: string }
interface RoadmapPhase { phase: number; title: string; duration: string; tasks: string[] }
interface Architecture {
  phase: number;
  summary: string;
  techStack: TechStack[];
  aiFlow: AiFlow[];
  mermaid: string;
  roadmap: RoadmapPhase[];
}
interface SessionItem {
  id: number;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export default function ArchitecturePage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [architecture, setArchitecture] = useState<Architecture | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'architecture' | 'output'>('chat');
  const [streamingText, setStreamingText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText]);

  const loadSessions = async () => {
    try {
      const res = await fetch('/api/architecture');
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {}
  };

  const createNewSession = async () => {
    const title = prompt('設計タイトルを入力してください', '新しいアーキテクチャ設計');
    if (!title) return;
    const res = await fetch('/api/architecture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const { session } = await res.json();
    setCurrentSessionId(session.id);
    setMessages([]);
    setArchitecture(null);
    setActiveTab('chat');
    loadSessions();

    // 初回挨拶（ローカルでメッセージ追加のみ）
    const greeting: Message = {
      role: 'assistant',
      content: '📍 Phase 1: 課題・目的の明確化\n\nこんにちは！どんなアプリや機能を作りたいですか？まずは課題や目的を教えてください。',
      timestamp: new Date().toISOString(),
    };
    setMessages([greeting]);
  };

  const loadSession = async (sessionId: number) => {
    const res = await fetch(`/api/architecture?id=${sessionId}`);
    const { session } = await res.json();
    setCurrentSessionId(session.id);
    setMessages(session.messages ?? []);
    setArchitecture(session.architecture ?? null);
    setActiveTab('chat');
  };

  const deleteSession = async (sessionId: number) => {
    if (!confirm('このセッションを削除しますか？')) return;
    await fetch(`/api/architecture?id=${sessionId}`, { method: 'DELETE' });
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setMessages([]);
      setArchitecture(null);
    }
    loadSessions();
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading || !currentSessionId) return;
    setInput('');

    const userMsg: Message = { role: 'user', content, timestamp: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);
    setStreamingText('');

    try {
      const res = await fetch('/api/architecture/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, currentArchitecture: architecture }),
      });
      if (!res.body) throw new Error('レスポンスボディなし');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'delta') {
              fullText += event.text;
              setStreamingText(fullText);
            } else if (event.type === 'done') {
              // architecture-jsonブロック抽出
              let parsedArch: Architecture | null = null;
              const archMatch = fullText.match(/```architecture-json\n([\s\S]*?)\n```/);
              if (archMatch) {
                try {
                  parsedArch = JSON.parse(archMatch[1]);
                  setArchitecture(parsedArch);
                  if (parsedArch && parsedArch.phase === 6) setActiveTab('architecture');
                } catch { /* skip */ }
              }
              const assistantMsg: Message = {
                role: 'assistant',
                content: fullText,
                timestamp: new Date().toISOString(),
              };
              const finalMessages = [...updatedMessages, assistantMsg];
              setMessages(finalMessages);
              setStreamingText('');

              // DBに保存（最新のarchitectureも一緒に）
              await fetch('/api/architecture', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: currentSessionId,
                  messages: finalMessages,
                  architecture: parsedArch ?? architecture,
                  status: parsedArch?.phase === 6 ? 'completed' : undefined,
                }),
              }).catch(() => {});
              loadSessions();
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch { /* skipparse error */ }
        }
      }
    } catch (err: any) {
      console.error(err);
      alert(`エラー: ${err?.message || err}`);
    } finally {
      setIsLoading(false);
      setStreamingText('');
    }
  };

  const downloadMD = () => {
    if (!architecture) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const content = `---
generated_at: ${now.toISOString()}
source: xLUMINA Architecture Designer
type: architecture_spec
---

# アーキテクチャ設計書

## 概要
${architecture.summary}

## 技術スタック
| カテゴリ | 技術 | 選定理由 |
|---------|------|---------|
${(architecture.techStack || []).map(t => `| ${t.category} | ${t.tech} | ${t.reason} |`).join('\n')}

## AIフロー
| ステップ | アクション | 自動化 | ツール |
|---------|-----------|--------|-------|
${(architecture.aiFlow || []).map(f => `| ${f.step} | ${f.action} | ${f.automation} | ${f.tool} |`).join('\n')}

## アーキテクチャ図（Mermaid）
\`\`\`mermaid
${architecture.mermaid}
\`\`\`

## 実装ロードマップ
${(architecture.roadmap || []).map(r => `### Phase ${r.phase}: ${r.title}（${r.duration}）\n${(r.tasks || []).map(t => `- ${t}`).join('\n')}`).join('\n\n')}

## チャット履歴
${messages.map(m => `### ${m.role === 'user' ? '👤 ユーザー' : '🤖 AI'}\n${m.content}`).join('\n\n---\n\n')}
`;
    const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dateStr}_architecture.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadClaudeCode = () => {
    if (!architecture) return;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const content = `# Claude Code 実装指示書
作成日: ${dateStr}

## アーキテクチャ概要
${architecture.summary}

## 使用技術スタック
${(architecture.techStack || []).map(t => `- **${t.category}**: ${t.tech}（${t.reason}）`).join('\n')}

## 実装フェーズ
${(architecture.roadmap || []).map(r => `### Phase ${r.phase}: ${r.title}（目安: ${r.duration}）\n以下のタスクを実装してください：\n${(r.tasks || []).map(t => `- ${t}`).join('\n')}`).join('\n\n')}

## AIフロー実装
${(architecture.aiFlow || []).map(f => `${f.step}. **${f.action}**\n   - 自動化: ${f.automation}\n   - 使用ツール: ${f.tool || 'なし'}`).join('\n')}

## アーキテクチャ図
\`\`\`mermaid
${architecture.mermaid}
\`\`\`

## 実装開始の指示
上記の仕様に基づいて、Phase 1から順番に実装してください。
各フェーズ完了後に動作確認を行い、次のフェーズに進んでください。
`;
    const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dateStr}_claude_code_instructions.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // architecture-jsonブロックを表示から除外
  const renderMessageContent = (content: string) =>
    content.replace(/```architecture-json[\s\S]*?```/g, '').trim();

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 0px)', overflow: 'hidden' }}>
      {/* セッション一覧 */}
      <aside style={{
        width: 240, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        display: 'flex', flexDirection: 'column' as const,
      }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
            🏗 アーキテクチャ設計
          </h2>
          <button
            onClick={createNewSession}
            style={{
              width: '100%', padding: '8px 12px',
              background: 'linear-gradient(135deg, #8b5cf6, #6c63ff)',
              color: '#fff', border: 'none', borderRadius: 8,
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }}
          >
            ＋ 新しい設計を始める
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' as const, padding: 10, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
          {sessions.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' as const, padding: 20 }}>
              まだセッションがありません
            </div>
          )}
          {sessions.map(s => (
            <div
              key={s.id}
              style={{
                padding: 10, borderRadius: 8,
                border: currentSessionId === s.id ? '1px solid #8b5cf6' : '1px solid var(--border)',
                background: currentSessionId === s.id ? 'rgba(139,92,246,0.08)' : 'var(--bg-primary)',
                cursor: 'pointer', transition: 'all 0.15s',
                position: 'relative' as const,
              }}
              onClick={() => loadSession(s.id)}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, paddingRight: 18 }}>
                {s.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 6, fontWeight: 700,
                  background: s.status === 'completed' ? 'rgba(34,197,94,0.18)' : 'rgba(59,130,246,0.18)',
                  color: s.status === 'completed' ? '#15803d' : '#2563eb',
                }}>
                  {s.status === 'completed' ? '✅ 完成' : '🔄 設計中'}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                  {new Date(s.updated_at).toLocaleDateString('ja-JP')}
                </span>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteSession(s.id); }}
                title="削除"
                style={{
                  position: 'absolute' as const, top: 6, right: 6,
                  width: 18, height: 18, borderRadius: 4,
                  border: 'none', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* メイン */}
      {!currentSessionId ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
          <div style={{ textAlign: 'center' as const, maxWidth: 480, padding: 30 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🏗</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
              AIアーキテクチャ設計
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 24 }}>
              AIと対話しながら、アプリの最適なアーキテクチャを段階的に設計します。<br />
              技術スタック・AIフロー・実装ロードマップまで一気に確定できます。
            </p>
            <button
              onClick={createNewSession}
              style={{
                padding: '12px 28px',
                background: 'linear-gradient(135deg, #8b5cf6, #6c63ff)',
                color: '#fff', border: 'none', borderRadius: 12,
                cursor: 'pointer', fontSize: 14, fontWeight: 700,
              }}
            >
              ＋ 新しい設計を始める
            </button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }}>
          {/* タブ */}
          <div style={{
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            padding: '8px 16px 0',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {([
              { id: 'chat', label: '💬 対話', show: true },
              { id: 'architecture', label: '🏗 アーキテクチャ', show: !!architecture },
              { id: 'output', label: '📄 出力', show: !!architecture },
            ] as const).map(t => t.show ? (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: 600,
                  background: 'transparent', border: 'none',
                  borderBottom: activeTab === t.id ? '2px solid #8b5cf6' : '2px solid transparent',
                  color: activeTab === t.id ? '#8b5cf6' : 'var(--text-muted)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {t.label}
              </button>
            ) : null)}
          </div>

          {/* 対話タブ */}
          {activeTab === 'chat' && (
            <>
              <div style={{ flex: 1, overflowY: 'auto' as const, padding: 20, display: 'flex', flexDirection: 'column' as const, gap: 12, background: 'var(--bg-primary)' }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%',
                      padding: '10px 14px',
                      borderRadius: 14,
                      background: m.role === 'user' ? 'linear-gradient(135deg, #8b5cf6, #6c63ff)' : 'var(--bg-secondary)',
                      color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' as const, lineHeight: 1.7 }}>
                        {renderMessageContent(m.content)}
                      </div>
                      <div style={{ fontSize: 9, marginTop: 4, opacity: 0.7 }}>
                        {new Date(m.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}

                {streamingText && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%', padding: '10px 14px', borderRadius: 14,
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' as const, lineHeight: 1.7 }}>
                        {renderMessageContent(streamingText)}
                        <span style={{ display: 'inline-block', width: 6, height: 14, marginLeft: 2, background: '#8b5cf6', animation: 'pulse 1s ease-in-out infinite' }} />
                      </div>
                    </div>
                  </div>
                )}

                {isLoading && !streamingText && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1.2s ease-in-out infinite' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1.2s ease-in-out infinite 0.2s' }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', animation: 'pulse 1.2s ease-in-out infinite 0.4s' }} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 入力 */}
              <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)', padding: 14 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 10 }}>
                  {['詳しく教えてください', 'もっとシンプルにしたい', 'コスト重視で選んで', 'スピード重視で選んで', '確定して出力して'].map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      disabled={isLoading}
                      style={{
                        fontSize: 11, padding: '5px 12px', borderRadius: 999,
                        background: 'rgba(139,92,246,0.08)',
                        color: '#8b5cf6',
                        border: '1px solid rgba(139,92,246,0.3)',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.4 : 1,
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage(input);
                      }
                    }}
                    placeholder="メッセージを入力... (Shift+Enterで改行)"
                    rows={2}
                    disabled={isLoading}
                    style={{
                      flex: 1, padding: '10px 14px',
                      border: '1px solid var(--border)',
                      borderRadius: 12, fontSize: 13,
                      resize: 'none' as const,
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={isLoading || !input.trim()}
                    style={{
                      padding: '0 18px',
                      background: isLoading || !input.trim() ? 'var(--bg-secondary)' : 'linear-gradient(135deg, #8b5cf6, #6c63ff)',
                      color: isLoading || !input.trim() ? 'var(--text-muted)' : '#fff',
                      border: 'none', borderRadius: 12,
                      cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                      fontSize: 13, fontWeight: 700,
                      alignSelf: 'flex-end' as const, height: 60,
                    }}
                  >
                    送信
                  </button>
                </div>
              </div>
            </>
          )}

          {/* アーキテクチャタブ */}
          {activeTab === 'architecture' && architecture && (
            <div style={{ flex: 1, overflowY: 'auto' as const, padding: 24, background: 'var(--bg-primary)' }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16, maxWidth: 1000, margin: '0 auto' }}>
                {/* 概要 */}
                <div style={{
                  padding: 20, borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(108,99,255,0.08))',
                  border: '1px solid rgba(139,92,246,0.3)',
                }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                    📋 アーキテクチャ概要
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' as const }}>
                    {architecture.summary}
                  </p>
                </div>

                {/* 技術スタック */}
                {architecture.techStack && architecture.techStack.length > 0 && (
                  <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                      ⚙️ 技術スタック
                    </h3>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' as const }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <th style={{ textAlign: 'left' as const, padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>カテゴリ</th>
                          <th style={{ textAlign: 'left' as const, padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>技術</th>
                          <th style={{ textAlign: 'left' as const, padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>選定理由</th>
                        </tr>
                      </thead>
                      <tbody>
                        {architecture.techStack.map((t, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 6px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t.category}</td>
                            <td style={{ padding: '10px 6px' }}>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(139,92,246,0.18)', color: '#8b5cf6', fontWeight: 700 }}>
                                {t.tech}
                              </span>
                            </td>
                            <td style={{ padding: '10px 6px', color: 'var(--text-secondary)' }}>{t.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* AIフロー */}
                {architecture.aiFlow && architecture.aiFlow.length > 0 && (
                  <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                      🤖 AIフロー
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                      {architecture.aiFlow.map((f, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: 10, borderRadius: 8, background: 'var(--bg-primary)',
                        }}>
                          <span style={{
                            width: 26, height: 26, borderRadius: '50%',
                            background: '#8b5cf6', color: '#fff',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, flexShrink: 0,
                          }}>
                            {f.step}
                          </span>
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {f.action}
                          </div>
                          <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 999,
                            background: f.automation === 'AI自動' ? 'rgba(34,197,94,0.18)' : 'rgba(107,114,128,0.18)',
                            color: f.automation === 'AI自動' ? '#15803d' : 'var(--text-muted)',
                          }}>
                            {f.automation}
                          </span>
                          {f.tool && (
                            <span style={{
                              fontSize: 10, padding: '2px 8px', borderRadius: 999,
                              background: 'rgba(59,130,246,0.18)', color: '#2563eb',
                            }}>
                              {f.tool}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ロードマップ */}
                {architecture.roadmap && architecture.roadmap.length > 0 && (
                  <div style={{ padding: 20, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                      🗺 実装ロードマップ
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                      {architecture.roadmap.map((r, i) => (
                        <div key={i} style={{ borderLeft: '4px solid #8b5cf6', paddingLeft: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                              Phase {r.phase}: {r.title}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>（{r.duration}）</span>
                          </div>
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {(r.tasks || []).map((task, j) => (
                              <li key={j} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>{task}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mermaid */}
                {architecture.mermaid && (
                  <div style={{ padding: 20, borderRadius: 12, background: '#0f172a', border: '1px solid #1e293b' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 10 }}>
                      📊 アーキテクチャ図（Mermaid）
                    </h3>
                    <pre style={{
                      margin: 0,
                      fontSize: 12, color: '#4ade80',
                      overflowX: 'auto' as const,
                      whiteSpace: 'pre' as const,
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    }}>
                      {architecture.mermaid}
                    </pre>
                    <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 8 }}>
                      ※ Mermaid Live Editor（mermaid.live）で可視化できます
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 出力タブ */}
          {activeTab === 'output' && (
            <div style={{ flex: 1, overflowY: 'auto' as const, padding: 24, background: 'var(--bg-primary)' }}>
              <div style={{ maxWidth: 900, margin: '0 auto' }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                  📄 成果物を出力
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                  {/* MD仕様書 */}
                  <div style={{ padding: 18, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                      Markdown仕様書
                    </h4>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 14 }}>
                      アーキテクチャ・技術スタック・ロードマップ・チャット履歴をまとめたMDファイル
                    </p>
                    <button
                      onClick={downloadMD}
                      disabled={!architecture}
                      style={{
                        width: '100%', padding: '8px 12px',
                        background: '#374151', color: '#fff',
                        border: 'none', borderRadius: 8,
                        cursor: architecture ? 'pointer' : 'not-allowed',
                        opacity: architecture ? 1 : 0.4,
                        fontSize: 12, fontWeight: 600,
                      }}
                    >
                      📄 MDで出力
                    </button>
                  </div>

                  {/* Claude Code指示書 */}
                  <div style={{ padding: 18, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>🤖</div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                      Claude Code実装指示書
                    </h4>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 14 }}>
                      Claude Codeにドラッグ&ドロップして、そのまま実装を依頼できるMDファイル
                    </p>
                    <button
                      onClick={downloadClaudeCode}
                      disabled={!architecture}
                      style={{
                        width: '100%', padding: '8px 12px',
                        background: 'linear-gradient(135deg, #8b5cf6, #6c63ff)',
                        color: '#fff', border: 'none', borderRadius: 8,
                        cursor: architecture ? 'pointer' : 'not-allowed',
                        opacity: architecture ? 1 : 0.4,
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      🤖 Claude Code指示書を出力
                    </button>
                  </div>

                  {/* Mermaidコード */}
                  <div style={{ padding: 18, borderRadius: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                      アーキテクチャ図
                    </h4>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 14 }}>
                      Mermaidコードをコピーして、mermaid.liveで視覚化できます
                    </p>
                    <button
                      onClick={() => {
                        if (architecture?.mermaid) {
                          navigator.clipboard.writeText(architecture.mermaid);
                          alert('Mermaidコードをコピーしました！\nmermaid.live に貼り付けて可視化してください。');
                        }
                      }}
                      disabled={!architecture?.mermaid}
                      style={{
                        width: '100%', padding: '8px 12px',
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                        color: '#fff', border: 'none', borderRadius: 8,
                        cursor: architecture?.mermaid ? 'pointer' : 'not-allowed',
                        opacity: architecture?.mermaid ? 1 : 0.4,
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      📊 Mermaidコードをコピー
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
