'use client';

import { useEffect, useState } from 'react';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { renderMarkdown } from '@/lib/markdown-renderer';
import ContextSelector, {
  buildContextText,
  type ContextItem,
} from '@/components/ContextSelector';
import DefaultContextBar, {
  buildDefaultContextText,
  type DefaultContextItem,
} from '@/components/DefaultContextBar';

interface MedicalDoc {
  id: number;
  doc_type: string;
  title: string;
  procedure_name: string;
  content: string;
  status: string;
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

const DOC_TYPES = [
  {
    id: 'consent_dermatology',
    label: '皮膚科診療同意書',
    icon: '🏥',
    color: '#4f46e5',
    examples: [
      'レーザー治療',
      'ケミカルピーリング',
      '液体窒素療法',
      'ステロイド注射',
      'パッチテスト',
      '皮膚生検',
    ],
  },
  {
    id: 'consent_cosmetic',
    label: '美容施術同意書',
    icon: '✨',
    color: '#db2777',
    examples: [
      'ボトックス注射',
      'ヒアルロン酸注入',
      'レーザートーニング',
      '光治療（IPL）',
      'イオン導入',
      'ハイフ（HIFU）',
    ],
  },
  {
    id: 'explanation',
    label: '患者説明書',
    icon: '📋',
    color: '#059669',
    examples: [
      'アトピー性皮膚炎',
      'ニキビ・にきび',
      '乾癬',
      '帯状疱疹',
      '蕁麻疹',
      '水虫',
    ],
  },
  {
    id: 'aftercare',
    label: 'アフターケア指導書',
    icon: '💊',
    color: '#d97706',
    examples: [
      'レーザー後',
      'ピーリング後',
      'ボトックス後',
      'ヒアルロン酸後',
      '光治療後',
    ],
  },
] as const;

type DocTypeConfig = (typeof DOC_TYPES)[number];

export default function MedicalStudioPage() {
  const [activeTab, setActiveTab] = useState<'create' | 'list' | 'templates'>(
    'create',
  );
  const [docs, setDocs] = useState<MedicalDoc[]>([]);
  const [selectedDocType, setSelectedDocType] = useState<DocTypeConfig>(
    DOC_TYPES[0],
  );
  const [procedureName, setProcedureName] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [selectedContexts, setSelectedContexts] = useState<ContextItem[]>([]);
  const [defaultContexts, setDefaultContexts] = useState<DefaultContextItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedDocId, setSavedDocId] = useState<number | null>(null);
  const [savedAsTemplate, setSavedAsTemplate] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<MedicalDoc | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [errorMessage, setErrorMessage] = useState('');

  // ディープリサーチからの連携確認 + 初回読み込み
  useEffect(() => {
    const fromResearch =
      new URLSearchParams(window.location.search).get('from') ===
      'deepresearch';
    if (fromResearch) {
      const researchText = sessionStorage.getItem('medicalDocResearch');
      const researchTopic = sessionStorage.getItem('medicalDocTopic');
      if (researchText) {
        setAdditionalInfo(
          `【ディープリサーチ結果を参考に作成】\n元のトピック: ${researchTopic ?? ''}\n\n${researchText.slice(0, 500)}...`,
        );
        // 連携テキストは生成時に再取得するためここでは消さない
      }
    }
    void loadDocs();
  }, []);

  const loadDocs = async () => {
    try {
      const res = await fetch('/api/medical');
      if (!res.ok) return;
      const data = await res.json();
      setDocs(Array.isArray(data.docs) ? data.docs : []);
    } catch {
      /* skip */
    }
  };

  const handleGenerate = async () => {
    if (!procedureName.trim()) {
      setErrorMessage('施術・診療名を入力してください');
      return;
    }
    setErrorMessage('');
    setIsGenerating(true);
    setGeneratedContent('');
    setStreamingText('');
    setSavedDocId(null);
    setSavedAsTemplate(false);

    // ディープリサーチからの連携テキストを取得（あれば）
    const researchText = sessionStorage.getItem('medicalDocResearch') ?? '';

    try {
      const res = await fetch('/api/medical/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType: selectedDocType.id,
          procedureName,
          additionalInfo,
          researchText,
          contextInfo: [buildDefaultContextText(defaultContexts), buildContextText(selectedContexts)].filter(Boolean).join('\n\n---\n\n'),
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
                setErrorMessage(event.message ?? '生成に失敗しました');
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
        setStreamingText('');
      }
      // 生成成功後はリサーチ連携テキストを消費
      if (researchText) {
        sessionStorage.removeItem('medicalDocResearch');
        sessionStorage.removeItem('medicalDocTopic');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '不明なエラー';
      setErrorMessage(`通信エラー: ${msg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (asTemplate = false) => {
    if (!generatedContent) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/medical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType: selectedDocType.id,
          title: `${selectedDocType.label}：${procedureName}`,
          procedureName,
          content: generatedContent,
          isTemplate: asTemplate,
        }),
      });
      const { doc } = await res.json();
      if (doc?.id) {
        setSavedDocId(doc.id);
        setSavedAsTemplate(asTemplate);
      }
      await loadDocs();
    } catch {
      setErrorMessage('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateDoc = async () => {
    if (!selectedDoc) return;
    try {
      const res = await fetch('/api/medical', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedDoc.id,
          content: editingContent,
        }),
      });
      const { doc } = await res.json();
      if (doc) {
        setSelectedDoc(doc);
      }
      await loadDocs();
      setIsEditing(false);
    } catch {
      setErrorMessage('更新に失敗しました');
    }
  };

  const handleDeleteDoc = async (id: number) => {
    if (!confirm('この文書を削除しますか？')) return;
    try {
      await fetch(`/api/medical?id=${id}`, { method: 'DELETE' });
      setSelectedDoc(null);
      await loadDocs();
    } catch {
      setErrorMessage('削除に失敗しました');
    }
  };

  const displayText = streamingText || generatedContent;
  const filteredDocs =
    filterType === 'all'
      ? docs
      : filterType === 'templates'
        ? docs.filter((d) => d.is_template)
        : docs.filter((d) => d.doc_type === filterType);

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          🏥 医療文書スタジオ
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            marginTop: 4,
          }}
        >
          皮膚科・美容皮膚科の同意書・説明書・アフターケア指導書をAIで自動生成
        </p>
      </div>

      {/* タブ */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '1px solid var(--border)',
          marginBottom: 24,
        }}
      >
        {(
          [
            { id: 'create' as const, label: '✍️ 新規作成' },
            {
              id: 'list' as const,
              label: `📄 文書一覧（${docs.length}件）`,
            },
            {
              id: 'templates' as const,
              label: `📋 テンプレート（${docs.filter((d) => d.is_template).length}件）`,
            },
          ]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              fontSize: 14,
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom:
                activeTab === tab.id
                  ? '2px solid #4f46e5'
                  : '2px solid transparent',
              color: activeTab === tab.id ? '#4f46e5' : 'var(--text-secondary)',
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
            padding: '8px 12px',
            marginBottom: 12,
            fontSize: 13,
            color: '#dc2626',
            background: 'rgba(220,38,38,0.06)',
            border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 8,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* 新規作成タブ */}
      {activeTab === 'create' && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* 左側：設定パネル */}
          <div style={{ width: 300, flexShrink: 0 }}>
            {/* 文書タイプ選択 */}
            <div
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 10,
                }}
              >
                文書タイプ
              </h3>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {DOC_TYPES.map((type) => {
                  const active = selectedDocType.id === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setSelectedDocType(type)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1px solid ${active ? type.color : 'var(--border)'}`,
                        background: active
                          ? `${type.color}15`
                          : 'var(--bg-secondary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{type.icon}</span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: active ? 600 : 400,
                          color: active ? type.color : 'var(--text-primary)',
                        }}
                      >
                        {type.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 施術・診療名 */}
            <div
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                施術・診療名 *
              </h3>
              <input
                value={procedureName}
                onChange={(e) => setProcedureName(e.target.value)}
                placeholder="例：ボトックス注射"
                style={{
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  boxSizing: 'border-box',
                  marginBottom: 8,
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                }}
              >
                よく使う例：
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedDocType.examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setProcedureName(ex)}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            {/* 追加情報 */}
            <div
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                追加情報・特記事項（任意）
              </h3>
              <textarea
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                placeholder="特定の患者層向けの注意事項、クリニック固有の記載事項など"
                rows={4}
                style={{
                  width: '100%',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* 機能別デフォルト背景情報（自動読み込み） */}
            <DefaultContextBar featureKey="medical-studio" onChange={setDefaultContexts} />
            {/* 背景情報セレクタ（保存済みのリサーチ結果等を選択してAIに参照させる） */}
            <ContextSelector featureKey="medical" onSelect={setSelectedContexts} />

            {/* 生成ボタン */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !procedureName.trim()}
              style={{
                width: '100%',
                padding: '12px',
                background: isGenerating ? '#9ca3af' : selectedDocType.color,
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor:
                  isGenerating || !procedureName.trim()
                    ? 'not-allowed'
                    : 'pointer',
                opacity: !procedureName.trim() ? 0.5 : 1,
              }}
            >
              {isGenerating
                ? '🤖 生成中...'
                : `${selectedDocType.icon} 文書を生成する`}
            </button>
          </div>

          {/* 右側：生成結果 */}
          <div style={{ flex: 1, minWidth: 320 }}>
            {!displayText && !isGenerating ? (
              <div
                style={{
                  height: 400,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px dashed var(--border)',
                  borderRadius: 12,
                  color: 'var(--text-secondary)',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>
                    {selectedDocType.icon}
                  </div>
                  <p style={{ fontSize: 14 }}>
                    施術名を入力して「文書を生成する」を押してください
                  </p>
                  <p style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                    AIが医学的に正確な{selectedDocType.label}を自動作成します
                  </p>
                </div>
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                {/* 結果ヘッダー */}
                <div
                  style={{
                    padding: '12px 16px',
                    background: 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>
                      {selectedDocType.icon}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                      {selectedDocType.label}：{procedureName}
                    </span>
                    {isGenerating && (
                      <span
                        style={{
                          fontSize: 12,
                          color: '#6d28d9',
                          animation: 'pulse 1s infinite',
                        }}
                      >
                        生成中...
                      </span>
                    )}
                  </div>
                  {generatedContent && !isGenerating && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(generatedContent)
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
                        onClick={() => handleSave(false)}
                        disabled={
                          isSaving || (!!savedDocId && !savedAsTemplate)
                        }
                        style={{
                          fontSize: 12,
                          padding: '5px 10px',
                          border: 'none',
                          borderRadius: 6,
                          background:
                            savedDocId && !savedAsTemplate
                              ? '#d1fae5'
                              : '#4f46e5',
                          color:
                            savedDocId && !savedAsTemplate
                              ? '#065f46'
                              : '#fff',
                          cursor:
                            savedDocId && !savedAsTemplate
                              ? 'default'
                              : 'pointer',
                        }}
                      >
                        {savedDocId && !savedAsTemplate
                          ? '✅ 保存済み'
                          : isSaving
                            ? '保存中...'
                            : '💾 保存'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSave(true)}
                        disabled={isSaving || (!!savedDocId && savedAsTemplate)}
                        style={{
                          fontSize: 12,
                          padding: '5px 10px',
                          border: '1px solid #4f46e5',
                          borderRadius: 6,
                          background:
                            savedDocId && savedAsTemplate
                              ? '#d1fae5'
                              : 'var(--bg-primary)',
                          color:
                            savedDocId && savedAsTemplate
                              ? '#065f46'
                              : '#4f46e5',
                          cursor:
                            savedDocId && savedAsTemplate
                              ? 'default'
                              : 'pointer',
                        }}
                      >
                        {savedDocId && savedAsTemplate
                          ? '✅ テンプレ済'
                          : '📋 テンプレートとして保存'}
                      </button>
                    </div>
                  )}
                </div>

                {/* 文書本文 */}
                {isGenerating ? (
                  <div
                    style={{
                      padding: 20,
                      fontSize: 13,
                      lineHeight: 1.8,
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 600,
                      overflowY: 'auto',
                      background: 'var(--bg-primary)',
                    }}
                  >
                    {displayText}
                    <span
                      style={{
                        display: 'inline-block',
                        width: 6,
                        height: 14,
                        background: selectedDocType.color,
                        marginLeft: 2,
                        animation: 'pulse 0.8s infinite',
                        verticalAlign: 'middle',
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="markdown-body"
                    style={{
                      padding: 20,
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      maxHeight: 600,
                      overflowY: 'auto',
                      background: 'var(--bg-primary)',
                    }}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(displayText) }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 文書一覧タブ */}
      {activeTab === 'list' && (
        <div>
          {/* フィルター */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setFilterType('all')}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                borderRadius: 6,
                background:
                  filterType === 'all' ? '#4f46e5' : 'var(--bg-secondary)',
                color: filterType === 'all' ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              すべて（{docs.length}）
            </button>
            {DOC_TYPES.map((type) => {
              const count = docs.filter((d) => d.doc_type === type.id).length;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setFilterType(type.id)}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    background:
                      filterType === type.id
                        ? type.color
                        : 'var(--bg-secondary)',
                    color:
                      filterType === type.id
                        ? '#fff'
                        : 'var(--text-secondary)',
                    border: `1px solid ${filterType === type.id ? type.color : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {type.icon} {type.label}（{count}）
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {/* 文書リスト */}
            <div style={{ flex: 1, minWidth: 320 }}>
              {filteredDocs.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: 'var(--text-secondary)',
                    border: '2px dashed var(--border)',
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
                  <p>まだ文書がありません</p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>
                    「新規作成」タブで文書を生成してください
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {filteredDocs.map((doc) => {
                    const typeConfig = DOC_TYPES.find(
                      (t) => t.id === doc.doc_type,
                    );
                    const active = selectedDoc?.id === doc.id;
                    return (
                      <div
                        key={doc.id}
                        onClick={() => {
                          setSelectedDoc(doc);
                          setEditingContent(doc.content);
                          setIsEditing(false);
                        }}
                        style={{
                          padding: '14px 16px',
                          border: `1px solid ${active ? (typeConfig?.color ?? '#4f46e5') : 'var(--border)'}`,
                          borderRadius: 10,
                          background: active
                            ? `${typeConfig?.color ?? '#4f46e5'}08`
                            : 'var(--bg-primary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <span style={{ fontSize: 20, flexShrink: 0 }}>
                          {typeConfig?.icon}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              marginBottom: 2,
                            }}
                          >
                            {doc.title}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              alignItems: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                padding: '2px 6px',
                                background: typeConfig
                                  ? `${typeConfig.color}15`
                                  : '#f3f4f6',
                                color: typeConfig?.color ?? '#374151',
                                borderRadius: 4,
                              }}
                            >
                              {typeConfig?.label}
                            </span>
                            {doc.is_template && (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: '2px 6px',
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  borderRadius: 4,
                                }}
                              >
                                📋 テンプレート
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {new Date(doc.updated_at).toLocaleDateString(
                                'ja-JP',
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 文書詳細パネル */}
            {selectedDoc && (
              <div style={{ width: 380, flexShrink: 0 }}>
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    overflow: 'hidden',
                    position: 'sticky',
                    top: 16,
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      background: 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {selectedDoc.title}
                    </span>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => setIsEditing(!isEditing)}
                        style={{
                          fontSize: 12,
                          padding: '4px 10px',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: isEditing
                            ? '#4f46e5'
                            : 'var(--bg-primary)',
                          color: isEditing
                            ? '#fff'
                            : 'var(--text-secondary)',
                        }}
                      >
                        {isEditing ? '✕ キャンセル' : '✏️ 編集'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDoc(selectedDoc.id)}
                        style={{
                          fontSize: 12,
                          padding: '4px 10px',
                          border: '1px solid #fca5a5',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: 'var(--bg-primary)',
                          color: '#ef4444',
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div style={{ padding: 12 }}>
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        rows={20}
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: 10,
                          fontSize: 12,
                          resize: 'vertical',
                          lineHeight: 1.7,
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={handleUpdateDoc}
                          style={{
                            flex: 1,
                            padding: '8px',
                            background: '#4f46e5',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 13,
                            cursor: 'pointer',
                          }}
                        >
                          💾 保存する
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(editingContent)
                          }
                          style={{
                            padding: '8px 12px',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            fontSize: 13,
                            background: 'var(--bg-primary)',
                            cursor: 'pointer',
                          }}
                        >
                          📋
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="markdown-body"
                      style={{
                        padding: 16,
                        fontSize: 12,
                        color: 'var(--text-primary)',
                        maxHeight: 500,
                        overflowY: 'auto',
                      }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedDoc.content) }}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* テンプレートタブ */}
      {activeTab === 'templates' && (
        <div>
          {docs.filter((d) => d.is_template).length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: 'var(--text-secondary)',
                border: '2px dashed var(--border)',
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <p>テンプレートがまだありません</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>
                文書生成後に「テンプレートとして保存」するとここに表示されます
              </p>
            </div>
          ) : (
            <div
              style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
            >
              {docs
                .filter((d) => d.is_template)
                .map((doc) => {
                  const typeConfig = DOC_TYPES.find(
                    (t) => t.id === doc.doc_type,
                  );
                  return (
                    <div
                      key={doc.id}
                      style={{
                        width: 260,
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: 14,
                        background: 'var(--bg-primary)',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setActiveTab('list');
                        setFilterType('templates');
                        setSelectedDoc(doc);
                        setEditingContent(doc.content);
                        setIsEditing(false);
                      }}
                    >
                      <div style={{ fontSize: 24, marginBottom: 8 }}>
                        {typeConfig?.icon}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          marginBottom: 4,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {doc.procedure_name || doc.title}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          background: typeConfig
                            ? `${typeConfig.color}15`
                            : '#f3f4f6',
                          color: typeConfig?.color ?? '#374151',
                          borderRadius: 4,
                          display: 'inline-block',
                        }}
                      >
                        {typeConfig?.label}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
