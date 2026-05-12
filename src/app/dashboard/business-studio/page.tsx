'use client';

import { useEffect, useRef, useState } from 'react';
import ContextSelector, {
  buildContextText,
  type ContextItem,
} from '@/components/ContextSelector';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface Project {
  id: number;
  title: string;
  description?: string;
  phase: string;
  messages: Message[];
  business_model: Record<string, unknown>;
  target_market: Record<string, unknown>;
  marketing_strategy: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface ProjectListItem {
  id: number;
  title: string;
  description?: string;
  phase: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Asset {
  id: number;
  asset_type: string;
  title: string;
  content: string;
  created_at: string;
}

const PHASES = [
  { num: 1, label: '事業アイデア', icon: '💡' },
  { num: 2, label: '市場・収益設計', icon: '📊' },
  { num: 3, label: 'ターゲット設計', icon: '🎯' },
  { num: 4, label: 'マーケティング', icon: '📣' },
  { num: 5, label: '成果物生成', icon: '⚡' },
  { num: 6, label: 'ローンチ計画', icon: '🚀' },
];

const GENERATE_TYPES = [
  { id: 'lp', label: '📄 LP生成', desc: 'セールスコピー全文' },
  { id: 'step_mail', label: '📧 ステップメール', desc: '21通シーケンス' },
  { id: 'kindle', label: '📚 Kindle準備', desc: '目次・説明文・戦略' },
];

const QUICK_REPLIES = [
  'もっと詳しく教えて',
  'それで進めてください',
  '別のアイデアも出して',
  '収益モデルを具体化して',
  '次のフェーズへ進んで',
  '成果物を生成して',
];

// phaseはTEXT型なので 'ideation' のような文字列も入る。数値変換できない場合は0扱い
const phaseToNum = (phase: string): number => {
  const n = parseInt(phase, 10);
  return Number.isNaN(n) ? 0 : n;
};

export default function BusinessStudioPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'generate' | 'assets'>(
    'chat',
  );
  const [selectedGenerateType, setSelectedGenerateType] = useState('lp');
  const [businessContexts, setBusinessContexts] = useState<ContextItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [genStreaming, setGenStreaming] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // ディープリサーチからの自動連携
  useEffect(() => {
    const fromResearch =
      new URLSearchParams(window.location.search).get('from') ===
      'deepresearch';
    if (!fromResearch) return;

    const researchText = sessionStorage.getItem('businessStudioResearch');
    const researchTopic = sessionStorage.getItem('businessStudioTopic');
    if (!researchText) return;

    sessionStorage.removeItem('businessStudioResearch');
    sessionStorage.removeItem('businessStudioTopic');

    const autoMsg = `以下のリサーチ結果を元に事業設計を始めてください。\n\nトピック: ${researchTopic ?? '新規事業'}\n\nリサーチ結果:\n${researchText.slice(0, 2000)}`;

    void (async () => {
      try {
        const res = await fetch('/api/business', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: researchTopic
              ? `事業設計：${researchTopic.slice(0, 40)}`
              : '新規事業（ディープリサーチ起点）',
          }),
        });
        const { project } = await res.json();
        if (project?.id) {
          await loadProject(project.id);
          void loadProjects();
          // currentProject の状態反映を少し待ってから送信
          setTimeout(() => {
            void sendMessage(autoMsg);
          }, 1000);
        }
      } catch {
        setErrorMessage('リサーチ結果の引き継ぎに失敗しました');
      }
    })();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/business');
      if (!res.ok) return;
      const data = await res.json();
      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch {
      /* skip */
    }
  };

  const createProject = async () => {
    const title = prompt(
      'プロジェクト名を入力してください',
      '新しい事業プロジェクト',
    );
    if (!title) return;
    try {
      const res = await fetch('/api/business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const { project } = await res.json();
      if (project?.id) {
        await loadProject(project.id);
      }
      void loadProjects();
    } catch {
      setErrorMessage('プロジェクト作成に失敗しました');
    }
  };

  const loadProject = async (id: number) => {
    try {
      const res = await fetch(`/api/business?id=${id}`);
      const { project, assets: assetList } = await res.json();
      if (!project) return;
      setCurrentProject(project);
      setAssets(Array.isArray(assetList) ? assetList : []);
      const projMsgs: Message[] = Array.isArray(project.messages)
        ? project.messages
        : [];
      setMessages(projMsgs);
      setActiveTab('chat');
      setGeneratedContent('');
      setGenStreaming('');

      if (projMsgs.length === 0) {
        const initMsg: Message = {
          role: 'assistant',
          content: `📍 Phase 1: 事業アイデアの明確化\n\nこんにちは！AIを最大限活用した個人事業の収益化を一緒に設計していきましょう。\n\nまず教えてください。\n\n**Q1. あなたが持っている「強み・経験・知識」は何ですか？**\n例：医療知識、マーケティング経験、教育スキル、特定の趣味・資格など\n\n**Q2. 「週1〜2時間の稼働で月100万円」を目指す上で、どんなビジネスモデルに興味がありますか？**\n- 📚 情報発信（note・ブログ・メルマガ）\n- 🎓 コンテンツ販売（動画講座・PDF教材）\n- 💬 コーチング・コンサル\n- 👥 コミュニティ・サブスク\n- 📖 Kindle出版\n- 🔀 複数の組み合わせ`,
          timestamp: new Date().toISOString(),
        };
        setMessages([initMsg]);
        await saveMessages(project.id, [initMsg]);
      }
    } catch {
      setErrorMessage('プロジェクト読み込みに失敗しました');
    }
  };

  const saveMessages = async (projectId: number, msgs: Message[]) => {
    try {
      await fetch('/api/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, messages: msgs }),
      });
    } catch {
      /* skip */
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading || !currentProject) return;
    setInput('');
    const userMsg: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);
    setStreamingText('');
    setErrorMessage('');

    try {
      const res = await fetch('/api/business/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages,
          projectContext: currentProject,
          contextInfo: buildContextText(businessContexts),
        }),
      });

      if (!res.ok || !res.body) {
        setErrorMessage('AI応答リクエストに失敗しました');
        setIsLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      let finished = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'delta') {
                fullText += event.text;
                setStreamingText(fullText);
              } else if (event.type === 'done') {
                finished = true;
                const assistantMsg: Message = {
                  role: 'assistant',
                  content: fullText,
                  timestamp: new Date().toISOString(),
                };
                const final = [...updatedMessages, assistantMsg];
                setMessages(final);
                setStreamingText('');
                await saveMessages(currentProject.id, final);
              } else if (event.type === 'error') {
                setErrorMessage(event.message ?? 'エラーが発生しました');
              }
            } catch {
              /* skip */
            }
          }
        }
      }

      // doneイベントが来なかった場合の保険
      if (!finished && fullText) {
        const assistantMsg: Message = {
          role: 'assistant',
          content: fullText,
          timestamp: new Date().toISOString(),
        };
        const final = [...updatedMessages, assistantMsg];
        setMessages(final);
        setStreamingText('');
        await saveMessages(currentProject.id, final);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsLoading(false);
      setStreamingText('');
    }
  };

  const handleGenerate = async () => {
    if (!currentProject) return;
    setIsGenerating(true);
    setGeneratedContent('');
    setGenStreaming('');
    setErrorMessage('');

    const projectData = {
      title: currentProject.title,
      businessModel: currentProject.business_model,
      targetMarket: currentProject.target_market,
      marketingStrategy: currentProject.marketing_strategy,
      recentMessages: messages
        .slice(-10)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n'),
    };

    try {
      const res = await fetch('/api/business/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generateType: selectedGenerateType,
          projectData,
          contextInfo: buildContextText(businessContexts),
        }),
      });

      if (!res.ok || !res.body) {
        setErrorMessage('生成リクエストに失敗しました');
        setIsGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'delta') {
                fullText += event.text;
                setGenStreaming(fullText);
              } else if (event.type === 'done') {
                setGeneratedContent(fullText);
                setGenStreaming('');
              } else if (event.type === 'error') {
                setErrorMessage(event.message ?? '生成エラー');
              }
            } catch {
              /* skip */
            }
          }
        }
      }
      // doneイベントが来なかった場合の保険
      if (fullText && !generatedContent) {
        setGeneratedContent(fullText);
        setGenStreaming('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveAsset = async () => {
    if (!currentProject || !generatedContent) return;
    const typeLabels: Record<string, string> = {
      lp: 'LP',
      step_mail: 'ステップメール',
      kindle: 'Kindle準備',
    };
    try {
      await fetch('/api/business/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentProject.id,
          assetType: selectedGenerateType,
          title: `${typeLabels[selectedGenerateType] ?? selectedGenerateType}：${currentProject.title}`,
          content: generatedContent,
        }),
      });
      const res = await fetch(`/api/business?id=${currentProject.id}`);
      const { assets: newAssets } = await res.json();
      setAssets(Array.isArray(newAssets) ? newAssets : []);
      alert('✅ 保存しました');
    } catch {
      setErrorMessage('保存に失敗しました');
    }
  };

  // メッセージ本文中のJSONブロックを除去して表示
  const renderContent = (text: string) =>
    text.replace(/```business-data-json[\s\S]*?```/g, '').trim();

  const displayGenText = genStreaming || generatedContent;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* サイドバー */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{ padding: 16, borderBottom: '1px solid var(--border)' }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 12,
              color: 'var(--text-primary)',
            }}
          >
            💰 収益化スタジオ
          </h2>
          <button
            type="button"
            onClick={createProject}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: 13,
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            ＋ 新しいプロジェクト
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {projects.map((p) => {
            const active = currentProject?.id === p.id;
            const phaseConf = PHASES.find((ph) => ph.num === phaseToNum(p.phase));
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => loadProject(p.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 8,
                  marginBottom: 4,
                  border: `1px solid ${active ? '#4f46e5' : 'var(--border)'}`,
                  background: active
                    ? 'rgba(79,70,229,0.08)'
                    : 'var(--bg-primary)',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.title}
                </div>
                <div
                  style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                >
                  {phaseConf?.icon ?? '💡'}{' '}
                  {new Date(p.updated_at).toLocaleDateString('ja-JP')}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* メイン */}
      {!currentProject ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>💰</div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 8,
                color: 'var(--text-primary)',
              }}
            >
              収益化スタジオ
            </h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                marginBottom: 20,
                maxWidth: 400,
              }}
            >
              AIと対話しながら、週1〜2時間で月100万円の収益軸を設計します
            </p>
            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginBottom: 24,
              }}
            >
              {PHASES.map((p) => (
                <span
                  key={p.num}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    background: 'rgba(79,70,229,0.1)',
                    color: '#4f46e5',
                    borderRadius: 20,
                    border: '1px solid rgba(79,70,229,0.2)',
                  }}
                >
                  {p.icon} {p.label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={createProject}
              style={{
                padding: '12px 28px',
                background: '#4f46e5',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ＋ プロジェクトを始める
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* フェーズバー */}
          <div
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              display: 'flex',
              gap: 4,
              overflowX: 'auto',
            }}
          >
            {PHASES.map((p) => {
              const cur = phaseToNum(currentProject.phase);
              const isCurrent = cur === p.num;
              const isPast = cur > p.num;
              return (
                <div
                  key={p.num}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 12,
                    whiteSpace: 'nowrap',
                    background: isCurrent
                      ? '#4f46e5'
                      : isPast
                        ? '#d1fae5'
                        : 'var(--bg-secondary)',
                    color: isCurrent
                      ? '#fff'
                      : isPast
                        ? '#065f46'
                        : 'var(--text-secondary)',
                  }}
                >
                  {p.icon} {p.label}
                </div>
              );
            })}
          </div>

          {/* タブ */}
          <div
            style={{
              padding: '0 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 4,
            }}
          >
            {(
              [
                { id: 'chat' as const, label: '💬 対話' },
                { id: 'generate' as const, label: '⚡ 成果物生成' },
                { id: 'assets' as const, label: `📁 保存済み（${assets.length}）` },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 14px',
                  fontSize: 13,
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderBottom:
                    activeTab === tab.id
                      ? '2px solid #4f46e5'
                      : '2px solid transparent',
                  color:
                    activeTab === tab.id
                      ? '#4f46e5'
                      : 'var(--text-secondary)',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  background: 'none',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {errorMessage && (
            <div
              style={{
                padding: '8px 16px',
                fontSize: 13,
                color: '#dc2626',
                background: 'rgba(220,38,38,0.06)',
                borderBottom: '1px solid rgba(220,38,38,0.2)',
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* 対話タブ */}
          {activeTab === 'chat' && (
            <>
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent:
                        msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '75%',
                        padding: '12px 16px',
                        borderRadius: 16,
                        background:
                          msg.role === 'user'
                            ? '#4f46e5'
                            : 'var(--bg-secondary)',
                        color:
                          msg.role === 'user'
                            ? '#fff'
                            : 'var(--text-primary)',
                        border:
                          msg.role === 'assistant'
                            ? '1px solid var(--border)'
                            : 'none',
                        fontSize: 14,
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {renderContent(msg.content)}
                    </div>
                  </div>
                ))}
                {streamingText && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div
                      style={{
                        maxWidth: '75%',
                        padding: '12px 16px',
                        borderRadius: 16,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        fontSize: 14,
                        lineHeight: 1.7,
                        color: 'var(--text-primary)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {renderContent(streamingText)}
                      <span
                        style={{
                          display: 'inline-block',
                          width: 6,
                          height: 14,
                          background: '#4f46e5',
                          marginLeft: 2,
                          animation: 'pulse 0.8s infinite',
                          verticalAlign: 'middle',
                        }}
                      />
                    </div>
                  </div>
                )}
                {isLoading && !streamingText && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 16,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        gap: 4,
                      }}
                    >
                      {[0, 150, 300].map((d) => (
                        <div
                          key={d}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: '#9ca3af',
                            animation: `pulse 1s ${d}ms infinite`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 入力エリア */}
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  padding: '12px 16px',
                  paddingBottom: 16,
                }}
              >
                {/* 背景情報セレクタ */}
                <ContextSelector
                  featureKey="business"
                  onSelect={setBusinessContexts}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    marginBottom: 8,
                  }}
                >
                  {QUICK_REPLIES.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendMessage(q)}
                      disabled={isLoading}
                      style={{
                        fontSize: 11,
                        padding: '5px 10px',
                        background: 'rgba(79,70,229,0.08)',
                        color: '#4f46e5',
                        border: '1px solid rgba(79,70,229,0.25)',
                        borderRadius: 16,
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.4 : 1,
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="メッセージを入力... (Cmd/Ctrl+Enterで送信)"
                    rows={3}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (
                        (e.metaKey || e.ctrlKey) &&
                        e.key === 'Enter' &&
                        input.trim() &&
                        !isLoading
                      ) {
                        e.preventDefault();
                        sendMessage(input);
                      }
                    }}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '10px 80px 10px 14px',
                      fontSize: 14,
                      resize: 'none',
                      outline: 'none',
                      fontFamily: 'inherit',
                      opacity: isLoading ? 0.5 : 1,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => sendMessage(input)}
                    disabled={isLoading || !input.trim()}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      padding: '6px 14px',
                      background: '#4f46e5',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 500,
                      cursor:
                        isLoading || !input.trim()
                          ? 'not-allowed'
                          : 'pointer',
                      opacity: isLoading || !input.trim() ? 0.4 : 1,
                    }}
                  >
                    送信
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 成果物生成タブ */}
          {activeTab === 'generate' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  marginBottom: 20,
                  flexWrap: 'wrap',
                }}
              >
                {GENERATE_TYPES.map((type) => {
                  const active = selectedGenerateType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setSelectedGenerateType(type.id)}
                      style={{
                        flex: 1,
                        minWidth: 180,
                        padding: '16px',
                        border: `2px solid ${active ? '#4f46e5' : 'var(--border)'}`,
                        borderRadius: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        background: active
                          ? 'rgba(79,70,229,0.08)'
                          : 'var(--bg-primary)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {type.label}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          marginTop: 4,
                        }}
                      >
                        {type.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: 15,
                  fontWeight: 600,
                  background: isGenerating ? '#9ca3af' : '#4f46e5',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  marginBottom: 20,
                }}
              >
                {isGenerating
                  ? '⚡ 生成中...'
                  : `⚡ ${GENERATE_TYPES.find((t) => t.id === selectedGenerateType)?.label}を生成する`}
              </button>

              {displayGenText && (
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 16px',
                      background: 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {
                        GENERATE_TYPES.find(
                          (t) => t.id === selectedGenerateType,
                        )?.label
                      }
                      {isGenerating && (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#4f46e5',
                            marginLeft: 8,
                          }}
                        >
                          生成中...
                        </span>
                      )}
                    </span>
                    {generatedContent && !isGenerating && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() =>
                            navigator.clipboard.writeText(generatedContent)
                          }
                          style={{
                            fontSize: 12,
                            padding: '5px 10px',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            background: 'var(--bg-primary)',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          📋 コピー
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAsset}
                          style={{
                            fontSize: 12,
                            padding: '5px 10px',
                            background: '#4f46e5',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                        >
                          💾 保存
                        </button>
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      padding: 20,
                      fontSize: 13,
                      lineHeight: 1.8,
                      whiteSpace: 'pre-wrap',
                      maxHeight: 500,
                      overflowY: 'auto',
                      color: 'var(--text-primary)',
                      background: 'var(--bg-primary)',
                    }}
                  >
                    {displayGenText}
                    {isGenerating && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 6,
                          height: 14,
                          background: '#4f46e5',
                          marginLeft: 2,
                          animation: 'pulse 0.8s infinite',
                          verticalAlign: 'middle',
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 保存済みタブ */}
          {activeTab === 'assets' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {assets.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
                  <p>まだ成果物がありません</p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>
                    「成果物生成」タブでLP・ステップメール・Kindle準備を生成して保存できます
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          padding: '10px 16px',
                          background: 'var(--bg-secondary)',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {asset.title}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                              marginLeft: 8,
                            }}
                          >
                            {new Date(asset.created_at).toLocaleDateString(
                              'ja-JP',
                            )}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {asset.asset_type === 'kindle' && (
                            <button
                              type="button"
                              onClick={() => {
                                sessionStorage.setItem(
                                  'kindleOutline',
                                  asset.content,
                                );
                                window.open(
                                  '/dashboard/kindle?from=business',
                                  '_blank',
                                );
                              }}
                              style={{
                                fontSize: 12,
                                padding: '4px 10px',
                                background: '#4f46e5',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 6,
                                cursor: 'pointer',
                              }}
                              title="Kindleスタジオで続ける"
                            >
                              📖 Kindleスタジオへ
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              navigator.clipboard.writeText(asset.content)
                            }
                            style={{
                              fontSize: 12,
                              padding: '4px 10px',
                              border: '1px solid var(--border)',
                              borderRadius: 6,
                              background: 'var(--bg-primary)',
                              cursor: 'pointer',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            📋
                          </button>
                        </div>
                      </div>
                      <div
                        style={{
                          padding: 16,
                          fontSize: 13,
                          lineHeight: 1.7,
                          whiteSpace: 'pre-wrap',
                          maxHeight: 200,
                          overflowY: 'auto',
                          color: 'var(--text-primary)',
                          background: 'var(--bg-primary)',
                        }}
                      >
                        {asset.content.length > 300
                          ? `${asset.content.slice(0, 300)}...`
                          : asset.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
