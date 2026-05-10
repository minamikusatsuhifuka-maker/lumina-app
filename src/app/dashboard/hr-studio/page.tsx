'use client';

import { useEffect, useState } from 'react';

interface Member {
  id: number;
  name: string;
  role?: string | null;
  department?: string | null;
  current_level?: string | null;
  target_level?: string | null;
  notes?: string | null;
  strengths: unknown[];
  challenges: unknown[];
  goals: unknown[];
  created_at: string;
  updated_at: string;
}

interface HrRecord {
  id: number;
  member_id: number;
  record_type: string;
  title: string;
  content: string;
  recorded_at: string;
}

const GENERATE_TYPES = [
  {
    id: 'possibility',
    label: '🌟 可能性診断',
    desc: '強み・才能・潜在力の発見',
    color: '#8b5cf6',
  },
  {
    id: 'roadmap',
    label: '🗺 成長ロードマップ',
    desc: '1年間の段階的成長計画',
    color: '#059669',
  },
  {
    id: 'evaluation',
    label: '📋 評価シート',
    desc: '5軸・4段階の公平な評価',
    color: '#4f46e5',
  },
  {
    id: 'one_on_one',
    label: '💬 1on1サポート',
    desc: '面談アジェンダ・質問集',
    color: '#d97706',
  },
  {
    id: 'skill_map',
    label: '⭐ スキルマップ',
    desc: '現在地と目標の可視化',
    color: '#dc2626',
  },
] as const;

const EXTRA_LABELS: Record<string, string> = {
  possibility: 'ヒアリング内容・エピソード（任意）',
  roadmap: '目標・方向性の詳細（任意）',
  evaluation: '評価期間（例：2026年上期）',
  one_on_one: '今回の面談テーマ（任意）',
  skill_map: '特記事項（任意）',
};

interface NewMemberInput {
  name: string;
  role: string;
  department: string;
  currentLevel: string;
  targetLevel: string;
  notes: string;
}

export default function HrStudioPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [records, setRecords] = useState<HrRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'generate' | 'records'>(
    'generate',
  );
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMember, setNewMember] = useState<NewMemberInput>({
    name: '',
    role: '',
    department: '',
    currentLevel: '',
    targetLevel: '',
    notes: '',
  });
  const [selectedGenerateType, setSelectedGenerateType] =
    useState<string>('possibility');
  const [extraInput, setExtraInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    void loadMembers();
  }, []);

  const loadMembers = async () => {
    try {
      const res = await fetch('/api/hr');
      if (!res.ok) return;
      const data = await res.json();
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch {
      /* skip */
    }
  };

  const loadMember = async (id: number) => {
    try {
      const res = await fetch(`/api/hr?id=${id}`);
      const { member, records: recs } = await res.json();
      if (!member) return;
      setSelectedMember(member);
      setRecords(Array.isArray(recs) ? recs : []);
      setActiveTab('generate');
      setGeneratedContent('');
      setStreamingText('');
      setExtraInput('');
    } catch {
      setErrorMessage('メンバー情報の取得に失敗しました');
    }
  };

  const handleAddMember = async () => {
    if (!newMember.name.trim()) {
      alert('名前を入力してください');
      return;
    }
    try {
      await fetch('/api/hr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember),
      });
      setNewMember({
        name: '',
        role: '',
        department: '',
        currentLevel: '',
        targetLevel: '',
        notes: '',
      });
      setShowAddMember(false);
      await loadMembers();
    } catch {
      setErrorMessage('メンバー追加に失敗しました');
    }
  };

  const handleDeleteMember = async (id: number) => {
    if (!confirm('このメンバーを削除しますか？')) return;
    try {
      await fetch(`/api/hr?id=${id}`, { method: 'DELETE' });
      setSelectedMember(null);
      setRecords([]);
      await loadMembers();
    } catch {
      setErrorMessage('削除に失敗しました');
    }
  };

  const handleGenerate = async () => {
    if (!selectedMember) {
      alert('メンバーを選択してください');
      return;
    }
    setIsGenerating(true);
    setGeneratedContent('');
    setStreamingText('');
    setErrorMessage('');

    const extraData: Record<string, string> = {};
    const type = selectedGenerateType;
    if (type === 'roadmap') extraData.goalDescription = extraInput;
    else if (type === 'one_on_one') extraData.theme = extraInput;
    else if (type === 'evaluation') extraData.period = extraInput;
    else if (type === 'possibility') extraData.interviewAnswers = extraInput;

    try {
      const res = await fetch('/api/hr/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generateType: selectedGenerateType,
          memberData: selectedMember,
          extraData,
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
                setStreamingText(fullText);
              } else if (event.type === 'done') {
                setGeneratedContent(fullText);
                setStreamingText('');
              } else if (event.type === 'error') {
                setErrorMessage(event.message ?? 'エラーが発生しました');
              }
            } catch {
              /* skip */
            }
          }
        }
      }
      // doneが来なかった場合の保険
      if (fullText && !generatedContent) {
        setGeneratedContent(fullText);
        setStreamingText('');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveRecord = async () => {
    if (!selectedMember || !generatedContent) return;
    setIsSaving(true);
    const typeConfig = GENERATE_TYPES.find(
      (t) => t.id === selectedGenerateType,
    );
    try {
      await fetch('/api/hr/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMember.id,
          recordType: selectedGenerateType,
          title: `${typeConfig?.label ?? selectedGenerateType}：${selectedMember.name}`,
          content: generatedContent,
        }),
      });
      await loadMember(selectedMember.id);
    } catch {
      setErrorMessage('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const displayText = streamingText || generatedContent;
  const currentTypeConfig = GENERATE_TYPES.find(
    (t) => t.id === selectedGenerateType,
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 左サイドバー：メンバー一覧 */}
      <div
        style={{
          width: 240,
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
            🌱 人材育成スタジオ
          </h2>
          <button
            type="button"
            onClick={() => setShowAddMember(true)}
            style={{
              width: '100%',
              padding: '8px',
              fontSize: 13,
              background: '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            ＋ メンバーを追加
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {members.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                textAlign: 'center',
                marginTop: 20,
              }}
            >
              メンバーを追加してください
            </p>
          ) : (
            members.map((m) => {
              const active = selectedMember?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => loadMember(m.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 8,
                    marginBottom: 4,
                    border: `1px solid ${active ? '#059669' : 'var(--border)'}`,
                    background: active
                      ? 'rgba(5,150,105,0.08)'
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
                    }}
                  >
                    {m.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {m.role ?? ''} {m.department ? `・${m.department}` : ''}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* メインエリア */}
      {!selectedMember ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🌱</div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 8,
                color: 'var(--text-primary)',
              }}
            >
              人材育成スタジオ
            </h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                marginBottom: 20,
              }}
            >
              一人ひとりの可能性を拓く、アチーブメント原理原則に基づいた育成支援
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
              {GENERATE_TYPES.map((t) => (
                <span
                  key={t.id}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    background: `${t.color}15`,
                    color: t.color,
                    borderRadius: 20,
                    border: `1px solid ${t.color}40`,
                  }}
                >
                  {t.label}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowAddMember(true)}
              style={{
                padding: '12px 28px',
                background: '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ＋ 最初のメンバーを追加する
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
          {/* メンバー情報ヘッダー */}
          <div
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                {selectedMember.name}
              </h3>
              <p
                style={{ fontSize: 12, color: 'var(--text-secondary)' }}
              >
                {selectedMember.role ?? ''}
                {selectedMember.department
                  ? ` / ${selectedMember.department}`
                  : ''}
                {selectedMember.current_level
                  ? ` / Lv: ${selectedMember.current_level}`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleDeleteMember(selectedMember.id)}
              style={{
                fontSize: 12,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid #fca5a5',
                background: 'var(--bg-primary)',
                color: '#ef4444',
                cursor: 'pointer',
              }}
            >
              🗑 削除
            </button>
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
                { id: 'generate' as const, label: '⚡ AI生成' },
                {
                  id: 'records' as const,
                  label: `📁 育成記録（${records.length}件）`,
                },
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
                      ? '2px solid #059669'
                      : '2px solid transparent',
                  color:
                    activeTab === tab.id
                      ? '#059669'
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

          {/* AI生成タブ */}
          {activeTab === 'generate' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {/* 生成タイプ選択 */}
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginBottom: 16,
                }}
              >
                {GENERATE_TYPES.map((type) => {
                  const active = selectedGenerateType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => {
                        setSelectedGenerateType(type.id);
                        setGeneratedContent('');
                        setStreamingText('');
                        setExtraInput('');
                      }}
                      style={{
                        flex: 1,
                        minWidth: 140,
                        padding: '12px',
                        border: `2px solid ${active ? type.color : 'var(--border)'}`,
                        borderRadius: 10,
                        cursor: 'pointer',
                        textAlign: 'left',
                        background: active
                          ? `${type.color}10`
                          : 'var(--bg-primary)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: active
                            ? type.color
                            : 'var(--text-primary)',
                        }}
                      >
                        {type.label}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          marginTop: 2,
                        }}
                      >
                        {type.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 追加入力 */}
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  {EXTRA_LABELS[selectedGenerateType]}
                </label>
                <textarea
                  value={extraInput}
                  onChange={(e) => setExtraInput(e.target.value)}
                  placeholder="詳細情報を入力すると、より精度の高い内容が生成されます"
                  rows={3}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    resize: 'vertical',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* 生成ボタン */}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 600,
                  background: isGenerating
                    ? '#9ca3af'
                    : (currentTypeConfig?.color ?? '#059669'),
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  cursor: isGenerating ? 'not-allowed' : 'pointer',
                  marginBottom: 20,
                }}
              >
                {isGenerating
                  ? '🤖 生成中...'
                  : `${currentTypeConfig?.label ?? ''}を生成する`}
              </button>

              {/* 生成結果 */}
              {displayText && (
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
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {currentTypeConfig?.label} - {selectedMember.name}
                      {isGenerating && (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#6d28d9',
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
                          onClick={handleSaveRecord}
                          disabled={isSaving}
                          style={{
                            fontSize: 12,
                            padding: '5px 10px',
                            border: 'none',
                            borderRadius: 6,
                            background:
                              currentTypeConfig?.color ?? '#059669',
                            color: '#fff',
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            opacity: isSaving ? 0.5 : 1,
                          }}
                        >
                          {isSaving ? '保存中...' : '💾 育成記録に保存'}
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
                      maxHeight: 550,
                      overflowY: 'auto',
                      color: 'var(--text-primary)',
                      background: 'var(--bg-primary)',
                    }}
                  >
                    {displayText}
                    {isGenerating && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 6,
                          height: 14,
                          background: currentTypeConfig?.color ?? '#059669',
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

          {/* 育成記録タブ */}
          {activeTab === 'records' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {records.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
                  <p>まだ育成記録がありません</p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>
                    「AI生成」タブで各種ドキュメントを生成・保存できます
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
                  {records.map((record) => {
                    const typeConfig = GENERATE_TYPES.find(
                      (t) => t.id === record.record_type,
                    );
                    return (
                      <div
                        key={record.id}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            padding: '10px 16px',
                            background: typeConfig
                              ? `${typeConfig.color}10`
                              : 'var(--bg-secondary)',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 8,
                          }}
                        >
                          <div>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color:
                                  typeConfig?.color ?? 'var(--text-primary)',
                              }}
                            >
                              {typeConfig?.label ?? record.record_type}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                                marginLeft: 8,
                              }}
                            >
                              {new Date(record.recorded_at).toLocaleDateString(
                                'ja-JP',
                              )}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() =>
                                navigator.clipboard.writeText(record.content)
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
                            fontSize: 12,
                            lineHeight: 1.7,
                            whiteSpace: 'pre-wrap',
                            maxHeight: 200,
                            overflowY: 'auto',
                            color: 'var(--text-primary)',
                            background: 'var(--bg-primary)',
                          }}
                        >
                          {record.content.length > 400
                            ? `${record.content.slice(0, 400)}...`
                            : record.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* メンバー追加モーダル */}
      {showAddMember && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              borderRadius: 16,
              padding: 24,
              width: 400,
              maxWidth: '90vw',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
              🌱 メンバーを追加
            </h3>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginBottom: 16,
              }}
            >
              {(
                [
                  { key: 'name', label: '氏名 *', placeholder: '山田 太郎' },
                  {
                    key: 'role',
                    label: '役職',
                    placeholder: '看護師・受付スタッフ等',
                  },
                  {
                    key: 'department',
                    label: '部署',
                    placeholder: '診療部・受付等',
                  },
                  {
                    key: 'currentLevel',
                    label: '現在のレベル',
                    placeholder: '例：中堅・新人・リーダー候補',
                  },
                  {
                    key: 'targetLevel',
                    label: '目標レベル',
                    placeholder: '例：チームリーダー',
                  },
                ] as const
              ).map((field) => (
                <div key={field.key}>
                  <label
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      display: 'block',
                      marginBottom: 4,
                    }}
                  >
                    {field.label}
                  </label>
                  <input
                    value={newMember[field.key]}
                    onChange={(e) =>
                      setNewMember((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '7px 10px',
                      fontSize: 13,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              ))}
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  メモ
                </label>
                <textarea
                  value={newMember.notes}
                  onChange={(e) =>
                    setNewMember((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="特記事項・課題・強みなど"
                  rows={3}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '7px 10px',
                    fontSize: 13,
                    resize: 'vertical',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={handleAddMember}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                追加する
              </button>
              <button
                type="button"
                onClick={() => setShowAddMember(false)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 14,
                  background: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
