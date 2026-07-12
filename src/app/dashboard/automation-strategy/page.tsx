'use client';

import { useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { triggerDownload } from '@/lib/download';
import { renderMarkdown } from '@/lib/markdown-renderer';
import {
  loadFeatureDraft,
  saveFeatureDraft,
  clearFeatureDraft,
} from '@/lib/feature-drafts';
import FeatureDraftBanner from '@/components/FeatureDraftBanner';

interface Message { role: 'user' | 'assistant'; content: string; }
interface Session {
  id: number; title: string; domain: string;
  has_strategy?: boolean; has_report?: boolean; message_count?: number;
  has_output?: boolean;
  created_at: string; updated_at: string;
}

// 自動下書き（feature_result_drafts feature_key='automation-strategy'）のpayload
// 対話はセッションDBに保存済みだが「開いていたセッション＋生成した設計書/レポート表示」は
// stateのみで消えるため、生成完了時点のスナップショットを丸ごと復元する
interface AutomationStrategyDraftPayload {
  sessionId?: number | null;
  domain?: string;
  messages?: Message[];
  strategyOutput?: string;
  reportOutput?: string;
  sessionTitle?: string;
}

const DOMAINS = [
  {
    id: 'all', label: '🚀 全体戦略', color: '#4f46e5',
    icon: '🚀',
    desc: '現状分析から優先順位・ロードマップを設計',
    tags: ['現状分析', '優先順位', 'ロードマップ'],
  },
  {
    id: 'agent', label: '🤖 AIエージェント化', color: '#7c3aed',
    icon: '🤖',
    desc: '完全自律型AIエージェントの設計・実装',
    tags: ['Claude Computer Use', 'MCP', 'CrewAI', 'AutoGen', '自律実行'],
    featured: true,
  },
  {
    id: 'saas', label: '🔗 外部SaaS連携', color: '#059669',
    icon: '🔗',
    desc: 'Make・Zapier・Notion・SNS自動投稿の設計',
    tags: ['Make', 'Zapier', 'n8n', 'Notion', 'SNS'],
  },
  {
    id: 'creative', label: '🎨 クリエイティブ自動化', color: '#d97706',
    icon: '🎨',
    desc: '画像・動画・音声の自動生成パイプライン',
    tags: ['DALL-E', 'Runway', 'ElevenLabs', 'HeyGen'],
  },
];

const QUICK_STARTERS: Record<string, string[]> = {
  all: [
    '現在の業務で最も時間がかかっている作業を教えて',
    '自動化の優先順位を一緒に考えたい',
    '月100万円稼ぐための自動化設計をして',
    'xLUMINAをさらに拡張するには？',
  ],
  agent: [
    'AIエージェントとは何か基礎から教えて',
    'Claude Computer Useで何ができる？',
    '完全自律型エージェントの設計方法を教えて',
    'MCPとは何か？xLUMINAへの適用方法は？',
    'マルチエージェント協調システムを設計したい',
    '自律エージェントのリスク管理方法は？',
  ],
  saas: [
    'Make vs Zapier どちらを選ぶべき？',
    'NotionとxLUMINAを連携させたい',
    'SNSへの自動投稿を設定したい',
    'Google Driveに自動保存する仕組みを作りたい',
  ],
  creative: [
    '画像自動生成のパイプラインを設計したい',
    'AIでYouTube動画を自動制作できる？',
    'ElevenLabsで音声コンテンツを自動化したい',
    'SNS投稿用バナーを毎日自動生成したい',
  ],
};

export default function AutomationStrategyPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [selectedDomain, setSelectedDomain] = useState('agent');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
  const [strategyOutput, setStrategyOutput] = useState('');
  const [strategyStreaming, setStrategyStreaming] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'strategy' | 'report'>('chat');
  const [showStrategyReady, setShowStrategyReady] = useState(false);
  const [reportOutput, setReportOutput] = useState('');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 自動下書きから復元した日時（バナー表示用。新規実行で消える）
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  // 復元取得が返ってきた時点で既に対話/セッション読込/生成が始まっていたら復元しない
  const draftGuardRef = useRef(false);
  draftGuardRef.current =
    isLoading ||
    isGeneratingStrategy ||
    isGeneratingReport ||
    messages.length > 0 ||
    currentSessionId !== null ||
    !!strategyOutput ||
    !!reportOutput;

  useEffect(() => {
    loadSessions();
  }, []);

  // マウント時に前回の実行結果（自動下書き）を復元。正はDB＝端末をまたいで復元できる
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft =
        await loadFeatureDraft<AutomationStrategyDraftPayload>('automation-strategy');
      if (cancelled || !draft?.payload) return;
      const p = draft.payload;
      if (!p.strategyOutput && !p.reportOutput) return;
      if (draftGuardRef.current) return;
      if (p.domain) setSelectedDomain(p.domain);
      setCurrentSessionId(p.sessionId ?? null);
      setMessages(Array.isArray(p.messages) ? p.messages : []);
      setStrategyOutput(p.strategyOutput ?? '');
      setReportOutput(p.reportOutput ?? '');
      setSessionTitle(p.sessionTitle ?? '');
      if (p.strategyOutput) setShowStrategyReady(true);
      setRestoredAt(draft.updated_at);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 「クリア」= 下書き削除 + 画面を新規状態に戻す（復元は表示のみで副作用なし）
  const handleClearDraft = () => {
    setRestoredAt(null);
    setMessages([]);
    setStrategyOutput('');
    setStrategyStreaming('');
    setShowStrategyReady(false);
    setReportOutput('');
    setSessionTitle('');
    setCurrentSessionId(null);
    setActiveTab('chat');
    clearFeatureDraft('automation-strategy');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const loadSessions = async () => {
    const res = await fetch('/api/automation/sessions');
    const { sessions } = await res.json();
    setSessions(sessions ?? []);
  };

  const loadSession = async (sessionId: number) => {
    const res = await fetch(`/api/automation/sessions?id=${sessionId}`);
    const { session: s } = await res.json();
    if (!s) return;

    setRestoredAt(null); // セッションを明示的に読み込んだら復元バナーは消す
    setCurrentSessionId(s.id);
    setSelectedDomain(s.domain ?? 'agent');
    setMessages(s.messages ?? []);
    setStrategyOutput(s.strategy_output ?? '');
    setReportOutput(s.report_output ?? '');
    setSessionTitle(s.title ?? '');
    setActiveTab('chat');

    if (s.strategy_output) setShowStrategyReady(true);
  };

  const handleGenerateReport = async () => {
    let sid = currentSessionId;

    if (!sid) {
      const res = await fetch('/api/automation/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: selectedDomain,
          messages,
          title: `${currentDomain?.label}セッション`,
        }),
      });
      const { session: s } = await res.json();
      sid = s.id;
      setCurrentSessionId(s.id);
      setSessionTitle(s.title);
    }

    setIsGeneratingReport(true);
    setReportOutput('');
    setActiveTab('report');

    try {
      const res = await fetch('/api/automation/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      });
      const { report } = await res.json();
      setReportOutput(report ?? '');
      // 完了した結果を自動下書き保存（画面遷移/アプリ終了後もマウント時に復元できる）
      if (report) {
        setRestoredAt(null);
        saveFeatureDraft('automation-strategy', {
          sessionId: sid,
          domain: selectedDomain,
          messages,
          strategyOutput,
          reportOutput: report,
          sessionTitle,
        } satisfies AutomationStrategyDraftPayload);
      }
      await loadSessions();
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const startNewSession = async (domain: string) => {
    setRestoredAt(null);
    setSelectedDomain(domain);
    setMessages([]);
    setStrategyOutput('');
    setStrategyStreaming('');
    setShowStrategyReady(false);
    setReportOutput('');
    setSessionTitle('');
    setCurrentSessionId(null);
    setActiveTab('chat');
    await fetchAIResponse('', [], domain);
  };

  const fetchAIResponse = async (userInput: string, currentMessages: Message[], domain?: string) => {
    setIsLoading(true);
    setStreamingText('');

    try {
      const res = await fetch('/api/automation/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: currentMessages,
          domain: domain ?? selectedDomain,
          userInput: userInput || undefined,
        }),
      });

      const reader = res.body!.getReader();
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
            if (event.type === 'delta') { fullText += event.text; setStreamingText(fullText); }
            if (event.type === 'done') {
              const aiMsg: Message = { role: 'assistant', content: fullText };
              setMessages(prev => [...prev, aiMsg]);
              setStreamingText('');

              if (fullText.includes('設計書を出力') || fullText.includes('まとめます') || fullText.includes('設計しましょう')) {
                setShowStrategyReady(true);
              }
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (content?: string) => {
    const text = content ?? input.trim();
    if (!text || isLoading) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    if (!currentSessionId) {
      const res = await fetch('/api/automation/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: selectedDomain,
          messages: updatedMessages,
          title: `${currentDomain?.label} - ${new Date().toLocaleDateString('ja-JP')}`,
        }),
      });
      const { session: s } = await res.json();
      setCurrentSessionId(s.id);
      setSessionTitle(s.title);
      await loadSessions();
    } else {
      fetch('/api/automation/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentSessionId, messages: updatedMessages }),
      }).catch(() => {});
    }

    await fetchAIResponse(text, updatedMessages);
  };

  const handleGenerateStrategy = async () => {
    setIsGeneratingStrategy(true);
    setStrategyOutput('');
    setStrategyStreaming('');
    setActiveTab('strategy');

    try {
      const res = await fetch('/api/automation/generate-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSessionId,
          messages,
          domain: selectedDomain,
        }),
      });

      const reader = res.body!.getReader();
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
            if (event.type === 'delta') { fullText += event.text; setStrategyStreaming(fullText); }
            if (event.type === 'done') {
              setStrategyOutput(fullText);
              setStrategyStreaming('');
              // 完了した結果を自動下書き保存（画面遷移/アプリ終了後もマウント時に復元できる）
              if (fullText.trim()) {
                setRestoredAt(null);
                saveFeatureDraft('automation-strategy', {
                  sessionId: currentSessionId,
                  domain: selectedDomain,
                  messages,
                  strategyOutput: fullText,
                  reportOutput,
                  sessionTitle,
                } satisfies AutomationStrategyDraftPayload);
              }
              await loadSessions();
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      setIsGeneratingStrategy(false);
    }
  };

  const currentDomain = DOMAINS.find(d => d.id === selectedDomain);
  const displayStrategyText = strategyStreaming || strategyOutput;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>🚀 自動化戦略AI</h2>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>AIと深く対話して最適な自動化を設計</p>
        </div>

        <div style={{ padding: 12, borderBottom: '1px solid var(--border-color)' }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>相談領域を選択</p>
          {DOMAINS.map(d => (
            <button
              key={d.id}
              onClick={() => startNewSession(d.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px',
                borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                border: `1px solid ${selectedDomain === d.id ? d.color : 'var(--border-color)'}`,
                background: selectedDomain === d.id ? `${d.color}12` : 'var(--bg-primary)',
                position: 'relative',
              }}
            >
              {d.featured && (
                <span style={{
                  position: 'absolute', top: -6, right: 6,
                  fontSize: 9, padding: '2px 6px',
                  background: '#f59e0b', color: '#fff', borderRadius: 10,
                  fontWeight: 700,
                }}>
                  深掘り推奨
                </span>
              )}
              <div style={{ fontSize: 13, fontWeight: selectedDomain === d.id ? 700 : 500, color: selectedDomain === d.id ? d.color : 'var(--text-primary)', marginBottom: 2 }}>
                {d.label}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{d.desc}</div>
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>過去のセッション</p>
          {sessions.map(s => {
            const d = DOMAINS.find(d => d.id === s.domain);
            return (
              <button key={s.id}
                onClick={() => loadSession(s.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px',
                  borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                  border: `1px solid ${currentSessionId === s.id ? (d?.color ?? '#4f46e5') : 'var(--border-color)'}`,
                  background: currentSessionId === s.id ? `${d?.color ?? '#4f46e5'}10` : 'var(--bg-primary)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                  {d?.icon} {s.title ?? `${d?.label}セッション`}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 10, color: 'var(--text-secondary)' }}>
                  <span>{s.message_count ?? 0}メッセージ</span>
                  {s.has_strategy && <span style={{ color: '#4f46e5' }}>📋</span>}
                  {s.has_report && <span style={{ color: '#059669' }}>📄</span>}
                  <span>{new Date(s.updated_at).toLocaleDateString('ja-JP')}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

        <div style={{
          padding: '12px 20px', borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{currentDomain?.icon}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: currentDomain?.color }}>{currentDomain?.label}</h3>
                {isEditingTitle ? (
                  <input
                    autoFocus
                    value={sessionTitle}
                    onChange={e => setSessionTitle(e.target.value)}
                    onBlur={async () => {
                      if (currentSessionId && sessionTitle) {
                        await fetch('/api/automation/sessions', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: currentSessionId, title: sessionTitle, messages }),
                        });
                        await loadSessions();
                      }
                      setIsEditingTitle(false);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') setIsEditingTitle(false); }}
                    style={{ fontSize: 13, border: '1px solid var(--border-color)', borderRadius: 6, padding: '2px 8px', width: 220 }}
                  />
                ) : (
                  <span
                    onClick={() => setIsEditingTitle(true)}
                    title="クリックで名前を変更"
                    style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: 4 }}
                  >
                    {sessionTitle || 'クリックで名前を付ける'} ✏️
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                {currentDomain?.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 10, padding: '2px 6px', background: `${currentDomain.color}15`, color: currentDomain.color, borderRadius: 10, border: `1px solid ${currentDomain.color}30` }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'chat', label: '💬 対話' },
              { id: 'strategy', label: '📋 設計書' },
              { id: 'report', label: '📄 レポート' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
                style={{
                  padding: '6px 14px', fontSize: 13, borderRadius: 8, cursor: 'pointer',
                  background: activeTab === tab.id ? (currentDomain?.color ?? '#4f46e5') : 'var(--bg-secondary)',
                  color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                  border: 'none', fontWeight: activeTab === tab.id ? 600 : 400,
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 自動下書きからの復元バナー */}
        {restoredAt && (
          <div style={{ padding: '12px 20px 0' }}>
            <FeatureDraftBanner restoredAt={restoredAt} onClear={handleClearDraft} />
          </div>
        )}

        {activeTab === 'chat' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 500 }}>

              {messages.length === 0 && !isLoading && (
                <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>{currentDomain?.icon}</div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: currentDomain?.color, marginBottom: 8 }}>
                    {currentDomain?.label}について深掘りしましょう
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 400, margin: '0 auto 16px' }}>
                    {currentDomain?.desc}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                    {(QUICK_STARTERS[selectedDomain] ?? []).map(q => (
                      <button key={q} onClick={() => handleSend(q)}
                        style={{
                          padding: '8px 14px', borderRadius: 20, fontSize: 12,
                          background: `${currentDomain?.color}10`,
                          color: currentDomain?.color,
                          border: `1px solid ${currentDomain?.color}30`,
                          cursor: 'pointer',
                        }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '12px 16px', borderRadius: 14,
                    background: msg.role === 'user' ? (currentDomain?.color ?? '#4f46e5') : 'var(--bg-secondary)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                    border: msg.role === 'assistant' ? '1px solid var(--border-color)' : 'none',
                    fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {streamingText && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '12px 16px', borderRadius: 14,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                    fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: 'var(--text-primary)',
                  }}>
                    {streamingText}
                    <span style={{ display: 'inline-block', width: 6, height: 12, background: currentDomain?.color ?? '#4f46e5', marginLeft: 2, animation: 'pulse 0.8s infinite' }} />
                  </div>
                </div>
              )}

              {isLoading && !streamingText && (
                <div style={{ display: 'flex', gap: 4, padding: '12px 16px' }}>
                  {[0, 150, 300].map(d => (
                    <div key={d} style={{ width: 8, height: 8, borderRadius: '50%', background: '#9ca3af', animation: `bounce 1s ${d}ms infinite` }} />
                  ))}
                </div>
              )}

              {showStrategyReady && messages.length > 0 && !strategyOutput && (
                <div style={{
                  padding: '14px 18px',
                  background: `${currentDomain?.color}12`,
                  border: `1px solid ${currentDomain?.color}40`,
                  borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: currentDomain?.color }}>
                      📋 戦略設計書を出力できます
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      対話内容を元に、アーキテクチャ・コスト・ロードマップを含む設計書を生成します
                    </div>
                  </div>
                  <button
                    onClick={handleGenerateStrategy}
                    style={{
                      padding: '10px 20px', background: currentDomain?.color ?? '#4f46e5',
                      color: '#fff', border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    📋 設計書を生成する
                  </button>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div style={{ flexShrink: 0, borderTop: '1px solid var(--border-color)', padding: '12px 16px', background: 'var(--bg-primary)' }}>
              {messages.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {['もっと詳しく', '具体例を教えて', 'リスクは？', 'コストは？', '設計書を出力して'].map(q => (
                    <button key={q} onClick={() => handleSend(q)} disabled={isLoading}
                      style={{
                        fontSize: 11, padding: '4px 10px',
                        background: `${currentDomain?.color}10`, color: currentDomain?.color,
                        border: `1px solid ${currentDomain?.color}30`,
                        borderRadius: 14, cursor: 'pointer', opacity: isLoading ? 0.4 : 1,
                      }}>
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ position: 'relative' }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="質問・相談内容を入力してください（送信ボタンで送信）"
                  rows={4}
                  disabled={isLoading}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    border: '1px solid var(--border-color)', borderRadius: 12,
                    padding: '10px 80px 10px 14px', fontSize: 14, resize: 'none',
                    fontFamily: 'inherit', opacity: isLoading ? 0.5 : 1,
                  }}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={isLoading || !input.trim()}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    padding: '6px 14px', background: currentDomain?.color ?? '#4f46e5',
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 13, fontWeight: 600,
                    cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
                    opacity: !input.trim() ? 0.4 : 1,
                  }}
                >
                  送信
                </button>
              </div>

              {messages.length >= 4 && (
                <button
                  onClick={handleGenerateStrategy}
                  disabled={isGeneratingStrategy}
                  style={{
                    width: '100%', marginTop: 8, padding: '10px',
                    background: isGeneratingStrategy ? '#9ca3af' : `linear-gradient(135deg, ${currentDomain?.color ?? '#4f46e5'}, #7c3aed)`,
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {isGeneratingStrategy ? '📋 設計書生成中...' : '📋 この対話内容で戦略設計書を出力する'}
                </button>
              )}
            </div>
          </>
        )}

        {activeTab === 'strategy' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {!displayStrategyText && !isGeneratingStrategy ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', border: '2px dashed var(--border-color)', borderRadius: 12, color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                <p>まず「💬 対話」タブでAIと深掘り相談してください</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>4往復以上の対話後に設計書を生成できます</p>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{
                  padding: '12px 16px', background: `${currentDomain?.color}10`,
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: currentDomain?.color }}>
                    📋 自動化戦略設計書
                    {isGeneratingStrategy && <span style={{ fontSize: 11, marginLeft: 8 }}>生成中...</span>}
                  </span>
                  {strategyOutput && !isGeneratingStrategy && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => copyToClipboard(strategyOutput)}
                        style={{ fontSize: 12, padding: '5px 10px', border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-primary)', cursor: 'pointer' }}>
                        📋 コピー
                      </button>
                    </div>
                  )}
                </div>
                {isGeneratingStrategy ? (
                  <div style={{ padding: 20, fontSize: 13, lineHeight: 1.9, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                    {displayStrategyText}
                    <span style={{ display: 'inline-block', width: 6, height: 12, background: currentDomain?.color ?? '#4f46e5', marginLeft: 2, animation: 'pulse 0.8s infinite' }} />
                  </div>
                ) : (
                  <div className="markdown-body" style={{ padding: 20, fontSize: 13, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(displayStrategyText) }} />
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'report' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

            {!reportOutput && !isGeneratingReport && (
              <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed var(--border-color)', borderRadius: 12 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>対話レポートを生成</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
                  対話内容を分析して、目的・気づき・推奨アクション・リスクをまとめたレポートを自動生成します
                </p>

                {messages.length < 4 ? (
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>
                    まず「💬 対話」タブでAIと対話してください（現在 {messages.length} メッセージ）
                  </p>
                ) : (
                  <button
                    onClick={handleGenerateReport}
                    style={{
                      padding: '12px 28px',
                      background: currentDomain?.color ?? '#4f46e5',
                      color: '#fff', border: 'none', borderRadius: 10,
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    📄 対話レポートを生成する
                  </button>
                )}
              </div>
            )}

            {isGeneratingReport && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 40, marginBottom: 16, animation: 'pulse 1s infinite' }}>📄</div>
                <p style={{ fontSize: 14 }}>対話内容を分析中...</p>
              </div>
            )}

            {reportOutput && !isGeneratingReport && (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(5,150,105,0.08)',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>📄 対話レポート</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => copyToClipboard(reportOutput)}
                      style={{ fontSize: 12, padding: '5px 10px', border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-primary)', cursor: 'pointer' }}
                    >
                      📋 コピー
                    </button>
                    <button
                      onClick={() => {
                        triggerDownload(`自動化戦略レポート_${new Date().toISOString().slice(0, 10)}.md`, reportOutput, 'text/markdown;charset=utf-8');
                      }}
                      style={{ fontSize: 12, padding: '5px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    >
                      ⬇️ MDダウンロード
                    </button>
                    <button
                      onClick={handleGenerateReport}
                      style={{ fontSize: 12, padding: '5px 10px', border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-primary)', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      🔄 再生成
                    </button>
                  </div>
                </div>
                <div className="markdown-body" style={{ padding: 20, fontSize: 13, color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: renderMarkdown(reportOutput) }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
